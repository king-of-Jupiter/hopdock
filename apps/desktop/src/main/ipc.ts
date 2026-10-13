import { handleIpc } from './handle-ipc';
import { randomUUID } from 'node:crypto';
import { BrowserWindow, dialog } from 'electron';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { planTermiusImport } from './termius-import';
import { readTermiusProfile } from './termius-reader';
import { detectRemoteOs } from './detect-os';
import { basename, join, resolve } from 'path';
import { SessionManager } from '@hopdock/ssh';
import type { ConnectOpts } from '@hopdock/ssh';
import { fingerprint, generateKeyFile, publicKeyFromPrivate } from '@hopdock/ssh';
import { SyncEngine } from '@hopdock/sync';
import { deleteSecret, getSecret, hasSecret, keysDir, loadVault, saveVault, setSecret } from './store';
import type { SaveHostInput, SyncCredsInput } from '@hopdock/ui';
import { syncVault } from './sync-vault';
import { keyFileStorage } from './key-files';
import { supabaseUrl, supabasePublishableKey } from './backend-config';
import { absoluteLocalPath, listLocalFiles, localPlaces } from './local-files';
import { toPuttyPrivateKey } from './putty-key';
import { findWinSCP, openWinSCP, validateWinSCP } from './winscp';

const mgr = new SessionManager(() => undefined);
const sync = new SyncEngine();
let lastSyncError: string | null = null;
let win: BrowserWindow | null = null;
let syncBusy = false;
let pendingKeyWrites = 0;

async function mutateKeys<T>(operation: () => Promise<T>): Promise<T> {
  requireSyncIdle();
  pendingKeyWrites++;
  try { return await operation(); }
  finally { pendingKeyWrites--; }
}

function requireSyncIdle(): void {
  if (syncBusy) throw new Error('Sync is in progress. Try again when it finishes.');
}

export function setWindow(w: BrowserWindow): void {
  win = w;
  (mgr as unknown as { emit: (c: string, p: unknown) => void }).emit = (channel, payload) => {
    win?.webContents.send(channel, payload);
  };
}

function vault() {
  return loadVault();
}

async function connectOptsFor(hostId: string): Promise<ConnectOpts> {
  const v = vault();
  const host = v.hosts.find((h) => h.id === hostId);
  if (!host) throw new Error(`unknown host: ${hostId}`);
  const opts: ConnectOpts = { host: host.host, port: host.port, username: host.username };
  if (host.auth.type === 'password' || host.auth.type === 'key-password') {
    const pw = getSecret(`pw:${host.id}`);
    if (!pw) throw new Error('no stored password for this host');
    opts.password = pw;
  }
  if (host.auth.type === 'cert') {
    throw new Error('SSH certificate authentication is not supported yet.');
  } else if (host.auth.type === 'key' || host.auth.type === 'key-password') {
    const key = v.keys.find((k) => k.id === host.auth.keyId);
    if (!key) throw new Error('referenced key not found');
    const path = join(keysDir(), key.id);
    if (!existsSync(path)) throw new Error('private key file missing on this device');
    opts.privateKey = readFileSync(path, 'utf8');
    const pp = getSecret(`pp:${key.id}`);
    if (pp) opts.passphrase = pp;
  } else if (host.auth.type === 'agent') {
    if (!process.env['SSH_AUTH_SOCK']) throw new Error('SSH agent is unavailable: SSH_AUTH_SOCK is not set.');
    opts.agent = process.env['SSH_AUTH_SOCK'];
  }
  return opts;
}

export function registerIpc(): void {
  handleIpc('files:pick', async (_e, title: string, options: { save?: boolean; multiple?: boolean; filename?: string } = {}) => {
    if (!win) throw new Error('Application window is unavailable.');
    if (options.save) {
      const result = await dialog.showSaveDialog(win, { title, defaultPath: options.filename, properties: ['createDirectory', 'showOverwriteConfirmation'] });
      return result.canceled || !result.filePath ? null : [result.filePath];
    }
    const result = await dialog.showOpenDialog(win, { title, properties: options.multiple ? ['openFile', 'multiSelections'] : ['openFile'] });
    return result.canceled ? null : result.filePaths;
  });
  handleIpc('winscp:status', () => ({ supported: process.platform === 'win32', path: findWinSCP(getSecret('winscp:path')) }));
  handleIpc('winscp:configure', (_e, path: string) => { if (path) validateWinSCP(path); setSecret('winscp:path', path); });
  handleIpc('winscp:open', async (_e, id: string) => {
    const v = vault(); const host = v.hosts.find((h) => h.id === id);
    if (!host) throw new Error('Unknown host.');
    await openWinSCP(host, await connectOptsFor(id), getSecret('winscp:path'));
  });
  handleIpc('files:places', () => localPlaces());
  handleIpc('files:list', (_e, path: string) => listLocalFiles(path));
  handleIpc('files:exists', (_e, path: string) => existsSync(absoluteLocalPath(path)));
  handleIpc('vault:get', () => {
    const v = vault();
    return { hosts: v.hosts, groups: v.groups, keys: v.keys, snippets: v.snippets };
  });
  handleIpc('vault:readHostPassword', (_e, id: string) => {
    if (!vault().hosts.some((host) => host.id === id)) throw new Error('unknown host');
    const password = getSecret(`pw:${id}`);
    if (password === null) throw new Error('No stored password.');
    return password;
  });

  handleIpc('vault:saveGroup', (_e, name: string) => {
    requireSyncIdle();
    if (typeof name !== 'string' || !name.trim()) throw new Error('Group name is required.');
    const v = vault();
    const existing = v.groups.find((g) => g.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing;
    const group = { id: `g-${randomUUID()}`, vaultId: 'v-personal', name: name.trim(), sort: v.groups.length, updatedAt: new Date().toISOString() };
    v.groups.push(group); saveVault(v); return group;
  });
  handleIpc('vault:importTermius', async () => {
    requireSyncIdle();
    if (pendingKeyWrites) throw new Error('Wait for key generation or import to finish before syncing.');
    const json = await readTermiusProfile();
    requireSyncIdle();
    if (pendingKeyWrites) throw new Error('Wait for key generation or import to finish before syncing.');
    const plan = planTermiusImport(json, vault(), hasSecret);
    const files = keyFileStorage(keysDir());
    const writtenKeys: string[] = [], writtenSecrets: string[] = [];
    try {
      for (const [id, material] of plan.keyWrites) {
        if (existsSync(files.path(id))) throw new Error('Termius import key file already exists.');
        files.write(id, material); writtenKeys.push(id);
        plan.vault.keys.find((key) => key.id === id)!.privateRef = files.path(id);
      }
      for (const [key, value] of plan.secretWrites) {
        if (hasSecret(key)) throw new Error('Termius import secret already exists.');
        setSecret(key, value); writtenSecrets.push(key);
      }
      saveVault(plan.vault); return plan.result;
    } catch (error) {
      for (const key of writtenSecrets) deleteSecret(key);
      for (const id of writtenKeys) files.delete(id);
      throw error;
    }
  });

  handleIpc('vault:saveHost', (_e, input: SaveHostInput, id?: string) => {
    requireSyncIdle();
    const v = vault();
    if (input.groupId && !v.groups.some((group) => group.id === input.groupId)) throw new Error('unknown group');
    if ((input.auth.type === 'key' || input.auth.type === 'key-password') && !v.keys.some((key) => key.id === input.auth.keyId)) throw new Error('Select a key from Keychain.');
    if ((input.auth.type === 'password' || input.auth.type === 'key-password') && !input.password && !(id && getSecret(`pw:${id}`))) throw new Error('Password is required.');
    const tags = input.tags;
    if (id) {
      const i = v.hosts.findIndex((h) => h.id === id);
      if (i < 0) throw new Error('unknown host');
      const prev = v.hosts[i];
      if (!prev) throw new Error('unknown host');
      v.hosts[i] = {
        ...prev,
        os: prev.host === input.host && prev.port === input.port ? prev.os : undefined,
        groupId: input.groupId === undefined ? prev.groupId : input.groupId,
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        auth: input.auth,
        tags,
        updatedAt: new Date().toISOString(),
      };
      if (input.auth.type !== 'password' && input.auth.type !== 'key-password') deleteSecret(`pw:${id}`);
      else if (input.password) setSecret(`pw:${id}`, input.password);
      saveVault(v);
      const saved = v.hosts[i];
      if (!saved) throw new Error('unknown host');
      return saved;
    }
    const host = {
      id: `h-${Date.now()}`,
      vaultId: 'v-personal',
      groupId: input.groupId ?? null,
      name: input.name,
      host: input.host,
      port: input.port,
      username: input.username,
      auth: input.auth,
      portForwards: [],
      tags,
      remark: '',
      sort: v.hosts.length,
      starred: false,
      updatedAt: new Date().toISOString(),
    };
    if (input.password) setSecret(`pw:${host.id}`, input.password);
    v.hosts.push(host);
    saveVault(v);
    return host;
  });

  handleIpc('vault:deleteHost', (_e, id: string) => {
    requireSyncIdle();
    const v = vault();
    const host = v.hosts.find((h) => h.id === id);
    if (host) (v.deletedHosts ??= []).push({ ...host, updatedAt: new Date().toISOString() });
    v.hosts = v.hosts.filter((h) => h.id !== id);
    deleteSecret(`pw:${id}`);
    saveVault(v);
  });

  handleIpc('vault:setSecret', (_e, key: string, value: string) => {
    requireSyncIdle();
    setSecret(key, value);
    if (key.startsWith('pw:')) {
      const v = vault();
      const host = v.hosts.find((h) => `pw:${h.id}` === key);
      if (host) { host.updatedAt = new Date().toISOString(); saveVault(v); }
    } else if (key.startsWith('pp:')) {
      const v = vault();
      const entry = v.keys.find((k) => `pp:${k.id}` === key);
      if (entry) { entry.updatedAt = new Date().toISOString(); saveVault(v); }
    }
  });

  handleIpc('ssh:connect', async (_e, hostId: string, cols?: number, rows?: number, purpose?: 'sftp') => {
    const opts = await connectOptsFor(hostId);
    const sessionId = purpose === 'sftp' ? `sftp:${hostId}` : hostId;
    await mgr.connect(sessionId, opts, cols ?? 80, rows ?? 24);
    const connection = mgr.sessionIdentity(sessionId);
    void detectRemoteOs((command) => mgr.exec(sessionId, command, { timeoutMs: 1800, maxOutputBytes: 16384 }), mgr.banner(sessionId)).then((os) => {
      const persist = () => {
      if (!os || mgr.sessionIdentity(sessionId) !== connection) return;
      if (syncBusy) { setTimeout(persist, 250).unref(); return; }
      const data = vault();
      const host = data.hosts.find((host) => host.id === hostId);
      if (!host || host.host !== opts.host || host.port !== opts.port || host.username !== opts.username) return;
      host.os = os; host.updatedAt = new Date().toISOString(); saveVault(data);
      if (win && !win.isDestroyed()) win.webContents.send('vault:hostUpdated', host);
      };
      persist();
    }).catch(() => { /* OS detection is optional and never breaks an established session. */ });
    return sessionId;
  });
  handleIpc('ssh:write', (_e, id: string, dataB64: string) => mgr.write(id, dataB64));
  handleIpc('ssh:resize', (_e, id: string, cols: number, rows: number) => mgr.resize(id, cols, rows));
  handleIpc('ssh:exec', (_e, id: string, command: string) => mgr.exec(id, command));
  handleIpc('ssh:close', (_e, id: string) => mgr.close(id));

  handleIpc('sftp:list', (_e, id: string, path: string) => mgr.list(id, path));
  handleIpc('sftp:realpath', (_e, id: string, path: string) => mgr.realpath(id, path));
  handleIpc('sftp:downloadTo', async (_e, id: string, remotePath: string, selectedPath: string) => {
    const localPath = absoluteLocalPath(selectedPath);
    await mgr.download(id, remotePath, localPath);
    return localPath;
  });
  handleIpc('sftp:uploadFrom', async (_e, id: string, remoteDir: string, selectedPaths: string[]) => {
    if (!Array.isArray(selectedPaths) || !selectedPaths.length) return null;
    let last: string | null = null;
    for (const selected of selectedPaths) {
      const local = absoluteLocalPath(selected);
      await mgr.upload(id, local, `${remoteDir.replace(/\/$/, '')}/${basename(local)}`);
      last = local;
    }
    return last;
  });
  handleIpc('sftp:mkdir', (_e, id: string, path: string) => mgr.mkdir(id, path));
  handleIpc('sftp:remove', (_e, id: string, path: string, recursive: boolean) => mgr.remove(id, path, recursive));
  handleIpc('sftp:rename', (_e, id: string, from: string, to: string) => mgr.rename(id, from, to));
  handleIpc('sftp:chmod', (_e, id: string, path: string, mode: number) => mgr.chmod(id, path, mode));
  handleIpc('sftp:copy', (_e, id: string, from: string, to: string) => mgr.copy(id, from, to));

  handleIpc('keys:generate', async (_e, name: string, kind: 'ed25519' | 'rsa', passphrase: string) => mutateKeys(async () => {
    const id = `k-${Date.now()}`;
    const path = join(keysDir(), id);
    const { publicKey } = await generateKeyFile(path, kind, passphrase, `hopdock-${name}`);
    if (passphrase) setSecret(`pp:${id}`, passphrase);
    const key = {
      id,
      vaultId: 'v-personal',
      name,
      kind: kind === 'ed25519' ? ('Ed25519' as const) : ('RSA' as const),
      fingerprint: fingerprint(publicKey),
      publicKey,
      privateRef: path,
      updatedAt: new Date().toISOString(),
    };
    const v = vault();
    v.keys.push(key);
    saveVault(v);
    return key;
  }));

  handleIpc('keys:read', (_e, id: string) => {
    const key = vault().keys.find((entry) => entry.id === id);
    if (!key) throw new Error('Unknown key.');
    const material = keyFileStorage(keysDir()).read(key.id);
    if (material === null) throw new Error('Private key is not available on this device. Sync your vault first.');
    return { privateKey: material, passphrase: getSecret(`pp:${key.id}`) ?? '' };
  });
  handleIpc('keys:update', async (_e, id: string, input: { name: string; privateKey: string; passphrase: string }) => mutateKeys(async () => {
    if (!input.name?.trim()) throw new Error('Key name is required.');
    const v = vault(); const index = v.keys.findIndex((entry) => entry.id === id);
    const key = v.keys[index]; if (!key) throw new Error('Unknown key.');
    const parsed = publicKeyFromPrivate(input.privateKey, input.passphrase || undefined);
    keyFileStorage(keysDir()).write(key.id, input.privateKey);
    if (input.passphrase) setSecret(`pp:${key.id}`, input.passphrase); else deleteSecret(`pp:${key.id}`);
    const updated = { ...key, name: input.name.trim(), publicKey: parsed.publicKey, kind: parsed.kind, fingerprint: fingerprint(parsed.publicKey), updatedAt: new Date().toISOString() };
    v.keys[index] = updated; saveVault(v); return updated;
  }));
  handleIpc('keys:export', (_e, id: string, selectedPath: string, format: 'original' | 'ppk') => {
    const key = vault().keys.find((entry) => entry.id === id);
    if (!key) throw new Error('Unknown key.');
    if (format !== 'original' && format !== 'ppk') throw new Error('Unsupported export format.');
    const material = keyFileStorage(keysDir()).read(key.id);
    if (material === null) throw new Error('Private key is not available on this device.');
    const target = absoluteLocalPath(selectedPath);
    const managedDirectory = resolve(keysDir()).toLowerCase(); const exportPath = resolve(target).toLowerCase();
    if (exportPath === managedDirectory || exportPath.startsWith(managedDirectory + '\\') || exportPath.startsWith(managedDirectory + '/')) throw new Error('Choose an export destination outside the managed Keychain folder.');
    const content = format === 'original' ? material : toPuttyPrivateKey(material, getSecret(`pp:${key.id}`) ?? '', key.name);
    writeFileSync(target, content, { mode: 0o600 });
    return target;
  });

  handleIpc('keys:import', async (_e, name: string, passphrase: string | undefined, selectedPath: string) => mutateKeys(async () => {
    const src = absoluteLocalPath(selectedPath);
    const id = `k-${Date.now()}`;
    const dest = join(keysDir(), id);
    const material = readFileSync(src, 'utf8');
    const { publicKey: pub, kind } = publicKeyFromPrivate(material, passphrase);
    keyFileStorage(keysDir()).write(id, material);
    if (passphrase) setSecret(`pp:${id}`, passphrase);
    const key = {
      id,
      vaultId: 'v-personal',
      name,
      kind,
      fingerprint: fingerprint(pub),
      publicKey: pub,
      privateRef: dest,
      updatedAt: new Date().toISOString(),
    };
    const v = vault();
    v.keys.push(key);
    saveVault(v);
    return key;
  }));

  handleIpc('keys:delete', async (_e, id: string) => {
    requireSyncIdle();
    const v = vault();
    const key = v.keys.find((k) => k.id === id);
    if (key) (v.deletedKeys ??= []).push({ id: key.id, vaultId: key.vaultId, updatedAt: new Date().toISOString() });
    v.keys = v.keys.filter((k) => k.id !== id);
    saveVault(v);
    deleteSecret(`pp:${id}`);
    rmSync(join(keysDir(), id), { force: true });
    rmSync(join(keysDir(), `${id}.pub`), { force: true });
  });

  handleIpc('keys:copyId', async (_e, keyId: string, hostId: string) => {
    const v = vault();
    const key = v.keys.find((k) => k.id === keyId);
    if (!key) throw new Error('unknown key');
    const tmpId = `tmp-copyid-${Date.now()}`;
    await mgr.connect(tmpId, await connectOptsFor(hostId));
    try {
      const safe = key.publicKey.replace(/'/g, `'\\''`);
      const r = await mgr.exec(tmpId, `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${safe}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo OK`);
      if (r.code !== 0) throw new Error(r.stderr || 'ssh-copy-id failed');
      return r.stdout.trim();
    } finally {
      await mgr.close(tmpId);
    }
  });

  handleIpc('snippets:run', async (_e, snippetId: string, hostId: string, vars: Record<string, string>) => {
    const v = vault();
    const snip = v.snippets.find((s) => s.id === snippetId);
    if (!snip) throw new Error('unknown snippet');
    const script = snip.script.replace(/\$\{(\w+)\}/g, (_, name: string) => vars[name] ?? '');
    const tmpId = `tmp-snip-${Date.now()}`;
    await mgr.connect(tmpId, await connectOptsFor(hostId));
    try {
      return await mgr.exec(tmpId, script);
    } finally {
      await mgr.close(tmpId);
    }
  });

  handleIpc('snippets:save', (_e, input: { name: string; folder: string; script: string }, id?: string) => {
    requireSyncIdle();
    const v = vault();
    if (id) {
      const i = v.snippets.findIndex((s) => s.id === id);
      if (i < 0) throw new Error('unknown snippet');
      const prev = v.snippets[i];
      if (!prev) throw new Error('unknown snippet');
      v.snippets[i] = {
        ...prev,
        name: input.name,
        folder: input.folder,
        script: input.script,
        vars: [...input.script.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1] as string),
        updatedAt: new Date().toISOString(),
      };
      saveVault(v);
      const saved = v.snippets[i];
      if (!saved) throw new Error('unknown snippet');
      return saved;
    }
    const snip = {
      id: `s-${Date.now()}`,
      vaultId: 'v-personal',
      name: input.name,
      folder: input.folder || 'general',
      script: input.script,
      vars: [...input.script.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1] as string),
      updatedAt: new Date().toISOString(),
    };
    v.snippets.push(snip);
    saveVault(v);
    return snip;
  });

  handleIpc('snippets:remove', (_e, id: string) => {
    requireSyncIdle();
    const v = vault();
    const snippet = v.snippets.find((s) => s.id === id);
    if (snippet) (v.deletedSnippets ??= []).push({ id: snippet.id, vaultId: snippet.vaultId, updatedAt: new Date().toISOString() });
    v.snippets = v.snippets.filter((s) => s.id !== id);
    saveVault(v);
  });

  handleIpc('sync:status', () => ({
    configured: !!(supabaseUrl && supabasePublishableKey && getSecret('sync:email') && getSecret('sync:pass')),
    backendConfigured: !!(supabaseUrl && supabasePublishableKey),
    projectUrl: supabaseUrl,
    lastSyncAt: vault().lastSyncAt,
    lastError: lastSyncError,
    passwordsConfigured: !!getSecret('sync:encryptionPassword'),
  }));

  handleIpc('sync:setEncryptionPassword', (_e, passphrase: string) => {
    requireSyncIdle();
    if (typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('Use at least 12 characters for the sync encryption password.');
    const previous = getSecret('sync:encryptionPassword');
    if (previous && previous !== passphrase && vault().passwordSyncVersion === 1) {
      throw new Error('The encryption password is already in use. Keep the same password on all devices.');
    }
    setSecret('sync:encryptionPassword', passphrase);
  });

  handleIpc('sync:saveCreds', (_e, creds: SyncCredsInput) => {
    requireSyncIdle();
    if (!supabaseUrl || !supabasePublishableKey) throw new Error('This build has no Supabase configuration.');
    if (!creds.email?.trim() || !creds.password) throw new Error('Enter your account email and password.');
    if (getSecret('sync:url') !== supabaseUrl || getSecret('sync:email') !== creds.email) {
      const v = vault();
      delete v.passwordSyncVersion;
      delete v.contentSyncVersion;
      v.lastSyncAt = new Date(0).toISOString();
      saveVault(v);
    }
    setSecret('sync:url', supabaseUrl);
    deleteSecret('sync:key');
    setSecret('sync:email', creds.email);
    setSecret('sync:pass', creds.password);
    sync.configure({ url: supabaseUrl, anonKey: supabasePublishableKey, email: creds.email, password: creds.password });
  });

  handleIpc('sync:now', async () => {
    requireSyncIdle();
    if (pendingKeyWrites) throw new Error('Wait for key generation or import to finish before syncing.');
    if (!sync.configured) {
      const email = getSecret('sync:email');
      const password = getSecret('sync:pass');
      if (!supabaseUrl || !supabasePublishableKey) throw new Error('This build has no Supabase configuration.');
      if (!email || !password) throw new Error('Sign in to sync in Settings first.');
      if (getSecret('sync:url') !== supabaseUrl) {
        const v = vault();
        delete v.passwordSyncVersion;
        delete v.contentSyncVersion;
        v.lastSyncAt = new Date(0).toISOString();
        saveVault(v);
        setSecret('sync:url', supabaseUrl);
      }
      sync.configure({ url: supabaseUrl, anonKey: supabasePublishableKey, email, password });
    }
    const v = vault();
    lastSyncError = null;
    syncBusy = true;
    try {
      const result = await syncVault(v, sync, { get: getSecret, set: setSecret, delete: deleteSecret }, getSecret('sync:encryptionPassword') ?? '', keyFileStorage(keysDir()));
      saveVault(result.vault);
      return { pushed: result.pushed, pulled: result.pulled };
    } catch (err) {
      lastSyncError = String(err);
      throw err;
    } finally {
      syncBusy = false;
    }
  });
}
