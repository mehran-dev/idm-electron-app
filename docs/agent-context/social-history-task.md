# Persisted media download history

Status: implemented; manual desktop verification outstanding

## Outcome

YouTube and Instagram attempts remain discoverable after their download window closes or the app restarts. History opens separately through a small button in each existing downloader.

## Acceptance criteria

- Persist separate records for validated media attempts with provider, media URL, timestamps, status, and completed output path.
- Preserve existing download and sign-in flows; closing a downloader still stops its child process and records interruption.
- Recover previously active records as interrupted on app startup.
- Show both providers in a separate history window with provider filters, empty/error states, open-file, open-folder, and copy-link actions.
- Keep credentials, proxy settings, and raw downloader logs out of persisted history.
- No automatic retries, queues, or changes to the main download list.

## Verification

Passed: `node --test tests/social-download-history.test.cjs tests/youtube-session.test.cjs`, `npm run build` (including typechecking), `npm run format:check`, and `git diff --check`.

Repository tests cover retained completed/failed records, restart interruption recovery, concurrent attempts, and refusing to overwrite corrupt history. Live provider authentication, actual child-process shutdown, and desktop interactions were not manually exercised. The close-during-preparation path checks whether the owner was destroyed before spawning yt-dlp.

History stores normalized media links and output paths; it does not store raw failure output, credentials, or proxy options. The history window polls while mounted and cleans up its timer and focus listener on close.
