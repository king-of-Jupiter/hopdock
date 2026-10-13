import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { explainError } from '@hopdock/core';

/** Electron discards Error properties. Return a safe typed error envelope instead. */
export function handleIpc(channel: string, action: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try { return await action(event, ...args); }
    catch (error) { return { __hopdockError: explainError(error, channel) }; }
  });
}
