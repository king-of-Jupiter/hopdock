import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { registerIpc, setWindow } from './ipc';
import { checkOnStartup, setupAutoUpdater } from './updater';

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
  setupAutoUpdater((channel, payload) => win.webContents.send(channel, payload));
  checkOnStartup();

  const url = process.env['ELECTRON_RENDERER_URL'];
  if (url) {
    void win.loadURL(url);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  if (process.argv.includes('--hopdock-smoke')) {
    // CI headless launch check: proves main-process imports resolve.
    console.log('hopdock smoke ok');
    app.exit(0);
    return;
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
