export type DownloadStatus =
  'queued' | 'downloading' | 'paused' | 'interrupted' | 'completed' | 'cancelled' | 'failed'
export interface CompletionOptions {
  notification: boolean
  playSound: boolean
  sound: 'system' | 'custom'
  customSoundPath?: string
  openFolder: boolean
}
export interface DownloadItem {
  id: string
  url: string
  fileName: string
  savePath: string
  status: DownloadStatus
  receivedBytes: number
  totalBytes: number
  speed: number
  createdAt: string
  segmentCount?: number
  segmentProgress?: number[]
  queueId?: string
  error?: string
  completion?: CompletionOptions
}
export interface DownloadQueue {
  id: string
  name: string
  concurrency: number
  createdAt: string
  completion?: CompletionOptions
}
export interface DownloadPreview {
  fileName: string
  size: number
  mimeType: string
  category: string
  savePath: string
}
export interface ImportResult {
  fileName: string
  imported: number
  skipped: number
  cancelled: boolean
}
export interface ExportResult {
  fileName: string
  exported: number
  cancelled: boolean
}
