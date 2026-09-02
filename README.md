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
