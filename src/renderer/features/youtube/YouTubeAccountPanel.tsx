import { useCallback, useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  CircleSlash2,
  Cookie,
  ExternalLink,
  KeyRound,
  MonitorDown,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  X,
} from 'lucide-react'
import type { YouTubeAuthStatus, YouTubeBrowser } from '../../../shared/download'

const browsers: { value: YouTubeBrowser; label: string }[] = [
  { value: 'firefox', label: 'Firefox' },
  { value: 'chrome', label: 'Google Chrome' },
  { value: 'chromium', label: 'Chromium' },
  { value: 'brave', label: 'Brave' },
  { value: 'edge', label: 'Microsoft Edge' },
]

const emptyStatus: YouTubeAuthStatus = {
  mode: 'none',
  label: 'Checking YouTube access…',
  detail: 'Public videos do not require an account.',
}

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export function YouTubeAccountPanel({ proxyUrl = '' }: { proxyUrl?: string }) {
  const [status, setStatus] = useState<YouTubeAuthStatus>(emptyStatus)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState<'signin' | 'browser' | 'manual' | 'clear'>()
  const [browser, setBrowser] = useState<YouTubeBrowser>('firefox')
  const [cookieText, setCookieText] = useState('')
  const [message, setMessage] = useState('')
  const closeOptions = useCallback(() => {
    setCookieText('')
    setMessage('')
    setExpanded(false)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const next = await window.downloads.getYouTubeAuthStatus()
      setStatus(next)
      if (next.browser) setBrowser(next.browser)
    } catch (error) {
      setMessage(errorText(error, 'YouTube access status could not be loaded.'))
    }
  }, [])

  useEffect(() => {
    void refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])
  useEffect(() => {
    if (!expanded) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) closeOptions()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [busy, closeOptions, expanded])

  const run = async (
    action: NonNullable<typeof busy>,
    request: () => Promise<YouTubeAuthStatus>,
    success: string,
  ) => {
    setBusy(action)
    setMessage('')
    try {
      const next = await request()
      setStatus(next)
      if (next.browser) setBrowser(next.browser)
      if (action === 'manual') setCookieText('')
      setMessage(success)
    } catch (error) {
      setMessage(errorText(error, 'YouTube access could not be updated.'))
    } finally {
      setBusy(undefined)
    }
  }

  const connected = status.mode !== 'none'
  const StatusIcon = connected ? ShieldCheck : ShieldQuestion

  return (
    <section className={`youtube-auth-panel ${connected ? 'connected' : ''}`}>
      <div className="youtube-auth-summary">
        <StatusIcon size={21} aria-hidden="true" />
        <div>
          <small>YOUTUBE ACCESS</small>
          <strong>{status.label}</strong>
          <span>{status.detail}</span>
        </div>
        <button
          type="button"
          className="youtube-auth-toggle"
          aria-expanded={expanded}
          onClick={() => (expanded ? closeOptions() : setExpanded(true))}
        >
          {expanded ? 'Hide options' : connected ? 'Manage access' : 'Sign-in options'}
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {expanded && (
        <div
          className="youtube-auth-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) closeOptions()
          }}
        >
          <div
            className="youtube-auth-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="youtube-auth-title"
          >
            <header>
              <div>
                <small>PRIVACY & ACCESS</small>
                <h3 id="youtube-auth-title">Choose how YouTube can identify you</h3>
              </div>
              <button
                type="button"
                autoFocus
                aria-label="Close YouTube access options"
                disabled={Boolean(busy)}
                onClick={closeOptions}
              >
                <X size={17} />
              </button>
            </header>
            <div className="youtube-auth-options">
              <div className="youtube-auth-current">
                <StatusIcon size={19} aria-hidden="true" />
                <div>
                  <small>CURRENT ACCESS</small>
                  <strong>{status.label}</strong>
                  <span>{status.detail}</span>
                </div>
              </div>
              <p className="youtube-auth-intro">
                Choose one available method. Nexus does not receive or store your Google password.
                Public videos work without any of these options.
              </p>

              <article
                className={`youtube-auth-method recommended ${status.mode === 'app-session' ? 'active' : ''}`}
              >
                <KeyRound size={20} aria-hidden="true" />
                <div>
                  <div className="youtube-auth-method-title">
                    <strong>Google username &amp; password</strong>
                    <span>Isolated</span>
                  </div>
                  <p>
                    Google opens in an isolated Nexus window. Your password is sent to Google, never
                    collected or saved by Nexus; only that window’s YouTube session is retained.
                  </p>
                  <button
                    type="button"
                    className="primary"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void run(
                        'signin',
                        () => window.downloads.signInToYouTube(proxyUrl.trim()),
                        'The isolated YouTube session is ready.',
                      )
                    }
                  >
                    <ExternalLink size={15} />
                    {busy === 'signin' ? 'Waiting for Google…' : 'Open private sign-in'}
                  </button>
                </div>
              </article>

              <article
                className={`youtube-auth-method ${status.mode === 'browser' ? 'active' : ''}`}
              >
                <MonitorDown size={20} aria-hidden="true" />
                <div>
                  <strong>Use cookies from a browser</strong>
                  <p>
                    On each YouTube request, yt-dlp reads the selected browser’s local cookie store.
                    Nexus saves only your browser choice. Close the browser first if access fails.
                  </p>
                  <div className="youtube-auth-inline">
                    <select
                      aria-label="Browser profile for YouTube access"
                      value={browser}
                      disabled={Boolean(busy)}
                      onChange={(event) => setBrowser(event.target.value as YouTubeBrowser)}
                    >
                      {browsers.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void run(
                          'browser',
                          () => window.downloads.useYouTubeBrowser(browser),
                          `${browsers.find((item) => item.value === browser)?.label} selected.`,
                        )
                      }
                    >
                      {busy === 'browser' ? 'Saving…' : 'Use this browser'}
                    </button>
                  </div>
                </div>
              </article>

              <article
                className={`youtube-auth-method ${status.mode === 'manual' ? 'active' : ''}`}
              >
                <Cookie size={20} aria-hidden="true" />
                <div>
                  <strong>Paste cookies manually</strong>
                  <p>
                    Paste Netscape cookies.txt content. Nexus keeps only youtube.com rows in local,
                    owner-only storage; Google and Gmail rows are discarded. Treat cookies like a
                    password and never share them.
                  </p>
                  <textarea
                    aria-label="YouTube cookies in Netscape cookies.txt format"
                    value={cookieText}
                    disabled={Boolean(busy)}
                    placeholder={'# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t…'}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => setCookieText(event.target.value)}
                  />
                  <button
                    type="button"
                    disabled={Boolean(busy) || !cookieText.trim()}
                    onClick={() =>
                      void run(
                        'manual',
                        () => window.downloads.saveYouTubeCookies(cookieText),
                        'YouTube-only cookies were saved locally.',
                      )
                    }
                  >
                    {busy === 'manual' ? 'Checking…' : 'Save YouTube cookies'}
                  </button>
                </div>
              </article>

              <article className="youtube-auth-method unavailable">
                <CircleSlash2 size={20} aria-hidden="true" />
                <div>
                  <strong>Google OAuth</strong>
                  <p>
                    Unavailable for YouTube downloads because yt-dlp no longer supports YouTube
                    OAuth. Nexus does not show a button that cannot provide working access.
                  </p>
                </div>
              </article>

              {message && (
                <div className="youtube-auth-message" role="status">
                  {message}
                </div>
              )}

              {connected && (
                <div className="youtube-auth-clear">
                  <span>
                    Account identity is intentionally not read, so no Gmail address is shown.
                  </span>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void run(
                        'clear',
                        () => window.downloads.clearYouTubeAuth(),
                        'Saved YouTube access was removed.',
                      )
                    }
                  >
                    <Trash2 size={15} /> {busy === 'clear' ? 'Removing…' : 'Remove saved access'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
