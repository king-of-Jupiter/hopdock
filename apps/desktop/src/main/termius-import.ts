import { createHash, createPrivateKey } from 'node:crypto';
import type { Host, KeyRef, Snippet } from '@hopdock/core';
import { fingerprint, publicKeyFromPrivate } from '@hopdock/ssh';
import type { VaultFile } from './store';
import type { TermiusImportResult } from '@hopdock/ui';

const invalid = () => new Error('Invalid Termius migration bundle.');
const text = (row: Record<string, unknown>, key: string) => {
  const value = row[key];
  if (value == null) return '';
  if (typeof value !== 'string') throw invalid();
  return value;
};
const path = (row: Record<string, unknown>, key: string) => {
  const value = row[key] ?? [];
  if (!Array.isArray(value) || value.some((part) => typeof part !== 'string')) throw invalid();
  return (value as string[]).map((part) => part.trim()).filter(Boolean).join(' / ');
};
const identity = (kind: string, source: string) => `${kind}-termius-${createHash('sha256').update(source).digest('hex').slice(0, 32)}`;

/** Plan completely in memory before touching files, passwords or the saved vault. */
export function planTermiusImport(json: string, source: VaultFile, secretExists: (key: string) => boolean = () => false) {
  if (Buffer.byteLength(json, 'utf8') > 64 * 1024 * 1024) throw new Error('Termius migration file is too large.');
  let bundle: Record<string, unknown>;
  try { bundle = JSON.parse(json.replace(/^\uFEFF/, '')); } catch { throw invalid(); }
  if (!bundle || typeof bundle !== 'object' || bundle.format !== 'termorator-termius-migration' || bundle.version !== 1) throw invalid();
  const rows = (key: string): Record<string, unknown>[] => {
    const value = bundle[key] ?? [];
    if (!Array.isArray(value) || value.length > 10000 || value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) throw invalid();
    return value;
  };
  const keys = rows('keys'), hosts = rows('hosts'), snippets = rows('snippets');
  const vault = structuredClone(source);
  const now = new Date().toISOString();
  const result: TermiusImportResult = { hosts: 0, groups: 0, keys: 0, snippets: 0, skipped: 0, warnings: [] };
  const secretWrites = new Map<string, string>();
  const keyWrites = new Map<string, string>();
  const keyIds = new Map<string, string>();
  const warn = (message: string) => { if (result.warnings.length < 100) result.warnings.push(message); };
  for (const row of keys) {
    const sourceId = text(row, 'id');
    let material = text(row, 'private_key');
    const passphrase = text(row, 'passphrase');
    if (!material.trim()) { result.skipped++; warn('A key has no private material and was skipped.'); continue; }
    let parsed: ReturnType<typeof publicKeyFromPrivate>;
    try {
      try { parsed = publicKeyFromPrivate(material, passphrase); }
      catch {
        const privateKey = createPrivateKey({ key: material, passphrase });
        const type = privateKey.asymmetricKeyType === 'rsa' ? 'pkcs1' : privateKey.asymmetricKeyType === 'ec' ? 'sec1' : null;
        if (!type) throw invalid();
        material = privateKey.export({ type, format: 'pem', ...(passphrase ? { cipher: 'aes-256-cbc', passphrase } : {}) }).toString();
        parsed = publicKeyFromPrivate(material, passphrase);
      }
    }
    catch { result.skipped++; warn('A private key could not be decoded or unlocked and was skipped.'); continue; }
    const fp = fingerprint(parsed.publicKey);
    const id = identity('k', sourceId || fp);
    const existing = vault.keys.find((key) => key.id === id || key.fingerprint === fp);
    if (existing) { keyIds.set(sourceId, existing.id); result.skipped++; continue; }
    const key: KeyRef = { id, vaultId: 'v-personal', name: text(row, 'label').trim() || 'Imported key', kind: parsed.kind, publicKey: parsed.publicKey, fingerprint: fp, privateRef: '', updatedAt: now };
    vault.keys.push(key); keyIds.set(sourceId, id); keyWrites.set(id, material);
    vault.deletedKeys = vault.deletedKeys?.filter((key) => key.id !== id);
    if (passphrase) secretWrites.set(`pp:${id}`, passphrase);
    result.keys++;
  }
  for (const row of hosts) {
    const address = text(row, 'address').trim();
    if (!address || !/^[A-Za-z0-9._:-]+$/.test(address)) { result.skipped++; warn('A host has an empty or invalid address and was skipped.'); continue; }
    const username = text(row, 'username').trim();
    const name = text(row, 'label').trim() || address;
    const id = identity('h', text(row, 'id') || JSON.stringify([name, address, username, row.port]));
    const existing = vault.hosts.find((host) => host.id === id);
    if (existing) {
      const password = text(row, 'password');
      const sourceKey = text(row, 'key_id');
      const keyId = sourceKey ? keyIds.get(sourceKey) : undefined;
      // Repair only the recognizable incomplete import. Preserve user edits and secrets.
      if (existing.remark === 'Imported from Termius' && existing.host === address && existing.port === (row.port ?? 22)
          && !existing.username && existing.auth.type === 'agent' && !secretExists(`pw:${id}`) && username && (password || keyId)) {
        existing.username = username;
        existing.auth = { type: keyId ? (password ? 'key-password' : 'key') : 'password', ...(keyId ? { keyId } : {}) };
        existing.updatedAt = now;
        if (password) secretWrites.set(`pw:${id}`, password);
        result.repaired = (result.repaired ?? 0) + 1;
      } else result.skipped++;
      continue;
    }
    let port = row.port ?? 22;
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) { port = 22; warn('An invalid SSH port was replaced with 22.'); }
    const groupName = path(row, 'group_path');
    let groupId: string | null = null;
    if (groupName) {
      let group = vault.groups.find((g) => g.vaultId === 'v-personal' && g.name === groupName);
      if (!group) { group = { id: identity('g', groupName), vaultId: 'v-personal', name: groupName, sort: vault.groups.length, updatedAt: now }; vault.groups.push(group); result.groups++; }
      groupId = group.id;
    }
    const password = text(row, 'password');
    const sourceKey = text(row, 'key_id');
    const keyId = sourceKey ? keyIds.get(sourceKey) : undefined;
    if (sourceKey && !keyId) warn('A host references a key that could not be imported.');
    if (!password && !keyId) warn('A host has no imported password or key. Add credentials before connecting; SSH agent is used meanwhile.');
    if (!username) warn('A host has no username. Set it before connecting.');
    if (row.proxy) warn('A proxy configuration was not imported; Hopdock does not support it yet.');
    if (row.agent_forward) warn('SSH agent forwarding was not imported.');
    if (Array.isArray(row.forwards) && row.forwards.length) warn('Port forwarding rules were not imported.');
    const host: Host = { id, vaultId: 'v-personal', groupId, name, host: address, port: port as number, username,
      auth: { type: keyId ? (password ? 'key-password' : 'key') : password ? 'password' : 'agent', ...(keyId ? { keyId } : {}) },
      portForwards: [], tags: [], remark: 'Imported from Termius', sort: vault.hosts.length, starred: false, updatedAt: now };
    vault.hosts.push(host);
    vault.deletedHosts = vault.deletedHosts?.filter((host) => host.id !== id);
    if (password) secretWrites.set(`pw:${id}`, password);
    result.hosts++;
  }
  for (const row of snippets) {
    const script = text(row, 'command');
    if (!script.trim()) { result.skipped++; warn('An empty snippet was skipped.'); continue; }
    const name = text(row, 'label').trim() || 'Imported snippet';
    const folder = path(row, 'package_path') || 'general';
    const id = identity('s', text(row, 'id') || JSON.stringify([name, folder, script]));
    if (vault.snippets.some((snippet) => snippet.id === id)) { result.skipped++; continue; }
    const snippet: Snippet = { id, vaultId: 'v-personal', name, folder, script, vars: [...new Set([...script.matchAll(/\$\{(\w+)\}/g)].map((match) => match[1]!))], updatedAt: now };
    vault.snippets.push(snippet); result.snippets++;
    vault.deletedSnippets = vault.deletedSnippets?.filter((snippet) => snippet.id !== id);
  }
  return { vault, secretWrites, keyWrites, result };
}
