import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { DownloadItem } from '../../shared/download'
import type { DownloadRepository } from '../domain/download-repository'
import type { ElectronDownloadEngine } from '../infrastructure/electron-download-engine'
export class DownloadService{
  constructor(private repo:DownloadRepository,private engine:ElectronDownloadEngine,private notify:()=>void){}
  list=()=>this.repo.all()
  add(urlValue:string):DownloadItem{const url=new URL(urlValue);if(!['http:','https:'].includes(url.protocol))throw new Error('Only HTTP and HTTPS URLs are supported.');const fileName=decodeURIComponent(basename(url.pathname))||`download-${Date.now()}`;const item:DownloadItem={id:randomUUID(),url:url.href,fileName,savePath:'',status:'queued',receivedBytes:0,totalBytes:0,speed:0,createdAt:new Date().toISOString()};this.repo.save(item);this.notify();this.engine.start(item.id,item.url,fileName);return item}
  pause=(id:string)=>this.engine.pause(id)
  resume=(id:string)=>this.engine.resume(id)
  cancel=(id:string)=>this.engine.cancel(id)
}
