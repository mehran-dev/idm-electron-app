import { downloadDestination } from '../../infrastructure/download-destination'
import { SocialDownloadHistory } from '../../infrastructure/social-download-history'
import {
  app,
  clipboard,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  session,
  shell,
  screen,
} from 'electron'
import { basename, join } from 'node:path'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawn } from 'node:child_process'
import {
  exportYouTubeCookies,
  signInToYouTube,
  forgetYouTubeSession,
  hasYouTubeSession,
} from '../../infrastructure/youtube-session'
import { YouTubeAuthStore } from '../../infrastructure/youtube-auth'
import {
  socialDownloadEnvironment,
  hasCertificateError,
  socialConnectionError,
} from '../../infrastructure/social-download-environment'
import { resolveSocialDownloadTools } from '../../infrastructure/social-download-tools'
import {
  IPC,
  type DownloadPreview,
  type YouTubeBrowser,
  type YouTubeCatalog,
} from '../../../shared/download'
import type { DownloadService } from '../../application/download-service'
import { centeredContentBounds } from '../window-fit'
const socialProgressByWebContents = new Map<number, { percent: number; status: string }>()
const socialFilesByWebContents = new Map<number, string>()
const socialProcessesByWebContents = new Map<number, Map<string, ReturnType<typeof spawn>>>()
const pausedSocialTasks = new Set<string>()
const activeSocialTasks = new Set<string>()
const socialTaskKey = (webContentsId: number, taskId: string) => `${webContentsId}:${taskId}`
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
  const history = new SocialDownloadHistory(
    join(app.getPath('userData'), 'social-download-history.json'),
  )
  const youtubeAuth = new YouTubeAuthStore(
    join(app.getPath('userData'), 'youtube-auth.json'),
    join(app.getPath('userData'), 'youtube-cookies.txt'),
  )
  const youtubeAuthStatus = async () => youtubeAuth.status(await hasYouTubeSession())
  ipcMain.handle(IPC.listSocialHistory, () => history.list())
  ipcMain.handle(IPC.socialHistoryAction, async (_event, id: string, action: string) => {
    const record = (await history.list()).find((value) => value.id === id)
    if (!record) return 'This history entry is no longer available.'
    if (action === 'copy') {
      clipboard.writeText(record.url)
      return ''
    }
    if (action === 'remove' || action === 'delete-file') {
      if (action === 'delete-file' && record.filePath && existsSync(record.filePath)) {
        try {
          unlinkSync(record.filePath)
        } catch {
          return 'The saved item could not be deleted. It may be a folder or currently in use.'
        }
      }
      await history.remove(id)
      return ''
    }
    if (!['open', 'folder'].includes(action)) return 'Unknown history action.'
    if (record.status !== 'completed' || !record.filePath) return 'No completed file is available.'
    if (!existsSync(record.filePath)) return 'The saved file has been moved or deleted.'
    if (action === 'open') return shell.openPath(record.filePath)
    shell.showItemInFolder(record.filePath)
    return ''
  })
  ipcMain.handle(
    IPC.inspectYouTube,
    async (event, inputValue: string, allowInvalidCertificate = false, proxyUrl = '') => {
      const input = inputValue.trim()
      if (!input) throw new Error('Enter a channel name, handle, or playlist link.')
      let source: URL
      try {
        source = new URL(input)
        if (
          source.protocol !== 'https:' ||
          !/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(source.hostname)
        )
          throw new Error('invalid')
      } catch {
        const handle = input.replace(/^@/, '').replace(/\s+/g, '')
        if (!/^[A-Za-z0-9._-]+$/.test(handle))
          throw new Error('Enter a YouTube @handle or a complete playlist link.')
        source = new URL(`https://www.youtube.com/@${handle}/playlists`)
      }
      const isVideo = source.hostname.endsWith('youtu.be') || source.searchParams.has('v')
      const isPlaylist = !isVideo && source.searchParams.has('list')
      if (!isVideo && !isPlaylist && !/\/playlists\/?$/i.test(source.pathname))
        source.pathname = `${source.pathname.replace(/\/$/, '')}/playlists`
      let explicitProxy: string | undefined
      if (proxyUrl.trim()) {
        try {
          const parsed = new URL(proxyUrl.trim())
          if (
            !['http:', 'https:', 'socks4:', 'socks5:', 'socks5h:'].includes(parsed.protocol) ||
            !parsed.hostname ||
            parsed.search ||
            parsed.hash ||
            (parsed.pathname && parsed.pathname !== '/')
          )
            throw new Error('Invalid proxy')
          explicitProxy = parsed.href
        } catch {
          throw new Error(
            'Enter a valid HTTP or SOCKS proxy URL from your VPN app, including its port.',
          )
        }
      }
      const hasEnvironmentProxy = [
        'https_proxy',
        'HTTPS_PROXY',
        'all_proxy',
        'ALL_PROXY',
        'http_proxy',
        'HTTP_PROXY',
      ].some((key) => Boolean(process.env[key]))
      let systemProxy: string | undefined
      if (!explicitProxy && !hasEnvironmentProxy) {
        try {
          const route = await event.sender.session.resolveProxy(source.href)
          const match = /^(PROXY|HTTPS|SOCKS4|SOCKS5|SOCKS)\s+(\S+)$/i.exec(
            route.split(';')[0]?.trim() ?? '',
          )
          if (match) {
            const scheme = {
              PROXY: 'http',
              HTTPS: 'https',
              SOCKS4: 'socks4',
              SOCKS5: 'socks5',
              SOCKS: 'socks4',
            }[match[1]!.toUpperCase()]
            systemProxy = `${scheme}://${match[2]}`
          }
        } catch {
          console.warn('[youtube-catalog] system proxy resolution failed')
        }
      }
      const { downloader } = resolveSocialDownloadTools({
        appPath: app.getAppPath(),
        resourcesPath: process.resourcesPath,
      })
      const args = [
        '--ignore-config',
        '--flat-playlist',
        '--dump-single-json',
        '--no-warnings',
        '--socket-timeout',
        '20',
        '--retries',
        '3',
        '--extractor-retries',
        '3',
        '--retry-sleep',
        'http:exp=1:4',
        '--compat-options',
        'no-certifi',
        '--js-runtimes',
        `node:${process.execPath}`,
        source.href,
      ]
      if (explicitProxy || systemProxy) args.unshift('--proxy', explicitProxy || systemProxy!)
      if (allowInvalidCertificate) args.unshift('--no-check-certificates')
      const authArgs = await youtubeAuth.downloaderArgs()
      const cookieFile = authArgs.length ? undefined : await exportYouTubeCookies()
      if (authArgs.length) args.unshift(...authArgs)
      if (cookieFile) args.unshift('--cookies', cookieFile.path)
      let raw: string
      try {
        raw = await new Promise<string>((resolve, reject) => {
          const child = spawn(downloader, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: socialDownloadEnvironment(process.env),
          })
          let stdout = ''
          let stderr = ''
          child.stdout.on('data', (chunk) => (stdout += String(chunk)))
          child.stderr.on('data', (chunk) => (stderr += String(chunk)))
          const stop = () => child.kill()
          event.sender.once('destroyed', stop)
          child.once('error', reject)
          child.once('close', (code) => {
            event.sender.removeListener('destroyed', stop)
            if (code === 0) resolve(stdout)
            else reject(new Error(stderr.trim() || 'YouTube lookup failed.'))
          })
        })
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error)
        console.error('[youtube-catalog]', details)
        throw new Error(socialConnectionError(details))
      } finally {
        await cookieFile?.cleanup()
      }
      const data = JSON.parse(raw) as Record<string, unknown>
      const entries = Array.isArray(data.entries) ? data.entries : []
      const rawItems = entries.length || !isVideo ? entries : [data]
      const items = rawItems
        .filter((entry): entry is Record<string, unknown> =>
          Boolean(entry && typeof entry === 'object'),
        )
        .map((entry) => {
          const id = String(entry.id ?? '')
          const entryUrl = String(entry.webpage_url ?? entry.url ?? '')
          return {
            id,
            title: String(entry.title ?? 'Untitled video'),
            url: /^https?:\/\//.test(entryUrl)
              ? entryUrl
              : isPlaylist
                ? `https://www.youtube.com/watch?v=${id}`
                : `https://www.youtube.com/playlist?list=${id}`,
            duration: typeof entry.duration === 'number' ? entry.duration : undefined,
            thumbnail: typeof entry.thumbnail === 'string' ? entry.thumbnail : undefined,
            itemCount: typeof entry.playlist_count === 'number' ? entry.playlist_count : undefined,
          }
        })
        .filter((entry) => entry.id && entry.url)
      return {
        kind: isPlaylist || isVideo ? 'playlist' : 'channel',
        title: String(data.title ?? data.channel ?? 'YouTube'),
        url: source.href,
        playlists: isPlaylist || isVideo ? [] : items,
        videos: isPlaylist || isVideo ? items : [],
      } satisfies YouTubeCatalog
    },
  )
  ipcMain.handle(IPC.fitWindow, (event, requestedHeight: number) => {
    if (!Number.isFinite(requestedHeight) || requestedHeight <= 0) return { clamped: false }
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || window.isMaximized() || window.isFullScreen()) return { clamped: false }
    const params = new URL(event.sender.getURL()).searchParams
    if (!params.has('utilityDialog') && !params.has('listDialog') && !params.has('progress'))
      return { clamped: false }
    if (['social-history', 'youtube-library'].includes(params.get('utilityDialog') ?? ''))
      return { clamped: false }
    const bounds = window.getBounds()
    const area = screen.getDisplayMatching(bounds).workArea
    window.setMinimumSize(Math.min(400, area.width), 120)
    window.setBounds(centeredContentBounds(bounds, area, requestedHeight))
    return { clamped: Math.ceil(requestedHeight) > area.height }
  })
  ipcMain.handle(IPC.windowAction, (event, action: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (action === 'minimize') window.minimize()
    else if (action === 'maximize') {
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    } else if (action === 'close') window.close()
  })
  ipcMain.handle(IPC.getYouTubeAuthStatus, youtubeAuthStatus)
  ipcMain.handle(IPC.useYouTubeBrowser, async (_event, browser) => {
    await youtubeAuth.useBrowser(browser)
    await forgetYouTubeSession()
    return youtubeAuthStatus()
  })
  ipcMain.handle(IPC.saveYouTubeCookies, async (_event, cookieText: string) => {
    await youtubeAuth.saveCookies(typeof cookieText === 'string' ? cookieText : '')
    await forgetYouTubeSession()
    return youtubeAuthStatus()
  })
  ipcMain.handle(IPC.signInToYouTube, async (event, proxyUrl = '') => {
    let proxy: string | undefined
    if (typeof proxyUrl === 'string' && proxyUrl.trim()) {
      try {
        const parsed = new URL(proxyUrl.trim())
        if (
          !['http:', 'https:', 'socks4:', 'socks5:', 'socks5h:'].includes(parsed.protocol) ||
          !parsed.hostname ||
          parsed.search ||
          parsed.hash ||
          (parsed.pathname && parsed.pathname !== '/')
        )
          throw new Error('Invalid proxy')
        proxy = parsed.href
      } catch {
        throw new Error('Enter a valid HTTP or SOCKS proxy URL, including its port.')
      }
    }
    await signInToYouTube(event.sender, proxy)
    await youtubeAuth.useAppSession()
    return youtubeAuthStatus()
  })
  ipcMain.handle(IPC.clearYouTubeAuth, async () => {
    await youtubeAuth.clear()
    await forgetYouTubeSession()
    return youtubeAuthStatus()
  })
  ipcMain.handle(IPC.forgetYouTubeSession, async () => {
    await forgetYouTubeSession()
    await youtubeAuth.clear()
  })
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
  ipcMain.handle(IPC.pauseSocialDownload, (event, taskIdValue: string) => {
    const taskId = typeof taskIdValue === 'string' ? taskIdValue.slice(0, 100) : ''
    if (!taskId) return false
    const key = socialTaskKey(event.sender.id, taskId)
    if (!activeSocialTasks.has(key)) return false
    pausedSocialTasks.add(key)
    socialProcessesByWebContents.get(event.sender.id)?.get(taskId)?.kill()
    return true
  })
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
  ipcMain.handle(IPC.inspect, async (_e, url: string) => {
    const existing = service.findDuplicate(url)
    // A known URL can be recognized even when the server is offline or the link has expired.
    const preview: DownloadPreview = existing
      ? {
          fileName: existing.fileName,
          size: existing.totalBytes,
          mimeType: 'application/octet-stream',
          category: category(existing.fileName, ''),
          savePath: existing.savePath || join(app.getPath('downloads'), existing.fileName),
        }
      : await inspect(url)
    const conflict = service.checkDuplicate(url, preview.savePath)
    return {
      ...preview,
      fileName: basename(conflict.nextPath),
      savePath: conflict.nextPath,
      duplicate: conflict.conflict
        ? {
            id: conflict.existing?.id,
            status: conflict.existing?.status,
            fileName: conflict.existing?.fileName || preview.fileName,
          }
        : undefined,
    }
  })
  ipcMain.handle(IPC.chooseSavePath, async (_e, path: string) => {
    const result = await dialog.showSaveDialog({
      title: 'Save download as',
      buttonLabel: 'Save',
      defaultPath: downloadDestination(
        path,
        service.list().map((item) => item.savePath),
      ),
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
        hasShadow: true,
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
      mode:
        | 'add'
        | 'scheduler'
        | 'options'
        | 'delete'
        | 'youtube'
        | 'youtube-library'
        | 'instagram'
        | 'social-history',
      ids: string[],
      queueId?: string,
    ) => {
      const sizes = {
        'social-history': [780, 560],
        'youtube-library': [880, 720],
        add: [620, 180],
        scheduler: [680, 570],
        options: [760, 620],
        delete: [540, 300],
        youtube: [570, 560],
        instagram: [570, 490],
      } as const
      const titles = {
        'social-history': 'Media download history',
        'youtube-library': 'YouTube offline library',
        add: 'Add download',
        scheduler: 'Scheduler',
        options: 'Options',
        delete: 'Confirm file deletion',
        youtube: 'Download from YouTube',
        instagram: 'Download from Instagram',
      }
      if (!(mode in sizes)) throw new Error('Unknown window type')
      if (mode === 'social-history' || mode === 'youtube-library') {
        const existing = BrowserWindow.getAllWindows().find((window) =>
          window.webContents.getURL().includes('utilityDialog=social-history'),
        )
        if (existing) {
          existing.show()
          existing.focus()
          return
        }
      }
      const [width, height] = sizes[mode]
      const child = new BrowserWindow({
        hasShadow: true,
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
      proxyUrl = '',
      details: { title?: string; batchId?: string; batchTitle?: string; taskId?: string } = {},
    ) => {
      if (!['youtube', 'instagram'].includes(platform))
        return { ok: false as const, error: 'Unknown media provider.' }
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
      if (platform === 'instagram') {
        const mediaPath = url.pathname.match(
          /^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/,
        )
        if (!mediaPath || (mediaPath[1] === 'reels' && mediaPath[2] === 'audio'))
          return {
            ok: false as const,
            error:
              'Open an individual Instagram video or reel and copy its link. Use instagram.com/reel/… or instagram.com/p/…; popular, explore, profile, and audio pages are not video links.',
          }
        url = new URL(`https://www.instagram.com/${mediaPath[1]}/${mediaPath[2]}/`)
      }
      let explicitProxy: string | undefined
      if (proxyUrl.trim()) {
        try {
          const parsed = new URL(proxyUrl.trim())
          if (
            !['http:', 'https:', 'socks4:', 'socks5:', 'socks5h:'].includes(parsed.protocol) ||
            !parsed.hostname ||
            parsed.search ||
            parsed.hash ||
            (parsed.pathname && parsed.pathname !== '/')
          )
            throw new Error('Invalid proxy')
          explicitProxy = parsed.href
        } catch {
          return {
            ok: false as const,
            error: 'Enter a valid HTTP or SOCKS proxy URL from your VPN app, including its port.',
          }
        }
      }
      const safeDetails = {
        title: typeof details?.title === 'string' ? details.title.slice(0, 500) : undefined,
        batchId: typeof details?.batchId === 'string' ? details.batchId.slice(0, 100) : undefined,
        batchTitle:
          typeof details?.batchTitle === 'string' ? details.batchTitle.slice(0, 500) : undefined,
      }
      const taskId = typeof details?.taskId === 'string' ? details.taskId.slice(0, 100) : ''
      const taskKey = taskId ? socialTaskKey(event.sender.id, taskId) : ''
      let historyId: string
      try {
        const savedUrl = new URL(url.href)
        savedUrl.username = ''
        savedUrl.password = ''
        savedUrl.hash = ''
        // Keep the media identifier, never persist proxy credentials or downloader output.
        savedUrl.search =
          platform === 'youtube' && savedUrl.searchParams.has('v')
            ? new URLSearchParams({ v: savedUrl.searchParams.get('v')! }).toString()
            : ''
        historyId = await history.start(platform, savedUrl.href, safeDetails)
      } catch {
        return {
          ok: false as const,
          error:
            'Could not save download history. Check available disk space and app data permissions.',
        }
      }
      if (taskKey) activeSocialTasks.add(taskKey)
      const markInterrupted = () => {
        void history
          .finish(historyId, 'interrupted')
          .catch((error) => console.error('[social-history]', error))
      }
      event.sender.once('destroyed', markInterrupted)
      try {
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
        const {
          downloader: executable,
          ffmpegDirectory,
          hasFfmpeg,
        } = resolveSocialDownloadTools({
          appPath: app.getAppPath(),
          resourcesPath: process.resourcesPath,
        })
        // Child processes do not inherit Chromium's system/PAC proxy resolution.
        // Keep explicit environment proxy settings under yt-dlp's control.
        let systemProxy: string | undefined
        const hasEnvironmentProxy = [
          'https_proxy',
          'HTTPS_PROXY',
          'all_proxy',
          'ALL_PROXY',
          'http_proxy',
          'HTTP_PROXY',
        ].some((key) => Boolean(process.env[key]))
        if (!explicitProxy && !hasEnvironmentProxy) {
          try {
            const route = await event.sender.session.resolveProxy(url.href)
            const firstRoute = route.split(';')[0]?.trim() ?? ''
            const match = /^(PROXY|HTTPS|SOCKS4|SOCKS5|SOCKS)\s+(\S+)$/i.exec(firstRoute)
            if (match) {
              const scheme = {
                PROXY: 'http',
                HTTPS: 'https',
                SOCKS4: 'socks4',
                SOCKS5: 'socks5',
                SOCKS: 'socks4',
              }[match[1]!.toUpperCase()]
              systemProxy = `${scheme}://${match[2]}`
            }
          } catch {
            console.warn(
              '[social-download] system proxy resolution failed; using downloader configuration',
            )
          }
        }
        console.info('[social-download] connection', {
          senderId: event.sender.id,
          proxySource: explicitProxy
            ? 'manual'
            : hasEnvironmentProxy
              ? 'environment'
              : systemProxy
                ? 'system'
                : 'downloader default',
        })
        let browserCookies: YouTubeBrowser | '' = ''
        let configuredAuthArgs = platform === 'youtube' ? await youtubeAuth.downloaderArgs() : []
        const runDownload = async (
          authenticatedRetry = false,
        ): Promise<{ ok: true; filePath: string } | { ok: false; error: string }> => {
          const cookieFile =
            platform === 'youtube' && !browserCookies && !configuredAuthArgs.length
              ? await exportYouTubeCookies()
              : undefined
          try {
            const result = await new Promise<
              { ok: true; filePath: string } | { ok: false; error: string }
            >((resolve) => {
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
                  taskId: taskId || undefined,
                })
              }
              reportProgress(
                0,
                `Connecting to ${platform === 'youtube' ? 'YouTube' : 'Instagram'}…`,
              )
              const args = [
                '--no-playlist',
                '--continue',
                '--socket-timeout',
                '20',
                '--retry-sleep',
                'http:exp=1:4',
                '--retry-sleep',
                'extractor:exp=1:4',
                '--compat-options',
                'no-certifi',
                '--js-runtimes',
                `node:${process.execPath}`,
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
                hasFfmpeg
                  ? 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best'
                  : 'best[ext=mp4]/best',
                '-P',
                destination,
                '-o',
                '%(title)s [%(id)s].%(ext)s',
                '--print',
                'after_move:FINAL_PATH:%(filepath)s',
                '--no-quiet',
                url.href,
              ]
              if (hasFfmpeg) args.splice(args.indexOf('-P'), 0, '--merge-output-format', 'mp4')
              const downloadProxy = explicitProxy || systemProxy
              if (cookieFile) args.unshift('--cookies', cookieFile.path)
              if (configuredAuthArgs.length && !browserCookies) args.unshift(...configuredAuthArgs)
              if (browserCookies) args.unshift('--cookies-from-browser', browserCookies)
              if (platform === 'youtube') args.unshift('--ignore-config')
              if (downloadProxy) args.unshift('--proxy', downloadProxy)
              if (platform === 'instagram') args.unshift('--use-extractors', 'Instagram')
              if (ffmpegDirectory) args.unshift('--ffmpeg-location', ffmpegDirectory)
              if (allowInvalidCertificate) args.unshift('--no-check-certificates')
              if (event.sender.isDestroyed()) throw new Error('Download window was closed.')
              if (taskKey && pausedSocialTasks.delete(taskKey)) {
                resolve({ ok: false, error: 'Download paused.' })
                return
              }
              const downloaderProcess = spawn(executable, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: socialDownloadEnvironment(process.env),
              })
              if (taskId) {
                const processes =
                  socialProcessesByWebContents.get(event.sender.id) ??
                  new Map<string, ReturnType<typeof spawn>>()
                processes.set(taskId, downloaderProcess)
                socialProcessesByWebContents.set(event.sender.id, processes)
              }
              console.info('[social-download] spawned', {
                senderId: event.sender.id,
                pid: downloaderProcess.pid,
                executable,
              })
              const consumeOutput = (chunk: unknown) => {
                const text = String(chunk)
                output.push(text)
                console.debug('[social-download] output', text.trim().slice(0, 500))
                if (platform === 'instagram' && /Setting up session/i.test(text))
                  reportProgress(0, 'Connecting to Instagram…')
                if (/Extracting URL/i.test(text)) reportProgress(0, 'Checking media address…')
                if (/Downloading webpage/i.test(text)) reportProgress(0, 'Loading video page…')
                if (/Downloading .*API JSON/i.test(text))
                  reportProgress(0, 'Reading video information…')
                if (/Solving JS challenges/i.test(text))
                  reportProgress(0, 'Resolving YouTube media…')
                if (/Downloading \d+ format/i.test(text))
                  reportProgress(0, 'Starting media transfer…')
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
                progressBuffer = consumed
                  ? progressBuffer.slice(consumed)
                  : progressBuffer.slice(-256)
              }
              downloaderProcess.stdout.on('data', consumeOutput)
              downloaderProcess.stderr.on('data', consumeOutput)
              const cancelDownload = () => downloaderProcess.kill()
              event.sender.once('destroyed', cancelDownload)
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
                event.sender.removeListener('destroyed', cancelDownload)
                if (taskId) {
                  const processes = socialProcessesByWebContents.get(event.sender.id)
                  if (processes?.get(taskId) === downloaderProcess) processes.delete(taskId)
                  if (processes?.size === 0) socialProcessesByWebContents.delete(event.sender.id)
                }
                const wasPaused = taskKey ? pausedSocialTasks.delete(taskKey) : false
                console.info('[social-download] process closed', {
                  senderId: event.sender.id,
                  code,
                  finalPath,
                })
                if (failedToStart) return
                if (wasPaused) {
                  resolve({ ok: false, error: 'Download paused.' })
                  return
                }
                const lines = output.join('').trim().split(/\r?\n/).filter(Boolean)
                finalPath =
                  lines
                    .filter((line) => line.startsWith('FINAL_PATH:'))
                    .at(-1)
                    ?.slice('FINAL_PATH:'.length)
                    .trim() || finalPath
                if (code === 0) {
                  if (!event.sender.isDestroyed())
                    socialFilesByWebContents.set(event.sender.id, finalPath || destination)
                  reportProgress(100, 'Download complete')
                  resolve({ ok: true, filePath: finalPath || destination })
                } else {
                  const details = lines.slice(-3).join('\n') || `yt-dlp exited with code ${code}`
                  const certificateFailed = hasCertificateError(output.join(''))
                  const networkUnavailable =
                    /Network is unreachable|No route to host|Network is down/i.test(details)
                  const connectionTimedOut =
                    /Connection timed out|connect timeout|curl: \(28\)/i.test(details)
                  resolve({
                    ok: false,
                    error: certificateFailed
                      ? 'The HTTPS certificate could not be verified. The downloader uses your system trust store. If your VPN/proxy inspects HTTPS, install its CA through your operating system’s trusted certificate settings, or try a connection without HTTPS inspection. If SSL_CERT_FILE or SSL_CERT_DIR is set, check that it points to the correct trust store. Retrying alone will not fix this certificate error.'
                      : connectionTimedOut
                        ? `Connection to ${platform === 'instagram' ? 'Instagram' : 'YouTube'} timed out before the download could finish. Enter the HTTP/SOCKS proxy address from your VPN app in the Proxy field, or enable its system-wide VPN mode, then retry.`
                        : networkUnavailable
                          ? `Cannot connect to ${platform === 'instagram' ? 'Instagram' : 'YouTube'}: the network is unreachable. Check your internet connection and VPN/proxy, then retry. No file was downloaded.`
                          : details,
                  })
                }
              })
            })
            if (
              platform === 'youtube' &&
              !result.ok &&
              /sign in to confirm|login required|use --cookies/i.test(result.error)
            ) {
              if (authenticatedRetry)
                return {
                  ok: false,
                  error:
                    'YouTube still requires verification after sign-in. Try another VPN/proxy connection or refresh your YouTube session. Cookies do not guarantee access.',
                }
              socialProgressByWebContents.set(event.sender.id, {
                percent: 0,
                status:
                  'Sign in to YouTube in the opened window; download will resume automatically…',
              })
              try {
                await signInToYouTube(
                  event.sender,
                  explicitProxy ||
                    systemProxy ||
                    process.env.https_proxy ||
                    process.env.HTTPS_PROXY ||
                    process.env.all_proxy ||
                    process.env.ALL_PROXY ||
                    process.env.http_proxy ||
                    process.env.HTTP_PROXY,
                )
                await youtubeAuth.useAppSession()
                configuredAuthArgs = []
              } catch (error) {
                if (event.sender.isDestroyed()) throw error
                const choice = await dialog.showMessageBox({
                  type: 'info',
                  title: 'Use your browser’s YouTube sign-in',
                  message: 'Sign-in was closed or could not complete.',
                  detail:
                    'If Google blocked the sign-in window, sign in to YouTube in Firefox or Chrome and confirm the video plays. Choose that browser below to let yt-dlp read its cookies and retry automatically. Close the browser first if cookie access fails.',
                  buttons: ['Use Firefox cookies', 'Use Chrome cookies', 'Cancel'],
                  defaultId: 2,
                  cancelId: 2,
                })
                if (choice.response === 2) throw error
                browserCookies = choice.response === 0 ? 'firefox' : 'chrome'
                await youtubeAuth.useBrowser(browserCookies)
                await forgetYouTubeSession()
                configuredAuthArgs = []
              }
              return await runDownload(true)
            }
            return result
          } finally {
            await cookieFile?.cleanup()
          }
        }
        const result = await runDownload()
        const historyStatus = result.ok
          ? 'completed'
          : event.sender.isDestroyed() || result.error === 'Download paused.'
            ? 'interrupted'
            : 'failed'
        await history.finish(historyId, historyStatus, result.ok ? result.filePath : undefined)
        return result
      } catch (error) {
        await history
          .finish(historyId, event.sender.isDestroyed() ? 'interrupted' : 'failed')
          .catch((failure) => console.error('[social-history]', failure))
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Media download failed.',
        }
      } finally {
        if (taskKey) {
          activeSocialTasks.delete(taskKey)
          pausedSocialTasks.delete(taskKey)
        }
        event.sender.removeListener('destroyed', markInterrupted)
      }
    },
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
    hasShadow: true,
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
