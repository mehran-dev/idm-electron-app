import { useState } from 'react'
import type { DownloadPreview } from '../../../shared/download'

export function DuplicateNotice({ preview }: { preview: DownloadPreview }) {
  const [error, setError] = useState('')
  const duplicate = preview.duplicate
  if (!duplicate) return null
  const completed = duplicate.status === 'completed'
  return (
    <div role="status" className="duplicate-notice">
      <b>
        {completed
          ? 'This file has already been downloaded.'
          : duplicate.id
            ? `This download is already in your list (${duplicate.status}).`
            : 'A file with this name already exists.'}
      </b>
      <p>{duplicate.fileName}</p>
      <p>
        Download anyway will add a separate copy as <strong>{preview.fileName}</strong>. The
        existing file and list entry will be kept.
      </p>
      {duplicate.id && (
        <button
          type="button"
          onClick={async () => {
            try {
              await window.downloads.showProgress(duplicate.id!)
            } catch (reason) {
              setError(
                reason instanceof Error ? reason.message : 'Unable to show the existing download',
              )
            }
          }}
        >
          {completed ? 'Show download completed window' : 'Show existing download'}
        </button>
      )}
      {error && <p className="dialog-error">{error}</p>}
    </div>
  )
}
