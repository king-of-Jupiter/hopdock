import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { mockGroups, mockHosts, mockKeys, mockSnippets } from '@hopdock/core';
import type { Host, HostGroup, KeyRef, Snippet } from '@hopdock/core';

export interface VaultFile {
  hosts: Host[];
  groups: HostGroup[];
  keys: KeyRef[];
  snippets: Snippet[];
  lastSyncAt: string;
}

const FILE = 'hopdock-vault.json';
const SECRETS_FILE = 'hopdock-secrets.json';

function userDir(): string {
  const dir = join(app.getPath('userData'), 'hopdock');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function keysDir(): string {
  const dir = join(userDir(), 'keys');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function seed(): VaultFile {
  return { hosts: mockHosts, groups: mockGroups, keys: mockKeys, snippets: mockSnippets, lastSyncAt: new Date(0).toISOString() };
}

export function loadVault(): VaultFile {
  const path = join(userDir(), FILE);
  if (!existsSync(path)) {
    const fresh = seed();
    writeFileSync(path, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<VaultFile>;
    return { ...seed(), ...parsed };
  } catch {
    return seed();
  }
}

export function saveVault(vault: VaultFile): void {
  writeFileSync(join(userDir(), FILE), JSON.stringify(vault, null, 2));
}

function secretsPath(): string {
  return join(userDir(), SECRETS_FILE);
}

function readSecrets(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(secretsPath(), 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

/** OS-keychain-backed secret storage (safeStorage). Values never leave the device. */
export function setSecret(key: string, value: string): void {
  const all = readSecrets();
  all[key] = safeStorage.encryptString(value).toString('base64');
  writeFileSync(secretsPath(), JSON.stringify(all));
}

export function getSecret(key: string): string | null {
  const raw = readSecrets()[key];
  if (!raw) return null;
  try {
    return safeStorage.decryptString(Buffer.from(raw, 'base64'));
  } catch {
    return null;
  }
}

export function deleteSecret(key: string): void {
  const all = readSecrets();
  delete all[key];
  writeFileSync(secretsPath(), JSON.stringify(all));
}
