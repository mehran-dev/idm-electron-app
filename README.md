# Nexus Download Manager

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
