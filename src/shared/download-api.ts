import type {
  CompletionOptions,
  DownloadItem,
  DownloadPreview,
  DownloadQueue,
  ExportResult,
  ImportResult,
} from './download-models'
export const IPC = {
  list: 'downloads:list',
  inspect: 'downloads:inspect',
  chooseSavePath: 'downloads:choose-save-path',
  showProgress: 'downloads:show-progress',
  showListWindow: 'downloads:show-list-window',
  showUtilityWindow: 'downloads:show-utility-window',
  downloadSocial: 'downloads:download-social',
  openSocialFile: 'downloads:open-social-file',
  showSocialFileInFolder: 'downloads:show-social-file-in-folder',
  socialProgress: 'downloads:social-progress',
  getSocialProgress: 'downloads:get-social-progress',
  add: 'downloads:add',
  startNow: 'downloads:start-now',
  enqueue: 'downloads:enqueue',
  importList: 'downloads:import-list',
  exportList: 'downloads:export-list',
  pause: 'downloads:pause',
  resume: 'downloads:resume',
  cancel: 'downloads:cancel',
  deleteCompleted: 'downloads:delete-completed',
  open: 'downloads:open',
  showInFolder: 'downloads:show-in-folder',
  copyUrl: 'downloads:copy-url',
  removeFromList: 'downloads:remove-list',
  deleteFromDisk: 'downloads:delete-disk',
  getSegments: 'settings:get-segments',
  setSegments: 'settings:set-segments',
  setItemSegments: 'downloads:set-segments',
  listQueues: 'queues:list',
  createQueue: 'queues:create',
  updateQueue: 'queues:update',
  deleteQueue: 'queues:delete',
  startQueue: 'queues:start',
  stopQueue: 'queues:stop',
  changed: 'downloads:changed',
  openFolder: 'downloads:open-folder',
  setCompletion: 'downloads:set-completion',
  setQueueCompletion: 'queues:set-completion',
  chooseCompletionSound: 'settings:choose-completion-sound',
  getCompletionSound: 'settings:get-completion-sound',
} as const
export interface DownloadApi {
  version: number
  list(): Promise<DownloadItem[]>
  inspect(url: string): Promise<DownloadPreview>
  chooseSavePath(path: string): Promise<string | undefined>
  showProgress(id: string): Promise<void>
  showListWindow(mode: 'import' | 'export', ids: string[], queueId?: string): Promise<void>
  showUtilityWindow(
    mode: 'add' | 'scheduler' | 'options' | 'delete' | 'youtube' | 'instagram',
    ids?: string[],
    queueId?: string,
  ): Promise<void>
  downloadSocial(
    platform: 'youtube' | 'instagram',
    url: string,
    allowInvalidCertificate?: boolean,
    proxyUrl?: string,
  ): Promise<{ ok: true; filePath: string } | { ok: false; error: string }>
  openSocialFile(): Promise<string>
  showSocialFileInFolder(): Promise<void>
  onSocialProgress(listener: (value: { percent: number; status: string }) => void): () => void
  getSocialProgress(): Promise<{ percent: number; status: string }>
  add(
    url: string,
    queued?: boolean,
    queueId?: string,
    segments?: number,
    path?: string,
  ): Promise<DownloadItem>
  enqueue(url: string, queueId?: string, segments?: number, path?: string): Promise<DownloadItem>
  importList(queueId: string): Promise<ImportResult>
  exportList(ids: string[]): Promise<ExportResult>
  pause(id: string): Promise<void>
  resume(id: string): Promise<void>
  cancel(id: string): Promise<void>
  deleteCompleted(): Promise<void>
  open(id: string): Promise<void>
  showInFolder(id: string): Promise<void>
  copyUrl(id: string): Promise<void>
  removeFromList(id: string): Promise<void>
  deleteFromDisk(id: string): Promise<void>
  getSegmentCount(): Promise<number>
  setSegmentCount(value: number): Promise<void>
  setItemSegmentCount(id: string, value: number): Promise<void>
  listQueues(): Promise<DownloadQueue[]>
  createQueue(name: string, concurrency: number): Promise<DownloadQueue>
  updateQueue(id: string, name: string, concurrency: number): Promise<void>
  deleteQueue(id: string): Promise<void>
  startQueue(id: string): Promise<void>
  stopQueue(id: string): Promise<void>
  openFolder(): Promise<void>
  setCompletion(id: string, options: CompletionOptions): Promise<void>
  setQueueCompletion(id: string, options: CompletionOptions): Promise<void>
  chooseCompletionSound(): Promise<string | undefined>
  getCompletionSound(): Promise<string>
  onChanged(listener: (items: DownloadItem[]) => void): () => void
}
