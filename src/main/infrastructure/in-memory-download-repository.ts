import type { DownloadItem } from '../../shared/download'
import type { DownloadRepository } from '../domain/download-repository'
export class InMemoryDownloadRepository implements DownloadRepository{
  private readonly items=new Map<string,DownloadItem>()
  all=()=>[...this.items.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  get=(id:string)=>this.items.get(id)
  save=(item:DownloadItem)=>{this.items.set(item.id,{...item})}
}
