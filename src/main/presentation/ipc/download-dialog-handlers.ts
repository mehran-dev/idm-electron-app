import { app, BrowserWindow, dialog, ipcMain, net, session } from 'electron'
import { basename, join } from 'node:path'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { IPC, type DownloadPreview } from '../../../shared/download'
import type { DownloadService } from '../../application/download-service'
const category = (name: string, mime: string) =>
  mime.startsWith('video/')
    ? 'Video'
    : mime.startsWith('audio/')
      ? 'Music'
      : /\.(zip|rar|7z|tar|gz)$/i.test(name)
        ? 'Compressed'
        : /\.(pdf|docx?|txt|xlsx?)$/i.test(name)
          ? 'Documents'
          : /\.(exe|msi|deb|rpm|appimage)$/i.test(name)
            ? 'Programs'
            : 'General'
const soundConfig = () => join(app.getPath('userData'), 'completion-sound.json')
const savedSound = () => {
  try {
    return JSON.parse(readFileSync(soundConfig(), 'utf8')).path as string
  } catch {
    return ''
  }
}
function inspect(urlValue: string): Promise<DownloadPreview> {
  const url = new URL(urlValue)
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Only HTTP and HTTPS URLs are supported.')
  return new Promise((resolve, reject) => {
    let done = false
    const request = net.request({
      url: url.href,
      method: 'GET',
      redirect: 'follow',
      session: session.defaultSession,
    })
    request.setHeader('Range', 'bytes=0-0')
    request.on('response', (response) => {
      const header = (name: string) => {
        const value = response.headers[name]
        return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
      }
      if (response.statusCode >= 400) {
        done = true
        reject(new Error(`Server returned HTTP ${response.statusCode}`))
        request.abort()
        return
      }
      const disposition = header('content-disposition'),
        encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1],
        plain = disposition.match(/filename="?([^";]+)"?/i)?.[1]
      let fileName = encoded
        ? decodeURIComponent(encoded)
        : plain || decodeURIComponent(basename(url.pathname)) || `download-${Date.now()}`
      fileName = fileName.replace(/[\\/:*?"<>|]/g, '_')
      const mimeType = header('content-type').split(';')[0] || 'application/octet-stream',
        range = header('content-range'),
        size = Number(range.match(/\/(\d+)$/)?.[1] ?? header('content-length') ?? 0)
      done = true
      resolve({
        fileName,
        size,
        mimeType,
        category: category(fileName, mimeType),
        savePath: join(app.getPath('downloads'), fileName),
      })
      request.abort()
    })
    request.on('error', (error) => {
      if (!done) reject(error)
    })
    request.end()
  })
}
export function registerDownloadDialogHandlers(
  service: DownloadService,
  showProgress: (id: string) => void,
) {
  ipcMain.handle(IPC.getCompletionSound, () => savedSound())
  ipcMain.handle(IPC.chooseCompletionSound, async () => {
    const selected = await dialog.showOpenDialog({
      title: 'Select completion sound',
      buttonLabel: 'Use this sound',
      properties: ['openFile'],
      filters: [{ name: 'Audio files', extensions: ['wav', 'mp3', 'ogg', 'oga', 'flac', 'm4a'] }],
    })
    if (selected.canceled || !selected.filePaths[0]) return
    const source = selected.filePaths[0],
      folder = join(app.getPath('userData'), 'sounds')
    mkdirSync(folder, { recursive: true })
    const extension = basename(source).split('.').pop() || 'wav',
      destination = join(folder, `completion.${extension}`)
    if (source !== destination) copyFileSync(source, destination)
    writeFileSync(soundConfig(), JSON.stringify({ path: destination }))
    return destination
  })
  ipcMain.handle(IPC.setCompletion, (_e, id, options) => service.setCompletion(id, options))
  ipcMain.handle(IPC.setQueueCompletion, (_e, id, options) =>
    service.setQueueCompletion(id, options),
  )
  ipcMain.handle(IPC.inspect, (_e, url: string) => inspect(url))
  ipcMain.handle(IPC.chooseSavePath, async (_e, path: string) => {
    const result = await dialog.showSaveDialog({
      title: 'Save download as',
      buttonLabel: 'Save',
      defaultPath: path,
    })
    return result.canceled ? undefined : result.filePath
  })
  ipcMain.handle(IPC.showProgress, (_e, id: string) => showProgress(id))
  ipcMain.handle(
    IPC.showListWindow,
    (_event, mode: 'import' | 'export', ids: string[], queueId?: string) => {
      const query = {
        listDialog: mode,
        ids: ids.join(','),
        queueId: queueId ?? '',
      }
      const child = new BrowserWindow({
        width: 570,
        height: mode === 'import' ? 455 : 390,
        minWidth: 520,
        minHeight: 340,
        title: mode === 'import' ? 'Import download list' : 'Export download list',
        frame: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: join(__dirname, '../preload/index.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })
      if (process.env.ELECTRON_RENDERER_URL) {
        const params = new URLSearchParams(query)
        child.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${params}`)
      } else child.loadFile(join(__dirname, '../renderer/index.html'), { query })
    },
  )
  ipcMain.handle(
    IPC.showUtilityWindow,
    (_event, mode: 'add' | 'scheduler' | 'options' | 'delete', ids: string[], queueId?: string) => {
      const sizes = {
        add: [620, 180],
        scheduler: [680, 570],
        options: [760, 620],
        delete: [540, 300],
      } as const
      const titles = {
        add: 'Add download',
        scheduler: 'Scheduler',
        options: 'Options',
        delete: 'Confirm file deletion',
      }
      const [width, height] = sizes[mode]
      const child = new BrowserWindow({
        width,
        height,
        minWidth: Math.min(width, 500),
        minHeight: Math.min(height, 280),
        title: titles[mode],
        frame: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: join(__dirname, '../preload/index.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })
      const query = { utilityDialog: mode, ids: ids.join(','), queueId: queueId ?? '' }
      if (process.env.ELECTRON_RENDERER_URL) {
        child.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${new URLSearchParams(query)}`)
      } else child.loadFile(join(__dirname, '../renderer/index.html'), { query })
    },
  )
  ipcMain.removeHandler(IPC.startNow)
  ipcMain.handle(IPC.startNow, (_e, url: string, segments?: number, path?: string) =>
    service.add(url, segments, path),
  )
  ipcMain.removeHandler(IPC.enqueue)
  ipcMain.handle(
    IPC.enqueue,
    (_e, url: string, queueId?: string, segments?: number, path?: string) =>
      service.enqueue(url, queueId, segments, path),
  )
}
export function progressWindow(id: string) {
  const existing = BrowserWindow.getAllWindows().find((value) =>
    value.webContents.getURL().includes(`progress=${id}`),
  )
  if (existing) {
    existing.show()
    existing.focus()
    return
  }
  const window = new BrowserWindow({
    width: 650,
    height: 570,
    minWidth: 560,
    minHeight: 480,
    title: 'Download status',
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL)
    window.loadURL(`${process.env.ELECTRON_RENDERER_URL}?progress=${encodeURIComponent(id)}`)
  else window.loadFile(join(__dirname, '../renderer/index.html'), { query: { progress: id } })
}
