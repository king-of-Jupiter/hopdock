import { explainError } from '@hopdock/core';
import type { UpdateStatus } from '@hopdock/ui';

interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<{ downloadPromise?: Promise<unknown> | null } | null>;
  quitAndInstall(silent?: boolean, runAfter?: boolean): void;
}

/** Durable status and a single check/download operation for the whole application. */
export class UpdateController {
  private current: UpdateStatus = { state: 'idle', revision: 0 };
  private running: Promise<void> | null = null;
  constructor(private updater: Updater, private packaged: () => boolean, private send: (status: UpdateStatus) => void) {
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.on('checking-for-update', () => this.publish({ state: 'checking' }));
    updater.on('update-available', (info: { version: string }) => this.publish({ state: 'available', version: info.version }));
    updater.on('update-not-available', (info: { version: string }) => this.publish({ state: 'up-to-date', version: info.version, checkedAt: new Date().toISOString() }));
    updater.on('download-progress', (progress: { percent: number }) => this.publish({ state: 'downloading', version: this.current.version, percent: Math.max(0, Math.min(100, Math.round(progress.percent))) }));
    updater.on('update-downloaded', (info: { version: string }) => this.publish({ state: 'downloaded', version: info.version, percent: 100, checkedAt: new Date().toISOString() }));
    updater.on('error', (error: unknown) => this.fail(error));
  }
  status(): UpdateStatus { return { ...this.current }; }
  private publish(status: UpdateStatus): void {
    this.current = { ...status, revision: (this.current.revision ?? 0) + 1 };
    this.send(this.status());
  }
  private fail(error: unknown): void {
    const message = 'HOPDOCK_ERROR:' + JSON.stringify(explainError(error, 'updater:check'));
    if (this.current.state === 'error' && this.current.message === message) return;
    this.publish({ state: 'error', message, checkedAt: new Date().toISOString() });
  }
  check(): Promise<void> {
    if (this.running) return this.running;
    if (this.current.state === 'downloaded') return Promise.resolve();
    if (!this.packaged()) { this.fail(new Error('Update checks are available in installed release builds.')); return Promise.resolve(); }
    this.publish({ state: 'checking' });
    this.running = Promise.resolve().then(async () => {
      try {
        const result = await this.updater.checkForUpdates();
        if (result === null) throw new Error('Application update service is unavailable.');
        if (result.downloadPromise) await result.downloadPromise;
      } catch (error) { this.fail(error); }
    }).finally(() => { this.running = null; });
    return this.running;
  }
  install(): void {
    if (this.current.state !== 'downloaded') throw new Error('No downloaded update is ready.');
    this.updater.quitAndInstall(true, true);
  }
}
