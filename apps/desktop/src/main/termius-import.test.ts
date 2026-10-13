import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { planTermiusImport } from './termius-import';
import type { VaultFile } from './store';

const empty = (): VaultFile => ({ hosts: [], groups: [], keys: [], snippets: [], lastSyncAt: new Date(0).toISOString() });
const bundle = (parts: object = {}) => JSON.stringify({ format: 'termorator-termius-migration', version: 1, hosts: [], keys: [], snippets: [], ...parts });
test('imports nested paths, Unicode credentials, usable encrypted keys, variables and combined auth without plaintext in vault', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'key-pass' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const plan = planTermiusImport(bundle({ keys: [{ id: 'key-1', label: 'Home', private_key: privateKey, passphrase: 'key-pass' }], hosts: [{ id: 'host-1', label: 'Дом', address: '127.0.0.1', username: 'root', password: 'пароль', key_id: 'key-1', group_path: ['Prod', 'EU'] }], snippets: [{ id: 's-1', label: 'Hello', command: 'echo ${name}', package_path: ['Admin', 'Tools'] }] }), empty());
  assert.equal(plan.vault.hosts[0]?.auth.type, 'key-password');
  assert.equal(plan.vault.groups[0]?.name, 'Prod / EU');
  assert.equal(plan.vault.snippets[0]?.folder, 'Admin / Tools');
  assert.deepEqual(plan.vault.snippets[0]?.vars, ['name']);
  assert.equal(plan.secretWrites.get(`pw:${plan.vault.hosts[0]!.id}`), 'пароль');
  assert.equal(plan.keyWrites.size, 1);
  assert.ok(!JSON.stringify(plan.vault).includes('пароль'));
  assert.ok(!JSON.stringify(plan.vault).includes('PRIVATE KEY'));
});
test('reimport skips existing records and never overwrites edits or credentials', () => {
  const json = bundle({ hosts: [{ id: 'h1', address: 'example.invalid', username: 'root', password: 'one', group_path: ['Servers'] }], snippets: [{ id: 's1', command: 'echo hi' }] });
  const first = planTermiusImport(json, empty()); first.vault.hosts[0]!.name = 'Edited';
  const again = planTermiusImport(json, first.vault);
  assert.equal(again.result.hosts, 0); assert.equal(again.result.snippets, 0);
  assert.equal(again.vault.hosts[0]?.name, 'Edited'); assert.equal(again.secretWrites.size, 0);
});
test('invalid containers and malformed late rows leave the input vault unchanged', () => {
  const source = empty(), before = structuredClone(source);
  for (const input of ['{bad', 'null', bundle({ hosts: 'wrong' }), bundle({ keys: [null] }), bundle({ version: 9 }), bundle({ hosts: [{ address: 'good.invalid', password: 'secret' }, { address: 'next.invalid', group_path: [123] }] })]) assert.throws(() => planTermiusImport(input, source), /Invalid Termius/);
  assert.deepEqual(source, before);
});
test('missing keys/credentials, invalid ports and unsupported configurations produce safe notes', () => {
  const plan = planTermiusImport(bundle({ keys: [{ id: 'missing', private_key: '' }, { id: 'bad', private_key: 'secret-malformed-material' }], hosts: [{ id: 'h', address: 'example.invalid', port: -1, key_id: 'bad', proxy: {}, agent_forward: true, forwards: [{}] }, { address: '' }], snippets: [{ command: '' }] }), empty());
  assert.equal(plan.vault.hosts[0]?.port, 22); assert.equal(plan.vault.hosts[0]?.auth.type, 'agent');
  assert.ok(plan.result.warnings.length >= 5); assert.ok(!plan.result.warnings.join('').includes('secret-malformed-material'));
});
