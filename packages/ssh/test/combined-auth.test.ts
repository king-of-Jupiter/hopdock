import assert from 'node:assert/strict';
import { test } from 'node:test';
import ssh2 from 'ssh2';
import { SessionManager } from '../src/session';

for (const mode of ['key', 'password', 'both', 'keyboard'] as const) {
  test(`combined credentials: real SSH ${mode} authentication`, async () => {
    const hostKey = ssh2.utils.generateKeyPairSync('rsa', { bits: 2048 });
    const identity = ssh2.utils.generateKeyPairSync('ed25519', {});
    const key = ssh2.utils.parseKey(identity.private);
    if (key instanceof Error || Array.isArray(key)) throw new Error('Invalid fixture key');
    const attempts: string[] = [];
    const clients = new Set<ssh2.Connection>();
    const server = new ssh2.Server({ hostKeys: [hostKey.private] }, (client) => {
      clients.add(client); client.on('error', () => {}); client.on('close', () => clients.delete(client));
      let verified = false;
      client.on('authentication', (context) => {
        attempts.push(context.method);
        if (context.method === 'publickey' && mode !== 'password' && key.getPublicSSH().equals(context.key.data)) {
          if (!context.signature) return context.accept();
          if (key.verify(context.blob!, context.signature, context.hashAlgo) !== true) return context.reject();
          if (mode === 'key') return context.accept();
          verified = true;
          return context.reject([mode === 'keyboard' ? 'keyboard-interactive' : 'password'], true);
        }
        if (context.method === 'password' && (mode === 'password' || (mode === 'both' && verified)) && context.password === 'test-account-password') return context.accept();
        if (context.method === 'keyboard-interactive' && mode === 'keyboard' && verified) return context.prompt([{ prompt: 'Password:', echo: false }], (answers) => answers[0] === 'test-account-password' ? context.accept() : context.reject());
        context.reject(mode === 'password' ? ['password'] : mode === 'keyboard' && verified ? ['keyboard-interactive'] : ['publickey', 'password']);
      });
      client.on('session', (accept) => { const session = accept(); session.on('pty', (accept) => accept()); session.on('shell', (accept) => { const stream = accept(); stream.write('connected'); }); });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const manager = new SessionManager(() => {});
    const port = (server.address() as { port: number }).port;
    try {
      await manager.connect('combined', { host: '127.0.0.1', port, username: 'tester', privateKey: identity.private, password: 'test-account-password', readyTimeoutMs: 4000 });
      assert.equal(attempts[0], 'publickey');
      if (mode === 'key') assert.ok(!attempts.includes('password'));
      if (mode === 'password' || mode === 'both') assert.ok(attempts.includes('password'));
      if (mode === 'keyboard') assert.ok(attempts.includes('keyboard-interactive'));
      await manager.close('combined');
      if (mode === 'both' || mode === 'keyboard') {
        await assert.rejects(manager.connect('wrong-password', { host: '127.0.0.1', port, username: 'tester', privateKey: identity.private, password: 'wrong', readyTimeoutMs: 4000 }), /authentication|closed|auth/i);
        await assert.rejects(manager.exec('wrong-password', 'echo'), /no session/);
        await assert.rejects(manager.connect('missing-key', { host: '127.0.0.1', port, username: 'tester', password: 'test-account-password', readyTimeoutMs: 4000 }), /authentication|closed|auth/i);
      }
    } finally {
      await manager.close('combined').catch(() => {}); for (const client of clients) client.end();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
