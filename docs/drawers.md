# Unified side panels — 2026-10-13

All in-app dialog flows now match Edit key: a full-height panel on the right, fixed header/close control, independently scrollable body and fixed actions at the bottom.

The shared `packages/ui/src/Drawer.tsx` is used by New/Edit host, New/Import key, Install public key, New/Edit snippet, snippet output, confirmations, renaming, new-folder creation and permission entry. Edit key retains its matching existing panel. Native OS file selection remains unchanged.

Escape, backdrop dismissal, initial focus and focus restoration are supported. Dismissal is blocked while a save/install operation is running. The application’s existing modal focus trap also applies to these panels.

Validation: 25 Electron scenarios and 13 browser checks passed; typecheck and production build passed. Visual inspection included host and snippet editors, confirmation panels, and a 600×600 viewport where the footer remained within the viewport. Captures: `docs/design/edit-host-drawer-dark.png`, `docs/design/edit-snippet-drawer-dark.png`, `docs/design/confirmation-drawer-dark.png`, `docs/design/host-drawer-compact.png`, and the updated native key-creation captures.
