import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { SocialDownloadRecord } from '../../shared/download-models'

export class SocialDownloadHistory {
  private records: SocialDownloadRecord[] = []
  private ready: Promise<void>
  private writes: Promise<void> = Promise.resolve()

  constructor(private readonly path: string) {
    this.ready = this.load()
    // Keep startup read errors observable through list/start without an unhandled rejection.
    void this.ready.catch(() => undefined)
  }

  private async load() {
    let text: string
    try {
      text = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    const data = JSON.parse(text)
    if (data.version !== 1 || !Array.isArray(data.records))
      throw new Error('Invalid social history format')
    this.records = data.records.filter(
      (r: SocialDownloadRecord) =>
        r &&
        typeof r.id === 'string' &&
        ['youtube', 'instagram'].includes(r.platform) &&
        typeof r.url === 'string' &&
        typeof r.createdAt === 'string' &&
        typeof r.updatedAt === 'string' &&
        ['downloading', 'completed', 'failed', 'interrupted'].includes(r.status) &&
        (r.filePath === undefined || typeof r.filePath === 'string'),
    )
    let recovered = false
    this.records = this.records.map((record) => {
      if (record.status !== 'downloading') return record
      recovered = true
      return { ...record, status: 'interrupted', updatedAt: new Date().toISOString() }
    })
    if (recovered) await this.persist()
  }

  private persist() {
    const data = JSON.stringify({ version: 1, records: this.records })
    const write = this.writes
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true })
        await writeFile(`${this.path}.tmp`, data, { mode: 0o600 })
        await rename(`${this.path}.tmp`, this.path)
      })
    this.writes = write
    return write
  }

  async list() {
    await this.ready
    return this.records.map((record) => ({ ...record }))
  }

  async start(platform: SocialDownloadRecord['platform'], url: string) {
    await this.ready
    const now = new Date().toISOString()
    const record: SocialDownloadRecord = {
      id: randomUUID(),
      platform,
      url,
      createdAt: now,
      updatedAt: now,
      status: 'downloading',
    }
    this.records.unshift(record)
    await this.persist()
    return record.id
  }

  async finish(
    id: string,
    status: Exclude<SocialDownloadRecord['status'], 'downloading'>,
    filePath?: string,
  ) {
    await this.ready
    const record = this.records.find((value) => value.id === id)
    if (!record) return
    Object.assign(record, { status, filePath, updatedAt: new Date().toISOString() })
    await this.persist()
  }
}
