# Task: Correct download row actions and dialog sizing

Status: complete

## Outcome

Completed rows open their file on double-click, unfinished rows show their progress, and actions that require an existing file are unavailable until completion.

## Scope

Download table primary actions, its context menu, file-action IPC guards, and finite dialog height measurement.

## Acceptance criteria

- [x] Double-click and Enter open completed files and show details for unfinished downloads.
- [x] Unfinished downloads do not offer a misleading folder action.
- [x] The context menu is readable and remains inside the viewport.
- [x] Finite dialogs measure their full intrinsic content.

## Context to read

- `ARCHITECTURE.md`
- `src/main/AGENTS.md`
- `src/renderer/AGENTS.md`
- `docs/agent-context/VERIFICATION.md`

## Plan

1. Trace row, duplicate, file, and window-size behavior.
2. Align action eligibility and modernize the context menu.
3. Run focused tests, check, and build.

## Decisions and questions

The saved destination is only treated as an openable file after the record reaches `completed`; a reserved path for a queued duplicate is not evidence that the new file exists.

## Progress and evidence

`npm run check`, the duplicate/import tests, and `npm run build` pass. Interactive desktop behavior was not inspected in this environment.

## Next action

None.
