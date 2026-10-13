import type { VaultItem } from '@hopdock/sync';
import type { VaultFile } from './store';
import { decryptPassword, encryptPassword, decryptSecret, encryptSecret } from './password-sync';
import type { SyncedHost, EncryptedPassword } from './password-sync';
import type { KeyRef, Snippet } from '@hopdock/core';
import { isDeepStrictEqual } from 'node:util';

function timestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid synced timestamp.');
  return date.toISOString();
}

export type SyncedKey = Omit<KeyRef, 'privateRef'> & { encryptedKey?: EncryptedPassword };
export type SyncedSnippet = { id: string; vaultId: string; encryptedSnippet: EncryptedPassword };
export interface KeyFiles {
  read(id: string): string | null;
  write(id: string, value: string): void;
  delete(id: string): void;
  path(id: string): string;
}

interface SyncTransport {
  pull(since: string): Promise<VaultItem[]>;
  push(items: VaultItem[]): Promise<number>;
}
interface Secrets {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}

/** Stage and authenticate remote vault contents before any local writes or uploads. */
export async function syncVault(source: VaultFile, transport: SyncTransport, secrets: Secrets, passphrase: string, files?: KeyFiles, beforeCommit: () => boolean = () => true) {
  if (!passphrase) throw new Error('Set a sync encryption password in Settings first.');
  const v: VaultFile = structuredClone(source);
  const migrating = v.passwordSyncVersion !== 1;
  const contentMigrating = v.contentSyncVersion !== 1;
  // Client edit times are not a safe download cursor across devices. Read the
  // complete bounded snapshot, but only apply/upload versions that changed.
  const since = new Date(0).toISOString();
  const versions = v.syncedVersions ??= {};
  let received = 0;
  const dirty = (kind: string, id: string, updatedAt: string) => versions[`${kind}:${id}`] !== timestamp(updatedAt);
  const startedAt = new Date().toISOString();
  const pulled = await transport.pull(since);
  const staged = new Map<string, string | null>();
  const remotePasswords = new Set<string>();
  const stagedFiles = new Map<string, string | null>();
  const remoteKeys = new Set<string>();
  const remoteSnippets = new Set<string>();
  const deletedIds = new Set(v.deletedHosts?.map((h) => h.id));
  for (const item of pulled) {
    item.updated_at = timestamp(item.updated_at);
    if (item.kind === 'host') {
      const { encryptedPassword, ...host } = item.data as SyncedHost;
      if (host.id !== item.id || host.vaultId !== item.vault_id) throw new Error('Invalid synced host identity.');
      const password = encryptedPassword ? await decryptPassword(host, encryptedPassword, passphrase) : encryptedPassword;
      const i = v.hosts.findIndex((h) => h.id === host.id);
      const local = v.hosts[i];
      const deleted = v.deletedHosts?.find((h) => h.id === host.id);
      if (deleted && timestamp(deleted.updatedAt) >= item.updated_at) continue;
      if (local && timestamp(local.updatedAt) > item.updated_at) {
        // A metadata edit on a device without the password must not erase the remote secret.
        if ((local.auth.type === 'password' || local.auth.type === 'key-password') && password != null && secrets.get(`pw:${host.id}`) === null) {
          staged.set(`pw:${host.id}`, password);
          remotePasswords.add(host.id);
          received++;
        }
        continue;
      }
      if (item.deleted_at) {
        if (local || secrets.get(`pw:${host.id}`) !== null) received++;
        versions[`host:${host.id}`] = item.updated_at;
        v.hosts = v.hosts.filter((h) => h.id !== host.id);
        staged.set(`pw:${host.id}`, null);
        deletedIds.add(host.id);
        continue;
      }
      deletedIds.delete(host.id);
      host.updatedAt = item.updated_at;
      versions[`host:${host.id}`] = item.updated_at;
      if (password !== undefined) remotePasswords.add(host.id);
      if (local && isDeepStrictEqual({ ...local, updatedAt: timestamp(local.updatedAt) }, host)
          && (password === undefined || secrets.get(`pw:${host.id}`) === password)) continue;
      received++;
      if (i >= 0) v.hosts[i] = host;
      else v.hosts.push(host);
      if (password !== undefined) {
        staged.set(`pw:${host.id}`, password);
        remotePasswords.add(host.id);
      }
    } else if (item.kind === 'key') {
      const { encryptedKey, ...data } = item.data as SyncedKey;
      if (data.id !== item.id || data.vaultId !== item.vault_id || !/^[\w-]{1,128}$/.test(data.id)) throw new Error('Invalid synced key identity.');
      let material: { privateKey: string; passphrase: string } | undefined;
      if (encryptedKey) {
        material = JSON.parse(await decryptSecret(data, encryptedKey, passphrase, 'hopdock-key-v1'));
        if (!material || typeof material.privateKey !== 'string' || typeof material.passphrase !== 'string') throw new Error('Invalid synced key material.');
      }
      const i = v.keys.findIndex((k) => k.id === data.id);
      const local = v.keys[i];
      const deleted = v.deletedKeys?.find((k) => k.id === data.id);
      if (deleted && timestamp(deleted.updatedAt) >= item.updated_at) continue;
      if (local && timestamp(local.updatedAt) > item.updated_at) {
        if (material && files?.read(data.id) === null) {
          stagedFiles.set(data.id, material.privateKey);
          staged.set(`pp:${data.id}`, material.passphrase || null);
          remoteKeys.add(data.id);
          received++;
        }
        if (material?.passphrase && secrets.get(`pp:${data.id}`) === null) staged.set(`pp:${data.id}`, material.passphrase);
        continue;
      }
      v.deletedKeys = v.deletedKeys?.filter((k) => k.id !== data.id);
      if (item.deleted_at) {
        if (local || files?.read(data.id) != null) received++;
        versions[`key:${data.id}`] = item.updated_at;
        v.keys = v.keys.filter((k) => k.id !== data.id);
        stagedFiles.set(data.id, null);
        staged.set(`pp:${data.id}`, null);
        continue;
      }
      if (!files) throw new Error('Key storage is unavailable.');
      const key: KeyRef = { ...data, privateRef: files.path(data.id), updatedAt: item.updated_at };
      versions[`key:${key.id}`] = item.updated_at;
      if (material) remoteKeys.add(key.id);
      if (local && isDeepStrictEqual({ ...local, updatedAt: timestamp(local.updatedAt) }, key)
          && (!material || (files.read(key.id) === material.privateKey && secrets.get(`pp:${key.id}`) === (material.passphrase || null)))) continue;
      received++;
      if (i < 0) v.keys.push(key);
      else v.keys[i] = key;
      if (material) {
        stagedFiles.set(key.id, material.privateKey);
        staged.set(`pp:${key.id}`, material.passphrase || null);
        remoteKeys.add(key.id);
      }
    } else if (item.kind === 'snippet') {
      const data = item.data as SyncedSnippet | Snippet;
      if (data.id !== item.id || data.vaultId !== item.vault_id) throw new Error('Invalid synced snippet identity.');
      const snippet: Snippet = 'encryptedSnippet' in data
        ? JSON.parse(await decryptSecret(data, data.encryptedSnippet, passphrase, 'hopdock-snippet-v1')) : data;
      if (snippet.id !== item.id || snippet.vaultId !== item.vault_id) throw new Error('Invalid synced snippet identity.');
      const i = v.snippets.findIndex((s) => s.id === snippet.id);
      const deleted = v.deletedSnippets?.find((s) => s.id === snippet.id);
      if (deleted && timestamp(deleted.updatedAt) >= item.updated_at) continue;
      if (i >= 0 && timestamp(v.snippets[i]!.updatedAt) > item.updated_at) continue;
      v.deletedSnippets = v.deletedSnippets?.filter((s) => s.id !== snippet.id);
      versions[`snippet:${snippet.id}`] = item.updated_at;
      if (item.deleted_at) { if (i >= 0) received++; v.snippets = v.snippets.filter((s) => s.id !== snippet.id); continue; }
      snippet.updatedAt = item.updated_at;
      if ('encryptedSnippet' in data) remoteSnippets.add(snippet.id);
      if (i >= 0 && isDeepStrictEqual({ ...v.snippets[i], updatedAt: timestamp(v.snippets[i]!.updatedAt) }, snippet)) continue;
      received++;
      if (i < 0) v.snippets.push(snippet);
      else v.snippets[i] = snippet;
    } else if (item.kind === 'group' && !item.deleted_at) {
      const group = item.data as VaultFile['groups'][number];
      if (group.id !== item.id || group.vaultId !== item.vault_id) throw new Error('Invalid synced group identity.');
      const i = v.groups.findIndex((g) => g.id === group.id);
      if (i >= 0 && timestamp(v.groups[i]?.updatedAt ?? since) > item.updated_at) continue;
      group.updatedAt = item.updated_at;
      versions[`group:${group.id}`] = item.updated_at;
      if (i >= 0 && isDeepStrictEqual({ ...v.groups[i], updatedAt: timestamp(v.groups[i]?.updatedAt ?? since) }, group)) continue;
      received++;
      if (i < 0) v.groups.push(group);
      else v.groups[i] = group;
    }
  }
  const items: VaultItem[] = [];
  for (const host of v.hosts) {
    const key = `pw:${host.id}`;
    const password = staged.has(key) ? staged.get(key) : secrets.get(key);
    // Existing installations must upload saved passwords even after a previous metadata-only sync.
    if (migrating && (host.auth.type === 'password' || host.auth.type === 'key-password') && password != null && !remotePasswords.has(host.id)) {
      host.updatedAt = host.updatedAt > startedAt ? host.updatedAt : startedAt;
    }
    if (!dirty('host', host.id, host.updatedAt)) continue;
    const encryptedPassword = (host.auth.type === 'password' || host.auth.type === 'key-password') && password != null
      ? await encryptPassword(host, password, passphrase)
      : (host.auth.type !== 'password' && host.auth.type !== 'key-password') ? null : undefined;
    items.push({ id: host.id, vault_id: host.vaultId, kind: 'host', data: { ...host, encryptedPassword }, updated_at: host.updatedAt });
  }
  for (const host of v.deletedHosts ?? []) {
    if (deletedIds.has(host.id)) items.push({ id: host.id, vault_id: host.vaultId, kind: 'host', data: host,
      updated_at: host.updatedAt, deleted_at: host.updatedAt });
  }
  for (const group of v.groups) {
    group.updatedAt ??= startedAt;
    if (dirty('group', group.id, group.updatedAt)) items.push({ id: group.id, vault_id: group.vaultId, kind: 'group', data: group, updated_at: group.updatedAt });
  }
  for (const key of v.keys) {
    const privateKey = stagedFiles.has(key.id) ? stagedFiles.get(key.id) : files?.read(key.id);
    if (contentMigrating && privateKey != null && !remoteKeys.has(key.id)) key.updatedAt = key.updatedAt > startedAt ? key.updatedAt : startedAt;
    if (!dirty('key', key.id, key.updatedAt)) continue;
    const { privateRef, ...data } = key;
    const pp = staged.has(`pp:${key.id}`) ? staged.get(`pp:${key.id}`) : secrets.get(`pp:${key.id}`);
    const encryptedKey = privateKey != null ? await encryptSecret(key, JSON.stringify({ privateKey, passphrase: pp ?? '' }), passphrase, 'hopdock-key-v1') : undefined;
    items.push({ id: key.id, vault_id: key.vaultId, kind: 'key', data: { ...data, encryptedKey }, updated_at: key.updatedAt });
  }
  for (const snippet of v.snippets) {
    if (contentMigrating && !remoteSnippets.has(snippet.id)) snippet.updatedAt = snippet.updatedAt > startedAt ? snippet.updatedAt : startedAt;
    if (!dirty('snippet', snippet.id, snippet.updatedAt)) continue;
    const encryptedSnippet = await encryptSecret(snippet, JSON.stringify(snippet), passphrase, 'hopdock-snippet-v1');
    items.push({ id: snippet.id, vault_id: snippet.vaultId, kind: 'snippet', data: { id: snippet.id, vaultId: snippet.vaultId, encryptedSnippet }, updated_at: snippet.updatedAt });
  }
  for (const [kind, deleted] of [['key', v.deletedKeys], ['snippet', v.deletedSnippets]] as const) {
    for (const data of deleted ?? []) items.push({ id: data.id, vault_id: data.vaultId, kind, data, updated_at: data.updatedAt, deleted_at: data.updatedAt });
  }
  const pushed = await transport.push(items);
  if (!beforeCommit()) return { vault: source, pushed, pulled: 0, superseded: true };
  for (const item of items) versions[`${item.kind}:${item.id}`] = timestamp(item.updated_at);
  for (const [id, value] of stagedFiles) {
    if (!files) throw new Error('Key storage is unavailable.');
    if (value === null) files.delete(id);
    else files.write(id, value);
  }
  for (const [key, value] of staged) {
    if (value === null) secrets.delete(key);
    else secrets.set(key, value);
  }
  v.passwordSyncVersion = 1;
  v.contentSyncVersion = 1;
  v.deletedHosts = [];
  v.deletedKeys = [];
  v.deletedSnippets = [];
  v.lastSyncAt = new Date().toISOString();
  return { vault: v, pushed, pulled: received, superseded: false };
}
