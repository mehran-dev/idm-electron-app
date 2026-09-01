import { app,BrowserWindow,ipcMain,shell } from 'electron'
import { IPC } from '../../../shared/download'
import type { DownloadService } from '../../application/download-service'
export function registerDownloadHandlers(service:DownloadService){ipcMain.handle(IPC.list,()=>service.list());ipcMain.handle(IPC.add,(_e,url:string)=>service.add(url));ipcMain.handle(IPC.pause,(_e,id:string)=>service.pause(id));ipcMain.handle(IPC.resume,(_e,id:string)=>service.resume(id));ipcMain.handle(IPC.cancel,(_e,id:string)=>service.cancel(id));ipcMain.handle(IPC.openFolder,()=>shell.openPath(app.getPath('downloads')))}
export function broadcastDownloads(service:DownloadService){for(const window of BrowserWindow.getAllWindows())window.webContents.send(IPC.changed,service.list())}
