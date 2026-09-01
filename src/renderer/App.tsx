import { useEffect,useMemo,useState } from 'react'
import { Archive,CalendarClock,CheckCircle2,ChevronDown,ChevronRight,CirclePause,CirclePlay,FileArchive,FileText,Folder,FolderOpen,Globe2,HardDriveDownload,Link2,ListStart,Music2,Play,Settings,Square,Trash2,Video,X } from 'lucide-react'
import type { DownloadItem,DownloadStatus } from '../shared/download'

type Category='all'|'unfinished'|'finished'|'video'|'music'|'programs'|'documents'|'compressed'|'queues'
const formatBytes=(value:number)=>value?`${(value/1024/1024).toFixed(value>10*1024*1024?2:3)} MB`:''
const ext=(name:string)=>name.split('.').pop()?.toLowerCase()??''
const videoTypes=['mp4','mkv','avi','mov','webm'];const musicTypes=['mp3','wav','aac','flac'];const docs=['pdf','doc','docx','txt','xls','xlsx'];const archives=['zip','rar','7z','tar','gz'];const programs=['exe','msi','dmg','deb','rpm','appimage']

export function App(){
  const [items,setItems]=useState<DownloadItem[]>([]),[category,setCategory]=useState<Category>('all'),[selected,setSelected]=useState<string>(),[dialog,setDialog]=useState(false),[url,setUrl]=useState(''),[error,setError]=useState('')
  useEffect(()=>{window.downloads.list().then(setItems);return window.downloads.onChanged(setItems)},[])
  const visible=useMemo(()=>items.filter(item=>matchesCategory(item,category)),[items,category])
  const current=items.find(item=>item.id===selected)
  async function add(queued=false){try{setError('');if(!window.downloads.version)throw new Error('Electron was not fully restarted after the queue update. Close every app window and start it again.');const item=queued?await window.downloads.enqueue(url.trim()):await window.downloads.add(url.trim());setSelected(item.id);setUrl('');setDialog(false)}catch(e){setError(e instanceof Error?e.message:'Unable to add download')}}
  const stopAll=()=>items.filter(i=>i.status==='downloading').forEach(i=>window.downloads.pause(i.id))
  return <div className="idm-app">
    <div className="titlebar"><span><HardDriveDownload size={16}/> Internet Download Manager</span><div><button>—</button><button>□</button><button className="close">×</button></div></div>
    <div className="menubar"><button>Tasks</button><button>File</button><button>Downloads</button><button>View</button><button>Help</button><button>Registration</button></div>
    <div className="toolbar">
      <Tool icon={<Link2/>} label="Add URL" color="blue" onClick={()=>setDialog(true)}/>
      <Tool icon={<CirclePlay/>} label="Resume" color="green" disabled={!current||!['paused','interrupted'].includes(current.status)} onClick={()=>current&&window.downloads.resume(current.id)}/>
      <Tool icon={<Square/>} label="Stop" color="red" disabled={!current||current.status!=='downloading'} onClick={()=>current&&window.downloads.pause(current.id)}/>
      <Tool icon={<CirclePause/>} label="Stop All" color="red" disabled={!items.some(i=>i.status==='downloading')} onClick={stopAll}/>
      <Tool icon={<Trash2/>} label="Delete" color="red" disabled={!current} onClick={()=>{if(current){window.downloads.cancel(current.id);setSelected(undefined)}}}/>
      <Tool icon={<X/>} label="Delete C..." color="gray" disabled/>
      <span className="separator"/>
      <Tool icon={<Settings/>} label="Options" color="blue"/>
      <Tool icon={<CalendarClock/>} label="Scheduler" color="orange"/>
      <Tool icon={<ListStart/>} label="Start Queue" color="green" disabled={!items.some(i=>i.status==='queued')} onClick={()=>window.downloads.startQueue()}/>
      <Tool icon={<Square/>} label="Stop Queue" color="red" onClick={()=>window.downloads.stopQueue()}/>
      <Tool icon={<Globe2/>} label="Grabber" color="blue"/>
    </div>
    <div className="workspace"><CategoryTree value={category} onChange={setCategory} items={items}/><DownloadTable items={visible} selected={selected} onSelect={setSelected}/></div>
    <div className="statusbar"><span>{items.filter(i=>i.status==='completed').length} completed</span><span>{items.filter(i=>i.status==='downloading').length} downloading</span><span>{items.length} file{items.length===1?'':'s'}</span><button onClick={()=>window.downloads.openFolder()}><FolderOpen size={13}/> Downloads</button></div>
    {dialog&&<div className="dialog-shade" onMouseDown={()=>setDialog(false)}><div className="dialog" onMouseDown={e=>e.stopPropagation()}><div className="dialog-title">Enter new address to download<button onClick={()=>setDialog(false)}>×</button></div><div className="dialog-body"><div className="url-row"><Globe2 size={42}/><div><label>Address</label><input autoFocus value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&url.trim()&&add(false)} /></div></div>{error&&<p className="dialog-error">{error}</p>}<fieldset><legend>Authorization</legend><label className="check"><input type="checkbox"/> Use authorization</label><div className="auth"><label>Login <input disabled/></label><label>Password <input disabled type="password"/></label></div></fieldset></div><div className="dialog-actions"><button disabled={!url.trim()} onClick={()=>add(true)}>Download later</button><button className="primary" disabled={!url.trim()} onClick={()=>add(false)}>Start download</button><button onClick={()=>setDialog(false)}>Cancel</button></div></div></div>}
  </div>
}

function Tool({icon,label,color,disabled,onClick}:{icon:React.ReactNode;label:string;color:string;disabled?:boolean;onClick?:()=>void}){return <button className={`tool ${color}`} disabled={disabled} onClick={onClick}><span>{icon}</span><small>{label}</small></button>}

function CategoryTree({value,onChange,items}:{value:Category;onChange:(v:Category)=>void;items:DownloadItem[]}){
  const rows:Array<[Category,string,React.ReactNode,number?]>=[['all','All Downloads',<Folder/>,items.length],['compressed','Compressed',<FileArchive/>],['documents','Documents',<FileText/>],['music','Music',<Music2/>],['programs','Programs',<Archive/>],['video','Video',<Video/>],['unfinished','Unfinished',<CirclePause/>,items.filter(i=>i.status!=='completed').length],['finished','Finished',<CheckCircle2/>,items.filter(i=>i.status==='completed').length],['queues','Queues',<ListStart/>]]
  return <aside className="categories"><div className="pane-title">Categories<button>×</button></div><div className="tree">{rows.map(([id,label,icon,count],index)=><button key={id} className={`${value===id?'selected':''} ${index>0&&index<6?'child':''}`} onClick={()=>onChange(id)}>{id==='all'?<ChevronDown className="chev"/>:id==='queues'?<ChevronRight className="chev"/>:<span className="chev"/>}<span className="tree-icon">{icon}</span><span>{label}</span>{count!==undefined&&<em>{count}</em>}</button>)}</div></aside>
}

function DownloadTable({items,selected,onSelect}:{items:DownloadItem[];selected?:string;onSelect:(id:string)=>void}){
  return <section className="downloads-table"><div className="columns"><span>File Name</span><span>Size</span><span>Status</span><span>Time left</span><span>Transfer rate</span><span>Last Try Date</span><span>Description</span></div><div className="rows">{items.length===0?<div className="no-downloads">There are no files in this category.</div>:items.map(item=><div className={`download-row ${selected===item.id?'selected':''}`} onClick={()=>onSelect(item.id)} onDoubleClick={()=>item.status==='paused'&&window.downloads.resume(item.id)} key={item.id}><span className="name"><FileIcon name={item.fileName}/><b>{item.fileName}</b></span><span>{formatBytes(item.totalBytes)}</span><span>{status(item)}</span><span>{timeLeft(item)}</span><span>{item.speed?`${formatBytes(item.speed)}/sec`:''}</span><span>{new Date(item.createdAt).toLocaleString()}</span><span title={item.error}>{item.error??''}</span></div>)}</div></section>
}

function FileIcon({name}:{name:string}){const type=ext(name);if(videoTypes.includes(type))return <Video/>;if(archives.includes(type))return <FileArchive/>;if(docs.includes(type))return <FileText/>;if(musicTypes.includes(type))return <Music2/>;return <HardDriveDownload/>}
function status(item:DownloadItem){if(item.status==='completed')return 'Complete';if(item.status==='downloading')return item.totalBytes?`${(item.receivedBytes/item.totalBytes*100).toFixed(2)}%`:'Receiving data...';return item.status[0].toUpperCase()+item.status.slice(1)}
function timeLeft(item:DownloadItem){if(!item.speed||!item.totalBytes)return '';const seconds=Math.max(0,(item.totalBytes-item.receivedBytes)/item.speed);const min=Math.floor(seconds/60);return `${min}:${Math.floor(seconds%60).toString().padStart(2,'0')}`}
function matchesCategory(item:DownloadItem,category:Category){if(category==='all')return true;if(category==='finished')return item.status==='completed';if(category==='unfinished')return item.status!=='completed';if(category==='queues')return item.status==='queued';const type=ext(item.fileName);return category==='video'?videoTypes.includes(type):category==='music'?musicTypes.includes(type):category==='documents'?docs.includes(type):category==='compressed'?archives.includes(type):programs.includes(type)}
