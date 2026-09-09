# Nexus Download Manager

An Electron, React, and TypeScript download manager inspired by IDM.

## Development

```bash
npm install
npm run dev
```

Quality commands:

```bash
npm run format       # format source and configuration
npm run format:check # verify formatting in CI
npm run typecheck    # strict TypeScript validation
npm run check        # formatting + types
npm run build        # typecheck + production bundles
```

Read [ARCHITECTURE.md](./ARCHITECTURE.md) before adding IPC methods or moving logic between Electron processes.

Electron + React + TypeScript foundation for an IDM-style desktop download manager.

## Start

```bash
npm install
npm run dev
```

## Clean architecture

- `src/main/domain`: repository contracts
- `src/main/application`: use cases and validation
- `src/main/infrastructure`: Electron download engine and persistence adapters
- `src/main/presentation`: IPC controllers
- `src/preload`: secure typed renderer bridge
- `src/renderer`: React UI
- `src/shared`: cross-process DTOs and channels

This milestone supports direct HTTP/HTTPS downloads, live progress, pause/resume, cancellation, filtering, and opening the native download directory. Persistence, segmented downloads, queues, browser integration, checksums, scheduling, and recovery are planned as separate modules.

## YouTube sign-in

When YouTube requests authentication, the downloader opens a separate Google sign-in window. Complete sign-in yourself; after returning to YouTube, the window closes and the download retries once automatically. Later YouTube downloads reuse that dedicated session. Instagram and direct downloads do not use it.

The sign-in page has no app preload or Node access. Only YouTube-domain cookies are exported to a temporary private file for yt-dlp, deleted when the attempt ends. The persistent Electron session remains in app data. Use **Forget YouTube sign-in** in the downloader to remove the app’s saved YouTube session. This does not sign you out of Firefox or Chrome.

If Google refuses embedded sign-in, close the sign-in window and choose Firefox or Chrome in the fallback dialog after signing in there. Browser cookies are read only after you choose that option. Login, two-factor authentication, and verification must be completed by you; cookies do not guarantee that YouTube will accept the network connection. See [yt-dlp’s cookie guidance](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies).

## YouTube channel and playlist browser

Open **YouTube** to search for a channel by name, enter an `@handle`, or paste a channel or
playlist URL. Channel-name searches show explicit matches; choosing a channel shows its public
playlists, and choosing a playlist opens a selectable video list. Use **Select all** or choose
individual available videos, then download the selection. The resizable browser keeps long lists
inside a scrollable results area. **Download one video** retains the focused single-link workflow
and its proxy and sign-in controls.

Nexus uses the bundled yt-dlp metadata extractor for discovery and does not contain a YouTube Data
API key. Private, deleted, and otherwise unavailable entries cannot be selected. Selected videos
download sequentially and each attempt is recorded in media history; if one fails, the remaining
batch stops so the failure can be addressed before retrying.

## Working with coding agents

Start with [AGENTS.md](AGENTS.md) for project instructions and the [context engineering guide](docs/agent-context/README.md) for an explanation of the harness, reusable task templates, and optional Codex configuration.

## YouTube and Instagram history

Each media downloader has a **History** button that opens a separate window for both providers. New attempts are saved in `social-download-history.json` in the application's user-data directory, independently of the main download list. History offers provider filters, Open, Open folder, and Copy link. If a file was moved or deleted, the action reports that instead of silently failing.

Closing a downloader still stops its current attempt; the history records it as interrupted. Attempts left active when the app exits are marked interrupted on the next launch. Copy a media link into the existing downloader to try again; there is no automatic resume or queue. Earlier downloads made before this feature are not imported. Proxy credentials, cookies, and raw downloader output are not stored in history.
