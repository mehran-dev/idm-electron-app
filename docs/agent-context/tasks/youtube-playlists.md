# Task: YouTube playlist downloads

Status: complete

## Outcome

Users can enter a YouTube channel handle or playlist URL, inspect playlists and videos, select some or all videos, and download them as a visible batch with resumable files and manageable history.

## Scope

Add a separate YouTube offline-library window through the typed preload bridge and yt-dlp integration, and extend the media-history window. Preserve the existing single-video YouTube and Instagram windows unchanged.

## Acceptance criteria

- [x] A channel handle/name or playlist URL can be inspected without starting a download.
- [x] Users can choose a playlist, select all/some videos, and start a sequential batch.
- [x] Partial media files continue on retry and playlist/video attempts are visible in history.
- [x] History entries can be removed, with a separate explicit option for deleting saved files.
- [x] Existing persisted history remains readable.

## Context to read

- `ARCHITECTURE.md`, `src/main/AGENTS.md`, `src/renderer/AGENTS.md`
- `src/main/presentation/ipc/download-dialog-handlers.ts`
- `src/main/infrastructure/social-download-history.ts`
- `src/renderer/App.tsx`, `src/renderer/features/social-history/SocialHistoryWindow.tsx`

## Plan

1. Extend serializable models, persistence, and the preload bridge.
2. Add yt-dlp catalog inspection and batch orchestration.
3. Build the selection and batch-history UX.
4. Add regression coverage and run check/build.

## Decisions and questions

Playlist batches run sequentially to be predictable and bandwidth-friendly. yt-dlp `.part` files and `--continue` provide resumability without overwriting completed files.

## Progress and evidence

Implemented a separate YT Offline toolbar action and catalog/selection window, concurrent batch orchestration, playlist-aware history, explicit record/file deletion, and resume controls. The original single-video YouTube component and window dimensions remain unchanged. Catalog lookup now shares download proxy, CA, cookie, and retry behavior; connection controls are available before lookup and transport errors are converted to actionable messages. The offline UI persists a validated eight-channel recent list, restores the latest channel and its cached playlists, and maps playlist videos to completed history. Each video owns its Download/Stop/Resume/Open action, status, percentage, and progress bar; other rows remain usable, and selected batches use a three-download concurrency limit. Its controls use the shared dialog button styles and its recent-channel/explorer panes have independent bounded scrolling. External YouTube access and interactive layout require manual desktop verification.

## Next action

None.
