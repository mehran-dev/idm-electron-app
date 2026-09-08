import { useEffect, useState } from 'react'
import { Instagram, Youtube } from 'lucide-react'
import type { SocialDownloadRecord } from '../../../shared/download'

export function SocialHistoryWindow() {
  const [records, setRecords] = useState<SocialDownloadRecord[]>([])
  const [filter, setFilter] = useState<'all' | 'youtube' | 'instagram'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    let pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const next = await window.downloads.listSocialHistory()
        if (active) {
          setRecords(next)
          setError('')
        }
      } catch {
        if (active)
          setError('History could not be loaded. Check app data permissions and try again.')
      } finally {
        pending = false
        if (active) setLoading(false)
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, 1500)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  const action = async (id: string, kind: 'open' | 'folder' | 'copy') => {
    try {
      const problem = await window.downloads.socialHistoryAction(id, kind)
      setMessage(
        problem ||
          (kind === 'copy' ? 'Media link copied. Paste it in the downloader to try again.' : ''),
      )
    } catch {
      setMessage('The action could not be completed. Please try again.')
    }
  }
  const visible = records.filter((record) => filter === 'all' || record.platform === filter)
  return (
    <div className="native-dialog-host">
      <div className="window-dialog social-history-window">
        <div className="dialog-title">
          Media download history
          <button aria-label="Close history" onClick={() => window.close()}>
            ×
          </button>
        </div>
        <div className="social-history-body">
          <p>
            Your YouTube and Instagram download attempts are saved here. Interrupted downloads do
            not restart automatically.
          </p>
          <div className="social-history-filters" role="group" aria-label="Filter history">
            {(['all', 'youtube', 'instagram'] as const).map((value) => (
              <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {value === 'all' ? 'All media' : value === 'youtube' ? 'YouTube' : 'Instagram'}
              </button>
            ))}
          </div>
          {message && <p role="status">{message}</p>}
          {error ? (
            <p role="alert">{error}</p>
          ) : loading ? (
            <p role="status">Loading history…</p>
          ) : visible.length === 0 ? (
            <div className="social-history-empty">
              <h2>No downloads yet</h2>
              <p>New media downloads will appear here automatically.</p>
            </div>
          ) : (
            <ul className="social-history-list">
              {visible.map((record) => {
                const label = record.platform === 'youtube' ? 'YouTube' : 'Instagram'
                const Icon = record.platform === 'youtube' ? Youtube : Instagram
                return (
                  <li key={record.id}>
                    <Icon aria-label={label} size={24} />
                    <div className="social-history-detail">
                      <strong title={record.filePath || record.url}>
                        {record.filePath?.split(/[\\/]/).pop() || `${label} media`}
                      </strong>
                      <small>
                        {label} · {new Date(record.createdAt).toLocaleString()}
                      </small>
                      <span className={`history-status history-${record.status}`}>
                        {
                          {
                            downloading: 'Downloading',
                            completed: 'Completed',
                            failed: 'Failed',
                            interrupted: 'Interrupted',
                          }[record.status]
                        }
                      </span>
                      <span className="social-history-url" title={record.url}>
                        {record.url}
                      </span>
                      {record.status === 'interrupted' && (
                        <small>Stopped before completion. Copy the link to try again.</small>
                      )}
                      <div className="social-history-actions">
                        {record.status === 'completed' && (
                          <>
                            <button onClick={() => action(record.id, 'open')}>Open</button>
                            <button onClick={() => action(record.id, 'folder')}>Open folder</button>
                          </>
                        )}
                        <button onClick={() => action(record.id, 'copy')}>Copy link</button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="dialog-actions">
          <button onClick={() => window.close()}>Close</button>
        </div>
      </div>
    </div>
  )
}
