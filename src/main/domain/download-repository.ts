import type { CompletedDoubleClickAction, DownloadItem, DownloadQueue } from '../../shared/download'
export interface DownloadRepository {
  all(): DownloadItem[]
  get(id: string): DownloadItem | undefined
  save(item: DownloadItem): void
  remove(id: string): void
  allQueues(): DownloadQueue[]
  getQueue(id: string): DownloadQueue | undefined
  saveQueue(queue: DownloadQueue): void
  removeQueue(id: string): void
  getSegmentCount(): number
  setSegmentCount(value: number): void
  getCompletedDoubleClickAction(): CompletedDoubleClickAction
  setCompletedDoubleClickAction(value: CompletedDoubleClickAction): void
  flush(): void
}
