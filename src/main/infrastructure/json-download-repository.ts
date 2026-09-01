import { existsSync,readFileSync,renameSync,writeFileSync } from 'node:fs'
import type { DownloadItem,DownloadQueue } from '../../shared/download'
import type { DownloadRepository } from '../domain/download-repository'

const WRITE_DELAY_MS=500

export class JsonDownloadRepository implements DownloadRepository{
  private readonly items=new Map<string,DownloadItem>()
  private readonly queues=new Map<string,DownloadQueue>()
  private writeTimer?:NodeJS.Timeout

  constructor(private readonly filePath:string){this.load()}

  all=()=>[...this.items.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  get=(id:string)=>this.items.get(id)
  save=(item:DownloadItem)=>{this.items.set(item.id,{...item});this.scheduleWrite()}
  remove=(id:string)=>{this.items.delete(id);this.scheduleWrite()}
  allQueues=()=>[...this.queues.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt))
  getQueue=(id:string)=>this.queues.get(id)
  saveQueue=(queue:DownloadQueue)=>{this.queues.set(queue.id,{...queue});this.scheduleWrite()}
  removeQueue=(id:string)=>{this.queues.delete(id);this.scheduleWrite()}

  flush=()=>{
    if(this.writeTimer){clearTimeout(this.writeTimer);this.writeTimer=undefined}
    const temporaryPath=`${this.filePath}.tmp`
    writeFileSync(temporaryPath,JSON.stringify({version:2,downloads:this.all(),queues:this.allQueues()},null,2),'utf8')
    renameSync(temporaryPath,this.filePath)
  }

  private scheduleWrite(){
    if(this.writeTimer)return
    this.writeTimer=setTimeout(()=>this.flush(),WRITE_DELAY_MS)
  }

  private load(){
    if(!existsSync(this.filePath))return
    try{
      const parsed=JSON.parse(readFileSync(this.filePath,'utf8')) as {downloads?:DownloadItem[];queues?:DownloadQueue[]}
      if(!Array.isArray(parsed.downloads))throw new Error('Invalid downloads history format')
      for(const download of parsed.downloads){
        if(!download?.id||!download.url||!download.fileName)continue
        if(['downloading','paused'].includes(download.status)){
          download.status='interrupted'
          download.speed=0
          download.error='The application closed before this download finished.'
        }
        this.items.set(download.id,{...download})
      }
      if(Array.isArray(parsed.queues))for(const queue of parsed.queues)if(queue?.id&&queue.name)this.queues.set(queue.id,{...queue,concurrency:Math.max(1,Math.min(10,queue.concurrency||1))})
    }catch(error){console.error('[Download history could not be loaded]',error)}
  }
}
