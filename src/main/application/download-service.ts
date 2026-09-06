import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { CompletionOptions, DownloadItem, DownloadQueue } from '../../shared/download'
import type { DownloadRepository } from '../domain/download-repository'
import type { ElectronDownloadEngine } from '../infrastructure/electron-download-engine'

export class DownloadService {
  private readonly runningQueues = new Set<string>()
  constructor(
    private repo: DownloadRepository,
    private engine: ElectronDownloadEngine,
    private notify: () => void,
  ) {
    if (!repo.allQueues().length)
      repo.saveQueue({
        id: 'main',
        name: 'Main download queue',
        concurrency: 1,
        createdAt: new Date().toISOString(),
      })
  }
  list = () => this.repo.all()
  get = (id: string) => this.repo.get(id)
  listQueues = () => this.repo.allQueues()
  getSegmentCount = () => this.repo.getSegmentCount()
  setSegmentCount = (value: number) =>
    this.repo.setSegmentCount(Number.isInteger(value) && value >= 1 && value <= 8 ? value : 4)
  setItemSegmentCount = (id: string, value: number) => {
    const item = this.repo.get(id)
    if (!item || this.engine.isActive(id)) return
    item.segmentCount =
      Number.isInteger(value) && value >= 1 && value <= 8 ? value : this.repo.getSegmentCount()
    this.repo.save(item)
    this.notify()
  }
  setCompletion = (id: string, options: CompletionOptions) => {
    const item = this.repo.get(id)
    if (!item) return
    item.completion = options
    this.repo.save(item)
    this.notify()
  }
  setQueueCompletion = (id: string, options: CompletionOptions) => {
    const queue = this.repo.getQueue(id)
    if (!queue) return
    queue.completion = options
    this.repo.saveQueue(queue)
    this.notify()
  }
  add(urlValue: string, segmentCount?: number, savePath?: string) {
    const item = this.create(urlValue, segmentCount, savePath)
    this.engine.start(item.id, item.url, item.fileName)
    return item
  }
  enqueue = (urlValue: string, queueId = 'main', segmentCount?: number, savePath?: string) => {
    const item = this.create(urlValue, segmentCount, savePath)
    const queue = this.repo.getQueue(queueId) ?? this.repo.allQueues()[0]
    item.queueId = queue?.id
    this.repo.save(item)
    this.notify()
    return item
  }
  pause = (id: string) => this.engine.pause(id)
  resume = (id: string) => {
    const item = this.repo.get(id)
    if (!item) return
    if (this.engine.isActive(id)) this.engine.resume(id)
    else this.engine.start(item.id, item.url, item.fileName)
  }
  cancel = (id: string) => {
    const item = this.repo.get(id)
    if (!item) return
    if (['queued', 'completed', 'failed', 'cancelled', 'interrupted'].includes(item.status)) {
      this.repo.remove(id)
      this.notify()
      return
    }
    this.engine.cancel(id)
  }
  deleteCompleted = () => {
    for (const item of this.repo.all()) if (item.status === 'completed') this.repo.remove(item.id)
    this.repo.flush()
    this.notify()
  }
  removeFromList = (id: string) => {
    if (this.engine.isActive(id)) this.engine.cancel(id)
    this.repo.remove(id)
    this.notify()
  }
  createQueue(name: string, concurrency: number) {
    const queue: DownloadQueue = {
      id: randomUUID(),
      name: name.trim() || 'New queue',
      concurrency: this.limit(concurrency),
      createdAt: new Date().toISOString(),
    }
    this.repo.saveQueue(queue)
    return queue
  }
  updateQueue(id: string, name: string, concurrency: number) {
    const queue = this.repo.getQueue(id)
    if (!queue) return
    queue.name = name.trim() || queue.name
    queue.concurrency = this.limit(concurrency)
    this.repo.saveQueue(queue)
    this.fillQueue(id)
  }
  deleteQueue(id: string) {
    const queue = this.repo.getQueue(id)
    if (!queue || id === 'main') return
    this.stopQueue(id)
    const fallback = this.repo.getQueue('main') ?? this.repo.allQueues().find((q) => q.id !== id)!
    for (const item of this.repo.all())
      if (item.queueId === id && item.status !== 'completed') {
        item.queueId = fallback.id
        this.repo.save(item)
      }
    this.repo.removeQueue(id)
    this.notify()
  }
  startQueue(id: string) {
    if (!this.repo.getQueue(id)) return
    this.runningQueues.add(id)
    for (const item of this.repo
      .all()
      .filter((i) => i.queueId === id && i.status === 'paused' && this.engine.isActive(i.id))) {
      this.engine.resume(item.id)
      item.status = 'downloading'
      this.repo.save(item)
    }
    this.fillQueue(id)
    this.notify()
  }
  stopQueue(id: string) {
    this.runningQueues.delete(id)
    for (const item of this.repo
      .all()
      .filter(
        (i) => i.queueId === id && i.status === 'downloading' && this.engine.isActive(i.id),
      )) {
      this.engine.pause(item.id)
      item.status = 'paused'
      item.speed = 0
      this.repo.save(item)
    }
    this.notify()
  }
  onDownloadFinished(id: string) {
    const queueId = this.repo.get(id)?.queueId
    if (queueId) this.fillQueue(queueId)
  }
  private fillQueue(id: string) {
    const queue = this.repo.getQueue(id)
    if (!queue || !this.runningQueues.has(id)) return
    const active = this.repo
      .all()
      .filter((item) => item.queueId === id && item.status === 'downloading').length
    const available = Math.max(0, queue.concurrency - active)
    const next = this.repo
      .all()
      .filter((item) => item.queueId === id && item.status === 'queued')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, available)
    for (const item of next) this.engine.start(item.id, item.url, item.fileName)
    if (!next.length && active === 0) this.runningQueues.delete(id)
  }
  private create(urlValue: string, segmentCount?: number, savePath = ''): DownloadItem {
    const url = new URL(urlValue)
    if (!['http:', 'https:'].includes(url.protocol))
      throw new Error('Only HTTP and HTTPS URLs are supported.')
    const fileName = savePath
      ? basename(savePath)
      : decodeURIComponent(basename(url.pathname)) || `download-${Date.now()}`
    const chosen =
      Number.isInteger(segmentCount) && segmentCount! >= 1 && segmentCount! <= 8
        ? segmentCount!
        : this.repo.getSegmentCount()
    const item: DownloadItem = {
      id: randomUUID(),
      url: url.href,
      fileName,
      savePath,
      status: 'queued',
      receivedBytes: 0,
      totalBytes: 0,
      speed: 0,
      segmentCount: chosen,
      createdAt: new Date().toISOString(),
    }
    this.repo.save(item)
    this.notify()
    return item
  }
  private limit(value: number) {
    return Math.max(1, Math.min(10, Math.round(value) || 1))
  }
}
