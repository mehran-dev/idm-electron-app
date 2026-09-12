# Decision: Privacy-preserving YouTube access methods

Date: 2026-09-12
Status: accepted

## Context

Some YouTube media requires an authenticated session, but users should not have to give the
download manager a Google username or password. The UI must distinguish public access, an isolated
application session, browser-cookie access, and manually supplied cookies without claiming an
account identity that the application has not read. yt-dlp no longer supports YouTube OAuth.

## Decision

Nexus offers four clearly explained choices from the same account panel in both YouTube windows:

1. Open Google's sign-in page in the existing sandboxed, provider-scoped Electron session. Nexus
   does not collect or persist the password. Google/YouTube cookies remain in that isolated web
   session, and only YouTube-domain cookies are exported to yt-dlp.
2. Show OAuth as unavailable instead of presenting a nonfunctional control.
3. Let the user explicitly select a supported browser for yt-dlp's local
   `--cookies-from-browser` integration. Persist only the browser name.
4. Accept Netscape cookies.txt text, discard every row outside `youtube.com`, and persist the
   filtered file with owner-only permissions.

Only one method is active at a time. Clearing access removes the isolated session, manual cookie
file, and saved method configuration. The status row names the active source. It does not display a
Gmail address because Nexus deliberately does not query or parse account identity.

## Alternatives considered

Collecting a Google username and password directly was rejected because it would make Nexus a
credential custodian and is not needed for yt-dlp. Reading a whole browser cookie database into
Nexus persistence was rejected; browser extraction is delegated to yt-dlp only after explicit
selection. Displaying an inferred email or a generic "signed in" label for unverified browser and
manual-cookie modes was rejected as misleading.

## Consequences

Users can see exactly which local authentication source will be used and can remove it from either
YouTube workflow. Manual imports have a deliberately narrow domain scope. Browser and manual modes
may still contain sensitive session material and can expire. Embedded Google sign-in can be rejected
by Google, and actual external authentication remains a manual integration check.

## Verification and references

- `src/main/infrastructure/youtube-auth.ts`
- `src/main/infrastructure/youtube-session.ts`
- `src/renderer/features/youtube/YouTubeAccountPanel.tsx`
- `tests/youtube-auth.test.cjs`
- `docs/agent-context/tasks/youtube-playlists.md`
- <https://github.com/yt-dlp/yt-dlp/wiki/FAQ>
- <https://github.com/yt-dlp/yt-dlp/wiki/Extractors>
