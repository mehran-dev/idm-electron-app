import { app, BrowserWindow, dialog, ipcMain, net, session, shell } from 'electron'
import { basename, join } from 'node:path'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { IPC, type DownloadPreview } from '../../../shared/download'
import type { DownloadService } from '../../application/download-service'
const socialProgressByWebContents = new Map<number, { percent: number; status: string }>()
const socialFilesByWebContents = new Map<number, string>()
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
  ipcMain.handle(IPC.openSocialFile, async (event) => {
    const path = socialFilesByWebContents.get(event.sender.id)
    return path ? shell.openPath(path) : 'No completed download is available.'
  })
  ipcMain.handle(IPC.showSocialFileInFolder, (event) => {
    const path = socialFilesByWebContents.get(event.sender.id)
    if (path) shell.showItemInFolder(path)
  })
  ipcMain.handle(IPC.getSocialProgress, (event) =>
    Promise.resolve(
      socialProgressByWebContents.get(event.sender.id) ?? { percent: 0, status: 'Waiting…' },
    ),
  )
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
    (
      _event,
      mode: 'add' | 'scheduler' | 'options' | 'delete' | 'youtube' | 'instagram',
      ids: string[],
      queueId?: string,
    ) => {
      const sizes = {
        add: [620, 180],
        scheduler: [680, 570],
        options: [760, 620],
        delete: [540, 300],
        youtube: [570, 390],
        instagram: [570, 390],
      } as const
      const titles = {
        add: 'Add download',
        scheduler: 'Scheduler',
        options: 'Options',
        delete: 'Confirm file deletion',
        youtube: 'Download from YouTube',
        instagram: 'Download from Instagram',
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
  ipcMain.handle(
    IPC.downloadSocial,
    async (
      event,
      platform: 'youtube' | 'instagram',
      urlValue: string,
      allowInvalidCertificate = false,
    ) => {
      let url: URL
      try {
        url = new URL(urlValue.trim())
      } catch {
        return { ok: false as const, error: 'Paste a complete HTTPS media URL.' }
      }
      const allowed =
        platform === 'youtube'
          ? /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(url.hostname)
          : /(^|\.)instagram\.com$/i.test(url.hostname)
      if (url.protocol !== 'https:' || !allowed)
        return {
          ok: false as const,
          error: `Enter a valid ${platform === 'youtube' ? 'YouTube' : 'Instagram'} URL.`,
        }
      const destination = join(app.getPath('downloads'), platform)
      console.info('[social-download] request', { platform, senderId: event.sender.id })
      socialProgressByWebContents.set(event.sender.id, {
        percent: 0,
        status: `Connecting to ${platform === 'youtube' ? 'YouTube' : 'Instagram'}…`,
      })
      socialFilesByWebContents.delete(event.sender.id)
      event.sender.once('destroyed', () => {
        socialProgressByWebContents.delete(event.sender.id)
        socialFilesByWebContents.delete(event.sender.id)
      })
      mkdirSync(destination, { recursive: true })
      const executableName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
      const executable =
        [
          join(app.getAppPath(), 'vendor', executableName),
          join(process.resourcesPath, 'vendor', executableName),
        ].find(existsSync) ?? executableName
      const ffmpegDirectory = [
        join(app.getAppPath(), 'vendor'),
        join(process.resourcesPath, 'vendor'),
      ].find((directory) =>
        existsSync(join(directory, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')),
      )
      return await new Promise<{ ok: true; filePath: string } | { ok: false; error: string }>(
        (resolve) => {
          const output: string[] = []
          let failedToStart = false
          let progressBuffer = ''
          let finalPath = ''
          const reportProgress = (percent: number, status: string) => {
            if (event.sender.isDestroyed()) return
            socialProgressByWebContents.set(event.sender.id, {
              percent: Math.max(0, Math.min(100, percent)),
              status,
            })
            console.info('[social-download] progress', {
              senderId: event.sender.id,
              percent: Math.max(0, Math.min(100, percent)),
              status,
            })
            event.sender.send(IPC.socialProgress, {
              percent: Math.max(0, Math.min(100, percent)),
              status,
            })
          }
          reportProgress(0, `Connecting to ${platform === 'youtube' ? 'YouTube' : 'Instagram'}…`)
          const args = [
            '--no-playlist',
            '--compat-options',
            'no-certifi',
            '--js-runtimes',
            'node',
            '--no-colors',
            '--newline',
            '--progress',
            '--progress-delta',
            '0.2',
            '--progress-template',
            'download:PROGRESS:%(progress.downloaded_bytes)s:%(progress.total_bytes,progress.total_bytes_estimate)s:%(progress._percent_str)s',
            '--retries',
            '3',
            '--extractor-retries',
            '3',
            '--fragment-retries',
            '3',
            '--concurrent-fragments',
            '4',
            '-f',
            'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
            '--merge-output-format',
            'mp4',
            '-P',
            destination,
            '-o',
            '%(title)s [%(id)s].%(ext)s',
            '--print',
            'after_move:FINAL_PATH:%(filepath)s',
            '--no-quiet',
            url.href,
          ]
          if (ffmpegDirectory) args.unshift('--ffmpeg-location', ffmpegDirectory)
          if (allowInvalidCertificate) args.unshift('--no-check-certificates')
          const downloaderProcess = spawn(executable, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
          })
          console.info('[social-download] spawned', {
            senderId: event.sender.id,
            pid: downloaderProcess.pid,
            executable,
          })
          const consumeOutput = (chunk: unknown) => {
            const text = String(chunk)
            output.push(text)
            console.debug('[social-download] output', text.trim().slice(0, 500))
            if (/Extracting URL/i.test(text)) reportProgress(0, 'Checking media address…')
            if (/Downloading webpage/i.test(text)) reportProgress(0, 'Loading video page…')
            if (/Downloading .*API JSON/i.test(text))
              reportProgress(0, 'Reading video information…')
            if (/Solving JS challenges/i.test(text)) reportProgress(0, 'Resolving YouTube media…')
            if (/Downloading \d+ format/i.test(text)) reportProgress(0, 'Starting media transfer…')
            const pathMatch = text.match(/FINAL_PATH:([^\r\n]+)/)
            if (pathMatch?.[1]) finalPath = pathMatch[1].trim()
            progressBuffer += text
            const progressPattern = /PROGRESS:(\d+):([^:\r\n]+):\s*([\d.]+)%/g
            let match: RegExpExecArray | null
            let consumed = 0
            while ((match = progressPattern.exec(progressBuffer))) {
              consumed = progressPattern.lastIndex
              reportProgress(Number(match[3]), 'Downloading media (current stream)…')
            }
            if (
              /Merging formats|Fixing MPEG-TS/i.test(progressBuffer) &&
              !event.sender.isDestroyed()
            )
              reportProgress(0, 'Merging video and audio…')
            progressBuffer = consumed ? progressBuffer.slice(consumed) : progressBuffer.slice(-256)
          }
          downloaderProcess.stdout.on('data', consumeOutput)
          downloaderProcess.stderr.on('data', consumeOutput)
          downloaderProcess.once('error', (error) => {
            console.error('[social-download] process error', error)
            failedToStart = true
            resolve({
              ok: false,
              error: error.message.includes('ENOENT')
                ? 'The bundled yt-dlp executable could not be found.'
                : error.message,
            })
          })
          downloaderProcess.once('close', (code) => {
            console.info('[social-download] process closed', {
              senderId: event.sender.id,
              code,
              finalPath,
            })
            if (failedToStart) return
            const lines = output.join('').trim().split(/\r?\n/).filter(Boolean)
            if (code === 0) {
              if (!event.sender.isDestroyed())
                socialFilesByWebContents.set(event.sender.id, finalPath || destination)
              reportProgress(100, 'Download complete')
              resolve({ ok: true, filePath: finalPath || destination })
            } else
              resolve({
                ok: false,
                error: lines.slice(-3).join('\n') || `yt-dlp exited with code ${code}`,
              })
          })
        },
      )
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
