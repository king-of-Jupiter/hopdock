import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UpdateController } from './update-controller';

class FakeUpdater extends EventEmitter {
  autoDownload = false; autoInstallOnAppQuit = false; calls = 0; installed: boolean[] | null = null;
  behavior: () => Promise<{ downloadPromise?: Promise<unknown> } | null> = async () => ({ });
  checkForUpdates() { this.calls++; return this.behavior(); }
  quitAndInstall(silent?: boolean, runAfter?: boolean) { this.installed = [!!silent, !!runAfter]; }
}
test('no newer release completes the check, preserves a snapshot and increments revisions', async () => {
  const updater = new FakeUpdater(); const changes: string[] = [];
  const control = new UpdateController(updater, () => true, (status) => changes.push(status.state));
  updater.behavior = async () => { updater.emit('update-not-available', { version: '0.0.6' }); return {}; };
  await control.check(); assert.equal(control.status().state, 'up-to-date'); assert.equal(control.status().version, '0.0.6');
  assert.ok(control.status().checkedAt); assert.deepEqual(changes, ['checking', 'up-to-date']);
  const snapshot = control.status(); snapshot.state = 'error'; assert.equal(control.status().state, 'up-to-date');
});
test('concurrent checks/downloads share an operation; ready update survives checks and installs silently with relaunch', async () => {
  const updater = new FakeUpdater(); const control = new UpdateController(updater, () => true, () => {});
  let finish!: () => void; const downloadPromise = new Promise<void>((resolve) => finish = resolve);
  updater.behavior = async () => { updater.emit('update-available', { version: '0.0.7' }); return { downloadPromise }; };
  const first = control.check(); const second = control.check(); assert.equal(first, second);
  await Promise.resolve(); updater.emit('download-progress', { percent: 58.5 });
  assert.equal(control.status().percent, 59); assert.equal(control.status().version, '0.0.7');
  updater.emit('update-downloaded', { version: '0.0.7' }); finish(); await first;
  await control.check(); assert.equal(updater.calls, 1); assert.equal(control.status().state, 'downloaded');
  control.install(); assert.deepEqual(updater.installed, [true, true]);
});
test('failed checks and downloads can be retried; duplicate error events are deduplicated', async () => {
  const updater = new FakeUpdater(); const statuses: string[] = [];
  const control = new UpdateController(updater, () => true, (status) => statuses.push(status.state));
  const error = new Error('ECONNREFUSED');
  updater.behavior = async () => { updater.emit('error', error); throw error; };
  await control.check(); assert.equal(statuses.filter((state) => state === 'error').length, 1);
  updater.behavior = async () => { updater.emit('update-not-available', { version: '0.0.6' }); return {}; };
  await control.check(); assert.equal(updater.calls, 2); assert.equal(control.status().state, 'up-to-date');
  updater.behavior = async () => ({ downloadPromise: Promise.reject(new Error('ENOSPC')) });
  await control.check(); assert.match(control.status().message!, /STORAGE_FULL/);
  updater.behavior = () => { throw new Error('sync failure'); };
  await control.check(); await control.check(); assert.equal(updater.calls, 5);
});
test('development builds and early install requests fail safely', async () => {
  const updater = new FakeUpdater(); const control = new UpdateController(updater, () => false, () => {});
  await control.check(); assert.equal(updater.calls, 0); assert.match(control.status().message!, /UPDATE_DEV/);
  assert.throws(() => control.install(), /No downloaded update/); assert.equal(updater.installed, null);
});
