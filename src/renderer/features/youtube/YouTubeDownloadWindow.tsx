import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckSquare,
  Clock3,
  ExternalLink,
  ListVideo,
  Play,
  Search,
  Square,
  Youtube,
} from 'lucide-react'
import type { SocialDownloadRecord, YouTubeCatalog } from '../../../shared/download'

const recentChannelsKey = 'nexus.youtube.recent-channels.v1'

interface RecentChannel extends YouTubeCatalog {
  kind: 'channel'
  searchedAt: string
}

const duration = (seconds?: number) => {
  if (!seconds) return ''
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

const videoId = (value: string) => {
  try {
    const url = new URL(value)
    return url.hostname.endsWith('youtu.be')
      ? (url.pathname.split('/').filter(Boolean)[0] ?? '')
      : (url.searchParams.get('v') ?? '')
  } catch {
    return ''
  }
}

const validRecentChannels = (value: unknown): RecentChannel[] => {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is RecentChannel =>
      Boolean(
        item &&
        typeof item === 'object' &&
        item.kind === 'channel' &&
        typeof item.title === 'string' &&
        typeof item.url === 'string' &&
        typeof item.searchedAt === 'string' &&
        Array.isArray(item.playlists) &&
        item.playlists.every(
          (playlist: YouTubeCatalog['playlists'][number]) =>
            playlist &&
            typeof playlist.id === 'string' &&
            typeof playlist.title === 'string' &&
            typeof playlist.url === 'string',
        ),
      ),
    )
    .slice(0, 8)
}

const loadRecentChannels = () => {
  try {
    return validRecentChannels(JSON.parse(localStorage.getItem(recentChannelsKey) ?? '[]'))
  } catch {
    return []
  }
}

const initialRecentChannels = loadRecentChannels()

export function YouTubeDownloadWindow() {
  const [input, setInput] = useState(initialRecentChannels[0]?.url ?? '')
  const [catalog, setCatalog] = useState<YouTubeCatalog | undefined>(initialRecentChannels[0])
  const [parentChannel, setParentChannel] = useState<YouTubeCatalog>()
  const [recentChannels, setRecentChannels] = useState<RecentChannel[]>(initialRecentChannels)
  const [history, setHistory] = useState<SocialDownloadRecord[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [message, setMessage] = useState('')
  const [proxy, setProxy] = useState('')
  const [allowInvalidCertificate, setAllowInvalidCertificate] = useState(false)
  const [progress, setProgress] = useState({ percent: 0, status: '' })

  const refreshHistory = async () => {
    try {
      setHistory(await window.downloads.listSocialHistory())
    } catch {
      setMessage('Download status could not be loaded from media history.')
    }
  }

  useEffect(() => window.downloads.onSocialProgress(setProgress), [])
  useEffect(() => {
    void refreshHistory()
    window.addEventListener('focus', refreshHistory)
    return () => window.removeEventListener('focus', refreshHistory)
  }, [])

  const completedByVideo = useMemo(() => {
    const records = new Map<string, SocialDownloadRecord>()
    for (const record of history) {
      const id = videoId(record.url)
      if (id && record.platform === 'youtube' && record.status === 'completed' && !records.has(id))
        records.set(id, record)
    }
    return records
  }, [history])

  const videos = catalog?.videos ?? []
  const selectedVideos = useMemo(
    () => videos.filter((video) => selected.has(video.id)),
    [selected, videos],
  )

  const rememberChannel = (channel: YouTubeCatalog) => {
    if (channel.kind !== 'channel') return
    const recent: RecentChannel = {
      ...channel,
      kind: 'channel',
      searchedAt: new Date().toISOString(),
    }
    setRecentChannels((current) => {
      const next = [recent, ...current.filter((item) => item.url !== recent.url)].slice(0, 8)
      try {
        localStorage.setItem(recentChannelsKey, JSON.stringify(next))
      } catch {
        // Recent searches are a convenience; storage failures must not block browsing.
      }
      return next
    })
  }

  const inspect = async (value = input, keepParentChannel = false) => {
    setLoading(true)
    setMessage('Looking up YouTube…')
    try {
      const result = await window.downloads.inspectYouTube(
        value,
        allowInvalidCertificate,
        proxy.trim(),
      )
      setCatalog(result)
      setInput(value)
      if (result.kind === 'channel') {
        setParentChannel(undefined)
        rememberChannel(result)
      } else if (!keepParentChannel) {
        setParentChannel(undefined)
      }
      setSelected(
        new Set(
          result.videos.filter((video) => !completedByVideo.has(video.id)).map((video) => video.id),
        ),
      )
      setMessage(
        result.kind === 'channel'
          ? `${result.playlists.length} playlists found. Choose one to browse its videos.`
          : `${result.videos.length} videos found. New videos are selected by default.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'YouTube could not be inspected.')
    } finally {
      setLoading(false)
    }
  }

  const openChannel = (channel: YouTubeCatalog) => {
    setCatalog(channel)
    setParentChannel(undefined)
    setInput(channel.url)
    setSelected(new Set())
    setMessage(`${channel.playlists.length} cached playlists. Choose one to refresh its videos.`)
  }

  const openPlaylist = async (playlistUrl: string) => {
    if (catalog?.kind === 'channel') setParentChannel(catalog)
    await inspect(playlistUrl, true)
  }

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const downloadVideos = async (items: typeof videos) => {
    if (!catalog || items.length === 0) return
    setDownloading(true)
    const batchId = crypto.randomUUID()
    let completed = 0
    try {
      for (const [index, video] of items.entries()) {
        setMessage(`Downloading ${index + 1} of ${items.length}: ${video.title}`)
        const result = await window.downloads.downloadSocial(
          'youtube',
          video.url,
          allowInvalidCertificate,
          proxy.trim(),
          { title: video.title, batchId, batchTitle: catalog.title },
        )
        if (!result.ok) {
          setMessage(`Stopped after ${completed} completed. ${result.error}`)
          break
        }
        completed += 1
        await refreshHistory()
        setSelected((current) => {
          const next = new Set(current)
          next.delete(video.id)
          return next
        })
      }
      if (completed === items.length)
        setMessage(
          items.length === 1
            ? 'Video downloaded and ready to open.'
            : `Playlist download complete — ${completed} videos saved.`,
        )
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'The YouTube download could not be started.',
      )
    } finally {
      setDownloading(false)
    }
  }

  const openDownloaded = async (record: SocialDownloadRecord) => {
    const problem = await window.downloads.socialHistoryAction(record.id, 'open')
    if (problem) setMessage(problem)
  }

  return (
    <div className="native-dialog-host youtube-library-host">
      <div className="window-dialog youtube-library">
        <div className="dialog-title">
          YouTube offline library
          <button aria-label="Close YouTube downloader" onClick={() => window.close()}>
            ×
          </button>
        </div>
        <div className="youtube-library-body">
          <header>
            <Youtube size={40} />
            <div>
              <h2>Build your offline video library</h2>
              <p>Browse a channel or playlist, then download only the videos you need.</p>
            </div>
          </header>
          <div className="youtube-source-row">
            <input
              autoFocus
              aria-label="YouTube channel or playlist"
              value={input}
              disabled={loading || downloading}
              placeholder="@channelname or https://youtube.com/playlist?list=…"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && input.trim() && void inspect()}
            />
            <button
              className="primary"
              disabled={!input.trim() || loading || downloading}
              onClick={() => inspect()}
            >
              <Search size={16} /> {loading ? 'Finding…' : 'Find'}
            </button>
          </div>
          {!downloading && (
            <details className="youtube-advanced youtube-lookup-options">
              <summary>Connection options</summary>
              <input
                aria-label="Proxy"
                value={proxy}
                placeholder="http://127.0.0.1:PORT or socks5://127.0.0.1:PORT"
                onChange={(event) => setProxy(event.target.value)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={allowInvalidCertificate}
                  onChange={(event) => setAllowInvalidCertificate(event.target.checked)}
                />{' '}
                Allow untrusted certificates (only on a connection you trust)
              </label>
              <button
                onClick={async () => {
                  await window.downloads.forgetYouTubeSession()
                  setMessage('Saved YouTube sign-in removed.')
                }}
              >
                Forget saved YouTube sign-in
              </button>
            </details>
          )}

          <div className="youtube-browser-layout">
            <aside className="youtube-recents" aria-label="Recent YouTube channels">
              <div className="youtube-section-title">
                <Clock3 size={16} />
                <strong>Recent channels</strong>
              </div>
              {recentChannels.length === 0 ? (
                <p>Your searched channels will appear here.</p>
              ) : (
                recentChannels.map((channel) => (
                  <button
                    key={channel.url}
                    className={catalog?.url === channel.url ? 'active' : ''}
                    onClick={() => openChannel(channel)}
                  >
                    <Youtube size={18} />
                    <span>{channel.title}</span>
                    <small>{channel.playlists.length} playlists</small>
                  </button>
                ))
              )}
            </aside>

            <section className="youtube-explorer" aria-label="YouTube playlists and videos">
              {!catalog && !loading && (
                <div className="youtube-welcome">
                  <ListVideo size={42} />
                  <h3>Choose a recent channel or find a new one</h3>
                  <p>Playlists stay organized here, separate from single-video downloads.</p>
                </div>
              )}
              {catalog?.kind === 'channel' && (
                <div className="youtube-results">
                  <div className="youtube-explorer-heading">
                    <div>
                      <small>CHANNEL</small>
                      <h3>{catalog.title}</h3>
                    </div>
                    <span>{catalog.playlists.length} playlists</span>
                  </div>
                  <div className="youtube-card-grid">
                    {catalog.playlists.map((playlist) => (
                      <button
                        key={playlist.id}
                        className="youtube-playlist-card"
                        disabled={loading}
                        onClick={() => openPlaylist(playlist.url)}
                      >
                        <ListVideo size={25} />
                        <span>{playlist.title}</span>
                        <small>
                          {playlist.itemCount ? `${playlist.itemCount} videos` : 'Browse videos'}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {catalog?.kind === 'playlist' && (
                <div className="youtube-results">
                  <div className="youtube-selection-head">
                    <div>
                      <button
                        onClick={() => {
                          if (parentChannel) openChannel(parentChannel)
                          else {
                            setCatalog(undefined)
                            setSelected(new Set())
                          }
                        }}
                      >
                        <ArrowLeft size={15} />{' '}
                        {parentChannel ? 'Back to playlists' : 'Change source'}
                      </button>
                      <h3>{catalog.title}</h3>
                      <small>
                        {videos.length} videos · {selected.size} selected ·{' '}
                        {videos.filter((video) => completedByVideo.has(video.id)).length} downloaded
                      </small>
                    </div>
                    <button
                      disabled={downloading}
                      onClick={() => {
                        const available = videos.filter((video) => !completedByVideo.has(video.id))
                        setSelected(
                          selected.size === available.length
                            ? new Set()
                            : new Set(available.map((video) => video.id)),
                        )
                      }}
                    >
                      {selected.size > 0 ? <Square size={16} /> : <CheckSquare size={16} />}
                      {selected.size > 0 ? 'Clear selection' : 'Select new videos'}
                    </button>
                  </div>
                  <div className="youtube-video-list" role="list">
                    {videos.map((video, index) => {
                      const completed = completedByVideo.get(video.id)
                      return (
                        <div
                          key={video.id}
                          className={`youtube-video-row ${completed ? 'downloaded' : ''}`}
                          role="listitem"
                        >
                          <input
                            aria-label={`Select ${video.title}`}
                            type="checkbox"
                            checked={selected.has(video.id)}
                            disabled={downloading || Boolean(completed)}
                            onChange={() => toggle(video.id)}
                          />
                          <span className="youtube-video-number">
                            {completed ? '✓' : index + 1}
                          </span>
                          <span className="youtube-video-title" title={video.title}>
                            {video.title}
                            <small>{completed ? 'Downloaded' : duration(video.duration)}</small>
                          </span>
                          {completed ? (
                            <button
                              disabled={downloading}
                              onClick={() => openDownloaded(completed)}
                            >
                              <ExternalLink size={14} /> Open file
                            </button>
                          ) : (
                            <button
                              className="primary"
                              disabled={downloading}
                              onClick={() => downloadVideos([video])}
                            >
                              <Play size={14} /> Download
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>

          {downloading && (
            <div className="youtube-batch-progress">
              <span>{progress.status || message}</span>
              <b>{progress.percent > 0 ? `${progress.percent.toFixed(0)}%` : 'Preparing'}</b>
              <progress max="100" value={progress.percent || undefined} />
            </div>
          )}
          {message && (
            <p className="youtube-message" role="status">
              {message}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <button
            className="social-history-link"
            onClick={() => window.downloads.showUtilityWindow('social-history')}
          >
            Playlist history
          </button>
          {catalog?.kind === 'playlist' && (
            <button
              className="primary"
              disabled={downloading || selectedVideos.length === 0}
              onClick={() => downloadVideos(selectedVideos)}
            >
              {downloading ? 'Downloading queue…' : `Download ${selectedVideos.length} selected`}
            </button>
          )}
          <button onClick={() => window.close()}>{downloading ? 'Stop and close' : 'Close'}</button>
        </div>
      </div>
    </div>
  )
}
