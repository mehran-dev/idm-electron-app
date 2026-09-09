# Task: YouTube library browser

Status: complete

## Outcome

Users can paste a YouTube playlist or channel address, browse its contents, select some or all
videos, and download the selection without having to construct individual video links.

## Scope

Add a resizable YouTube browser, serializable discovery IPC, selection controls, and batch
download handoff. Preserve the existing Instagram flow and YouTube authentication/network
options. Do not add an embedded API credential or attempt to bypass private/DRM media.

## Acceptance criteria

- [x] A playlist URL resolves to a selectable, scrollable video list.
- [x] A channel URL or handle resolves to a selectable playlist list.
- [x] A channel-name query shows explicit channel matches instead of choosing silently.
- [x] Users can select all available videos or individual videos and start the selected batch.
- [x] Metadata failures are actionable and stale requests cannot replace newer results.
- [x] Large result sets stay in a bounded viewport and the window remains usable on small screens.
- [x] Shared IPC payloads remain serializable and renderer code uses only `window.downloads`.

## Context to read

- `AGENTS.md`
- `ARCHITECTURE.md`
- `src/main/AGENTS.md`
- `src/renderer/AGENTS.md`
- `docs/agent-context/VERIFICATION.md`
- `src/renderer/App.tsx`
- `src/main/presentation/ipc/download-dialog-handlers.ts`
- `src/shared/download-api.ts`

## Plan

1. Extract and normalize lightweight yt-dlp metadata behind typed IPC.
2. Build the browsing and selection states in a feature-oriented renderer component.
3. Connect selected items to sequential downloads with clear progress and failure feedback.
4. Run focused tests, project checks, and the production build.

## Decisions and questions

Use yt-dlp metadata extraction so Nexus does not ship a private YouTube Data API key. Free-text
search returns explicit channel candidates derived from search results. Direct playlist, channel,
and handle URLs remain the most reliable input.

## Progress and evidence

Implemented typed channel/playlist/video results, preload and main-process discovery IPC, bounded
browser views, explicit navigation and selection, sequential batch progress, unavailable-item
handling, and metadata-process cancellation when the window closes.

Passed: `npm run check`, `npm run build`, `npm run typecheck`, and `git diff --check`.

Live channel search, authentication during a batch, provider metadata variations, and desktop
interactions were not manually exercised in this environment.

## Next action

None.
