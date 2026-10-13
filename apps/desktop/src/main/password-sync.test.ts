import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Host } from '@hopdock/core';
import type { VaultItem } from '@hopdock/sync';
import type { VaultFile } from './store';
import { decryptPassword, encryptPassword } from './password-sync';
import type { SyncedHost } from './password-sync';
import { syncVault } from './sync-vault';
import type { SyncedKey, SyncedSnippet } from './sync-vault';
import { keyFileStorage } from './key-files';
import { mkdtempSync, rmSync, rmdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import type { KeyRef, Snippet } from '@hopdock/core';

const passphrase = 'test-only encryption passphrase';
const host: Host = { id: 'h-test', vaultId: 'v-test', groupId: null, name: 'Test', host: 'example.invalid',
  port: 22, username: 'root', auth: { type: 'password' }, portForwards: [], tags: [], remark: '', sort: 0,
  starred: false, updatedAt: '2026-01-01T00:00:00.000Z' };
function vault(hosts: Host[] = []): VaultFile {
  return { hosts: structuredClone(hosts), groups: [], keys: [], snippets: [], lastSyncAt: '2026-01-02T00:00:00.000Z' };
}
function secrets(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { values, get: (key: string) => values.get(key) ?? null,
    set: (key: string, value: string) => { values.set(key, value); }, delete: (key: string) => { values.delete(key); } };
}
function server() {
  const rows = new Map<string, VaultItem>();
  let pushes = 0;
  return { rows, get pushes() { return pushes; },
    pull: async (since: string) => structuredClone([...rows.values()].filter((r) => r.updated_at > since)),
    push: async (items: VaultItem[]) => { pushes++; for (const item of items) rows.set(item.id, structuredClone(item)); return items.length; } };
}

test('groups created after initial sync upload and restore on another device', async () => {
  const remote = server();
  const initial = await syncVault(vault(), remote, secrets(), passphrase);
  initial.vault.groups.push({ id: 'g-new', vaultId: 'v-test', name: 'New group', sort: 0, updatedAt: new Date(Date.now() + 10).toISOString() });
  await syncVault(initial.vault, remote, secrets(), passphrase);
  assert.equal(remote.rows.get('g-new')?.kind, 'group');
  const other = await syncVault(vault(), remote, secrets(), passphrase);
  assert.equal(other.vault.groups[0]?.name, 'New group');
});

test('authenticated encryption handles Unicode, randomizes ciphertext and rejects tampering/other hosts', async () => {
  const encrypted = await encryptPassword(host, 'пароль 🔑', passphrase);
  assert.equal(await decryptPassword(host, encrypted, passphrase), 'пароль 🔑');
  assert.notEqual(encrypted.ciphertext, (await encryptPassword(host, 'пароль 🔑', passphrase)).ciphertext);
  await assert.rejects(decryptPassword(host, encrypted, 'wrong password'), /Cannot decrypt/);
  await assert.rejects(decryptPassword({ ...host, id: 'h-other' }, encrypted, passphrase), /Cannot decrypt/);
  await assert.rejects(decryptPassword(host, { ...encrypted, tag: Buffer.alloc(16).toString('base64') }, passphrase), /Cannot decrypt/);
});

test('combined key/password hosts sync their account password without plaintext', async () => {
  const combined: Host = { ...host, auth: { type: 'key-password', keyId: 'k-test' } };
  const remote = server(); const source = secrets({ 'pw:h-test': 'combined-account-password' });
  await syncVault(vault([combined]), remote, source, passphrase);
  assert.ok(!JSON.stringify([...remote.rows.values()]).includes('combined-account-password'));
  const restored = secrets(); const result = await syncVault(vault(), remote, restored, passphrase);
  assert.equal(restored.get('pw:h-test'), 'combined-account-password');
  assert.equal(result.vault.hosts[0]?.auth.type, 'key-password');
});

test('migrates existing passwords and restores them on a second device without plaintext in vault/network', async () => {
  const remote = server();
  const local = secrets({ 'pw:h-test': 'existing-password' });
  const first = await syncVault(vault([host]), remote, local, passphrase);
  assert.equal(first.pushed, 1);
  assert.ok((remote.rows.get(host.id)!.data as SyncedHost).encryptedPassword);
  assert.ok(!JSON.stringify([...remote.rows.values()]).includes('existing-password'));
  const otherSecrets = secrets();
  const second = await syncVault(vault(), remote, otherSecrets, passphrase);
  assert.equal(otherSecrets.get('pw:h-test'), 'existing-password');
  assert.equal(second.vault.hosts.length, 1);
  assert.ok(!JSON.stringify(second.vault).includes('encryptedPassword'));
  assert.ok(!JSON.stringify(second.vault).includes('existing-password'));
  const changed = structuredClone(first.vault);
  changed.hosts[0]!.updatedAt = '2099-01-01T00:00:00.000Z';
  local.set('pw:h-test', 'new-password');
  await syncVault(changed, remote, local, passphrase);
  await syncVault(second.vault, remote, otherSecrets, passphrase);
  assert.equal(otherSecrets.get('pw:h-test'), 'new-password');
});

test('wrong or missing encryption password and failed uploads do not mutate local state', async () => {
  const remote = server();
  await syncVault(vault([host]), remote, secrets({ 'pw:h-test': 'remote-password' }), passphrase);
  const source = vault([host]);
  const before = structuredClone(source);
  const local = secrets({ 'pw:h-test': 'keep-local' });
  const pushes = remote.pushes;
  await assert.rejects(syncVault(source, remote, local, 'wrong password'), /Cannot decrypt/);
  await assert.rejects(syncVault(source, remote, local, ''), /Settings/);
  assert.equal(remote.pushes, pushes);
  await assert.rejects(syncVault(source, { pull: remote.pull, push: async () => { throw new Error('offline'); } }, local, passphrase), /offline/);
  assert.deepEqual(source, before);
  assert.equal(local.get('pw:h-test'), 'keep-local');
});

test('legacy metadata keeps local passwords; newer metadata on a passwordless device preserves remote passwords', async () => {
  const remote = server();
  remote.rows.set(host.id, { id: host.id, vault_id: host.vaultId, kind: 'host', data: host, updated_at: host.updatedAt });
  const migrated = await syncVault(vault([host]), remote, secrets({ 'pw:h-test': 'keep-password' }), passphrase);
  const edited = structuredClone(migrated.vault);
  edited.hosts[0]!.updatedAt = '2099-01-01T00:00:00.000Z';
  edited.hosts[0]!.name = 'Renamed';
  const local = secrets();
  edited.lastSyncAt = new Date(0).toISOString();
  await syncVault(edited, remote, local, passphrase);
  assert.equal(local.get('pw:h-test'), 'keep-password');
  assert.equal(await decryptPassword(host, (remote.rows.get(host.id)!.data as SyncedHost).encryptedPassword!, passphrase), 'keep-password');
});

test('host deletion removes the encrypted remote password and the other device local password', async () => {
  const remote = server();
  await syncVault(vault([host]), remote, secrets({ 'pw:h-test': 'password' }), passphrase);
  const otherSecrets = secrets();
  const other = await syncVault(vault(), remote, otherSecrets, passphrase);
  const deleted = vault();
  deleted.passwordSyncVersion = 1;
  deleted.deletedHosts = [{ ...host, updatedAt: '2099-01-01T00:00:00.000Z' }];
  await syncVault(deleted, remote, secrets(), passphrase);
  assert.equal((remote.rows.get(host.id)!.data as SyncedHost).encryptedPassword, undefined);
  const received = await syncVault(other.vault, remote, otherSecrets, passphrase);
  assert.equal(received.vault.hosts.length, 0);
  assert.equal(otherSecrets.get('pw:h-test'), null);
});

const snippet: Snippet = { id: 's-test', vaultId: 'v-test', name: 'Deploy', folder: 'prod',
  script: 'echo ${version}\necho secret-token', vars: ['version'], updatedAt: host.updatedAt };
const key: KeyRef = { id: 'k-test', vaultId: 'v-test', name: 'Deploy key', kind: 'RSA', fingerprint: 'test',
  publicKey: 'test-public-key', privateRef: '/original/device/path', updatedAt: host.updatedAt };

test('Keychain and Snippets migrate, restore usable encrypted private keys, passphrases and scripts on another device', async () => {
  const dirs = [mkdtempSync(join(tmpdir(), 'hopdock-sync-test-')), mkdtempSync(join(tmpdir(), 'hopdock-sync-test-'))];
  const [firstFiles, secondFiles] = dirs.map(keyFileStorage);
  try {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'key-passphrase' }).toString();
    firstFiles!.write(key.id, privateKey);
    const remote = server();
    const source = vault();
    source.passwordSyncVersion = 1; // Existing password-sync installation must still migrate these older entries.
    source.keys = [key];
    source.snippets = [snippet];
    const first = await syncVault(source, remote, secrets({ 'pp:k-test': 'key-passphrase' }), passphrase, firstFiles);
    const wire = JSON.stringify([...remote.rows.values()]);
    assert.ok(!wire.includes('PRIVATE KEY') && !wire.includes('key-passphrase') && !wire.includes('secret-token'));
    assert.ok(!wire.includes('/original/device/path'));
    assert.ok((remote.rows.get(key.id)!.data as SyncedKey).encryptedKey);
    assert.ok((remote.rows.get(snippet.id)!.data as SyncedSnippet).encryptedSnippet);
    const secondSecrets = secrets();
    const second = await syncVault(vault(), remote, secondSecrets, passphrase, secondFiles);
    assert.equal(secondSecrets.get('pp:k-test'), 'key-passphrase');
    assert.equal(second.vault.keys[0]!.privateRef, secondFiles!.path(key.id));
    assert.equal(readFileSync(second.vault.keys[0]!.privateRef, 'utf8'), privateKey);
    const restored = createPrivateKey({ key: secondFiles!.read(key.id)!, passphrase: secondSecrets.get('pp:k-test')! });
    const message = Buffer.from('Verify restored key is usable');
    assert.ok(verify('sha256', message, createPublicKey(pair.privateKey), sign('sha256', message, restored)));
    assert.equal(second.vault.snippets[0]!.script, snippet.script);
    assert.deepEqual(second.vault.snippets[0]!.vars, ['version']);
    assert.equal(second.vault.snippets[0]!.folder, 'prod');
    const edit = structuredClone(first.vault);
    edit.snippets[0]!.script = 'echo updated';
    edit.snippets[0]!.updatedAt = '2099-01-01T00:00:00.000Z';
    await syncVault(edit, remote, secrets({ 'pp:k-test': 'key-passphrase' }), passphrase, firstFiles);
    const updated = await syncVault(second.vault, remote, secondSecrets, passphrase, secondFiles);
    assert.equal(updated.vault.snippets[0]!.script, 'echo updated');
    const deletion = structuredClone(edit);
    deletion.keys = [];
    deletion.snippets = [];
    deletion.deletedKeys = [{ id: key.id, vaultId: key.vaultId, updatedAt: '2099-01-02T00:00:00.000Z' }];
    deletion.deletedSnippets = [{ id: snippet.id, vaultId: snippet.vaultId, updatedAt: '2099-01-02T00:00:00.000Z' }];
    await syncVault(deletion, remote, secrets(), passphrase, firstFiles);
    const removed = await syncVault(updated.vault, remote, secondSecrets, passphrase, secondFiles);
    assert.equal(removed.vault.keys.length, 0);
    assert.equal(removed.vault.snippets.length, 0);
    assert.equal(secondFiles!.read(key.id), null);
    assert.equal(secondSecrets.get('pp:k-test'), null);
  } finally {
    // Remove only the explicit fixture file, then its empty temporary directory.
    for (const directory of dirs) { rmSync(join(directory, key.id), { force: true }); rmdirSync(directory); }
  }
});

test('key/snippet authentication failures and upload failures leave files, secrets and library untouched', async () => {
  const remote = server();
  const values = new Map<string, string>([[key.id, 'test private key']]);
  const files = { read: (id: string) => values.get(id) ?? null, write: (id: string, value: string) => { values.set(id, value); },
    delete: (id: string) => { values.delete(id); }, path: (id: string) => `/new-device/${id}` };
  const source = vault(); source.keys = [key]; source.snippets = [snippet];
  await syncVault(source, remote, secrets({ 'pp:k-test': 'test pp' }), passphrase, files);
  const other = vault();
  const empty = new Map<string, string>();
  const otherFiles = { ...files, read: (id: string) => empty.get(id) ?? null, write: (id: string, value: string) => { empty.set(id, value); } };
  const localSecrets = secrets();
  const before = structuredClone(other);
  const pushes = remote.pushes;
  await assert.rejects(syncVault(other, remote, localSecrets, 'wrong encryption password', otherFiles), /Cannot decrypt/);
  assert.equal(remote.pushes, pushes);
  await assert.rejects(syncVault(other, { pull: remote.pull, push: async () => { throw new Error('offline'); } }, localSecrets, passphrase, otherFiles), /offline/);
  assert.equal(empty.size, 0);
  assert.equal(localSecrets.values.size, 0);
  assert.deepEqual(other, before);
  assert.throws(() => keyFileStorage('C:/test').path('../escape'), /Invalid key id/);
});
