import { BrowserWindow, dialog, ipcMain } from 'electron';
import { copyFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { homedir } from 'os';
import { basename, join } from 'path';
import { SessionManager } from '@hopdock/ssh';
import type { ConnectOpts } from '@hopdock/ssh';
import { fingerprint, generateKeyFile } from '@hopdock/ssh';
import { SyncEngine } from '@hopdock/sync';
import type { ItemKind, VaultItem } from '@hopdock/sync';
import { execFile } from 'child_process';
import { deleteSecret, getSecret, keysDir, loadVault, saveVault, setSecret } from './store';
import type { SaveHostInput } from '@hopdock/ui';

const mgr = new SessionManager(() => undefined);
const sync = new SyncEngine();
let lastSyncError: string | null = null;
let win: BrowserWindow | null = null;

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
  if (host.auth.type === 'password') {
    const pw = getSecret(`pw:${host.id}`);
    if (!pw) throw new Error('no stored password for this host');
    opts.password = pw;
  } else if (host.auth.type === 'key' || host.auth.type === 'cert') {
    const key = v.keys.find((k) => k.id === host.auth.keyId);
    if (!key) throw new Error('referenced key not found');
    const path = join(keysDir(), key.id);
    if (!existsSync(path)) throw new Error('private key file missing on this device');
    opts.privateKey = readFileSync(path, 'utf8');
    const pp = getSecret(`pp:${key.id}`);
    if (pp) opts.passphrase = pp;
  } else if (host.auth.type === 'agent') {
    if (process.env['SSH_AUTH_SOCK']) opts.agent = process.env['SSH_AUTH_SOCK'];
  }
  return opts;
}

export function registerIpc(): void {
  ipcMain.handle('vault:get', () => {
    const v = vault();
    return { hosts: v.hosts, keys: v.keys, snippets: v.snippets };
  });

  ipcMain.handle('vault:saveHost', (_e, input: SaveHostInput, id?: string) => {
    const v = vault();
    const tags = input.tags;
    if (id) {
      const i = v.hosts.findIndex((h) => h.id === id);
      if (i < 0) throw new Error('unknown host');
      const prev = v.hosts[i];
      if (!prev) throw new Error('unknown host');
      v.hosts[i] = {
        ...prev,
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        auth: input.auth,
        tags,
        updatedAt: new Date().toISOString(),
      };
      if (input.password) setSecret(`pw:${id}`, input.password);
      saveVault(v);
      const saved = v.hosts[i];
      if (!saved) throw new Error('unknown host');
      return saved;
    }
    const host = {
      id: `h-${Date.now()}`,
      vaultId: 'v-personal',
      groupId: v.groups[0]?.id ?? null,
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

  ipcMain.handle('vault:deleteHost', (_e, id: string) => {
    const v = vault();
    v.hosts = v.hosts.filter((h) => h.id !== id);
    deleteSecret(`pw:${id}`);
    saveVault(v);
  });

  ipcMain.handle('vault:setSecret', (_e, key: string, value: string) => setSecret(key, value));

  ipcMain.handle('ssh:connect', async (_e, hostId: string, cols?: number, rows?: number) => {
    const opts = await connectOptsFor(hostId);
    await mgr.connect(hostId, opts, cols ?? 80, rows ?? 24);
    return hostId;
  });
  ipcMain.handle('ssh:write', (_e, id: string, dataB64: string) => mgr.write(id, dataB64));
  ipcMain.handle('ssh:resize', (_e, id: string, cols: number, rows: number) => mgr.resize(id, cols, rows));
  ipcMain.handle('ssh:exec', (_e, id: string, command: string) => mgr.exec(id, command));
  ipcMain.handle('ssh:close', (_e, id: string) => mgr.close(id));

  ipcMain.handle('sftp:list', (_e, id: string, path: string) => mgr.list(id, path));
  ipcMain.handle('sftp:downloadTo', async (_e, id: string, remotePath: string) => {
    const picked = await dialog.showSaveDialog({ defaultPath: join(homedir(), 'Downloads', basename(remotePath)) });
    if (picked.canceled || !picked.filePath) return null;
    await mgr.download(id, remotePath, picked.filePath);
    return picked.filePath;
  });
  ipcMain.handle('sftp:uploadFrom', async (_e, id: string, remoteDir: string) => {
    const picked = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    if (picked.canceled || picked.filePaths.length === 0) return null;
    let last: string | null = null;
    for (const local of picked.filePaths) {
      await mgr.upload(id, local, `${remoteDir.replace(/\/$/, '')}/${basename(local)}`);
      last = local;
    }
    return last;
  });
  ipcMain.handle('sftp:mkdir', (_e, id: string, path: string) => mgr.mkdir(id, path));
  ipcMain.handle('sftp:remove', (_e, id: string, path: string, recursive: boolean) => mgr.remove(id, path, recursive));
  ipcMain.handle('sftp:rename', (_e, id: string, from: string, to: string) => mgr.rename(id, from, to));
  ipcMain.handle('sftp:chmod', (_e, id: string, path: string, mode: number) => mgr.chmod(id, path, mode));
  ipcMain.handle('sftp:copy', (_e, id: string, from: string, to: string) => mgr.copy(id, from, to));

  ipcMain.handle('keys:generate', async (_e, name: string, kind: 'ed25519' | 'rsa', passphrase: string) => {
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
  });

  ipcMain.handle('keys:import', async (_e, name: string) => {
    const picked = await dialog.showOpenDialog({ properties: ['openFile'] });
    if (picked.canceled || picked.filePaths.length === 0) return null;
    const src = picked.filePaths[0];
    if (!src) return null;
    const id = `k-${Date.now()}`;
    const dest = join(keysDir(), id);
    copyFileSync(src, dest);
    const pub = await new Promise<string>((resolve, reject) => {
      execFile('ssh-keygen', ['-y', '-f', dest], (err, stdout) => (err ? reject(err) : resolve(stdout.trim())));
    });
    const key = {
      id,
      vaultId: 'v-personal',
      name,
      kind: (/^ssh-ed25519/.test(pub) || /^sk-ssh-ed25519/.test(pub) ? 'Ed25519' : 'RSA') as 'Ed25519' | 'RSA',
      fingerprint: fingerprint(pub),
      publicKey: pub,
      privateRef: dest,
      updatedAt: new Date().toISOString(),
    };
    const v = vault();
    v.keys.push(key);
    saveVault(v);
    return key;
  });

  ipcMain.handle('keys:delete', async (_e, id: string) => {
    const v = vault();
    v.keys = v.keys.filter((k) => k.id !== id);
    saveVault(v);
    deleteSecret(`pp:${id}`);
    rmSync(join(keysDir(), id), { force: true });
  });

  ipcMain.handle('keys:copyId', async (_e, keyId: string, hostId: string) => {
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

  ipcMain.handle('snippets:run', async (_e, snippetId: string, hostId: string, vars: Record<string, string>) => {
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

  ipcMain.handle('snippets:save', (_e, input: { name: string; folder: string; script: string }, id?: string) => {
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

  ipcMain.handle('snippets:remove', (_e, id: string) => {
    const v = vault();
    v.snippets = v.snippets.filter((s) => s.id !== id);
    saveVault(v);
  });

  ipcMain.handle('sync:status', () => ({
    configured: sync.configured,
    lastSyncAt: vault().lastSyncAt,
    lastError: lastSyncError,
  }));

  ipcMain.handle('sync:saveCreds', (_e, creds: { url: string; anonKey: string; email: string; password: string }) => {
    setSecret('sync:url', creds.url);
    setSecret('sync:key', creds.anonKey);
    setSecret('sync:email', creds.email);
    setSecret('sync:pass', creds.password);
    sync.configure(creds);
  });

  ipcMain.handle('sync:now', async () => {
    if (!sync.configured) {
      const url = getSecret('sync:url');
      const anonKey = getSecret('sync:key');
      const email = getSecret('sync:email');
      const password = getSecret('sync:pass');
      if (!url || !anonKey) throw new Error('sync not configured — fill Settings first');
      sync.configure({ url, anonKey, email: email ?? '', password: password ?? '' });
    }
    const v = vault();
    lastSyncError = null;
    try {
      const since = v.lastSyncAt;
      const pushItems: VaultItem[] = [
        ...v.hosts.filter((h) => h.updatedAt > since).map((h) => {
          const { ...rest } = h;
          void rest;
          return { id: h.id, vault_id: h.vaultId, kind: 'host' as ItemKind, data: h, updated_at: h.updatedAt };
        }),
        ...v.groups.filter((g) => since === new Date(0).toISOString()).map((g) => ({ id: g.id, vault_id: g.vaultId, kind: 'group' as ItemKind, data: g, updated_at: new Date().toISOString() })),
        ...v.keys.map((k) => {
          const { privateRef, ...pub } = k;
          void privateRef;
          return { id: k.id, vault_id: k.vaultId, kind: 'key' as ItemKind, data: pub, updated_at: k.updatedAt };
        }),
        ...v.snippets.map((s) => ({ id: s.id, vault_id: s.vaultId, kind: 'snippet' as ItemKind, data: s, updated_at: s.updatedAt })),
      ].filter((i) => i.updated_at > since);
      const pushed = await sync.push(pushItems);
      const pulled = await sync.pull(since);
      for (const item of pulled) {
        if (item.kind === 'host') {
          const h = item.data as (typeof v.hosts)[number];
          const i = v.hosts.findIndex((x) => x.id === h.id);
          if (i >= 0) v.hosts[i] = h;
          else v.hosts.push(h);
        } else if (item.kind === 'snippet') {
          const s = item.data as (typeof v.snippets)[number];
          const i = v.snippets.findIndex((x) => x.id === s.id);
          if (i >= 0) v.snippets[i] = s;
          else v.snippets.push(s);
        }
        // groups/keys merge by id the same way; key private material stays local-only
      }
      v.lastSyncAt = new Date().toISOString();
      saveVault(v);
      return { pushed, pulled: pulled.length };
    } catch (err) {
      lastSyncError = String(err);
      throw err;
    }
  });
}
