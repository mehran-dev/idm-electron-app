# Verification guide

Run commands from the repository root. Dependencies must already be installed. Check `package.json` when updating this guide; there is currently no `npm test` or `npm run lint` script.

## Existing commands

```bash
npm run format:check
npm run typecheck
npm run check
npm run build
```

`check` combines formatting and types. `build` also runs typechecking before bundling. For documentation-only edits, formatting and link/path checks are normally sufficient. Before committing application changes, follow the architecture document's check/build requirement.

## Focused existing tests

```bash
node --test tests/social-download-history.test.cjs
node --test tests/youtube-session.test.cjs
node --test tests/youtube-auth.test.cjs
node --test tests/download-progress-actions.test.cjs
node --experimental-strip-types --test tests/social-download-environment.test.mjs
node --test tests/social-download-tools.test.cjs
node --test tests/download-engine.cjs
```

The environment test imports TypeScript directly and needs a Node runtime supporting `--experimental-strip-types` (the current development environment has Node 23.11.1). The CommonJS tests transpile their target TypeScript with the installed TypeScript package.

- History test: persistence, restart recovery, concurrent records, and preserving corrupt files.
- Session test: cookie export filtering and formatting; does not prove real Google login works.
- YouTube auth test: manual cookie domain filtering and persisted access-source selection.
- Progress-action test: queued/active/paused/error/cancelled button labels and semantics.
- Environment test: proxy/certificate environment handling; does not prove external connectivity.
- Engine test: local HTTP server scenarios; requires permission to bind a local port and uses mocked Electron networking.

Select tests for the affected behavior. When a real logic bug lacks coverage, add a regression test that reproduces the failure. Avoid tests that merely assert source text or mirror a cosmetic implementation.

## Manual UI checks when relevant

Launch with `npm run dev` in a desktop session.

- Main window: resizing, readable sidebar, table scrolling, and no unwanted outer margin.
- Columns: drag a header; check row alignment, sorting, resizing, and order after reopening.
- Menus: toggle, choose an action, click outside, press Escape.
- Dialogs: open add-download, import/export, scheduler, preferences, delete, YouTube, Instagram, progress/completion, and history windows. Check idle, expanded, loading, long-error, and completed states. Finite forms should fit without unnecessary scrollbars; small screens must retain access to all controls through scrolling. Check display scaling and monitors with nonzero work-area origins, plus focus and close behavior.
- Persisted state: use disposable test data for invalid or older settings, and confirm fallback behavior.

Use a local fixture or a download you control for download checks. Do not use real credentials or destructive file operations as generic test data.

## Result format

Record the command, outcome, and relevant limitation. “Not run: no desktop session” is valid evidence reporting. A passing bundle does not establish interaction, native shadow rendering, or external provider authentication.
