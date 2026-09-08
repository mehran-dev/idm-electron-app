# Renderer guidance

- Use React state/hooks and `window.downloads`; no direct filesystem, Node, or Electron access.
- Follow stylesheet import order in `main.tsx`. `modern-ui.css` currently overrides feature styles.
- Keep the main layout light and edge-to-edge. Preserve the sidebar's category navigation.
- Preserve header sorting, column resizing, drag reordering, and saved column order when changing the table.
- Validate persisted UI settings before using them; storage failures must not crash the UI.
- Menus should dismiss on outside interaction and Escape. Clean up document listeners on unmount.
- Give icon-only controls accessible names. Preserve visible keyboard focus.
- Check both the main window and affected standalone dialogs; they share styles but have different viewport constraints.
- Introduce new feature components incrementally as described in `ARCHITECTURE.md`.
- For visual changes, report whether you actually inspected the running app.
