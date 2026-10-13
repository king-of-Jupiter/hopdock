import { app } from 'electron';
import { handleIpc } from './handle-ipc';
import updaterPkg from 'electron-updater';
import { UpdateController } from './update-controller';

const { autoUpdater } = updaterPkg;
let controller: UpdateController | null = null;
let sink: UpdaterSink = () => {};
let scheduled = false;
export type UpdaterSink = (channel: string, payload: unknown) => void;

export function setupAutoUpdater(send: UpdaterSink): void {
  sink = send;
  if (controller) return;
  controller = new UpdateController(autoUpdater, () => app.isPackaged, (status) => sink('updater:status', status));
  handleIpc('updater:status', () => controller!.status());
  handleIpc('updater:check', () => controller!.check());
  handleIpc('updater:install', () => controller!.install());
}
export function checkOnStartup(): void {
  if (!app.isPackaged || scheduled) return;
  scheduled = true;
  const startup = setTimeout(() => { void controller?.check(); }, 20000);
  const periodic = setInterval(() => { void controller?.check(); }, 6 * 60 * 60 * 1000);
  startup.unref(); periodic.unref();
  app.once('will-quit', () => { clearTimeout(startup); clearInterval(periodic); });
}
