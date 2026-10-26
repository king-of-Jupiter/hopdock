# Terminal workspace — 2026-10-13

SSH tabs use a compact layout with a 44px tab bar, 20px status bar and 8px terminal insets. Connected sessions hide the redundant connection bar. Navigation is available through the menu overlay. Focus mode and its Ctrl+Shift+F shortcut have been removed.

The right snippets panel is 300px wide and can be toggled using the braces button in the tab bar. It shows folders, names and command previews, with search across names, folders and scripts. Selecting a folder filters the list; All folders restores it. Users can create, edit and delete snippets without leaving their terminal, using the shared right drawers.

Clicking a snippet sends its script and a final newline to the current SSH shell using the existing connection. Its output appears in the terminal, retaining the shell's current directory and environment. Variables open a drawer before execution. Commands are disabled while disconnected. Below 800px the panel overlays the terminal; initial windows below 900px start with the panel hidden.

Panel visibility and CRUD keep the same TerminalView and SSH session. ResizeObserver updates terminal dimensions when the panel changes available width.

Validation: all 26 Electron scenarios and 15 browser checks passed, along with typecheck and production build. The live SSH scenario verifies CRUD, plain and Unicode variable commands received by the existing shell, search, folder navigation, panel toggle, PTY resize and unchanged connection count. Both themes and narrow-screen rendering were visually inspected. The SSH fixture records shell input rather than executing arbitrary shell scripts.

Captures: docs/design/native-terminal-snippets.png, docs/design/terminal-snippets-dark.png, docs/design/terminal-snippets-small.png. Earlier focus screenshots are historical and no longer reflect the app.

## Connection screen, persistent tabs and session windows — 27 October 2026

While a session opens, the terminal area shows a connection screen: the route from this device to the host fills as each stage completes (network, host key with its SHA256 fingerprint, negotiated cipher, authentication with the configured methods, shell), with timings. Stages come from `ssh:progress` events emitted by the session manager; they never contain secrets. Host keys are still trusted on first use as before; the fingerprint is only shown.

A failed connection keeps the screen: the error title, explanation and hint from `packages/core/src/errors.ts`, the step that failed (or "Saved credentials" when it failed before the network), auth methods, elapsed time, the error code, and Reconnect, Edit host, Copy details (a secret-free report) and Close tab. A session that drops after it was live keeps the terminal output and shows the Reconnect bar.

Session tabs stay mounted while hidden, so switching to Vaults and back keeps the SSH session instead of reconnecting. Saving an edited host restarts the session of its tab.

Right-click a session tab, or use its chevron, for Duplicate session, Open in new window, Open SFTP, Open in WinSCP (Windows only), Edit host and Close tab. A new window opens its own session to the same host; the original tab stays connected. Window sessions are scoped (`w<n>:<hostId>`), events are broadcast to every window, and the sessions of a window close with it.

Duplicate session opens another tab right after the original with its own SSH connection to the same host, labelled `name (2)`, `name (3)`; its session id is `<hostId>#<n>`. Input, resize and closing affect only that tab.

The theme defaults to System and follows the Windows or macOS appearance live; Light and Dark remain explicit choices.
