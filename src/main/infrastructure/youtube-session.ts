import { app, BrowserWindow, session, type Cookie, type WebContents } from 'electron'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

const youtubeSession = () => session.fromPartition('persist:youtube-login')
let loginInProgress = false

export function youtubeCookiesText(cookies: Cookie[]): string {
  const rows = cookies
    .filter(
      (cookie) =>
        /(^|\.)youtube\.com$/i.test(cookie.domain ?? '') &&
        ![cookie.domain, cookie.path, cookie.name, cookie.value].some((part) =>
          /[\r\n\t]/.test(part ?? ''),
        ),
    )
    .map((cookie) =>
      [
        `${cookie.httpOnly ? '#HttpOnly_' : ''}${cookie.domain}`,
        cookie.domain?.startsWith('.') ? 'TRUE' : 'FALSE',
        cookie.path || '/',
        cookie.secure ? 'TRUE' : 'FALSE',
        cookie.session ? 0 : Math.floor(cookie.expirationDate ?? 0),
        cookie.name,
        cookie.value,
      ].join('\t'),
    )
  return '# Netscape HTTP Cookie File\n' + rows.join('\n') + '\n'
}

export async function exportYouTubeCookies() {
  const cookies = await youtubeSession().cookies.get({ domain: 'youtube.com' })
  if (!cookies.length) return undefined
  const folder = await mkdtemp(join(app.getPath('temp'), 'nexus-youtube-'))
  const path = join(folder, 'cookies.txt')
  try {
    await writeFile(path, youtubeCookiesText(cookies), { mode: 0o600 })
  } catch (error) {
    await rm(folder, { recursive: true, force: true })
    throw error
  }
  return { path, cleanup: () => rm(folder, { recursive: true, force: true }) }
}

// The remote sign-in page has no preload or access to the application's IPC API.
export async function signInToYouTube(owner: WebContents, proxy?: string): Promise<void> {
  if (loginInProgress)
    throw new Error('YouTube sign-in is already open. Finish it, then retry this download.')
  loginInProgress = true
  try {
    const loginSession = youtubeSession()
    await loginSession.setProxy(proxy ? { proxyRules: proxy } : { mode: 'system' })
    if (owner.isDestroyed()) throw new Error('Download window closed.')
    await new Promise<void>((resolve, reject) => {
      let signedIn = false
      const window = new BrowserWindow({
        width: 960,
        height: 760,
        title: 'Sign in to YouTube to continue downloading',
        parent: BrowserWindow.fromWebContents(owner) ?? undefined,
        autoHideMenuBar: true,
        webPreferences: {
          session: loginSession,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      })
      const allowed = (value: string) => {
        try {
          const url = new URL(value)
          return (
            url.protocol === 'https:' &&
            (/^(?:[^.]+\.)*youtube\.com$/.test(url.hostname) ||
              ['accounts.google.com', 'consent.google.com'].includes(url.hostname))
          )
        } catch {
          return false
        }
      }
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      window.webContents.on('will-navigate', (event, url) => {
        if (!allowed(url)) event.preventDefault()
      })
      window.webContents.on('will-redirect', (event, url) => {
        if (!allowed(url)) event.preventDefault()
      })
      const cancel = () => {
        if (!window.isDestroyed()) window.close()
      }
      owner.once('destroyed', cancel)
      window.webContents.on('did-finish-load', () => {
        void (async () => {
          if (window.isDestroyed()) return
          const url = new URL(window.webContents.getURL())
          if (!/(^|\.)youtube\.com$/.test(url.hostname)) return
          const cookies = await loginSession.cookies.get({ domain: 'youtube.com' })
          if (
            cookies.some((cookie) =>
              ['SAPISID', '__Secure-3PAPISID', '__Secure-1PAPISID'].includes(cookie.name),
            )
          ) {
            await loginSession.cookies.flushStore()
            signedIn = true
            if (!window.isDestroyed()) window.close()
          }
        })().catch(() => {
          /* Leave sign-in visible so the user can retry or close it. */
        })
      })
      window.once('closed', () => {
        owner.removeListener('destroyed', cancel)
        if (signedIn) resolve()
        else
          reject(
            new Error(
              'YouTube sign-in was not completed. Google may reject embedded sign-in; use browser cookies instead.',
            ),
          )
      })
      void window
        .loadURL(
          'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F',
        )
        .catch(() => {
          if (!window.isDestroyed()) window.close()
        })
    })
  } finally {
    loginInProgress = false
  }
}

export async function forgetYouTubeSession(): Promise<void> {
  if (loginInProgress) throw new Error('Close the YouTube sign-in window first.')
  await youtubeSession().clearStorageData()
  await youtubeSession().cookies.flushStore()
}
