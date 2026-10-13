# Terminal workspace — 2026-10-13

SSH tabs use a compact layout with a 44px tab bar, 20px status bar and 8px terminal insets. Connected sessions hide the redundant connection bar. Navigation is available through the menu overlay. Focus mode and its Ctrl+Shift+F shortcut have been removed.

The right snippets panel is 300px wide and can be toggled using the braces button in the tab bar. It shows folders, names and command previews, with search across names, folders and scripts. Selecting a folder filters the list; All folders restores it. Users can create, edit and delete snippets without leaving their terminal, using the shared right drawers.

Clicking a snippet sends its script and a final newline to the current SSH shell using the existing connection. Its output appears in the terminal, retaining the shell's current directory and environment. Variables open a drawer before execution. Commands are disabled while disconnected. Below 800px the panel overlays the terminal; initial windows below 900px start with the panel hidden.

Panel visibility and CRUD keep the same TerminalView and SSH session. ResizeObserver updates terminal dimensions when the panel changes available width.

Validation: all 26 Electron scenarios and 15 browser checks passed, along with typecheck and production build. The live SSH scenario verifies CRUD, plain and Unicode variable commands received by the existing shell, search, folder navigation, panel toggle, PTY resize and unchanged connection count. Both themes and narrow-screen rendering were visually inspected. The SSH fixture records shell input rather than executing arbitrary shell scripts.

Captures: docs/design/native-terminal-snippets.png, docs/design/terminal-snippets-dark.png, docs/design/terminal-snippets-small.png. Earlier focus screenshots are historical and no longer reflect the app.
