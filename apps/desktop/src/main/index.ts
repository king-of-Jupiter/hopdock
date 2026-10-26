import { app, BrowserWindow } from 'electron';
import { registerIpc, setWindow } from './ipc';
import { checkOnStartup, setupAutoUpdater } from './updater';
import { cleanupWinSCP } from './winscp';
import { broadcast, createAppWindow } from './windows';
let ipcRegistered = false;

function createWindow(): void {
  const win = createAppWindow();
  setWindow(win);
  if (!ipcRegistered) { registerIpc(); ipcRegistered = true; }
  setupAutoUpdater(broadcast);
  checkOnStartup();
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
app.on('will-quit', cleanupWinSCP);
