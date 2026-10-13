import type { Host } from '@hopdock/core';
import type { ExecResult } from '@hopdock/ssh';
type Os = NonNullable<Host['os']>;
const os = (id: string, name: string, version?: string, family?: string): Os => ({ id, name, version, family, source: 'probe', detectedAt: new Date().toISOString() });
const clean = (text: string) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, 8192);

export function parseOsRelease(text: string): Os | null {
  const fields: Record<string, string> = {};
  for (const line of clean(text).split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    fields[match[1]!] = value.replace(/\\(["\\$`])/g, '$1').slice(0, 160);
  }
  const id = fields.ID?.toLowerCase();
  if (!id || !/^[a-z0-9._-]{1,64}$/.test(id)) return null;
  return os(id, fields.PRETTY_NAME || fields.NAME || id, fields.VERSION_ID, fields.ID_LIKE);
}
export function parseOsBanner(banner: string): Os | null {
  const text = clean(banner);
  const known: [RegExp, string, string][] = [[/\bUbuntu\b/i, 'ubuntu', 'Ubuntu'], [/\bDebian\b/i, 'debian', 'Debian'], [/\bRouterOS\b|\bMikroTik\b/i, 'routeros', 'RouterOS'], [/\bMicrosoft Windows\b/i, 'windows', 'Windows'], [/\bFreeBSD\b/i, 'freebsd', 'FreeBSD'], [/\bOpenBSD\b/i, 'openbsd', 'OpenBSD'], [/\bmacOS\b|\bDarwin\b/i, 'macos', 'macOS']];
  const match = known.find(([pattern]) => pattern.test(text));
  return match ? { ...os(match[1], match[2]), source: 'banner' } : null;
}

/** Plain commands work in POSIX/fish shells. No shell changes, history writes or exit. */
export async function detectRemoteOs(exec: (command: string) => Promise<ExecResult>, banner = ''): Promise<Os | null> {
  const run = async (command: string) => { try { const r = await exec(command); return r.code === 0 ? clean(r.stdout) : ''; } catch { return ''; } };
  const kernel = await run('uname -s');
  if (/^Linux$/m.test(kernel)) {
    const release = parseOsRelease(await run('cat /etc/os-release')) || parseOsRelease(await run('cat /usr/lib/os-release'));
    return release || os('linux', 'Linux');
  }
  if (/^Darwin$/m.test(kernel)) return os('macos', 'macOS', (await run('sw_vers -productVersion')).split(/\r?\n/)[0]);
  for (const name of ['FreeBSD', 'OpenBSD', 'NetBSD', 'DragonFly', 'SunOS']) if (new RegExp(`^${name}$`, 'm').test(kernel)) return os(name.toLowerCase(), name);
  if (/^(?:MINGW|MSYS|CYGWIN)/m.test(kernel)) return os('windows', 'Windows');
  const windows = await run('cmd /c ver');
  if (/\b(?:Microsoft )?Windows\b/i.test(windows)) return os('windows', 'Windows', /\d+\.\d+\.\d+(?:\.\d+)?/.exec(windows)?.[0]);
  const platform = await run(':put [/system resource get platform]');
  if (/^(?:MikroTik|RouterBOARD|CHR|x86|arm|arm64|mipsbe|mmips|tile)$/im.test(platform)) return os('routeros', 'RouterOS');
  return parseOsBanner(banner);
}
