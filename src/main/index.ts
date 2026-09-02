import { app, BrowserWindow, Notification, session, shell } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { DownloadService } from './application/download-service'
import { ElectronDownloadEngine } from './infrastructure/electron-download-engine'
import { JsonDownloadRepository } from './infrastructure/json-download-repository'
import { useSystemCertificateAuthorities } from './infrastructure/system-ca-verifier'
import { broadcastDownloads, registerDownloadHandlers } from './presentation/ipc/download-handlers'
import {
  progressWindow,
  registerDownloadDialogHandlers,
} from './presentation/ipc/download-dialog-handlers'
let service: DownloadService
let repository: JsonDownloadRepository | undefined
function playSound(path?: string) {
  const candidates =
    path && existsSync(path)
      ? [
          ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', path]],
          ['paplay', [path]],
          ['aplay', [path]],
        ]
      : [
          ['canberra-gtk-play', ['-i', 'complete']],
          ['paplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga']],
        ]
  const attempt = (index: number) => {
    if (index >= candidates.length) return
    const [command, args] = candidates[index] as [string, string[]],
      child = spawn(command, args, { stdio: 'ignore' })
    child.once('error', () => attempt(index + 1))
    child.once('exit', (code) => {
      if (code !== 0) attempt(index + 1)
    })
  }
  attempt(0)
}
function runCompletion(id: string) {
  const item = service.get(id)
  if (!item || item.status !== 'completed') return
  const options = item.completion
  if (options?.notification)
    new Notification({ title: 'Download complete', body: item.fileName, silent: true }).show()
  if (options?.playSound)
    playSound(options.sound === 'custom' ? options.customSoundPath : undefined)
  if (options?.openFolder && item.savePath) shell.showItemInFolder(item.savePath)
  if (!item.queueId) return
  const queue = service.listQueues().find((value) => value.id === item.queueId),
    remaining = service
      .list()
      .some(
        (value) =>
          value.queueId === item.queueId &&
          !['completed', 'cancelled', 'failed'].includes(value.status),
      )
  if (!queue?.completion || remaining) return
  const queueOptions = queue.completion
  if (queueOptions.notification)
    new Notification({ title: 'Queue complete', body: queue.name, silent: true }).show()
  if (queueOptions.playSound)
    playSound(queueOptions.sound === 'custom' ? queueOptions.customSoundPath : undefined)
  if (queueOptions.openFolder && item.savePath) shell.showItemInFolder(item.savePath)
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b1020',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(join(__dirname, '../renderer/index.html'))
}
app.whenReady().then(() => {
  useSystemCertificateAuthorities(session.defaultSession)
  session.defaultSession.webRequest.onErrorOccurred((details) =>
    console.error('[Request failed]', { url: details.url, error: details.error }),
  )
  repository = new JsonDownloadRepository(join(app.getPath('userData'), 'downloads.json'))
  let notify = () => {},
    finished = (_id: string) => {}
  const engine = new ElectronDownloadEngine(
    session.defaultSession,
    repository,
    () => notify(),
    (id) => finished(id),
  )
  service = new DownloadService(repository, engine, () => notify())
  notify = () => broadcastDownloads(service)
  finished = (id) => {
    service.onDownloadFinished(id)
    runCompletion(id)
  }
  registerDownloadHandlers(service)
  registerDownloadDialogHandlers(service, progressWindow)
  createWindow()
  const startupUrl = process.argv.find((value) => /^https?:\/\//i.test(value))
  if (startupUrl) setTimeout(() => service.add(startupUrl), 500)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
app.on('before-quit', () => repository?.flush())
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
