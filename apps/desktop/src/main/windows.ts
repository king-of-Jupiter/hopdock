import { BrowserWindow, nativeTheme } from 'electron';
import { join } from 'path';

let nextScope = 1;

/** Every Hopdock window shares one preload and renderer; a session window carries its scope and host in the URL hash. */
export function createAppWindow(hash = '', near?: BrowserWindow | null): BrowserWindow {
  const bounds = near && !near.isDestroyed() ? near.getBounds() : null;
  const win = new BrowserWindow({
    width: bounds?.width ?? 1360,
    height: bounds?.height ?? 860,
    ...(bounds ? { x: bounds.x + 32, y: bounds.y + 32 } : {}),
    autoHideMenuBar: true,
    // Match the first paint to the system appearance so a dark desktop does not flash white.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#262624' : '#faf9f5',
    icon: join(__dirname, '../renderer/app-icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  const url = process.env['ELECTRON_RENDERER_URL'];
  if (url) void win.loadURL(hash ? `${url}#${hash}` : url);
  else void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined);
  return win;
}

/** Opens a separate window with its own SSH session to the host; the original tab stays connected. */
export function openSessionWindow(hostId: string, near?: BrowserWindow | null): BrowserWindow {
  const scope = `w${nextScope++}`;
  return createAppWindow(`window=${scope}&host=${encodeURIComponent(hostId)}`, near);
}

export function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, payload);
}
