import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type DownloadApi, type DownloadItem } from '../shared/download'
const api: DownloadApi = {
  version: 9,
  list: () => ipcRenderer.invoke(IPC.list),
  inspect: (url) => ipcRenderer.invoke(IPC.inspect, url),
  chooseSavePath: (path) => ipcRenderer.invoke(IPC.chooseSavePath, path),
  showProgress: (id) => ipcRenderer.invoke(IPC.showProgress, id),
  showListWindow: (mode, ids, queueId) =>
    ipcRenderer.invoke(IPC.showListWindow, mode, ids, queueId),
  showUtilityWindow: (mode, ids = [], queueId) =>
    ipcRenderer.invoke(IPC.showUtilityWindow, mode, ids, queueId),
  downloadSocial: (platform, url, allowInvalidCertificate) =>
    ipcRenderer.invoke(IPC.downloadSocial, platform, url, allowInvalidCertificate),
  onSocialProgress: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      value: { percent: number; status: string },
    ) => listener(value)
    ipcRenderer.on(IPC.socialProgress, handler)
    return () => ipcRenderer.removeListener(IPC.socialProgress, handler)
  },
  getSocialProgress: () => ipcRenderer.invoke(IPC.getSocialProgress),
  add: (url, queued = false, queueId, segments, path) =>
    queued
      ? ipcRenderer.invoke(IPC.enqueue, url, queueId, segments, path)
      : ipcRenderer.invoke(IPC.startNow, url, segments, path),
  enqueue: (url, queueId, segments, path) =>
    ipcRenderer.invoke(IPC.enqueue, url, queueId, segments, path),
  importList: (queueId) => ipcRenderer.invoke(IPC.importList, queueId),
  exportList: (ids) => ipcRenderer.invoke(IPC.exportList, ids),
  pause: (id) => ipcRenderer.invoke(IPC.pause, id),
  resume: (id) => ipcRenderer.invoke(IPC.resume, id),
  cancel: (id) => ipcRenderer.invoke(IPC.cancel, id),
  deleteCompleted: () => ipcRenderer.invoke(IPC.deleteCompleted),
  open: (id) => ipcRenderer.invoke(IPC.open, id),
  showInFolder: (id) => ipcRenderer.invoke(IPC.showInFolder, id),
  copyUrl: (id) => ipcRenderer.invoke(IPC.copyUrl, id),
  removeFromList: (id) => ipcRenderer.invoke(IPC.removeFromList, id),
  deleteFromDisk: (id) => ipcRenderer.invoke(IPC.deleteFromDisk, id),
  getSegmentCount: () => ipcRenderer.invoke(IPC.getSegments),
  setSegmentCount: (value) => ipcRenderer.invoke(IPC.setSegments, value),
  setItemSegmentCount: (id, value) => ipcRenderer.invoke(IPC.setItemSegments, id, value),
  listQueues: () => ipcRenderer.invoke(IPC.listQueues),
  createQueue: (name, concurrency) => ipcRenderer.invoke(IPC.createQueue, name, concurrency),
  updateQueue: (id, name, concurrency) =>
    ipcRenderer.invoke(IPC.updateQueue, id, name, concurrency),
  deleteQueue: (id) => ipcRenderer.invoke(IPC.deleteQueue, id),
  startQueue: (id) => ipcRenderer.invoke(IPC.startQueue, id),
  stopQueue: (id) => ipcRenderer.invoke(IPC.stopQueue, id),
  openFolder: () => ipcRenderer.invoke(IPC.openFolder),
  setCompletion: (id, options) => ipcRenderer.invoke(IPC.setCompletion, id, options),
  setQueueCompletion: (id, options) => ipcRenderer.invoke(IPC.setQueueCompletion, id, options),
  chooseCompletionSound: () => ipcRenderer.invoke(IPC.chooseCompletionSound),
  getCompletionSound: () => ipcRenderer.invoke(IPC.getCompletionSound),
  onChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, items: DownloadItem[]) => listener(items)
    ipcRenderer.on(IPC.changed, handler)
    return () => ipcRenderer.removeListener(IPC.changed, handler)
  },
}
contextBridge.exposeInMainWorld('downloads', api)
