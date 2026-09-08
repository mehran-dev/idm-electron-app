# Main process guidance

Read the root architecture document before changing process boundaries.

- Put download and queue behavior in `application/download-service.ts` and OS/network details in infrastructure adapters.
- Keep IPC handlers focused on request validation and dispatch. Treat renderer input as untrusted.
- When extending the bridge, update the shared API, preload implementation, and main registration together.
- Preserve context isolation and sandboxing. Remote sign-in windows must not receive the app preload.
- Keep sign-in sessions scoped to their provider and temporary cookie files cleaned up on success and failure.
- Preserve compatibility when reading old download records; specify defaults for new persisted fields.
- For networking changes, consider redirects, missing length, ignored range requests, interruption, and cancellation as applicable.
- Select focused tests from `docs/agent-context/VERIFICATION.md`; actual provider login requires separate manual verification.

- Fit native dialog sizes through the typed `fitWindow` bridge, validate measurements, and clamp bounds to the current display work area (including its origin). Keep minimum sizes within that area and respect maximized/fullscreen windows. Remote sign-in and list windows remain user-resizable viewports.
