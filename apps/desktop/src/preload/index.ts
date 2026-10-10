import { ipcRenderer } from 'electron';
import type { HopdockApi } from '@hopdock/ui';
import { contextBridge } from 'electron';

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener as never);
  return () => ipcRenderer.removeListener(channel, listener as never);
}

const api: HopdockApi = {
  version: '0.0.1',
  vault: {
    get: () => ipcRenderer.invoke('vault:get'),
    saveHost: (input, id) => ipcRenderer.invoke('vault:saveHost', input, id),
    deleteHost: (id) => ipcRenderer.invoke('vault:deleteHost', id),
    setSecret: (key, value) => ipcRenderer.invoke('vault:setSecret', key, value),
  },
  ssh: {
    connect: (params) => ipcRenderer.invoke('ssh:connect', params.hostId, params.cols, params.rows),
    write: (id, dataB64) => ipcRenderer.invoke('ssh:write', id, dataB64),
    resize: (id, cols, rows) => ipcRenderer.invoke('ssh:resize', id, cols, rows),
    exec: (id, command) => ipcRenderer.invoke('ssh:exec', id, command),
    close: (id) => ipcRenderer.invoke('ssh:close', id),
    onData: (cb) => on('ssh:data', cb),
    onClose: (cb) => on('ssh:close', cb),
  },
  sftp: {
    list: (id, path) => ipcRenderer.invoke('sftp:list', id, path),
    downloadTo: (id, remotePath) => ipcRenderer.invoke('sftp:downloadTo', id, remotePath),
    uploadFrom: (id, remoteDir) => ipcRenderer.invoke('sftp:uploadFrom', id, remoteDir),
    mkdir: (id, path) => ipcRenderer.invoke('sftp:mkdir', id, path),
    remove: (id, path, recursive) => ipcRenderer.invoke('sftp:remove', id, path, recursive),
    rename: (id, from, to) => ipcRenderer.invoke('sftp:rename', id, from, to),
    chmod: (id, path, mode) => ipcRenderer.invoke('sftp:chmod', id, path, mode),
    copy: (id, from, to) => ipcRenderer.invoke('sftp:copy', id, from, to),
    onProgress: (cb) => on('sftp:progress', cb),
  },
  keys: {
    generate: (name, kind, passphrase) => ipcRenderer.invoke('keys:generate', name, kind, passphrase),
    importFile: (name) => ipcRenderer.invoke('keys:import', name),
    delete: (id) => ipcRenderer.invoke('keys:delete', id),
    copyId: (keyId, hostId) => ipcRenderer.invoke('keys:copyId', keyId, hostId),
  },
  snippets: {
    run: (snippetId, hostId, vars) => ipcRenderer.invoke('snippets:run', snippetId, hostId, vars),
    save: (input, id) => ipcRenderer.invoke('snippets:save', input, id),
    remove: (id) => ipcRenderer.invoke('snippets:remove', id),
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    saveCreds: (creds) => ipcRenderer.invoke('sync:saveCreds', creds),
    syncNow: () => ipcRenderer.invoke('sync:now'),
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    onStatus: (cb) => on('updater:status', cb),
  },
};

contextBridge.exposeInMainWorld('hopdock', api);
