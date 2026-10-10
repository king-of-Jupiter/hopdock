import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { registerIpc, setWindow } from './ipc';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    autoHideMenuBar: true,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
    },
  });
  setWindow(win);
  registerIpc();

  const url = process.env['ELECTRON_RENDERER_URL'];
  if (url) {
    void win.loadURL(url);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
