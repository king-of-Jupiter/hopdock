import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, unlinkSync, rmdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import ssh2 from 'ssh2';
import sshpk from 'sshpk';
import { toPuttyPrivateKey } from './putty-key';
import { prepareWinSCP } from './winscp';
import type { Host } from '@hopdock/core';

for (const type of ['rsa', 'ecdsa', 'ed25519'] as const) {
  test(`PPK ${type}: encrypted and plain exports preserve signing identity and are accepted by WinSCP`, () => {
    const generated = ssh2.utils.generateKeyPairSync(type, type === 'rsa' ? { bits: 2048 } : type === 'ecdsa' ? { bits: 256 } : {});
    const original = sshpk.parsePrivateKey(generated.private, 'auto');
    for (const passphrase of ['', 'test-only-ppk-password']) {
      const ppk = toPuttyPrivateKey(generated.private, '', 'Тест\nkey', passphrase);
      const recovered = sshpk.parsePrivateKey(ppk, 'auto', { passphrase });
      assert.equal(recovered.toPublic().fingerprint('sha256').toString(), original.toPublic().fingerprint('sha256').toString());
      const hash = type === 'ed25519' ? 'sha512' : 'sha256';
      const signer = recovered.createSign(hash); signer.update('identity-check');
      const verifier = original.toPublic().createVerify(hash); verifier.update('identity-check');
      assert.equal(verifier.verify(signer.sign()), true);
      const winscp = 'C:/Program Files (x86)/WinSCP/WinSCP.com';
      if (existsSync(winscp)) {
        const directory = mkdtempSync(join(tmpdir(), 'hopdock-ppk-test-'));
        try {
          const input = join(directory, 'input.ppk'); const output = join(directory, 'output.ppk');
          writeFileSync(input, ppk);
          execFileSync(winscp, ['/keygen', input, `/output=${output}`, '/comment=verified', `/passphrase=${passphrase}`], { windowsHide: true, timeout: 20000, stdio: 'pipe' });
          assert.ok(readFileSync(output, 'utf8').includes('PuTTY-User-Key-File-'));
        } finally { for (const file of readdirSync(directory)) unlinkSync(join(directory, file)); rmdirSync(directory); }
      }
    }
  });
}
test('WinSCP session uses encrypted PPK and credential files, encodes username/IPv6, and cleans up', () => {
  const key = ssh2.utils.generateKeyPairSync('ed25519', {});
  const host = { host: '::1', port: 2222, username: 'name@domain', name: 'Test', auth: { type: 'key-password' } } as Host;
  const prepared = prepareWinSCP(host, { host: host.host, port: host.port, username: host.username, privateKey: key.private, password: 'test-only-account-password' });
  try {
    assert.equal(prepared.args[0], 'sftp://name%40domain@[::1]:2222/');
    assert.ok(!prepared.args.join(' ').includes('test-only-account-password'));
    assert.ok(prepared.args.includes('/passwordsfromfiles'));
    assert.equal(readFileSync(join(prepared.directory, 'password'), 'utf8'), 'test-only-account-password');
    const ppk = readFileSync(join(prepared.directory, 'identity.ppk'), 'utf8');
    assert.ok(ppk.includes('Encryption: aes256-cbc'));
    assert.ok(sshpk.parsePrivateKey(ppk, 'auto', { passphrase: readFileSync(join(prepared.directory, 'passphrase'), 'utf8') }));
  } finally { prepared.cleanup(); }
  assert.equal(existsSync(prepared.directory), false);
});
