import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'fs';
import { randomUUID } from 'node:crypto';
import { join } from 'path';
import type { Host, HostGroup, KeyRef, Snippet } from '@hopdock/core';

export interface VaultFile {
  hosts: Host[];
  groups: HostGroup[];
  keys: KeyRef[];
  snippets: Snippet[];
  lastSyncAt: string;
  passwordSyncVersion?: 1;
  contentSyncVersion?: 1;
  deletedHosts?: Host[];
  deletedKeys?: { id: string; vaultId: string; updatedAt: string }[];
  deletedSnippets?: { id: string; vaultId: string; updatedAt: string }[];
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

function emptyVault(): VaultFile {
  return { hosts: [], groups: [], keys: [], snippets: [], lastSyncAt: new Date(0).toISOString() };
}

export function loadVault(): VaultFile {
  const path = join(userDir(), FILE);
  if (!existsSync(path)) {
    const fresh = emptyVault();
    writeFileSync(path, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  const raw = readFileSync(path, 'utf8');
  try {
    const parsed = JSON.parse(raw) as Partial<VaultFile>;
    if (!parsed || typeof parsed !== 'object' || ['hosts', 'groups', 'keys', 'snippets'].some((field) => parsed[field as keyof VaultFile] !== undefined && !Array.isArray(parsed[field as keyof VaultFile]))) throw new SyntaxError('Invalid vault structure');
    return { ...emptyVault(), ...parsed };
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Stored vault data is corrupt.');
    throw error;
  }
}

export function saveVault(vault: VaultFile): void {
  const path = join(userDir(), FILE), temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, JSON.stringify(vault, null, 2), { mode: 0o600 }); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}

function secretsPath(): string {
  return join(userDir(), SECRETS_FILE);
}

function readSecrets(): Record<string, string> {
  try {
    const data = JSON.parse(readFileSync(secretsPath(), 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.values(data).some((value) => typeof value !== 'string')) throw new SyntaxError('Invalid secrets structure');
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    if (error instanceof SyntaxError) throw new Error('Stored secrets data is corrupt.');
    throw error;
  }
}
export function hasSecret(key: string): boolean { return Object.hasOwn(readSecrets(), key); }
function writeSecrets(data: Record<string, string>): void {
  const path = secretsPath(), temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 }); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}

/** OS-keychain-backed local storage. Sync encrypts passwords and key passphrases before upload. */
export function setSecret(key: string, value: string): void {
  const all = readSecrets();
  all[key] = safeStorage.encryptString(value).toString('base64');
  writeSecrets(all);
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
  writeSecrets(all);
}
