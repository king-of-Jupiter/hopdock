// Real electron-updater / GitHub provider probe. Isolated cache; never install over the user's app.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { NsisUpdater } = require('electron-updater');
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor');
if (!process.env.HOPDOCK_UPDATE_FIXTURE) throw new Error('Isolated fixture directory required');
const fixture = process.env.HOPDOCK_UPDATE_FIXTURE;
app.setPath('userData', path.join(fixture, 'profile'));
fs.mkdirSync(app.getPath('userData'), { recursive: true });
const { UpdateController } = require(path.join(fixture, 'controller.cjs'));
const result = { checks: [], installer: null };
class ProbeUpdater extends NsisUpdater {
  doInstall(options) { result.installer = options; return false; }
}
const adapter = (version) => ({
  version, name: 'Hopdock update fixture', isPackaged: true,
  appUpdateConfigPath: path.join(fixture, 'app-update.yml'),
  userDataPath: app.getPath('userData'), baseCachePath: fixture,
  whenReady: () => app.whenReady(), quit: () => { throw new Error('The fixture must not quit for a real installation'); },
  relaunch: () => {}, onQuit: () => {},
});
app.whenReady().then(async () => {
  const watchdog = setTimeout(() => app.exit(2), 180000);
  try {
    const current = new ProbeUpdater(undefined, adapter('0.0.6'));
    current.logger = null;
    current.httpExecutor = new ElectronHttpExecutor();
    current.on('error', (error) => console.error('probe:', error.message));
    const upToDate = new UpdateController(current, () => true, () => {});
    await upToDate.check();
    if (upToDate.status().state !== 'up-to-date') throw new Error(JSON.stringify(upToDate.status()));
    result.checks.push({ name: 'Published GitHub feed, current version', status: upToDate.status() });
    const older = new ProbeUpdater(undefined, adapter('0.0.5'));
    older.logger = null; older.disableDifferentialDownload = true;
    older.httpExecutor = new ElectronHttpExecutor();
    older.setFeedURL({ provider: 'github', owner: 'king-of-Jupiter', repo: 'hopdock' });
    const download = new UpdateController(older, () => true, (status) => { if (status.state !== 'downloading') console.log('update:', status.state); });
    await download.check();
    if (download.status().state !== 'downloaded') throw new Error(JSON.stringify(download.status()));
    if (!older.installerPath || fs.statSync(older.installerPath).size < 1000000) throw new Error('Installer was not downloaded');
    result.checks.push({ name: 'Older version receives and verifies the real NSIS installer', status: download.status(), bytes: fs.statSync(older.installerPath).size });
    download.install();
    if (!result.installer?.isSilent || !result.installer?.isForceRunAfter) throw new Error('Silent install / relaunch flags missing');
    // Remove file paths from the shareable result; the probe intercepts installer execution.
    result.installer = { silent: result.installer.isSilent, relaunch: result.installer.isForceRunAfter, interceptedForIsolation: true };
    fs.writeFileSync(path.resolve('docs/updater-real-results.json'), JSON.stringify(result, null, 2));
    console.log('PASS real GitHub feed: up-to-date, download with checksum verification, installer dispatch');
    app.exit(0);
  } catch (error) { console.error(error.message); app.exit(1); }
  finally { clearTimeout(watchdog); }
});
