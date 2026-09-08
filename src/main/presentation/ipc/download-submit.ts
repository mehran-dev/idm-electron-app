import { BrowserWindow, dialog, shell } from 'electron'
import { basename } from 'node:path'
import type { DownloadService } from '../../application/download-service'

export function createDownloadSubmit(service: DownloadService, showProgress: (id: string) => void) {
  return async (
    event: Electron.IpcMainInvokeEvent,
    url: string,
    segments?: number,
    path?: string,
    queued = false,
    queueId?: string,
    importing = false,
  ) => {
    const conflict = service.checkDuplicate(url, path)
    if (conflict.conflict) {
      const existing = conflict.existing
      const options: Electron.MessageBoxOptions = {
        type: 'question',
        title: 'Duplicate download',
        message: `“${basename(conflict.requestedPath)}” already exists on disk or in your download list.`,
        detail: `${existing ? `Existing download: ${existing.fileName} (${existing.status}).\n` : ''}Add a new copy as:\n${conflict.nextPath}\nExisting files and download entries will be kept.`,
        buttons: [
          'Add new copy',
          existing?.status === 'completed'
            ? 'Show completed download'
            : existing
              ? 'Show existing download'
              : 'Show existing file',
          importing ? 'Skip this entry' : 'Cancel',
        ],
        defaultId: 2,
        cancelId: 2,
        noLink: true,
      }
      const parent = BrowserWindow.fromWebContents(event.sender)
      const choice = parent
        ? await dialog.showMessageBox(parent, options)
        : await dialog.showMessageBox(options)
      if (choice.response === 1) {
        if (existing) showProgress(existing.id)
        else shell.showItemInFolder(conflict.requestedPath)
      }
      if (choice.response !== 0) return undefined
    }
    // Recompute at creation: another window may have reserved the proposed name while the prompt was open.
    return queued ? service.enqueue(url, queueId, segments, path) : service.add(url, segments, path)
  }
}
