import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { app } from 'electron';
import { homedir } from 'node:os';
import type { LocalFileListing } from '@hopdock/ui';

export function absoluteLocalPath(value: unknown): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) throw new Error('Choose an absolute local file path.');
  return resolve(value);
}
export function listLocalFiles(value: string): LocalFileListing {
  const path = absoluteLocalPath(value);
  if (!statSync(path).isDirectory()) throw new Error('Choose a folder to browse.');
  const entries = readdirSync(path).flatMap((name) => {
    try { const full = join(path, name); const info = statSync(full); return [{ name, path: full, directory: info.isDirectory(), size: info.size }]; }
    catch { return []; }
  }).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  return { path, separator: sep, parent: dirname(path) === path ? null : dirname(path), entries };
}
export function localPlaces() {
  const places = [{ name: 'Home', path: homedir() }, { name: 'Desktop', path: app.getPath('desktop') }, { name: 'Downloads', path: app.getPath('downloads') }, { name: 'Documents', path: app.getPath('documents') }, { name: 'SSH keys', path: join(homedir(), '.ssh') }];
  if (process.platform === 'win32') for (let letter = 65; letter <= 90; letter++) { const path = `${String.fromCharCode(letter)}:\\`; if (existsSync(path)) places.push({ name: `${String.fromCharCode(letter)}:`, path }); }
  return places.filter((place) => existsSync(place.path));
}
