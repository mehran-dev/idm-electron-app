import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CirclePause,
  CirclePlay,
  FileArchive,
  FileInput,
  FileOutput,
  FileText,
  Folder,
  FolderOpen,
  Globe2,
  HardDriveDownload,
  Instagram,
  Link2,
  ListStart,
  Music2,
  Play,
  Settings,
  Square,
  Trash2,
  Video,
  Youtube,
  X,
} from 'lucide-react'
import type {
  CompletionOptions,
  DownloadItem,
  DownloadPreview,
  DownloadQueue,
  DownloadStatus,
} from '../shared/download'

type Category =
  | 'all'
  | 'unfinished'
  | 'finished'
  | 'video'
  | 'music'
  | 'programs'
  | 'documents'
  | 'compressed'
  | 'queues'
  | `queue:${string}`
const formatBytes = (value: number) =>
  value ? `${(value / 1024 / 1024).toFixed(value > 10 * 1024 * 1024 ? 2 : 3)} MB` : ''
const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
const videoTypes = ['mp4', 'mkv', 'avi', 'mov', 'webm']
const musicTypes = ['mp3', 'wav', 'aac', 'flac']
const docs = ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx']
const archives = ['zip', 'rar', '7z', 'tar', 'gz']
const programs = ['exe', 'msi', 'dmg', 'deb', 'rpm', 'appimage']

export function App() {
  const params = new URLSearchParams(location.search)
  const id = params.get('progress')
  const listDialog = params.get('listDialog')
  const utilityDialog = params.get('utilityDialog')
  if (id) return <ProgressWindow id={id} />
  if (listDialog === 'import' || listDialog === 'export')
    return <ListDialogWindow mode={listDialog} params={params} />
  if (
    ['add', 'scheduler', 'options', 'delete', 'youtube', 'instagram'].includes(utilityDialog ?? '')
  )
    return (
      <UtilityDialogWindow
        mode={utilityDialog as 'add' | 'scheduler' | 'options' | 'delete' | 'youtube' | 'instagram'}
        params={params}
      />
    )
  return <MainApp />
}

function UtilityDialogWindow({
  mode,
  params,
}: {
  mode: 'add' | 'scheduler' | 'options' | 'delete' | 'youtube' | 'instagram'
  params: URLSearchParams
}) {
  const [queues, setQueues] = useState<DownloadQueue[]>([])
  const [segmentCount, setSegmentCount] = useState(4)
  const initialQueue = params.get('queueId') ?? ''
  useEffect(() => {
    window.downloads.listQueues().then(setQueues)
    window.downloads.getSegmentCount().then(setSegmentCount)
  }, [])
  if (mode === 'youtube' || mode === 'instagram') return <SocialDownloadWindow platform={mode} />
  if (mode === 'add')
    return (
      <AddDownloadWindow queues={queues} segmentCount={segmentCount} initialQueue={initialQueue} />
    )
  if (mode === 'scheduler')
    return (
      <div className="native-dialog-host">
        <SchedulerDialog
          queues={queues}
          initialQueue={initialQueue}
          onClose={() => window.close()}
          onSave={async (id, name, concurrency) => {
            await window.downloads.updateQueue(id, name, concurrency)
            setQueues(await window.downloads.listQueues())
          }}
          onCreate={async () => {
            const queue = await window.downloads.createQueue('New download queue', 1)
            setQueues(await window.downloads.listQueues())
            return queue
          }}
          onDelete={async (id) => {
            await window.downloads.deleteQueue(id)
            const next = await window.downloads.listQueues()
            setQueues(next)
            return next
          }}
        />
      </div>
    )
  if (mode === 'options')
    return (
      <div className="native-dialog-host">
        <OptionsDialog
          segmentCount={segmentCount}
          onSave={async (value) => {
            await window.downloads.setSegmentCount(value)
            window.close()
          }}
          onClose={() => window.close()}
        />
      </div>
    )
  return <DeleteFilesWindow ids={params.get('ids')?.split(',').filter(Boolean) ?? []} />
}

function SocialDownloadWindow({ platform }: { platform: 'youtube' | 'instagram' }) {
  const [url, setUrl] = useState('')
  const [completed, setCompleted] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [allowInvalidCertificate, setAllowInvalidCertificate] = useState(false)
  const [progress, setProgress] = useState({ percent: 0, status: '' })
  const label = platform === 'youtube' ? 'YouTube' : 'Instagram'
  const Icon = platform === 'youtube' ? Youtube : Instagram
  useEffect(() => window.downloads.onSocialProgress(setProgress), [])
  useEffect(() => {
    if (!downloading) return
    let active = true
    const refresh = () =>
      window.downloads
        .getSocialProgress()
        .then((value) => active && setProgress(value))
        .catch(() => undefined)
    refresh()
    const timer = window.setInterval(refresh, 250)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [downloading])
  const download = async () => {
    setCompleted(false)
    setDownloading(true)
    setProgress({ percent: 0, status: 'Connecting…' })
    setStatusMessage('Resolving available media and downloading…')
    try {
      const result = await window.downloads.downloadSocial(
        platform,
        url.trim(),
        allowInvalidCertificate,
      )
      setCompleted(result.ok)
      setStatusMessage(result.ok ? `Saved to ${result.filePath}` : result.error)
    } catch (reason) {
      setStatusMessage(
        reason instanceof Error ? reason.message : `Unable to download from ${label}.`,
      )
    } finally {
      setDownloading(false)
    }
  }
  return (
    <div className={`native-dialog-host social-window ${platform}`}>
      <div className="window-dialog social-dialog">
        <div className="dialog-title">
          Download from {label}
          <button onClick={() => window.close()}>×</button>
        </div>
        <div className="social-body">
          <Icon />
          <div>
            <h2>{label} media downloader</h2>
            <p>Paste a public post, reel, or video URL.</p>
          </div>
          <label htmlFor="social-url">Media address</label>
          <input
            id="social-url"
            autoFocus
            placeholder={`https://${platform === 'youtube' ? 'youtube.com/watch?v=…' : 'instagram.com/reel/…'}`}
            value={url}
            disabled={downloading}
            onChange={(event) => {
              setUrl(event.target.value)
              setCompleted(false)
              setStatusMessage('')
            }}
          />
          <small>
            Download only media you own or have permission to save. Private, paid, and DRM-protected
            content is not bypassed.
          </small>
          <label className="social-certificate-option">
            <input
              type="checkbox"
              checked={allowInvalidCertificate}
              onChange={(event) => setAllowInvalidCertificate(event.target.checked)}
            />
            Allow untrusted certificates (less secure; use only if normal downloads report a
            certificate error)
          </label>
          {!downloading && statusMessage && <div className="social-status">{statusMessage}</div>}
          {downloading && (
            <div className="social-progress">
              <div>
                <span>{progress.status}</span>
                <b>{progress.percent > 0 ? `${progress.percent.toFixed(0)}%` : 'Please wait'}</b>
              </div>
              {progress.percent > 0 ? (
                <progress max="100" value={progress.percent} />
              ) : (
                <progress />
              )}
            </div>
          )}
        </div>
        <div className="dialog-actions">
          {completed ? (
            <>
              <button
                className="primary"
                onClick={async () => {
                  try {
                    const error = await window.downloads.openSocialFile()
                    if (error) setStatusMessage(error)
                  } catch (reason) {
                    setStatusMessage(
                      reason instanceof Error ? reason.message : 'Unable to open file.',
                    )
                  }
                }}
              >
                Open
              </button>
              <button onClick={() => window.downloads.showSocialFileInFolder()}>Open Folder</button>
            </>
          ) : (
            <button className="primary" disabled={!url.trim() || downloading} onClick={download}>
              {downloading ? 'Downloading…' : 'Download'}
            </button>
          )}
          <button onClick={() => window.close()}>Close</button>
        </div>
      </div>
    </div>
  )
}

function DeleteFilesWindow({ ids }: { ids: string[] }) {
  const [items, setItems] = useState<DownloadItem[]>([])
  useEffect(() => {
    window.downloads.list().then((all) => setItems(all.filter((item) => ids.includes(item.id))))
  }, [])
  return (
    <div className="native-dialog-host native-confirm">
      <div className="window-dialog confirm-dialog">
        <div className="dialog-title">
          Confirm file deletion<button onClick={() => window.close()}>×</button>
        </div>
        <div className="confirm-body">
          <Trash2 />
          <div>
            <b>
              Delete {items.length} file{items.length === 1 ? '' : 's'} permanently?
            </b>
            <p>{items.map((item) => item.fileName).join(', ')}</p>
            <small>This removes the physical files and download-history entries.</small>
          </div>
        </div>
        <div className="dialog-actions">
          <button
            className="danger-button"
            disabled={!items.length}
            onClick={() => {
              items.forEach((item) => window.downloads.deleteFromDisk(item.id))
              window.close()
            }}
          >
            Delete files
          </button>
          <button className="primary" onClick={() => window.close()}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function AddDownloadWindow({
  queues,
  segmentCount,
  initialQueue,
}: {
  queues: DownloadQueue[]
  segmentCount: number
  initialQueue: string
}) {
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<DownloadPreview>()
  const [error, setError] = useState('')
  const [inspecting, setInspecting] = useState(false)
  const [segments, setSegments] = useState(segmentCount)
  const [queueId, setQueueId] = useState(initialQueue)
  const dialogElement = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const dialog = dialogElement.current
    if (!dialog) return
    const fitWindowToContent = () => window.resizeTo(620, Math.max(170, dialog.scrollHeight))
    const observer = new ResizeObserver(fitWindowToContent)
    observer.observe(dialog)
    fitWindowToContent()
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!queueId && queues[0]) setQueueId(queues[0].id)
  }, [queues, queueId])
  useEffect(() => {
    if (!url.trim()) return setPreview(undefined)
    try {
      const parsed = new URL(url.trim())
      if (!['http:', 'https:'].includes(parsed.protocol)) return
    } catch {
      return
    }
    let active = true
    setInspecting(true)
    setError('')
    const timer = setTimeout(
      () =>
        window.downloads
          .inspect(url.trim())
          .then((value) => active && setPreview(value))
          .catch(
            (reason) =>
              active &&
              setError(
                reason instanceof Error ? reason.message : 'Unable to retrieve file information',
              ),
          )
          .finally(() => active && setInspecting(false)),
      450,
    )
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [url])
  const start = async (later: boolean) => {
    if (!preview) return
    const item = later
      ? await window.downloads.enqueue(url.trim(), queueId, segments, preview.savePath)
      : await window.downloads.add(url.trim(), false, undefined, segments, preview.savePath)
    if (!later) await window.downloads.showProgress(item.id)
    window.close()
  }
  const browse = async () => {
    if (!preview) return
    const path = await window.downloads.chooseSavePath(preview.savePath)
    if (path)
      setPreview({
        ...preview,
        savePath: path,
        fileName: path.split(/[\\/]/).pop() || preview.fileName,
      })
  }
  return (
    <div className="native-dialog-host">
      <div ref={dialogElement} className="dialog file-info-dialog">
        <div className="dialog-title">
          Enter new address to download<button onClick={() => window.close()}>×</button>
        </div>
        <div className="dialog-body">
          <div className="url-row">
            <Globe2 size={42} />
            <div>
              <label>Address</label>
              <input
                autoFocus
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value)
                  setPreview(undefined)
                }}
              />
            </div>
          </div>
          {inspecting && !preview && <p className="query-status">Getting file information…</p>}
          {error && <p className="dialog-error">{error}</p>}
          {preview && (
            <>
              <div className="file-overview">
                <FileIcon name={preview.fileName} />
                <div>
                  <b>{preview.fileName}</b>
                  <span>
                    {preview.mimeType} · {preview.size ? formatBytes(preview.size) : 'Size unknown'}
                  </span>
                </div>
              </div>
              <div className="file-destination">
                <label className="save-as-row">
                  Save As{' '}
                  <input
                    value={preview.savePath}
                    onChange={(event) => setPreview({ ...preview, savePath: event.target.value })}
                  />
                  <button onClick={browse}>…</button>
                </label>
              </div>
              <fieldset>
                <legend>Download options</legend>
                <label>
                  Connections{' '}
                  <select
                    value={segments}
                    onChange={(event) => setSegments(Number(event.target.value))}
                  >
                    {[1, 2, 4, 6, 8].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Download later in{' '}
                  <select value={queueId} onChange={(event) => setQueueId(event.target.value)}>
                    {queues.map((queue) => (
                      <option value={queue.id} key={queue.id}>
                        {queue.name}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            </>
          )}
        </div>
        <div className="dialog-actions">
          <button disabled={!preview || !queueId} onClick={() => start(true)}>
            Download Later
          </button>
          <button className="primary" disabled={!preview} onClick={() => start(false)}>
            Start Download
          </button>
          <button onClick={() => window.close()}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function ListDialogWindow({
  mode,
  params,
}: {
  mode: 'import' | 'export'
  params: URLSearchParams
}) {
  const [queues, setQueues] = useState<DownloadQueue[]>([])
  const [items, setItems] = useState<DownloadItem[]>([])
  const [queueId, setQueueId] = useState(params.get('queueId') ?? '')
  const [newQueueName, setNewQueueName] = useState('')
  const [exportMode, setExportMode] = useState<'selected' | 'queue'>('selected')
  const [message, setMessage] = useState('')
  const selectedIds = params.get('ids')?.split(',').filter(Boolean) ?? []
  useEffect(() => {
    window.downloads.listQueues().then((value) => {
      setQueues(value)
      if (!queueId && value[0]) setQueueId(value[0].id)
    })
    window.downloads.list().then(setItems)
  }, [])
  const createQueue = async () => {
    if (!newQueueName.trim()) return
    const queue = await window.downloads.createQueue(newQueueName, 1)
    setQueues(await window.downloads.listQueues())
    setQueueId(queue.id)
    setNewQueueName('')
    setMessage(`Queue “${queue.name}” created.`)
  }
  const runImport = async () => {
    if (!queueId) return
    const result = await window.downloads.importList(queueId)
    if (!result.cancelled)
      setMessage(`${result.fileName}: imported ${result.imported}, skipped ${result.skipped}.`)
  }
  const runExport = async () => {
    const ids =
      exportMode === 'selected'
        ? selectedIds
        : items.filter((item) => item.queueId === queueId).map((item) => item.id)
    if (!ids.length) return setMessage('There are no downloads to export.')
    const result = await window.downloads.exportList(ids)
    if (!result.cancelled) setMessage(`${result.fileName}: exported ${result.exported} URL(s).`)
  }
  return (
    <div className="native-list-dialog">
      <div className="window-dialog import-dialog">
        <div className="dialog-title">
          {mode === 'import' ? 'Import download list' : 'Export download list'}
          <button onClick={() => window.close()}>×</button>
        </div>
        <div className="import-body">
          {mode === 'import' ? <FileInput size={46} /> : <FileOutput size={46} />}
          <p>
            {mode === 'import'
              ? 'Select a destination queue, then open a text file containing one HTTP/HTTPS download URL per line.'
              : 'Export one download URL per line to a reusable text list.'}
          </p>
          {mode === 'import' ? (
            <>
              <fieldset>
                <legend>Destination queue</legend>
                <select value={queueId} onChange={(event) => setQueueId(event.target.value)}>
                  {queues.map((queue) => (
                    <option value={queue.id} key={queue.id}>
                      {queue.name}
                    </option>
                  ))}
                </select>
              </fieldset>
              <fieldset>
                <legend>Create a new queue</legend>
                <input
                  value={newQueueName}
                  onChange={(event) => setNewQueueName(event.target.value)}
                  placeholder="New queue name"
                />
                <button disabled={!newQueueName.trim()} onClick={createQueue}>
                  Create and select
                </button>
              </fieldset>
            </>
          ) : (
            <fieldset>
              <legend>What to export</legend>
              <label>
                <input
                  type="radio"
                  checked={exportMode === 'selected'}
                  onChange={() => setExportMode('selected')}
                />{' '}
                Selected items ({selectedIds.length})
              </label>
              <label>
                <input
                  type="radio"
                  checked={exportMode === 'queue'}
                  onChange={() => setExportMode('queue')}
                />{' '}
                Entire queue
              </label>
              {exportMode === 'queue' && (
                <select value={queueId} onChange={(event) => setQueueId(event.target.value)}>
                  {queues.map((queue) => (
                    <option value={queue.id} key={queue.id}>
                      {queue.name}
                    </option>
                  ))}
                </select>
              )}
            </fieldset>
          )}
          {message && <div className="import-result">{message}</div>}
        </div>
        <div className="dialog-actions">
          <button
            className="primary"
            disabled={mode === 'import' && !queueId}
            onClick={mode === 'import' ? runImport : runExport}
          >
            {mode === 'import' ? 'Open .txt file' : 'Export...'}
          </button>
          <button onClick={() => window.close()}>Close</button>
        </div>
      </div>
    </div>
  )
}

function useDialogDrag() {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const keepInsideParent = () => {
      const dialog = dialogRef.current
      const parent = dialog?.closest('.idm-app')
      if (!dialog || !parent) return
      const dialogRect = dialog.getBoundingClientRect()
      const parentRect = parent.getBoundingClientRect()
      setOffset((current) => ({
        x:
          current.x +
          Math.max(
            parentRect.left - dialogRect.left,
            Math.min(0, parentRect.right - dialogRect.right),
          ),
        y:
          current.y +
          Math.max(
            parentRect.top - dialogRect.top,
            Math.min(0, parentRect.bottom - dialogRect.bottom),
          ),
      }))
    }
    window.addEventListener('resize', keepInsideParent)
    return () => window.removeEventListener('resize', keepInsideParent)
  }, [])
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    event.preventDefault()
    const dialog = event.currentTarget.closest('.window-dialog') as HTMLElement | null
    if (!dialog) return
    const startX = event.clientX
    const startY = event.clientY
    const startOffset = offset
    const startRect = dialog.getBoundingClientRect()
    const parentRect = dialog.closest('.idm-app')?.getBoundingClientRect()
    if (!parentRect) return
    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = Math.max(
        parentRect.left - startRect.left,
        Math.min(parentRect.right - startRect.right, moveEvent.clientX - startX),
      )
      const deltaY = Math.max(
        parentRect.top - startRect.top,
        Math.min(parentRect.bottom - startRect.bottom, moveEvent.clientY - startY),
      )
      setOffset({ x: startOffset.x + deltaX, y: startOffset.y + deltaY })
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.classList.remove('dragging-dialog')
    }
    document.body.classList.add('dragging-dialog')
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }
  return {
    ref: dialogRef,
    style: { transform: `translate(${offset.x}px, ${offset.y}px)` },
    onPointerDown: startDrag,
  }
}

function ProgressWindow({ id }: { id: string }) {
  const [item, setItem] = useState<DownloadItem>()
  useEffect(() => {
    window.downloads.list().then((items) => setItem(items.find((value) => value.id === id)))
    return window.downloads.onChanged((items) => setItem(items.find((value) => value.id === id)))
  }, [id])
  return (
    <div className="progress-window-root">
      {item ? (
        item.status === 'completed' ? (
          <CompletedDownload item={item} />
        ) : (
          <DownloadProgress item={item} onClose={() => window.close()} />
        )
      ) : (
        <div className="progress-missing">
          Download not found.<button onClick={() => window.close()}>Close</button>
        </div>
      )}
    </div>
  )
}
function CompletedDownload({ item }: { item: DownloadItem }) {
  return (
    <div className="window-dialog completed-download">
      <div className="dialog-title">
        Download complete<button onClick={() => window.close()}>×</button>
      </div>
      <div className="completed-hero">
        <CheckCircle2 />
        <div>
          <h2>Download complete</h2>
          <b>{item.fileName}</b>
        </div>
      </div>
      <div className="completed-info">
        <label>File size:</label>
        <span>{formatBytes(item.totalBytes) || formatBytes(item.receivedBytes) || 'Unknown'}</span>
        <label>Saved as:</label>
        <span title={item.savePath}>{item.savePath}</span>
        <label>Downloaded:</label>
        <span>{new Date().toLocaleString()}</span>
      </div>
      <div className="progress-actions">
        <button className="primary" onClick={() => window.downloads.open(item.id)}>
          Open file
        </button>
        <button onClick={() => window.downloads.showInFolder(item.id)}>Open folder</button>
        <button onClick={() => window.close()}>Close</button>
      </div>
    </div>
  )
}
function MainApp() {
  const importDrag = useDialogDrag()
  const exportDrag = useDialogDrag()
  const [items, setItems] = useState<DownloadItem[]>([]),
    [queues, setQueues] = useState<DownloadQueue[]>([]),
    [category, setCategory] = useState<Category>('all'),
    [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()),
    [selectionAnchor, setSelectionAnchor] = useState<string>(),
    [selectedQueue, setSelectedQueue] = useState('main'),
    [dialog, setDialog] = useState(false),
    [scheduler, setScheduler] = useState(false),
    [options, setOptions] = useState(false),
    [importDialog, setImportDialog] = useState(false),
    [exportDialog, setExportDialog] = useState(false),
    [exportMode, setExportMode] = useState<'selected' | 'queue'>('selected'),
    [newQueueName, setNewQueueName] = useState(''),
    [importMessage, setImportMessage] = useState(''),
    [exportMessage, setExportMessage] = useState(''),
    [tasksMenu, setTasksMenu] = useState(false),
    [deleteConfirm, setDeleteConfirm] = useState<DownloadItem[]>(),
    [segmentCount, setSegmentCount] = useState(4),
    [fileSegments, setFileSegments] = useState(4),
    [context, setContext] = useState<{ x: number; y: number; item: DownloadItem }>(),
    [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [preview, setPreview] = useState<DownloadPreview>(),
    [inspecting, setInspecting] = useState(false)
  useEffect(() => {
    window.downloads.list().then(setItems)
    window.downloads.getSegmentCount().then(setSegmentCount)
    window.downloads.listQueues().then((value) => {
      setQueues(value)
      if (value[0]) setSelectedQueue(value[0].id)
    })
    return window.downloads.onChanged(setItems)
  }, [])
  useEffect(() => {
    const refreshSettings = () => {
      window.downloads.listQueues().then(setQueues)
      window.downloads.getSegmentCount().then(setSegmentCount)
    }
    window.addEventListener('focus', refreshSettings)
    return () => window.removeEventListener('focus', refreshSettings)
  }, [])
  useEffect(() => {
    if (!dialog || !url.trim()) {
      setPreview(undefined)
      return
    }
    try {
      const parsed = new URL(url.trim())
      if (!['http:', 'https:'].includes(parsed.protocol)) return
    } catch {
      return
    }
    let active = true
    setInspecting(true)
    setError('')
    const timer = setTimeout(
      () =>
        window.downloads
          .inspect(url.trim())
          .then((value) => active && setPreview(value))
          .catch((reason) => {
            if (active) {
              setPreview(undefined)
              setError(
                reason instanceof Error ? reason.message : 'Unable to retrieve file information',
              )
            }
          })
          .finally(() => active && setInspecting(false)),
      450,
    )
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [dialog, url])
  const visible = useMemo(
    () => items.filter((item) => matchesCategory(item, category)),
    [items, category],
  )
  const selectedItems = items.filter((item) => selectedIds.has(item.id)),
    current = selectedItems[0]
  const mainQueue = queues.find((queue) => queue.id === 'main') ?? queues[0]
  const toolbarQueueId = category.startsWith('queue:') ? category.slice(6) : mainQueue?.id
  const toolbarQueue = queues.find((queue) => queue.id === toolbarQueueId)
  async function add(queued = false) {
    try {
      if (!preview) return
      const item = queued
        ? await window.downloads.enqueue(url.trim(), selectedQueue, fileSegments, preview.savePath)
        : await window.downloads.add(url.trim(), false, undefined, fileSegments, preview.savePath)
      setSelectedIds(new Set([item.id]))
      if (!queued) await window.downloads.showProgress(item.id)
      setUrl('')
      setPreview(undefined)
      setDialog(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to add download')
    }
  }
  async function browseSavePath() {
    if (!preview) return
    const path = await window.downloads.chooseSavePath(preview.savePath)
    if (path)
      setPreview({
        ...preview,
        savePath: path,
        fileName: path.split(/[\\/]/).pop() || preview.fileName,
      })
  }
  const openQueueManager = () => window.downloads.showUtilityWindow('scheduler', [], selectedQueue)
  async function importList() {
    setImportMessage('')
    if (!selectedQueue) {
      setImportMessage('Select or create a queue first.')
      return
    }
    const result = await window.downloads.importList(selectedQueue)
    if (!result.cancelled)
      setImportMessage(
        `${result.fileName}: imported ${result.imported}, skipped ${result.skipped}.`,
      )
  }
  async function createImportQueue() {
    if (!newQueueName.trim()) return
    const queue = await window.downloads.createQueue(newQueueName, 1)
    setQueues(await window.downloads.listQueues())
    setSelectedQueue(queue.id)
    setNewQueueName('')
    setImportMessage(`Queue “${queue.name}” created.`)
  }
  async function exportList() {
    setExportMessage('')
    const ids =
      exportMode === 'selected'
        ? [...selectedIds]
        : items.filter((item) => item.queueId === selectedQueue).map((item) => item.id)
    if (!ids.length) {
      setExportMessage('There are no downloads to export.')
      return
    }
    const result = await window.downloads.exportList(ids)
    if (!result.cancelled)
      setExportMessage(`${result.fileName}: exported ${result.exported} URL(s).`)
  }
  function selectRow(event: React.MouseEvent, id: string) {
    if (event.shiftKey && selectionAnchor) {
      const start = visible.findIndex((item) => item.id === selectionAnchor),
        end = visible.findIndex((item) => item.id === id)
      if (start >= 0 && end >= 0) {
        setSelectedIds(
          new Set(
            visible.slice(Math.min(start, end), Math.max(start, end) + 1).map((item) => item.id),
          ),
        )
        return
      }
    }
    if (event.ctrlKey || event.metaKey) {
      const next = new Set(selectedIds)
      next.has(id) ? next.delete(id) : next.add(id)
      setSelectedIds(next)
      setSelectionAnchor(id)
      return
    }
    setSelectedIds(new Set([id]))
    setSelectionAnchor(id)
  }
  const stopAll = () =>
    items.filter((i) => i.status === 'downloading').forEach((i) => window.downloads.pause(i.id))
  return (
    <div className="idm-app">
      <div className="titlebar">
        <span>
          <HardDriveDownload size={16} /> Internet Download Manager
        </span>
        <div>
          <button>—</button>
          <button>□</button>
          <button className="close">×</button>
        </div>
      </div>
      <div className="menubar">
        <div className="menu-root">
          <button
            aria-haspopup="menu"
            aria-expanded={tasksMenu}
            onClick={() => setTasksMenu((open) => !open)}
          >
            Tasks
          </button>
          {tasksMenu && (
            <div className="app-menu" role="menu">
              <button
                role="menuitem"
                onClick={() => {
                  setTasksMenu(false)
                  window.downloads.showListWindow('import', [], selectedQueue)
                }}
              >
                <FileInput size={15} /> Import download list…
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setTasksMenu(false)
                  window.downloads.showListWindow('export', [...selectedIds], selectedQueue)
                }}
              >
                <FileOutput size={15} /> Export download list…
              </button>
            </div>
          )}
        </div>
        <button>File</button>
        <button>Downloads</button>
        <button>View</button>
        <button>Help</button>
        <button>Donate</button>
      </div>
      <div className="toolbar">
        <Tool
          icon={<Link2 />}
          label="Add URL"
          color="blue"
          onClick={() => window.downloads.showUtilityWindow('add', [], selectedQueue)}
        />
        <Tool
          icon={<CirclePlay />}
          label="Resume"
          color="green"
          disabled={
            !selectedItems.some((item) =>
              ['queued', 'paused', 'interrupted', 'failed'].includes(item.status),
            )
          }
          onClick={() =>
            selectedItems
              .filter((item) => ['queued', 'paused', 'interrupted', 'failed'].includes(item.status))
              .forEach((item) => window.downloads.resume(item.id))
          }
        />
        <Tool
          icon={<Square />}
          label="Stop"
          color="red"
          disabled={!selectedItems.some((item) => item.status === 'downloading')}
          onClick={() =>
            selectedItems
              .filter((item) => item.status === 'downloading')
              .forEach((item) => window.downloads.pause(item.id))
          }
        />
        <Tool
          icon={<CirclePause />}
          label="Stop All"
          color="red"
          disabled={!items.some((i) => i.status === 'downloading')}
          onClick={stopAll}
        />
        <Tool
          icon={<Trash2 />}
          label={selectedItems.length > 1 ? `Delete (${selectedItems.length})` : 'Delete'}
          title={
            selectedItems.length
              ? `Delete ${selectedItems.length} selected download${selectedItems.length === 1 ? '' : 's'} from the list`
              : 'Select one or more downloads to enable Delete'
          }
          color="red"
          disabled={selectedItems.length === 0}
          onClick={() => {
            selectedItems.forEach((item) => window.downloads.removeFromList(item.id))
            setSelectedIds(new Set())
          }}
        />
        <Tool
          icon={<X />}
          label="Delete C..."
          color="gray"
          disabled={!items.some((i) => i.status === 'completed')}
          onClick={() => {
            window.downloads.deleteCompleted()
            setSelectedIds(
              new Set(
                [...selectedIds].filter(
                  (id) => items.find((item) => item.id === id)?.status !== 'completed',
                ),
              ),
            )
          }}
        />
        <span className="separator" />
        <Tool
          icon={<Settings />}
          label="Options"
          color="blue"
          onClick={() => window.downloads.showUtilityWindow('options')}
        />
        <Tool
          icon={<CalendarClock />}
          label="Scheduler"
          color="orange"
          onClick={() => window.downloads.showUtilityWindow('scheduler', [], selectedQueue)}
        />
        <Tool
          icon={<ListStart />}
          label="Start Queue"
          title={`Start ${toolbarQueue?.name ?? 'Main download queue'}`}
          color="green"
          disabled={!toolbarQueueId}
          onClick={() => toolbarQueueId && window.downloads.startQueue(toolbarQueueId)}
        />
        <Tool
          icon={<Square />}
          label="Stop Queue"
          title={`Stop ${toolbarQueue?.name ?? 'Main download queue'}`}
          color="red"
          disabled={!toolbarQueueId}
          onClick={() => toolbarQueueId && window.downloads.stopQueue(toolbarQueueId)}
        />
        <Tool
          icon={<FileInput />}
          label="Import"
          color="blue"
          onClick={() => {
            window.downloads.showListWindow('import', [], selectedQueue)
          }}
        />
        <Tool
          icon={<FileOutput />}
          label="Export"
          color="blue"
          onClick={() => {
            window.downloads.showListWindow('export', [...selectedIds], selectedQueue)
          }}
        />
        <Tool icon={<Globe2 />} label="Grabber" color="blue" />
        <span className="separator social-separator" aria-hidden="true" />
        <Tool
          icon={<Instagram />}
          label="Instagram"
          color="pink"
          title="Download permitted media from Instagram"
          onClick={() => window.downloads.showUtilityWindow('instagram')}
        />
        <Tool
          icon={<Youtube />}
          label="YouTube"
          color="red"
          title="Download permitted media from YouTube"
          onClick={() => window.downloads.showUtilityWindow('youtube')}
        />
      </div>
      <div
        className="workspace"
        onClick={() => {
          setContext(undefined)
          setTasksMenu(false)
        }}
      >
        <CategoryTree
          value={category}
          onChange={(value) => {
            setCategory(value)
            if (value.startsWith('queue:')) setSelectedQueue(value.slice(6))
          }}
          items={items}
          queues={queues}
          onAdd={openQueueManager}
          onEdit={openQueueManager}
          onDelete={openQueueManager}
        />
        <DownloadTable
          items={visible}
          selected={selectedIds}
          onSelect={selectRow}
          onOpen={(id) => window.downloads.showProgress(id)}
          onContext={(event, item) => {
            event.preventDefault()
            if (!selectedIds.has(item.id)) setSelectedIds(new Set([item.id]))
            setContext({ x: event.clientX, y: event.clientY, item })
          }}
        />
      </div>
      <div className="statusbar">
        <span>{items.filter((i) => i.status === 'completed').length} completed</span>
        <span>{items.filter((i) => i.status === 'downloading').length} downloading</span>
        <span>
          {items.length} file{items.length === 1 ? '' : 's'}
        </span>
        <span title="Queue controlled by the toolbar">Queue: {toolbarQueue?.name ?? 'None'}</span>
        <button onClick={() => window.downloads.openFolder()}>
          <FolderOpen size={13} /> Downloads
        </button>
      </div>
      {dialog && (
        <div className="dialog-shade" onMouseDown={() => setDialog(false)}>
          <div className="dialog file-info-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialog-title">
              Enter new address to download<button onClick={() => setDialog(false)}>×</button>
            </div>
            <div className="dialog-body">
              <div className="url-row">
                <Globe2 size={42} />
                <div>
                  <label>Address</label>
                  <input
                    autoFocus
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value)
                      setPreview(undefined)
                    }}
                  />
                </div>
              </div>
              {inspecting && !preview && <p className="query-status">Getting file information…</p>}
              {error && <p className="dialog-error">{error}</p>}
              {preview && (
                <>
                  <div className="file-overview">
                    <FileIcon name={preview.fileName} />
                    <div>
                      <b>{preview.fileName}</b>
                      <span>
                        {preview.mimeType} ·{' '}
                        {preview.size ? formatBytes(preview.size) : 'Size unknown'}
                      </span>
                    </div>
                  </div>
                  <div className="file-destination">
                    <label>
                      Category{' '}
                      <select
                        value={preview.category}
                        onChange={(e) => setPreview({ ...preview, category: e.target.value })}
                      >
                        {['General', 'Compressed', 'Documents', 'Music', 'Programs', 'Video'].map(
                          (value) => (
                            <option key={value}>{value}</option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="save-as-row">
                      Save As{' '}
                      <input
                        value={preview.savePath}
                        onChange={(e) => setPreview({ ...preview, savePath: e.target.value })}
                      />
                      <button onClick={browseSavePath}>…</button>
                    </label>
                  </div>
                  <fieldset>
                    <legend>Download options</legend>
                    <label>
                      Connections{' '}
                      <select
                        value={fileSegments}
                        onChange={(e) => setFileSegments(Number(e.target.value))}
                      >
                        {[1, 2, 4, 6, 8].map((value) => (
                          <option value={value} key={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Download later in{' '}
                      <select
                        value={selectedQueue}
                        onChange={(e) => setSelectedQueue(e.target.value)}
                      >
                        {queues.map((queue) => (
                          <option value={queue.id} key={queue.id}>
                            {queue.name} ({queue.concurrency} files at once)
                          </option>
                        ))}
                      </select>
                    </label>
                  </fieldset>
                </>
              )}
            </div>
            <div className="dialog-actions">
              <button disabled={!preview || !selectedQueue} onClick={() => add(true)}>
                Download Later
              </button>
              <button className="primary" disabled={!preview} onClick={() => add(false)}>
                Start Download
              </button>
              <button onClick={() => setDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {scheduler && (
        <SchedulerDialog
          queues={queues}
          initialQueue={selectedQueue}
          onClose={() => setScheduler(false)}
          onSave={async (id, name, concurrency) => {
            await window.downloads.updateQueue(id, name, concurrency)
            setQueues(await window.downloads.listQueues())
            setSelectedQueue(id)
          }}
          onCreate={async () => {
            const queue = await window.downloads.createQueue('New download queue', 1)
            setQueues(await window.downloads.listQueues())
            setSelectedQueue(queue.id)
            return queue
          }}
          onDelete={async (id) => {
            await window.downloads.deleteQueue(id)
            const next = await window.downloads.listQueues()
            setQueues(next)
            setSelectedQueue(next[0]?.id ?? '')
            return next
          }}
        />
      )}
      {options && (
        <OptionsDialog
          segmentCount={segmentCount}
          onSave={async (value) => {
            await window.downloads.setSegmentCount(value)
            setSegmentCount(value)
            setOptions(false)
          }}
          onClose={() => setOptions(false)}
        />
      )}
      {context && (
        <div
          className="row-context"
          style={{ left: context.x, top: context.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            disabled={context.item.status !== 'completed'}
            onClick={() => {
              window.downloads.open(context.item.id)
              setContext(undefined)
            }}
          >
            Open
          </button>
          <button
            disabled={!context.item.savePath}
            onClick={() => {
              window.downloads.showInFolder(context.item.id)
              setContext(undefined)
            }}
          >
            Open folder
          </button>
          <span />
          <button
            onClick={() => {
              window.downloads.copyUrl(context.item.id)
              setContext(undefined)
            }}
          >
            Copy download address
          </button>
          <span />
          <button
            onClick={() => {
              selectedItems.forEach((item) => window.downloads.removeFromList(item.id))
              setSelectedIds(new Set())
              setContext(undefined)
            }}
          >
            Delete selected from list ({selectedItems.length})
          </button>
          <button
            className="danger"
            disabled={!selectedItems.some((item) => item.savePath)}
            onClick={() => {
              window.downloads.showUtilityWindow(
                'delete',
                selectedItems.filter((item) => item.savePath).map((item) => item.id),
              )
              setContext(undefined)
            }}
          >
            Delete selected file(s) from disk
          </button>
        </div>
      )}
      {deleteConfirm && (
        <div className="dialog-shade">
          <div className="window-dialog confirm-dialog">
            <div className="dialog-title">
              Confirm file deletion<button onClick={() => setDeleteConfirm(undefined)}>×</button>
            </div>
            <div className="confirm-body">
              <Trash2 />
              <div>
                <b>
                  Delete {deleteConfirm.length} file{deleteConfirm.length === 1 ? '' : 's'}{' '}
                  permanently from the computer?
                </b>
                <p>{deleteConfirm.map((item) => item.fileName).join(', ')}</p>
                <small>
                  This removes the physical files and their download-history entries. This action
                  cannot be undone.
                </small>
              </div>
            </div>
            <div className="dialog-actions">
              <button
                className="danger-button"
                onClick={() => {
                  deleteConfirm.forEach((item) => window.downloads.deleteFromDisk(item.id))
                  setSelectedIds(new Set())
                  setDeleteConfirm(undefined)
                }}
              >
                Delete files
              </button>
              <button className="primary" onClick={() => setDeleteConfirm(undefined)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {importDialog && (
        <div className="dialog-shade">
          <div
            ref={importDrag.ref}
            className="window-dialog import-dialog movable-dialog"
            style={importDrag.style}
          >
            <div className="dialog-title" onPointerDown={importDrag.onPointerDown}>
              Import download list from text file
              <button onClick={() => setImportDialog(false)}>×</button>
            </div>
            <div className="import-body">
              <FileInput size={46} />
              <p>
                Select a destination queue, then open a text file containing one HTTP/HTTPS download
                URL per line.
              </p>
              <fieldset>
                <legend>Destination queue</legend>
                <select value={selectedQueue} onChange={(e) => setSelectedQueue(e.target.value)}>
                  {queues.map((queue) => (
                    <option value={queue.id} key={queue.id}>
                      {queue.name} — {queue.concurrency} files at once
                    </option>
                  ))}
                </select>
              </fieldset>
              <fieldset>
                <legend>Create a new queue</legend>
                <input
                  placeholder="New queue name"
                  value={newQueueName}
                  onChange={(e) => setNewQueueName(e.target.value)}
                />
                <button disabled={!newQueueName.trim()} onClick={createImportQueue}>
                  Create and select
                </button>
              </fieldset>
              {importMessage && <div className="import-result">{importMessage}</div>}
              <small>
                Blank lines and lines beginning with # are ignored. Invalid URLs are counted as
                skipped.
              </small>
            </div>
            <div className="dialog-actions">
              <button className="primary" disabled={!selectedQueue} onClick={importList}>
                Open .txt file
              </button>
              <button onClick={() => setImportDialog(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {exportDialog && (
        <div className="dialog-shade">
          <div
            ref={exportDrag.ref}
            className="window-dialog import-dialog movable-dialog"
            style={exportDrag.style}
          >
            <div className="dialog-title" onPointerDown={exportDrag.onPointerDown}>
              Export download URLs<button onClick={() => setExportDialog(false)}>×</button>
            </div>
            <div className="import-body">
              <FileOutput size={46} />
              <p>Export one download URL per line to a reusable text list.</p>
              <fieldset>
                <legend>What to export</legend>
                <label>
                  <input
                    type="radio"
                    checked={exportMode === 'selected'}
                    onChange={() => setExportMode('selected')}
                  />{' '}
                  Selected items ({selectedItems.length})
                </label>
                <label>
                  <input
                    type="radio"
                    checked={exportMode === 'queue'}
                    onChange={() => setExportMode('queue')}
                  />{' '}
                  Entire queue
                </label>
                {exportMode === 'queue' && (
                  <select value={selectedQueue} onChange={(e) => setSelectedQueue(e.target.value)}>
                    {queues.map((queue) => (
                      <option value={queue.id} key={queue.id}>
                        {queue.name}
                      </option>
                    ))}
                  </select>
                )}
              </fieldset>
              {exportMessage && <div className="import-result">{exportMessage}</div>}
            </div>
            <div className="dialog-actions">
              <button className="primary" onClick={exportList}>
                Export...
              </button>
              <button onClick={() => setExportDialog(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SchedulerDialog({
  queues,
  initialQueue,
  onClose,
  onSave,
  onCreate,
  onDelete,
}: {
  queues: DownloadQueue[]
  initialQueue: string
  onClose: () => void
  onSave: (id: string, name: string, concurrency: number) => Promise<void>
  onCreate: () => Promise<DownloadQueue>
  onDelete: (id: string) => Promise<DownloadQueue[]>
}) {
  const [queueId, setQueueId] = useState(initialQueue || queues[0]?.id || ''),
    [name, setName] = useState(
      queues.find((q) => q.id === initialQueue)?.name ?? queues[0]?.name ?? '',
    ),
    [concurrency, setConcurrency] = useState(
      queues.find((q) => q.id === initialQueue)?.concurrency ?? 1,
    ),
    [message, setMessage] = useState('')
  const queue = queues.find((q) => q.id === queueId)
  function select(id: string) {
    const value = queues.find((q) => q.id === id)
    setQueueId(id)
    setName(value?.name ?? '')
    setConcurrency(value?.concurrency ?? 1)
    setMessage('')
  }
  async function save(close = false) {
    if (!queue) return
    await onSave(queue.id, name, concurrency)
    setMessage('Queue settings saved.')
    if (close) onClose()
  }
  async function create() {
    const created = await onCreate()
    setQueueId(created.id)
    setName(created.name)
    setConcurrency(created.concurrency)
    setMessage('New queue created. Rename it and press Apply.')
  }
  async function remove() {
    if (!queue || queue.id === 'main') {
      setMessage('The Main download queue cannot be deleted.')
      return
    }
    const remaining = await onDelete(queue.id)
    const next = remaining.find((item) => item.id === 'main') ?? remaining[0]
    setQueueId(next?.id ?? '')
    setName(next?.name ?? '')
    setConcurrency(next?.concurrency ?? 1)
    setMessage('Queue deleted. Unfinished files were moved to the Main download queue.')
  }
  return (
    <div className="dialog-shade">
      <div className="window-dialog scheduler-dialog">
        <div className="dialog-title">
          Scheduler<button onClick={onClose}>×</button>
        </div>
        <div className="scheduler-layout">
          <aside>
            <div className="queue-tools">
              <button title="Add queue" onClick={create}>
                ＋
              </button>
              <button title="Save queue settings" onClick={() => save(false)}>
                ⚙
              </button>
              <button
                title={
                  queueId === 'main'
                    ? 'The Main download queue cannot be deleted'
                    : 'Delete selected queue'
                }
                disabled={!queue || queueId === 'main'}
                onClick={remove}
              >
                ×
              </button>
            </div>
            {queues.map((q) => (
              <button
                className={q.id === queueId ? 'selected' : ''}
                onClick={() => select(q.id)}
                key={q.id}
              >
                <ListStart />
                {q.name}
              </button>
            ))}
          </aside>
          <section>
            <div className="schedule-tabs">
              <button className="active">Schedule</button>
              <button>Files in the queue</button>
            </div>
            <fieldset>
              <legend>Queue settings</legend>
              <label>
                Queue name <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Download{' '}
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                />{' '}
                files at the same time
              </label>
              {message && <p className="queue-message">{message}</p>}
            </fieldset>
            <fieldset>
              <legend>Schedule</legend>
              <label className="check">
                <input type="checkbox" /> Start download at{' '}
                <input type="time" defaultValue="09:00" />
              </label>
              <div className="weekdays">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <label key={day}>
                    <input type="checkbox" defaultChecked />
                    {day}
                  </label>
                ))}
              </div>
              <label className="check">
                <input type="checkbox" /> Stop download at{' '}
                <input type="time" defaultValue="18:00" />
              </label>
            </fieldset>
            <fieldset>
              <legend>When done</legend>
              <label className="check">
                <input type="checkbox" /> Hang up modem when done
              </label>
              <label className="check">
                <input type="checkbox" /> Exit Internet Download Manager when done
              </label>
              <label className="check">
                <input type="checkbox" /> Turn off computer when done
              </label>
            </fieldset>
          </section>
        </div>
        <div className="dialog-actions">
          <button onClick={() => save(false)}>Apply</button>
          <button className="primary" onClick={() => save(true)}>
            OK
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function OptionsDialog({
  segmentCount,
  onSave,
  onClose,
}: {
  segmentCount: number
  onSave: (value: number) => void
  onClose: () => void
}) {
  const tabs = [
    'General',
    'File types',
    'Save to',
    'Downloads',
    'Connection',
    'Proxy / Socks',
    'Site Logins',
    'Dial-Up',
    'Sounds',
  ]
  const [tab, setTab] = useState('General'),
    [segments, setSegments] = useState(segmentCount)
  return (
    <div className="dialog-shade">
      <div className="window-dialog options-dialog">
        <div className="dialog-title">
          Internet Download Manager Configuration<button onClick={onClose}>×</button>
        </div>
        <div className="option-tabs">
          {tabs.map((name) => (
            <button
              className={tab === name ? 'active' : ''}
              onClick={() => setTab(name)}
              key={name}
            >
              <Settings />
              {name}
            </button>
          ))}
        </div>
        <div className="option-page">
          <h3>{tab}</h3>
          {tab === 'Connection' ? (
            <>
              <fieldset>
                <legend>Connection type / speed</legend>
                <label>
                  Connection type/speed{' '}
                  <select defaultValue="high">
                    <option value="high">High speed: Direct connection</option>
                    <option>Medium speed</option>
                    <option>Low speed</option>
                  </select>
                </label>
              </fieldset>
              <fieldset>
                <legend>Max. connections number</legend>
                <label>
                  Default max. conn. number{' '}
                  <select value={segments} onChange={(e) => setSegments(Number(e.target.value))}>
                    {[1, 2, 4, 6, 8].map((value) => (
                      <option value={value} key={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  Each new download will use up to {segments} parallel file segments when the server
                  supports byte ranges.
                </p>
              </fieldset>
            </>
          ) : tab === 'General' ? (
            <>
              <fieldset>
                <legend>Integrate IDM into browsers</legend>
                <label className="check">
                  <input type="checkbox" defaultChecked /> Launch Internet Download Manager on
                  startup
                </label>
                <label className="check">
                  <input type="checkbox" defaultChecked /> Use advanced browser integration
                </label>
                <div className="browser-list">
                  <label>
                    <input type="checkbox" defaultChecked /> Microsoft Edge
                  </label>
                  <label>
                    <input type="checkbox" defaultChecked /> Google Chrome
                  </label>
                  <label>
                    <input type="checkbox" defaultChecked /> Firefox
                  </label>
                  <label>
                    <input type="checkbox" /> Opera
                  </label>
                </div>
              </fieldset>
              <fieldset>
                <legend>Customize IDM menu items in context menu of browsers</legend>
                <button>Edit...</button>
              </fieldset>
            </>
          ) : (
            <>
              <p>Configure {tab.toLowerCase()} preferences for the download manager.</p>
              <fieldset>
                <legend>{tab} settings</legend>
                <label className="check">
                  <input type="checkbox" /> Enable custom {tab.toLowerCase()} settings
                </label>
                <label>
                  Default value <input />
                </label>
              </fieldset>
            </>
          )}
        </div>
        <div className="dialog-actions">
          <button className="primary" onClick={() => onSave(segments)}>
            OK
          </button>
          <button onClick={onClose}>Cancel</button>
          <button disabled>Help</button>
        </div>
      </div>
    </div>
  )
}

function DownloadProgress({ item, onClose }: { item: DownloadItem; onClose: () => void }) {
  const [tab, setTab] = useState<'status' | 'speed' | 'completion'>('status'),
    percent = item.totalBytes ? Math.min(100, (item.receivedBytes / item.totalBytes) * 100) : 0
  return (
    <div className="dialog-shade">
      <div className="window-dialog progress-dialog">
        <div className="dialog-title">
          {item.fileName} - Download status<button onClick={onClose}>×</button>
        </div>
        <div className="progress-tabs">
          <button className={tab === 'status' ? 'active' : ''} onClick={() => setTab('status')}>
            Download status
          </button>
          <button className={tab === 'speed' ? 'active' : ''} onClick={() => setTab('speed')}>
            Speed Limiter
          </button>
          <button
            className={tab === 'completion' ? 'active' : ''}
            onClick={() => setTab('completion')}
          >
            Options on completion
          </button>
        </div>
        {tab === 'completion' ? (
          <CompletionControls
            value={item.completion}
            onChange={(options) => window.downloads.setCompletion(item.id, options)}
          />
        ) : tab === 'speed' ? (
          <div className="completion-page">
            <h3>Speed Limiter</h3>
            <p>The download currently uses the available connection speed.</p>
          </div>
        ) : (
          <>
            <div className="progress-info">
              <label>File name:</label>
              <b>{item.fileName}</b>
              <label>URL:</label>
              <span title={item.url}>{item.url}</span>
              <label>Status:</label>
              <span>{status(item)}</span>
              <label>File size:</label>
              <span>{formatBytes(item.totalBytes) || 'Unknown'}</span>
              <label>Downloaded:</label>
              <span>
                {formatBytes(
                  item.totalBytes > 0
                    ? Math.min(item.receivedBytes, item.totalBytes)
                    : item.receivedBytes,
                )}{' '}
                ({percent.toFixed(2)}%)
              </span>
              <label>Transfer rate:</label>
              <span>{item.speed ? `${formatBytes(item.speed)}/sec` : '0 B/sec'}</span>
              <label>Time left:</label>
              <span>{timeLeft(item) || '—'}</span>
              <label>Resume capability:</label>
              <span>{item.totalBytes ? 'Yes' : 'Unknown'}</span>
            </div>
            <div
              className="overall-progress segmented-progress"
              title={`${percent.toFixed(2)}% total — ${item.segmentProgress?.length ?? item.segmentCount ?? 1} connection(s)`}
            >
              {(
                item.segmentProgress ?? Array.from({ length: item.segmentCount ?? 1 }, () => 0)
              ).map((segmentPercent, index) => (
                <span className="overall-segment" key={index}>
                  <i style={{ width: `${Math.min(100, segmentPercent)}%` }} />
                </span>
              ))}
            </div>
            <div className="segment-head">
              <b>Connection details</b>
              <span>{item.segmentProgress?.length ?? item.segmentCount ?? 1} connection(s)</span>
            </div>
            <div className="segments">
              {(
                item.segmentProgress ?? Array.from({ length: item.segmentCount ?? 1 }, () => 0)
              ).map((value, index) => (
                <div className="segment-row" key={index}>
                  <span>{index + 1}</span>
                  <div>
                    <i style={{ width: `${value}%` }} />
                  </div>
                  <em>{item.status === 'downloading' ? 'Receiving data...' : item.status}</em>
                  <b>{value.toFixed(1)}%</b>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="progress-actions">
          <button onClick={() => window.downloads.showInFolder(item.id)}>Open folder</button>
          {item.status === 'downloading' ? (
            <button className="primary" onClick={() => window.downloads.pause(item.id)}>
              Pause
            </button>
          ) : ['paused', 'interrupted', 'failed'].includes(item.status) ? (
            <button className="primary" onClick={() => window.downloads.resume(item.id)}>
              Start / Resume
            </button>
          ) : null}
          <button
            onClick={() => {
              window.downloads.cancel(item.id)
              onClose()
            }}
          >
            Cancel
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function CompletionControls({
  value,
  onChange,
}: {
  value?: CompletionOptions
  onChange: (value: CompletionOptions) => void
}) {
  const [options, setOptions] = useState<CompletionOptions>(
    value ?? { notification: true, playSound: true, sound: 'system', openFolder: false },
  )
  const update = (next: CompletionOptions) => {
    setOptions(next)
    onChange(next)
  }
  useEffect(() => {
    if (!options.customSoundPath)
      window.downloads
        .getCompletionSound()
        .then((path) => path && setOptions((current) => ({ ...current, customSoundPath: path })))
  }, [])
  async function chooseSound() {
    const path = await window.downloads.chooseCompletionSound()
    if (path) update({ ...options, sound: 'custom', playSound: true, customSoundPath: path })
  }
  return (
    <div className="completion-page">
      <h3>When this download completes</h3>
      <label>
        <input
          type="checkbox"
          checked={options.notification}
          onChange={(e) => update({ ...options, notification: e.target.checked })}
        />{' '}
        Show system notification
      </label>
      <label>
        <input
          type="checkbox"
          checked={options.playSound}
          onChange={(e) => update({ ...options, playSound: e.target.checked })}
        />{' '}
        Play sound
      </label>
      <label>
        Sound{' '}
        <select
          disabled={!options.playSound}
          value={options.sound}
          onChange={(e) => update({ ...options, sound: e.target.value as 'system' | 'custom' })}
        >
          <option value="system">System notification sound</option>
          <option value="custom">Custom sound</option>
        </select>
      </label>
      {options.sound === 'custom' && (
        <label className="sound-path">
          Custom sound <input readOnly value={options.customSoundPath ?? 'No sound selected'} />
          <button onClick={chooseSound}>Browse…</button>
        </label>
      )}
      <label>
        <input
          type="checkbox"
          checked={options.openFolder}
          onChange={(e) => update({ ...options, openFolder: e.target.checked })}
        />{' '}
        Open containing folder
      </label>
      <small>
        The selected sound is copied into the application data folder, so moving or deleting the
        original file will not affect it.
      </small>
    </div>
  )
}

function Tool({
  icon,
  label,
  title,
  color,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  title?: string
  color: string
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button className={`tool ${color}`} title={title} disabled={disabled} onClick={onClick}>
      <span>{icon}</span>
      <small>{label}</small>
    </button>
  )
}

function CategoryTree({
  value,
  onChange,
  items,
  queues,
  onAdd,
  onEdit,
  onDelete,
}: {
  value: Category
  onChange: (v: Category) => void
  items: DownloadItem[]
  queues: DownloadQueue[]
  onAdd: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [downloadsOpen, setDownloadsOpen] = useState(true),
    [queuesOpen, setQueuesOpen] = useState(true)
  const downloadRows: Array<[Category, string, React.ReactNode, number?]> = [
    ['compressed', 'Compressed', <FileArchive />],
    ['documents', 'Documents', <FileText />],
    ['music', 'Music', <Music2 />],
    ['programs', 'Programs', <Archive />],
    ['video', 'Video', <Video />],
    [
      'unfinished',
      'Unfinished',
      <CirclePause />,
      items.filter((i) => i.status !== 'completed').length,
    ],
    [
      'finished',
      'Finished',
      <CheckCircle2 />,
      items.filter((i) => i.status === 'completed').length,
    ],
  ]
  return (
    <aside className="categories">
      <div className="pane-title">
        Categories
        <div>
          <button title="Add queue" onClick={onAdd}>
            ＋
          </button>
          <button title="Queue options" onClick={onEdit}>
            ⚙
          </button>
          <button title="Delete queue" onClick={onDelete}>
            ×
          </button>
        </div>
      </div>
      <div className="tree">
        <button className={value === 'all' ? 'selected' : ''} onClick={() => onChange('all')}>
          <span
            className="tree-toggle"
            role="button"
            tabIndex={0}
            title={downloadsOpen ? 'Collapse All Downloads' : 'Expand All Downloads'}
            onClick={(event) => {
              event.stopPropagation()
              setDownloadsOpen((open) => !open)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                setDownloadsOpen((open) => !open)
              }
            }}
          >
            {downloadsOpen ? <ChevronDown className="chev" /> : <ChevronRight className="chev" />}
          </span>
          <span className="tree-icon">
            <Folder />
          </span>
          <span>All Downloads</span>
          <em>{items.length}</em>
        </button>
        {downloadsOpen &&
          downloadRows.map(([id, label, icon, count]) => (
            <button
              key={id}
              className={`${value === id ? 'selected' : ''} child`}
              onClick={() => onChange(id)}
            >
              <span className="chev" />
              <span className="tree-icon">{icon}</span>
              <span>{label}</span>
              {count !== undefined && <em>{count}</em>}
            </button>
          ))}
        <button className={value === 'queues' ? 'selected' : ''} onClick={() => onChange('queues')}>
          <span
            className="tree-toggle"
            role="button"
            tabIndex={0}
            title={queuesOpen ? 'Collapse Queues' : 'Expand Queues'}
            onClick={(event) => {
              event.stopPropagation()
              setQueuesOpen((open) => !open)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                setQueuesOpen((open) => !open)
              }
            }}
          >
            {queuesOpen ? <ChevronDown className="chev" /> : <ChevronRight className="chev" />}
          </span>
          <span className="tree-icon">
            <ListStart />
          </span>
          <span>Queues</span>
          <em>{queues.length}</em>
        </button>
        {queuesOpen &&
          queues.map((queue) => (
            <button
              key={queue.id}
              className={`${value === `queue:${queue.id}` ? 'selected' : ''} child`}
              onClick={() => onChange(`queue:${queue.id}`)}
            >
              <span className="chev" />
              <span className="tree-icon">
                <ListStart />
              </span>
              <span>{queue.name}</span>
              <em>{queue.concurrency}×</em>
            </button>
          ))}
      </div>
    </aside>
  )
}

function DownloadTable({
  items,
  selected,
  onSelect,
  onOpen,
  onContext,
}: {
  items: DownloadItem[]
  selected: Set<string>
  onSelect: (event: React.MouseEvent, id: string) => void
  onOpen: (id: string) => void
  onContext: (event: React.MouseEvent, item: DownloadItem) => void
}) {
  type SortKey = 'fileName' | 'size' | 'status' | 'timeLeft' | 'speed' | 'date' | 'description'
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'date',
    direction: 'desc',
  })
  const [columnWidths, setColumnWidths] = useState([300, 90, 95, 80, 110, 155, 180])
  const gridColumns = columnWidths.map((width) => `${width}px`).join(' ')
  const resizeColumn = (event: React.PointerEvent, index: number) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = columnWidths[index] ?? 80
    const onMove = (moveEvent: PointerEvent) => {
      setColumnWidths((current) => {
        const next = [...current]
        next[index] = Math.max(55, startWidth + moveEvent.clientX - startX)
        return next
      })
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.classList.remove('resizing-column')
    }
    document.body.classList.add('resizing-column')
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }
  const sortedItems = useMemo(() => {
    const value = (item: DownloadItem, key: SortKey): string | number => {
      if (key === 'fileName') return item.fileName.toLocaleLowerCase()
      if (key === 'size') return item.totalBytes
      if (key === 'status') return status(item).toLocaleLowerCase()
      if (key === 'timeLeft')
        return item.speed && item.totalBytes
          ? Math.max(0, (item.totalBytes - item.receivedBytes) / item.speed)
          : Number.POSITIVE_INFINITY
      if (key === 'speed') return item.speed
      if (key === 'date') return new Date(item.createdAt).getTime()
      return (item.error ?? `${item.segmentCount ?? 1} connection(s)`).toLocaleLowerCase()
    }
    return [...items].sort((left, right) => {
      const a = value(left, sort.key)
      const b = value(right, sort.key)
      const comparison =
        typeof a === 'number' && typeof b === 'number'
          ? a - b
          : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
      return sort.direction === 'asc' ? comparison : -comparison
    })
  }, [items, sort])
  const changeSort = (key: SortKey) =>
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  const header = (key: SortKey, label: string, index: number) => (
    <span
      aria-sort={
        sort.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button onClick={() => changeSort(key)}>
        {label}
        <i>{sort.key === key ? (sort.direction === 'asc' ? '▲' : '▼') : ''}</i>
      </button>
      <i
        className="column-resizer"
        role="separator"
        aria-label={`Resize ${label} column`}
        aria-orientation="vertical"
        onPointerDown={(event) => resizeColumn(event, index)}
      />
    </span>
  )
  return (
    <section className="downloads-table">
      <div className="table-scroll">
        <div className="columns" style={{ gridTemplateColumns: gridColumns }}>
          {header('fileName', 'File Name', 0)}
          {header('size', 'Size', 1)}
          {header('status', 'Status', 2)}
          {header('timeLeft', 'Time left', 3)}
          {header('speed', 'Transfer rate', 4)}
          {header('date', 'Last Try Date', 5)}
          {header('description', 'Description', 6)}
        </div>
        <div className="rows">
          {items.length === 0 ? (
            <div className="no-downloads">There are no files in this category.</div>
          ) : (
            sortedItems.map((item) => (
              <div
                className={`download-row ${selected.has(item.id) ? 'selected' : ''}`}
                onClick={(event) => onSelect(event, item.id)}
                onContextMenu={(event) => onContext(event, item)}
                onDoubleClick={() => onOpen(item.id)}
                key={item.id}
                style={{ gridTemplateColumns: gridColumns }}
              >
                <span className="name">
                  <FileIcon name={item.fileName} />
                  <b>{item.fileName}</b>
                </span>
                <span>{formatBytes(item.totalBytes)}</span>
                <span>{status(item)}</span>
                <span>{timeLeft(item)}</span>
                <span>{item.speed ? `${formatBytes(item.speed)}/sec` : ''}</span>
                <span>{new Date(item.createdAt).toLocaleString()}</span>
                <span title={item.error}>
                  {item.error ?? `${item.segmentCount ?? 1} connection(s)`}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function FileIcon({ name }: { name: string }) {
  const type = ext(name)
  if (videoTypes.includes(type)) return <Video />
  if (archives.includes(type)) return <FileArchive />
  if (docs.includes(type)) return <FileText />
  if (musicTypes.includes(type)) return <Music2 />
  return <HardDriveDownload />
}
function status(item: DownloadItem) {
  if (item.status === 'completed') return 'Complete'
  if (item.status === 'downloading')
    return item.totalBytes
      ? `${Math.min(100, (item.receivedBytes / item.totalBytes) * 100).toFixed(2)}%`
      : 'Receiving data...'
  return item.status.charAt(0).toUpperCase() + item.status.slice(1)
}
function timeLeft(item: DownloadItem) {
  if (!item.speed || !item.totalBytes) return ''
  const seconds = Math.max(0, (item.totalBytes - item.receivedBytes) / item.speed)
  const min = Math.floor(seconds / 60)
  return `${min}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`
}
function matchesCategory(item: DownloadItem, category: Category) {
  if (category === 'all') return true
  if (category === 'finished') return item.status === 'completed'
  if (category === 'unfinished') return item.status !== 'completed'
  if (category === 'queues') return Boolean(item.queueId) && item.status !== 'completed'
  if (category.startsWith('queue:'))
    return item.queueId === category.slice(6) && item.status !== 'completed'
  const type = ext(item.fileName)
  return category === 'video'
    ? videoTypes.includes(type)
    : category === 'music'
      ? musicTypes.includes(type)
      : category === 'documents'
        ? docs.includes(type)
        : category === 'compressed'
          ? archives.includes(type)
          : programs.includes(type)
}
