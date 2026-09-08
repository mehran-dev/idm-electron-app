# Agent guide

## Project

Nexus is an Electron + React + TypeScript download manager. Use npm and the existing package lock. Preserve unrelated work in the checkout.

## Read only the context needed

- Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing IPC, persistence, or process boundaries.
- For `src/main` work, read [src/main/AGENTS.md](src/main/AGENTS.md).
- For renderer work, read [src/renderer/AGENTS.md](src/renderer/AGENTS.md).
- Use [docs/agent-context/VERIFICATION.md](docs/agent-context/VERIFICATION.md) to select checks.
- For substantial multi-step work, use [the task template](docs/agent-context/templates/TASK.md). Small fixes do not need a plan file.
- The learning guide is [docs/agent-context/README.md](docs/agent-context/README.md); read it when working on this harness.

## Working agreements

- Inspect the relevant implementation before editing; check documentation claims against code.
- Keep changes focused on the user's requested outcome. Resolve routine implementation choices independently.
- Ask when missing information changes the intended behavior; continue independent work while waiting.
- Keep renderer code behind `window.downloads`; do not introduce Node or Electron imports there.
- Keep shared IPC payloads serializable and persisted data backward-compatible.
- Never put credentials, browser cookies, or private download URLs into committed examples or task notes.
- Record durable architecture decisions in architecture notes; put temporary progress in a task file.
- Update documentation when the change makes an existing statement inaccurate.

- Size finite dialog windows to their actual content and clamp them to the display work area. Avoid unnecessary scrollbars; keep growing lists in bounded scrollable viewports.

## Completion

Run relevant checks from the verification guide. Report what changed, commands and outcomes, and any unverified behavior. Do not describe a build as proof of interactive UI behavior. Do not commit or publish unless requested.
