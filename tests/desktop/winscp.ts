/** Real installed WinSCP -> isolated loopback SSH/SFTP fixture. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import assert from 'node:assert/strict';
import ssh2 from 'ssh2';
import type { Host } from '@hopdock/core';
import { prepareWinSCP, findWinSCP } from '../../apps/desktop/src/main/winscp';
import { startSSH } from './ssh-server.mjs';

const executable = findWinSCP();
if (!executable || !existsSync(executable.replace(/\.exe$/i, '.com'))) {
  console.log('SKIP: real WinSCP is not installed on this host.');
} else {
  const root = mkdtempSync(join(tmpdir(), 'hopdock-winscp-test-'));
  mkdirSync(join(root, 'root')); writeFileSync(join(root, 'root/hello.txt'), 'winscp-test');
  const server = await startSSH(root);
  try {
    for (const mode of ['password', 'key', 'key-password'] as const) {
      const key = ssh2.utils.generateKeyPairSync('ed25519', {}); server.authorize(key.public);
      const host = { host: '127.0.0.1', username: 'tester', port: server.port, name: 'WinSCP fixture', auth: { type: mode } } as Host;
      const prepared = prepareWinSCP(host, { host: host.host, port: host.port, username: host.username,
        privateKey: mode === 'password' ? undefined : key.private, password: mode === 'key' ? undefined : 'local-test-password' });
      try {
        const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
        const credentialOptions = prepared.args.filter((argument) => /^\/(?:password|privatekey|passphrase)=/.test(argument)).map((argument) => { const equal = argument.indexOf('='); return '-' + argument.slice(1, equal + 1) + quote(argument.slice(equal + 1)); });
        const command = `open ${prepared.args[0]} -hostkey=${quote(server.fingerprint)} ${credentialOptions.join(' ')} -rawsettings TryAgent=0`;
        const script = join(prepared.directory, 'test-script.txt');
        writeFileSync(script, `option batch abort\n${command} -passwordsfromfiles\nls /root\nexit\n`);
        const result = await promisify(execFile)(executable.replace(/\.exe$/i, '.com'), ['/ini=nul', `/script=${script}`], { windowsHide: true, timeout: 20000 });
        assert.match(result.stdout, /hello\.txt/);
        console.log('PASS real WinSCP SFTP:', mode);
      } finally { prepared.cleanup(); }
    }
  } finally {
    await server.close();
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('hopdock-winscp-test-')) throw new Error('Invalid fixture cleanup path');
    rmSync(root, { recursive: true, force: true });
  }
}
