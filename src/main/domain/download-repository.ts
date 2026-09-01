import type { DownloadItem } from '../../shared/download'
export interface DownloadRepository{all():DownloadItem[];get(id:string):DownloadItem|undefined;save(item:DownloadItem):void;remove(id:string):void;flush():void}
