import { ipcRenderer } from 'electron';
import type { HopdockApi } from '@hopdock/ui';
import { contextBridge } from 'electron';
import { buildVersion } from '../build-info';
async function invoke(channel: string, ...args: unknown[]) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (result && typeof result === 'object' && result.__hopdockError) throw new Error('HOPDOCK_ERROR:' + JSON.stringify(result.__hopdockError));
  return result;
}

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener as never);
  return () => ipcRenderer.removeListener(channel, listener as never);
}

const api: HopdockApi = {
  version: buildVersion,
  files: {
    pick: (title, options) => invoke('files:pick', title, options),
    places: () => invoke('files:places'),
    list: (path) => invoke('files:list', path),
    exists: (path) => invoke('files:exists', path),
  },
  vault: {
    get: () => invoke('vault:get'),
    onHostUpdated: (cb) => on('vault:hostUpdated', cb),
    readHostPassword: (id) => invoke('vault:readHostPassword', id),
    saveHost: (input, id) => invoke('vault:saveHost', input, id),
    saveGroup: (name) => invoke('vault:saveGroup', name),
    moveHost: (id, groupId) => invoke('vault:moveHost', id, groupId),
    importTermius: () => invoke('vault:importTermius'),
    deleteHost: (id) => invoke('vault:deleteHost', id),
    setSecret: (key, value) => invoke('vault:setSecret', key, value),
  },
  ssh: {
    connect: (params) => invoke('ssh:connect', params.hostId, params.cols, params.rows, params.purpose),
    write: (id, dataB64) => invoke('ssh:write', id, dataB64),
    resize: (id, cols, rows) => invoke('ssh:resize', id, cols, rows),
    exec: (id, command) => invoke('ssh:exec', id, command),
    close: (id) => invoke('ssh:close', id),
    onData: (cb) => on('ssh:data', cb),
    onClose: (cb) => on('ssh:close', cb),
  },
  sftp: {
    list: (id, path) => invoke('sftp:list', id, path),
    realpath: (id, path) => invoke('sftp:realpath', id, path),
    downloadTo: (id, remotePath, localPath) => invoke('sftp:downloadTo', id, remotePath, localPath),
    uploadFrom: (id, remoteDir, localPaths) => invoke('sftp:uploadFrom', id, remoteDir, localPaths),
    mkdir: (id, path) => invoke('sftp:mkdir', id, path),
    remove: (id, path, recursive) => invoke('sftp:remove', id, path, recursive),
    rename: (id, from, to) => invoke('sftp:rename', id, from, to),
    chmod: (id, path, mode) => invoke('sftp:chmod', id, path, mode),
    copy: (id, from, to) => invoke('sftp:copy', id, from, to),
    onProgress: (cb) => on('sftp:progress', cb),
  },
  keys: {
    read: (id) => invoke('keys:read', id),
    update: (id, input) => invoke('keys:update', id, input),
    export: (id, path, format) => invoke('keys:export', id, path, format),
    generate: (name, kind, passphrase) => invoke('keys:generate', name, kind, passphrase),
    importFile: (name, passphrase, path) => invoke('keys:import', name, passphrase, path),
    delete: (id) => invoke('keys:delete', id),
    copyId: (keyId, hostId) => invoke('keys:copyId', keyId, hostId),
  },
  snippets: {
    run: (snippetId, hostId, vars) => invoke('snippets:run', snippetId, hostId, vars),
    save: (input, id) => invoke('snippets:save', input, id),
    remove: (id) => invoke('snippets:remove', id),
  },
  winscp: {
    status: () => invoke('winscp:status'),
    configure: (path) => invoke('winscp:configure', path),
    open: (hostId) => invoke('winscp:open', hostId),
  },
  auth: {
    status: () => invoke('auth:status'),
    signIn: (creds) => invoke('auth:signIn', creds),
    signUp: (creds) => invoke('auth:signUp', creds),
    signOut: () => invoke('auth:signOut'),
    onStatus: (cb) => on('auth:statusChanged', cb),
  },
  sync: {
    onStatus: (cb) => on('sync:statusChanged', cb),
    onVaultUpdated: (cb) => on('vault:updated', cb),
    status: () => invoke('sync:status'),
    saveCreds: (creds) => invoke('sync:saveCreds', creds),
    setEncryptionPassword: (password) => invoke('sync:setEncryptionPassword', password),
    syncNow: () => invoke('sync:now'),
  },
  updater: {
    status: () => invoke('updater:status'),
    check: () => invoke('updater:check'),
    install: () => invoke('updater:install'),
    onStatus: (cb) => on('updater:status', cb),
  },
};

contextBridge.exposeInMainWorld('hopdock', api);
