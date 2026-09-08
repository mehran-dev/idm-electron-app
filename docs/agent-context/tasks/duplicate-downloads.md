# Task: Duplicate downloads

Status: complete

## Outcome

Offer existing-download actions and save new copies as file-1.ext, file-2.ext without overwriting earlier downloads.

## Scope

HTTP downloads, destination allocation, native duplicate prompt, and both add forms.

## Acceptance criteria

- [x] Duplicate URLs offer status, new copy, and cancellation.
- [x] Existing disk files and queued destinations reserve names.
- [x] Filename edits and submission errors remain visible in both forms.
- [x] Existing records remain readable.

## Context to read

Architecture, main/renderer agent guides, verification guide, service, engine, and IPC adapters.

## Plan

1. Inspect overwrite and dialog behavior.
2. Allocate paths before saving records; add duplicate actions and guard submissions.
3. Run regression tests, check, and build.

## Decisions and questions

New copies preserve the original and use a numeric suffix before the extension. Matching uses normalized full URLs, ignoring fragments. No persistence schema changes.

## Progress and evidence

Confirmed the engine used w+ for all downloads and forms could submit stale preview names.

Implemented unique allocation, exclusive creation, native duplicate choices, submission guards, filename synchronization, and form error handling. No persisted fields changed.

- `node --test tests/duplicate-downloads.cjs tests/download-engine.cjs`: 7 passing tests; engine fixtures required running outside the sandbox to bind localhost.
- `npm run check`: passed.
- `npm run build`: passed.
- Interactive desktop dialogs have not been inspected; native prompt interactions and window sizing still need manual verification.

## Next action

None.

## Follow-up: list imports and filename conflicts

The initial prompt covered URLs only and list imports bypassed it. Both entry points now share a prompt for URL, list filename, and on-disk destination conflicts. New copies are allocated again after the prompt; skip/show add no record and delete no file. Existing historical duplicates are preserved.

Reference: [IDM grabber guide](https://internetdownloadmanager.com/support/idm-grabber/grabber_wizard.html) documents numeric suffixes when overwrite is disabled. Nexus retains the requested hyphen-number spelling and provides no overwrite action.

Verification: `node --test tests/import-duplicates.cjs tests/duplicate-downloads.cjs tests/main-queue.cjs` passed, including actual import-handler dispatch with mocked native prompts. Desktop interaction remains unverified.
