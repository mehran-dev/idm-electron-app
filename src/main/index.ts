import { app,BrowserWindow,session } from 'electron'
import { join } from 'node:path'
import { DownloadService } from './application/download-service'
import { ElectronDownloadEngine } from './infrastructure/electron-download-engine'
import { InMemoryDownloadRepository } from './infrastructure/in-memory-download-repository'
import { useSystemCertificateAuthorities } from './infrastructure/system-ca-verifier'
import { broadcastDownloads,registerDownloadHandlers } from './presentation/ipc/download-handlers'
let service:DownloadService

function createWindow(){const window=new BrowserWindow({width:1240,height:780,minWidth:900,minHeight:600,backgroundColor:'#0b1020',titleBarStyle:'hiddenInset',webPreferences:{preload:join(__dirname,'../preload/index.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});if(process.env.ELECTRON_RENDERER_URL)window.loadURL(process.env.ELECTRON_RENDERER_URL);else window.loadFile(join(__dirname,'../renderer/index.html'))}
app.whenReady().then(()=>{useSystemCertificateAuthorities(session.defaultSession);session.defaultSession.webRequest.onErrorOccurred(details=>console.error('[Request failed]',{url:details.url,error:details.error}));const repo=new InMemoryDownloadRepository();let notify=()=>{};const engine=new ElectronDownloadEngine(session.defaultSession,repo,()=>notify());service=new DownloadService(repo,engine,()=>notify());notify=()=>broadcastDownloads(service);registerDownloadHandlers(service);createWindow();const startupUrl=process.argv.find(value=>/^https?:\/\//i.test(value));if(startupUrl)setTimeout(()=>service.add(startupUrl),500);app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})})
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()})
