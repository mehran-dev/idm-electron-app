# Architecture

This project uses a pragmatic clean architecture for Electron. Dependencies point inward: UI and Electron adapters depend on application/domain contracts, never the reverse.

## Process boundaries

- `src/main`: trusted Electron/Node process. Owns files, networking, persistence, notifications, windows, and IPC handlers.
- `src/preload`: the only renderer bridge. It exposes the narrow `DownloadApi`; never expose `ipcRenderer` directly.
- `src/renderer`: untrusted React UI. It calls `window.downloads` and contains no Node or Electron imports.
- `src/shared`: serializable models and the canonical IPC/API contract used by all processes.

## Main process layers

- `domain`: repository interfaces and business-facing abstractions.
- `application`: download/queue use cases and orchestration.
- `infrastructure`: JSON persistence, Electron networking, certificates, and OS adapters.
- `presentation/ipc`: translates typed renderer requests into application calls. No business rules belong here.

## Change rules

1. Add every IPC channel to `src/shared/download-api.ts` first.
2. Add the method to `DownloadApi`, implement it in preload, then register its main-process handler.
3. Keep IPC payloads serializable; do not pass Electron objects across the bridge.
4. Put download and queue rules in `DownloadService`, not React or handlers.
5. Put filesystem/network/Electron behavior behind infrastructure or presentation adapters.
6. Persist new model fields backward-compatibly because existing users already have `downloads.json`.
7. Run `npm run check` and `npm run build` before committing.

## Renderer direction

`App.tsx` is now formatted and safe to edit, but it is still the largest migration target. New UI should be feature-oriented under `src/renderer/features/<feature>` with local components/hooks. Move existing dialogs incrementally, one tested feature at a time, instead of performing a risky all-at-once rewrite.
