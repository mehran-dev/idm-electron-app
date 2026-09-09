import { ArrowLeft, CheckSquare, ListVideo, Search, Youtube } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  YouTubeBrowseResult,
  YouTubeChannelSummary,
  YouTubePlaylistSummary,
  YouTubeVideoSummary,
} from '../../../shared/download'

const duration = (seconds?: number) => {
  if (!seconds) return ''
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export function YouTubeBrowserWindow({ onSingleVideo }: { onSingleVideo: () => void }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<YouTubeBrowseResult>()
  const [trail, setTrail] = useState<YouTubeBrowseResult[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [batch, setBatch] = useState<{ current: number; total: number; title: string }>()
  const [progress, setProgress] = useState({ percent: 0, status: '' })
  const request = useRef(0)
  const videos = result?.kind === 'videos' ? result.videos : []
  const available = useMemo(() => videos.filter((video) => !video.unavailable), [videos])

  useEffect(() => window.downloads.onSocialProgress(setProgress), [])

  const browse = async (input: string, pushCurrent = true) => {
    const token = ++request.current
    setLoading(true)
    setError('')
    try {
      const next = await window.downloads.browseYouTube(input)
      if (token !== request.current) return
      if (pushCurrent && result) setTrail((items) => [...items, result])
      setResult(next)
      setSelected(new Set())
    } catch (reason) {
      if (token === request.current)
        setError(reason instanceof Error ? reason.message : 'Could not load YouTube.')
    } finally {
      if (token === request.current) setLoading(false)
    }
  }

  const back = () => {
    const previous = trail.at(-1)
    if (!previous) return
    request.current += 1
    setTrail((items) => items.slice(0, -1))
    setResult(previous)
    setSelected(new Set())
    setError('')
  }

  const downloadSelected = async () => {
    const chosen = available.filter((video) => selected.has(video.id))
    if (!chosen.length) return
    setError('')
    for (let index = 0; index < chosen.length; index += 1) {
      const video = chosen[index]!
      setProgress({ percent: 0, status: 'Preparing video…' })
      setBatch({ current: index + 1, total: chosen.length, title: video.title })
      const response = await window.downloads.downloadSocial('youtube', video.url)
      if (!response.ok) {
        setError(`Stopped at “${video.title}”: ${response.error}`)
        setBatch(undefined)
        return
      }
    }
    setBatch(undefined)
    setSelected(new Set())
    setError(`${chosen.length} video${chosen.length === 1 ? '' : 's'} downloaded successfully.`)
  }

  return (
    <div className="youtube-browser-window">
      <header className="youtube-browser-title">
        <span>
          <Youtube size={20} /> YouTube Browser
        </span>
        <button aria-label="Close YouTube browser" onClick={() => window.close()}>
          ×
        </button>
      </header>
      <div className="youtube-browser-toolbar">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (query.trim()) void browse(query.trim(), false)
          }}
        >
          <Search size={18} />
          <input
            autoFocus
            aria-label="Channel or playlist"
            placeholder="Channel name, @handle, channel URL, or playlist URL"
            value={query}
            disabled={loading || Boolean(batch)}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="primary" disabled={!query.trim() || loading || Boolean(batch)}>
            {loading ? 'Finding…' : 'Find'}
          </button>
        </form>
        <button disabled={Boolean(batch)} onClick={onSingleVideo}>
          Download one video
        </button>
      </div>
      <main className="youtube-browser-content" aria-busy={loading}>
        {!result && !loading && (
          <div className="youtube-browser-empty">
            <Youtube size={54} />
            <h2>Find videos without copying links one by one</h2>
            <p>Search for a channel, or paste a channel or playlist address.</p>
            <small>Download only media you own or have permission to save.</small>
          </div>
        )}
        {loading && <div className="youtube-browser-empty">Loading YouTube information…</div>}
        {result && !loading && (
          <>
            <div className="youtube-result-heading">
              <div>
                {trail.length > 0 && (
                  <button aria-label="Go back" onClick={back}>
                    <ArrowLeft size={18} />
                  </button>
                )}
                <div>
                  <small>{result.kind === 'channels' ? 'Search results' : result.kind}</small>
                  <h2>{result.title}</h2>
                </div>
              </div>
              {result.kind === 'videos' && (
                <button
                  onClick={() =>
                    setSelected(
                      selected.size === available.length
                        ? new Set()
                        : new Set(available.map((video) => video.id)),
                    )
                  }
                >
                  <CheckSquare size={16} />
                  {selected.size === available.length ? 'Clear selection' : 'Select all'}
                </button>
              )}
            </div>
            <div className="youtube-result-list">
              {result.kind === 'channels' &&
                result.channels.map((channel) => (
                  <ChannelRow
                    key={channel.id}
                    channel={channel}
                    open={() => void browse(channel.url)}
                  />
                ))}
              {result.kind === 'playlists' &&
                result.playlists.map((playlist) => (
                  <PlaylistRow
                    key={playlist.id}
                    playlist={playlist}
                    open={() => void browse(playlist.url)}
                  />
                ))}
              {result.kind === 'videos' &&
                result.videos.map((video, index) => (
                  <VideoRow
                    key={`${video.id}-${index}`}
                    video={video}
                    index={index}
                    checked={selected.has(video.id)}
                    toggle={() =>
                      setSelected((current) => {
                        const next = new Set(current)
                        if (next.has(video.id)) next.delete(video.id)
                        else next.add(video.id)
                        return next
                      })
                    }
                  />
                ))}
              {'channels' in result && result.channels.length === 0 && (
                <div className="youtube-no-results">
                  No matching channels found. Try an @handle or URL.
                </div>
              )}
              {'playlists' in result && result.playlists.length === 0 && (
                <div className="youtube-no-results">This channel has no public playlists.</div>
              )}
              {'videos' in result && result.videos.length === 0 && (
                <div className="youtube-no-results">This playlist has no available videos.</div>
              )}
            </div>
          </>
        )}
      </main>
      <footer className="youtube-browser-footer">
        <div>
          {batch
            ? `Downloading ${batch.current} of ${batch.total}${progress.percent ? ` · ${progress.percent.toFixed(0)}%` : ''}: ${batch.title}`
            : error || (result?.kind === 'videos' ? `${selected.size} selected` : '')}
        </div>
        {result?.kind === 'videos' && (
          <button
            className="primary"
            disabled={!selected.size || Boolean(batch)}
            onClick={downloadSelected}
          >
            {batch
              ? `Downloading ${batch.current} of ${batch.total}…`
              : `Download selected (${selected.size})`}
          </button>
        )}
      </footer>
    </div>
  )
}

function Artwork({ source }: { source?: string }) {
  return source ? (
    <img src={source} alt="" />
  ) : (
    <span>
      <ListVideo />
    </span>
  )
}

function ChannelRow({ channel, open }: { channel: YouTubeChannelSummary; open: () => void }) {
  return (
    <button className="youtube-result-row" onClick={open}>
      <Artwork source={channel.thumbnail} />
      <span>
        <strong>{channel.title}</strong>
        <small>View public playlists</small>
      </span>
      <b>Open</b>
    </button>
  )
}

function PlaylistRow({ playlist, open }: { playlist: YouTubePlaylistSummary; open: () => void }) {
  return (
    <button className="youtube-result-row" onClick={open}>
      <Artwork source={playlist.thumbnail} />
      <span>
        <strong>{playlist.title}</strong>
        <small>
          {playlist.videoCount === undefined ? 'Playlist' : `${playlist.videoCount} videos`}
        </small>
      </span>
      <b>Open</b>
    </button>
  )
}

function VideoRow({
  video,
  index,
  checked,
  toggle,
}: {
  video: YouTubeVideoSummary
  index: number
  checked: boolean
  toggle: () => void
}) {
  return (
    <label className={`youtube-video-row${video.unavailable ? ' unavailable' : ''}`}>
      <input type="checkbox" checked={checked} disabled={video.unavailable} onChange={toggle} />
      <Artwork source={video.thumbnail} />
      <span className="youtube-video-index">{index + 1}</span>
      <span>
        <strong>{video.title}</strong>
        <small>{video.unavailable ? 'Unavailable' : 'Ready to download'}</small>
      </span>
      <time>{duration(video.duration)}</time>
    </label>
  )
}
