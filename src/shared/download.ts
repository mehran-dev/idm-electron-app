export type DownloadStatus='queued'|'downloading'|'paused'|'interrupted'|'completed'|'cancelled'|'failed'
export interface DownloadItem{id:string;url:string;fileName:string;savePath:string;status:DownloadStatus;receivedBytes:number;totalBytes:number;speed:number;createdAt:string;error?:string}
export interface DownloadApi{list():Promise<DownloadItem[]>;add(url:string):Promise<DownloadItem>;pause(id:string):Promise<void>;resume(id:string):Promise<void>;cancel(id:string):Promise<void>;openFolder():Promise<void>;onChanged(listener:(items:DownloadItem[])=>void):()=>void}
export const IPC={list:'downloads:list',add:'downloads:add',pause:'downloads:pause',resume:'downloads:resume',cancel:'downloads:cancel',changed:'downloads:changed',openFolder:'downloads:open-folder'} as const
