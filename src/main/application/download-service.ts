import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { DownloadItem } from '../../shared/download'
import type { DownloadRepository } from '../domain/download-repository'
import type { ElectronDownloadEngine } from '../infrastructure/electron-download-engine'
export class DownloadService{
  private queueRunning=false
  private queueActiveId?:string
  constructor(private repo:DownloadRepository,private engine:ElectronDownloadEngine,private notify:()=>void){}
  list=()=>this.repo.all()
  add(urlValue:string):DownloadItem{const item=this.create(urlValue);if(!this.engine.isBusy())this.engine.start(item.id,item.url,item.fileName);return item}
  enqueue=(urlValue:string):DownloadItem=>this.create(urlValue)
  pause=(id:string)=>this.engine.pause(id)
  resume=(id:string)=>{const item=this.repo.get(id);if(!item)return;if(this.engine.isBusy()){item.status='queued';this.repo.save(item);this.notify();return}if(['interrupted','queued'].includes(item.status))this.engine.start(item.id,item.url,item.fileName);else this.engine.resume(id)}
  cancel=(id:string)=>{const item=this.repo.get(id);if(!item)return;if(['queued','completed','failed','cancelled','interrupted'].includes(item.status)){this.repo.remove(id);this.notify();return}this.engine.cancel(id)}
  startQueue=()=>{this.queueRunning=true;if(this.queueActiveId){const item=this.repo.get(this.queueActiveId);if(item&&this.engine.isActive(item.id)){this.engine.resume(item.id);item.status='downloading';this.repo.save(item);this.notify();return}this.queueActiveId=undefined}this.startNext()}
  stopQueue=()=>{this.queueRunning=false;if(!this.queueActiveId)return;const item=this.repo.get(this.queueActiveId);if(item&&this.engine.isActive(item.id)){this.engine.pause(item.id);item.status='paused';item.speed=0;this.repo.save(item);this.notify()}}
  onDownloadFinished=()=>{this.queueActiveId=undefined;this.startNext()}
  private create(urlValue:string){const url=new URL(urlValue);if(!['http:','https:'].includes(url.protocol))throw new Error('Only HTTP and HTTPS URLs are supported.');const fileName=decodeURIComponent(basename(url.pathname))||`download-${Date.now()}`;const item:DownloadItem={id:randomUUID(),url:url.href,fileName,savePath:'',status:'queued',receivedBytes:0,totalBytes:0,speed:0,createdAt:new Date().toISOString()};this.repo.save(item);this.notify();return item}
  private startNext(){if(!this.queueRunning||this.engine.isBusy())return;const next=this.repo.all().filter(item=>item.status==='queued').sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];if(next){this.queueActiveId=next.id;this.engine.start(next.id,next.url,next.fileName)}else{this.queueRunning=false;this.queueActiveId=undefined}}
}
