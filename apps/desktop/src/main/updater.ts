import { BrowserWindow, app, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

export type UpdaterSink = (channel: string, payload: unknown) => void;

/** GitHub Releases auto-update: silent download, prompt restart, manual check from Settings. */
export function setupAutoUpdater(send: UpdaterSink): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => send('updater:status', { state: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    send('updater:status', { state: 'available', version: info.version }),
  );
  autoUpdater.on('download-progress', (progress) =>
    send('updater:status', { state: 'downloading', percent: Math.round(progress.percent) }),
  );
  autoUpdater.on('update-downloaded', (info) => {
    send('updater:status', { state: 'downloaded', version: info.version });
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    void dialog
      .showMessageBox(win, {
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        message: `Hopdock ${info.version} downloaded. Restart to install?`,
      })
      .then((r) => {
        if (r.response === 0) autoUpdater.quitAndInstall();
      });
  });
  autoUpdater.on('error', (err: unknown) =>
    send('updater:status', { state: 'error', message: err instanceof Error ? err.message : String(err) }),
  );

  ipcMain.handle('updater:check', async () => {
    send('updater:status', { state: 'checking' });
    await autoUpdater.checkForUpdates();
  });
}

export function checkOnStartup(): void {
  // Dev runs have no releases feed — only packaged builds phone home.
  if (!app.isPackaged) return;
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => undefined);
  }, 20000);
}
