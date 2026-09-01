import { contextBridge,ipcRenderer } from 'electron'
import { IPC,type DownloadApi,type DownloadItem } from '../shared/download'
const api:DownloadApi={list:()=>ipcRenderer.invoke(IPC.list),add:url=>ipcRenderer.invoke(IPC.add,url),pause:id=>ipcRenderer.invoke(IPC.pause,id),resume:id=>ipcRenderer.invoke(IPC.resume,id),cancel:id=>ipcRenderer.invoke(IPC.cancel,id),openFolder:()=>ipcRenderer.invoke(IPC.openFolder),onChanged:listener=>{const handler=(_event:Electron.IpcRendererEvent,items:DownloadItem[])=>listener(items);ipcRenderer.on(IPC.changed,handler);return()=>ipcRenderer.removeListener(IPC.changed,handler)}}
contextBridge.exposeInMainWorld('downloads',api)
