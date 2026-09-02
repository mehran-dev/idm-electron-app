import type { DownloadItem,DownloadQueue } from '../../shared/download'
import type { DownloadRepository } from '../domain/download-repository'
export class InMemoryDownloadRepository implements DownloadRepository{
  private readonly items=new Map<string,DownloadItem>()
  private readonly queues=new Map<string,DownloadQueue>()
  private segmentCount=4
  all=()=>[...this.items.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  get=(id:string)=>this.items.get(id)
  save=(item:DownloadItem)=>{this.items.set(item.id,{...item})}
  remove=(id:string)=>{this.items.delete(id)}
  allQueues=()=>[...this.queues.values()]
  getQueue=(id:string)=>this.queues.get(id)
  saveQueue=(queue:DownloadQueue)=>{this.queues.set(queue.id,{...queue})}
  removeQueue=(id:string)=>{this.queues.delete(id)}
  getSegmentCount=()=>this.segmentCount
  setSegmentCount=(value:number)=>{this.segmentCount=value}
  flush=()=>{}
}
