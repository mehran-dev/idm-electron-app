import { access, chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { YouTubeAuthStatus, YouTubeBrowser } from '../../shared/download-models'

const browsers: YouTubeBrowser[] = ['firefox', 'chrome', 'chromium', 'brave', 'edge']

interface AuthConfig {
  version: 1
  mode: 'none' | 'app-session' | 'browser' | 'manual'
  browser?: YouTubeBrowser
  updatedAt?: string
}

export function youtubeOnlyCookieText(value: string): string {
  if (value.length > 2_000_000) throw new Error('The cookie text is too large.')
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  if (!lines.some((line) => /^# (?:Netscape )?HTTP Cookie File\s*$/i.test(line.trim())))
    throw new Error('Paste cookies in Netscape cookies.txt format.')
  const accepted: string[] = []
  for (const line of lines) {
    if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) continue
    const fields = line.split('\t')
    if (fields.length !== 7) continue
    const domain = fields[0]!.replace(/^#HttpOnly_/, '')
    if (!/(^|\.)youtube\.com$/i.test(domain)) continue
    if (fields.some((field) => /[\r\n]/.test(field))) continue
    accepted.push(fields.join('\t'))
  }
  if (!accepted.length)
    throw new Error('No YouTube cookies were found. Export cookies for youtube.com and try again.')
  return `# Netscape HTTP Cookie File\n${accepted.join('\n')}\n`
}

export class YouTubeAuthStore {
  private config?: AuthConfig
  private ready: Promise<void>

  constructor(
    private readonly configPath: string,
    private readonly cookiePath: string,
  ) {
    this.ready = this.load()
  }

  private async load() {
    try {
      const parsed = JSON.parse(await readFile(this.configPath, 'utf8')) as AuthConfig
      if (
        parsed.version === 1 &&
        ['none', 'app-session', 'browser', 'manual'].includes(parsed.mode) &&
        (parsed.browser === undefined || browsers.includes(parsed.browser))
      )
        this.config = parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.error('[youtube-auth] configuration could not be loaded', error)
    }
    this.config ??= { version: 1, mode: 'none' }
  }

  private async persist(config: AuthConfig) {
    await mkdir(dirname(this.configPath), { recursive: true })
    const temporary = `${this.configPath}.tmp`
    await writeFile(temporary, JSON.stringify(config), { mode: 0o600 })
    await chmod(temporary, 0o600)
    await rename(temporary, this.configPath)
    this.config = config
  }

  async useAppSession() {
    await this.ready
    await rm(this.cookiePath, { force: true })
    await this.persist({ version: 1, mode: 'app-session', updatedAt: new Date().toISOString() })
  }

  async useBrowser(browser: YouTubeBrowser) {
    await this.ready
    if (!browsers.includes(browser)) throw new Error('Unsupported browser selection.')
    await rm(this.cookiePath, { force: true })
    await this.persist({
      version: 1,
      mode: 'browser',
      browser,
      updatedAt: new Date().toISOString(),
    })
  }

  async saveCookies(value: string) {
    await this.ready
    const filtered = youtubeOnlyCookieText(value)
    await mkdir(dirname(this.cookiePath), { recursive: true })
    const temporary = `${this.cookiePath}.tmp`
    await writeFile(temporary, filtered, { mode: 0o600 })
    await chmod(temporary, 0o600)
    await rename(temporary, this.cookiePath)
    await this.persist({ version: 1, mode: 'manual', updatedAt: new Date().toISOString() })
  }

  async clear() {
    await this.ready
    await rm(this.cookiePath, { force: true })
    await this.persist({ version: 1, mode: 'none' })
  }

  async downloaderArgs(): Promise<string[]> {
    await this.ready
    if (this.config!.mode === 'browser' && this.config!.browser)
      return ['--cookies-from-browser', this.config!.browser]
    if (this.config!.mode === 'manual') {
      try {
        await access(this.cookiePath)
        return ['--cookies', this.cookiePath]
      } catch {
        await this.persist({ version: 1, mode: 'none' })
      }
    }
    return []
  }

  async status(hasAppSession: boolean): Promise<YouTubeAuthStatus> {
    await this.ready
    const config = this.config!
    if (config.mode === 'browser' && config.browser)
      return {
        mode: 'browser',
        browser: config.browser,
        label: `${config.browser[0]!.toUpperCase()}${config.browser.slice(1)} selected`,
        detail: 'Browser cookies are read locally by yt-dlp only when a YouTube request starts.',
        updatedAt: config.updatedAt,
      }
    if (config.mode === 'manual') {
      try {
        await access(this.cookiePath)
      } catch {
        await this.persist({ version: 1, mode: 'none' })
        return this.status(hasAppSession)
      }
      return {
        mode: 'manual',
        label: 'Manual YouTube cookies saved',
        detail: 'Only youtube.com cookie rows are stored locally. Account email is not available.',
        updatedAt: config.updatedAt,
      }
    }
    if ((config.mode === 'app-session' || config.mode === 'none') && hasAppSession)
      return {
        mode: 'app-session',
        label: 'Signed in with an isolated session',
        detail:
          'The Google/YouTube session is active. Nexus does not read your password or account email.',
        updatedAt: config.updatedAt,
      }
    return {
      mode: 'none',
      label: 'Not signed in',
      detail: 'Public videos can still be downloaded without connecting an account.',
    }
  }
}
