import type { DownloadStatus } from '../../../shared/download'

export type ProgressPrimaryAction = 'pause' | 'resume'
export type ProgressDestructiveAction = 'cancel' | 'remove'

export interface ProgressActions {
  primary?: { action: ProgressPrimaryAction; label: string }
  destructive?: { action: ProgressDestructiveAction; label: string }
}

export function progressActionsFor(status: DownloadStatus): ProgressActions {
  switch (status) {
    case 'queued':
      return {
        primary: { action: 'resume', label: 'Start now' },
        destructive: { action: 'remove', label: 'Remove from list' },
      }
    case 'downloading':
      return {
        primary: { action: 'pause', label: 'Pause' },
        destructive: { action: 'cancel', label: 'Cancel download' },
      }
    case 'paused':
      return {
        primary: { action: 'resume', label: 'Resume' },
        destructive: { action: 'cancel', label: 'Cancel download' },
      }
    case 'interrupted':
    case 'failed':
      return {
        primary: { action: 'resume', label: 'Retry' },
        destructive: { action: 'remove', label: 'Remove from list' },
      }
    case 'cancelled':
      return {
        primary: { action: 'resume', label: 'Restart' },
        destructive: { action: 'remove', label: 'Remove from list' },
      }
    case 'completed':
      return {}
  }
}
