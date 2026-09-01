import { existsSync,readFileSync,renameSync,writeFileSync } from 'node:fs'
import type { DownloadItem } from '../../shared/download'
import type { DownloadRepository } from '../domain/download-repository'

const WRITE_DELAY_MS=500

export class JsonDownloadRepository implements DownloadRepository{
  private readonly items=new Map<string,DownloadItem>()
  private writeTimer?:NodeJS.Timeout

  constructor(private readonly filePath:string){this.load()}

  all=()=>[...this.items.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  get=(id:string)=>this.items.get(id)
  save=(item:DownloadItem)=>{this.items.set(item.id,{...item});this.scheduleWrite()}
  remove=(id:string)=>{this.items.delete(id);this.scheduleWrite()}

  flush=()=>{
    if(this.writeTimer){clearTimeout(this.writeTimer);this.writeTimer=undefined}
    const temporaryPath=`${this.filePath}.tmp`
    writeFileSync(temporaryPath,JSON.stringify({version:1,downloads:this.all()},null,2),'utf8')
    renameSync(temporaryPath,this.filePath)
  }

  private scheduleWrite(){
    if(this.writeTimer)return
    this.writeTimer=setTimeout(()=>this.flush(),WRITE_DELAY_MS)
  }

  private load(){
    if(!existsSync(this.filePath))return
    try{
      const parsed=JSON.parse(readFileSync(this.filePath,'utf8')) as {downloads?:DownloadItem[]}
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
    }catch(error){console.error('[Download history could not be loaded]',error)}
  }
}
