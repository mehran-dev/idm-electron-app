import { app, net, type ClientRequest, type Session } from 'electron'
import { closeSync, ftruncateSync, openSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import type { DownloadRepository } from '../domain/download-repository'
interface Segment {
  start: number
  end: number
  received: number
  done: boolean
}
interface ActiveDownload {
  requests: Set<ClientRequest>
  segments: Segment[]
  file: number
  paused: boolean
  cancelled: boolean
  lastBytes: number
  lastTime: number
  lastNotify: number
  generation: number
  fallbackUsed: boolean
}
export class ElectronDownloadEngine {
  private readonly active = new Map<string, ActiveDownload>()
  constructor(
    private session: Session,
    private repo: DownloadRepository,
    private changed: () => void,
    private finished: (id: string) => void,
  ) {}
  isBusy() {
    return this.active.size > 0
  }
  isActive(id: string) {
    return this.active.has(id)
  }
  async start(id: string, url: string, fileName: string) {
    if (this.active.has(id)) return
    const item = this.repo.get(id)
    if (!item) return
    try {
      const probe = await this.probe(url)
      const savePath = item.savePath || join(app.getPath('downloads'), fileName)
      const file = openSync(savePath, 'w+')
      if (probe.total > 0) ftruncateSync(file, probe.total)
      const count =
        probe.ranges && probe.total > 0 ? Math.min(item.segmentCount ?? 1, probe.total) : 1
      const size = probe.total > 0 ? Math.ceil(probe.total / count) : 0
      const segments = Array.from({ length: count }, (_, index) => ({
        start: index * size,
        end: probe.total > 0 ? Math.min(probe.total - 1, (index + 1) * size - 1) : -1,
        received: 0,
        done: false,
      }))
      const state: ActiveDownload = {
        requests: new Set(),
        segments,
        file,
        paused: false,
        cancelled: false,
        lastBytes: 0,
        lastTime: Date.now(),
        lastNotify: 0,
        generation: 0,
        fallbackUsed: false,
      }
      this.active.set(id, state)
      item.savePath = savePath
      item.totalBytes = probe.total
      item.receivedBytes = 0
      item.segmentProgress = segments.map(() => 0)
      item.status = 'downloading'
      item.error = undefined
      this.repo.save(item)
      this.changed()
      console.info('[Segmented download started]', {
        url,
        savePath,
        segments: count,
        totalBytes: probe.total,
      })
      this.runSegments(id)
    } catch (error) {
      this.fail(id, error)
    }
  }
  pause(id: string) {
    const state = this.active.get(id),
      item = this.repo.get(id)
    if (!state || !item) return
    state.paused = true
    for (const request of state.requests) request.abort()
    state.requests.clear()
    item.status = 'paused'
    item.speed = 0
    this.repo.save(item)
    this.changed()
    console.info('[Download paused]', { url: item.url, receivedBytes: item.receivedBytes })
  }
  resume(id: string) {
    const state = this.active.get(id),
      item = this.repo.get(id)
    if (!state || !item) return
    state.paused = false
    item.status = 'downloading'
    this.repo.save(item)
    this.changed()
    this.runSegments(id)
  }
  cancel(id: string) {
    const state = this.active.get(id)
    if (!state) return
    state.cancelled = true
    for (const request of state.requests) request.abort()
    state.requests.clear()
    closeSync(state.file)
    this.active.delete(id)
    const item = this.repo.get(id)
    if (item) {
      item.status = 'cancelled'
      item.speed = 0
      this.repo.save(item)
      this.changed()
    }
    this.finished(id)
  }
  private probe(url: string): Promise<{ total: number; ranges: boolean }> {
    return new Promise((resolve, reject) => {
      let settled = false
      const request = net.request({ url, method: 'GET', session: this.session, redirect: 'follow' })
      request.setHeader('Range', 'bytes=0-0')
      request.on('response', (response) => {
        const header = (name: string) => {
          const value = response.headers[name]
          return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
        }
        const contentRange = header('content-range')
        const match = contentRange.match(/^bytes\s+0-0\/(\d+)$/i)
        const ranges = response.statusCode === 206 && Boolean(match)
        const total = Number(match?.[1] ?? header('content-length') ?? 0)
        settled = true
        resolve({ total, ranges })
        request.abort()
      })
      request.on('error', (error) => {
        if (!settled) reject(error)
      })
      request.end()
    })
  }
  private runSegments(id: string) {
    const state = this.active.get(id),
      item = this.repo.get(id)
    if (!state || !item || state.paused || state.cancelled) return
    const generation = state.generation
    for (const segment of state.segments.filter((value) => !value.done))
      this.runSegment(id, item.url, segment, state, generation)
  }
  private runSegment(
    id: string,
    url: string,
    segment: Segment,
    state: ActiveDownload,
    generation: number,
  ) {
    const requestedStart = segment.start + segment.received
    const request = net.request({ url, method: 'GET', session: this.session, redirect: 'follow' })
    state.requests.add(request)
    if (segment.end >= 0) request.setHeader('Range', `bytes=${requestedStart}-${segment.end}`)
    request.on('response', (response) => {
      if (generation !== state.generation) return
      if (response.statusCode >= 400) {
        this.fail(id, new Error(`Server returned HTTP ${response.statusCode}`))
        return
      }
      const contentRangeValue = response.headers['content-range']
      const contentRange = Array.isArray(contentRangeValue)
        ? (contentRangeValue[0] ?? '')
        : (contentRangeValue ?? '')
      const range = contentRange.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i)
      const mustHonorRange = state.segments.length > 1 || requestedStart > 0
      const validRange =
        response.statusCode === 206 &&
        Number(range?.[1]) === requestedStart &&
        Number(range?.[2]) <= segment.end
      if (mustHonorRange && !validRange) {
        this.fallbackToSingleConnection(id, url, state, generation)
        return
      }
      response.on('data', (chunk: Buffer) => {
        if (state.paused || state.cancelled || generation !== state.generation) return
        const remaining =
          segment.end >= 0
            ? Math.max(0, segment.end - (segment.start + segment.received) + 1)
            : chunk.length
        const bytesToWrite = Math.min(chunk.length, remaining)
        if (bytesToWrite === 0) return
        writeSync(state.file, chunk, 0, bytesToWrite, segment.start + segment.received)
        segment.received += bytesToWrite
        this.progress(id, state)
      })
      response.on('end', () => {
        state.requests.delete(request)
        if (state.paused || state.cancelled || generation !== state.generation) return
        const expected = segment.end >= 0 ? segment.end - segment.start + 1 : segment.received
        if (segment.received < expected) {
          this.fail(id, new Error('The server ended a file segment before all bytes arrived.'))
          return
        }
        segment.done = true
        if (state.segments.every((value) => value.done)) this.complete(id, state)
      })
      response.on('error', (error) => {
        state.requests.delete(request)
        if (!state.paused && !state.cancelled && generation === state.generation)
          this.fail(id, error)
      })
    })
    request.on('error', (error) => {
      state.requests.delete(request)
      if (!state.paused && !state.cancelled && generation === state.generation) this.fail(id, error)
    })
    request.end()
  }
  private fallbackToSingleConnection(
    id: string,
    url: string,
    state: ActiveDownload,
    generation: number,
  ) {
    if (generation !== state.generation) return
    if (state.fallbackUsed) {
      this.fail(id, new Error('The server does not reliably support resuming this download.'))
      return
    }
    state.fallbackUsed = true
    state.generation += 1
    for (const activeRequest of state.requests) activeRequest.abort()
    state.requests.clear()
    const item = this.repo.get(id)
    if (!item) return
    state.segments = [
      { start: 0, end: item.totalBytes > 0 ? item.totalBytes - 1 : -1, received: 0, done: false },
    ]
    state.lastBytes = 0
    state.lastTime = Date.now()
    if (item.totalBytes > 0) ftruncateSync(state.file, item.totalBytes)
    item.receivedBytes = 0
    item.segmentProgress = [0]
    item.error = 'Server ignored parallel ranges; safely switched to one connection.'
    this.repo.save(item)
    this.changed()
    this.runSegments(id)
    console.warn('[Download range fallback]', { url, reason: 'Invalid Content-Range response' })
  }
  private progress(id: string, state: ActiveDownload) {
    const item = this.repo.get(id)
    if (!item) return
    const measuredBytes = state.segments.reduce((sum, value) => sum + value.received, 0),
      bytes = item.totalBytes > 0 ? Math.min(item.totalBytes, measuredBytes) : measuredBytes,
      now = Date.now()
    item.receivedBytes = bytes
    item.segmentProgress = state.segments.map((segment) =>
      segment.end < 0
        ? 0
        : Math.min(100, (segment.received / (segment.end - segment.start + 1)) * 100),
    )
    item.speed = Math.max(
      0,
      (bytes - state.lastBytes) / Math.max(0.001, (now - state.lastTime) / 1000),
    )
    state.lastBytes = bytes
    state.lastTime = now
    this.repo.save(item)
    if (now - state.lastNotify > 150) {
      state.lastNotify = now
      this.changed()
    }
  }
  private complete(id: string, state: ActiveDownload) {
    closeSync(state.file)
    this.active.delete(id)
    const item = this.repo.get(id)
    if (item) {
      const measuredBytes = state.segments.reduce((sum, value) => sum + value.received, 0)
      item.receivedBytes =
        item.totalBytes > 0 ? Math.min(item.totalBytes, measuredBytes) : measuredBytes
      item.speed = 0
      item.status = 'completed'
      this.repo.save(item)
      this.changed()
      console.info('[Segmented download completed]', {
        url: item.url,
        segments: state.segments.length,
        bytes: item.receivedBytes,
      })
    }
    this.finished(id)
  }
  private fail(id: string, error: unknown) {
    const state = this.active.get(id)
    if (state) {
      for (const request of state.requests) request.abort()
      try {
        closeSync(state.file)
      } catch {}
      this.active.delete(id)
    }
    const item = this.repo.get(id)
    if (item) {
      item.status = 'failed'
      item.speed = 0
      item.error = error instanceof Error ? error.message : String(error)
      this.repo.save(item)
      this.changed()
    }
    console.error('[Download failed]', error)
    this.finished(id)
  }
}
