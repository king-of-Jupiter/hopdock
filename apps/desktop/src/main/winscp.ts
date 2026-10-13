import { spawn, execFileSync } from 'node:child_process';
import { existsSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, basename, isAbsolute, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type { Host } from '@hopdock/core';
import type { ConnectOpts } from '@hopdock/ssh';
import { toPuttyPrivateKey } from './putty-key';
const activeCredentials = new Set<() => void>();
export function cleanupWinSCP(): void {
  for (const cleanup of activeCredentials) { try { cleanup(); } catch {} }
  activeCredentials.clear();
}

export function validateWinSCP(path: string): void {
  if (!isAbsolute(path) || basename(path).toLowerCase() !== 'winscp.exe' || !existsSync(path) || !statSync(path).isFile()) throw new Error('Choose the WinSCP.exe application.');
}
export function findWinSCP(configured?: string | null): string | null {
  if (process.platform !== 'win32') return null;
  if (configured) { try { validateWinSCP(configured); return configured; } catch { return null; } }
  const candidates = [
    ...['ProgramFiles', 'ProgramFiles(x86)'].flatMap((name) => process.env[name] ? [join(process.env[name]!, 'WinSCP', 'WinSCP.exe')] : []),
    ...(process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, 'Programs', 'WinSCP', 'WinSCP.exe')] : []),
    ...(process.env.PATH ?? '').split(';').filter(Boolean).map((directory) => join(directory.replace(/^"|"$/g, ''), 'WinSCP.exe')),
  ];
  for (const candidate of candidates) { try { validateWinSCP(candidate); return candidate; } catch {} }
  for (const hive of ['HKCU', 'HKLM']) {
    try {
      const output = execFileSync('reg.exe', ['query', `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\WinSCP.exe`, '/ve'], { windowsHide: true, timeout: 2000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const path = /REG_(?:EXPAND_)?SZ\s+(.+)/.exec(output)?.[1]?.trim();
      if (path) { validateWinSCP(path); return path; }
    } catch {}
  }
  return null;
}

/** Owned temporary credential files; never interpolate secrets into shell commands. */
export function prepareWinSCP(host: Host, opts: ConnectOpts) {
  if (!/^[A-Za-z0-9._:-]+$/.test(host.host) || !Number.isInteger(host.port) || host.port < 1 || host.port > 65535) throw new Error('Invalid host address or port.');
  if (host.auth.type === 'cert') throw new Error('Certificate authentication is not supported by this integration.');
  if (host.jumpHostId) throw new Error('WinSCP jump hosts are not configured yet.');
  const directory = mkdtempSync(join(tmpdir(), 'hopdock-winscp-'));
  const cleanup = () => {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('hopdock-winscp-')) throw new Error('Invalid temporary credential directory.');
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  };
  const address = host.host.includes(':') ? `[${host.host.replace(/^\[|\]$/g, '')}]` : host.host;
  const args = [`sftp://${encodeURIComponent(host.username)}@${address}:${host.port}/`, '/newinstance', '/passwordsfromfiles'];
  const write = (name: string, value: string) => { const path = join(directory, name); writeFileSync(path, value, { mode: 0o600, flag: 'wx' }); return path; };
  try {
    if (opts.password) args.push(`/password=${write('password', opts.password)}`);
    if (opts.privateKey) {
      const passphrase = randomBytes(32).toString('hex');
      args.push(`/privatekey=${write('identity.ppk', toPuttyPrivateKey(opts.privateKey, opts.passphrase, host.name, passphrase))}`);
      args.push(`/passphrase=${write('passphrase', passphrase)}`);
    }
    args.push('/rawsettings', `TryAgent=${host.auth.type === 'agent' ? 1 : 0}`);
    return { args, cleanup, directory };
  } catch (error) { cleanup(); throw error; }
}

export async function openWinSCP(host: Host, opts: ConnectOpts, configured?: string | null): Promise<void> {
  if (process.platform !== 'win32') throw new Error('WinSCP integration is available on Windows.');
  const executable = findWinSCP(configured);
  if (!executable) throw new Error('WinSCP was not found. Install it or choose WinSCP.exe in Settings.');
  const prepared = prepareWinSCP(host, opts);
  activeCredentials.add(prepared.cleanup);
  const cleanup = () => { activeCredentials.delete(prepared.cleanup); prepared.cleanup(); };
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, prepared.args, { shell: false, stdio: 'ignore', windowsHide: false });
    child.once('spawn', () => resolve());
    child.once('error', () => { cleanup(); reject(new Error('Unable to launch WinSCP. Check the executable in Settings.')); });
    child.once('exit', cleanup);
    child.unref();
  });
}
