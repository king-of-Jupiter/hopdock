import ssh2 from 'ssh2';
import * as fs from 'node:fs';
import { resolve, sep, join } from 'node:path';
import { generateKeyPairSync, createHash } from 'node:crypto';
import net from 'node:net';

export async function startSSH(base) {
  const hostKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' });
  const clients = new Set();
  const authorized = [];
  const agentKey = ssh2.utils.parseKey(generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' }));
  authorized.push(agentKey);
  const agentPath = process.platform === 'win32' ? `\\\\.\\pipe\\hopdock-agent-${process.pid}` : join(base, 'agent.sock');
  const agentSockets = new Set();
  const agent = net.createServer((socket) => {
    agentSockets.add(socket); socket.on('close', () => agentSockets.delete(socket));
    const protocol = new ssh2.AgentProtocol(false);
    protocol.on('error', () => socket.destroy()); socket.on('error', () => {});
    protocol.on('identities', (request) => protocol.getIdentitiesReply(request, [agentKey]));
    protocol.on('sign', (request, _key, data, flags) => protocol.signReply(request, agentKey.sign(data, flags.hash ?? 'sha1')));
    socket.pipe(protocol).pipe(socket);
  });
  await new Promise((resolve) => agent.listen(agentPath, resolve));
  const metrics = { connections: 0, shellInput: '', resizes: [], commands: [], modes: new Map() };
  const safePath = (path) => {
    const target = resolve(base, '.' + (path.startsWith('/') ? path : '/' + path));
    if (target !== resolve(base) && !target.startsWith(resolve(base) + sep)) throw new Error('Path outside test server');
    return target;
  };
  const attrs = (path) => {
    const stat = fs.statSync(path);
    return { mode: metrics.modes.get(path) ?? stat.mode, uid: 0, gid: 0, size: stat.size, atime: 1, mtime: Math.floor(stat.mtimeMs / 1000) };
  };
  const sftp = (stream) => {
    const files = new Map(); const dirs = new Map(); let next = 1;
    const handle = (id) => { const buffer = Buffer.alloc(4); buffer.writeUInt32BE(id); return buffer; };
    const id = (buffer) => buffer.readUInt32BE();
    const ok = (req) => stream.status(req, 0);
    const fail = (req) => stream.status(req, 4);
    const operation = (name, fn) => stream.on(name, (req, ...args) => { try { fn(req, ...args); } catch { fail(req); } });
    operation('REALPATH', (req, path) => stream.name(req, [{ filename: path === '.' ? '/root' : path, longname: path, attrs: attrs(safePath(path === '.' ? '/root' : path)) }]));
    for (const name of ['STAT', 'LSTAT']) operation(name, (req, path) => stream.attrs(req, attrs(safePath(path))));
    operation('FSTAT', (req, raw) => stream.attrs(req, attrs(files.get(id(raw)).path)));
    operation('OPENDIR', (req, path) => { const h = next++; const full = safePath(path); dirs.set(h, { full, names: fs.readdirSync(full) }); stream.handle(req, handle(h)); });
    operation('READDIR', (req, raw) => {
      const dir = dirs.get(id(raw));
      if (!dir.names.length) return stream.status(req, 1);
      stream.name(req, dir.names.splice(0, 20).map((name) => ({ filename: name, longname: name, attrs: attrs(join(dir.full, name)) })));
    });
    operation('OPEN', (req, path, flags) => {
      const full = safePath(path); const h = next++;
      const mode = flags & 4 ? 'a+' : flags & 2 ? (flags & 16 ? 'w+' : flags & 8 ? 'a+' : 'r+') : 'r';
      files.set(h, { fd: fs.openSync(full, mode), path: full }); stream.handle(req, handle(h));
    });
    operation('READ', (req, raw, offset, length) => {
      const buffer = Buffer.alloc(length); const count = fs.readSync(files.get(id(raw)).fd, buffer, 0, length, offset);
      if (!count) return stream.status(req, 1); stream.data(req, buffer.subarray(0, count));
    });
    operation('WRITE', (req, raw, offset, data) => { fs.writeSync(files.get(id(raw)).fd, data, 0, data.length, offset); ok(req); });
    operation('CLOSE', (req, raw) => { const h = id(raw); if (files.has(h)) fs.closeSync(files.get(h).fd); files.delete(h); dirs.delete(h); ok(req); });
    operation('MKDIR', (req, path) => { fs.mkdirSync(safePath(path)); ok(req); });
    operation('RMDIR', (req, path) => { fs.rmdirSync(safePath(path)); ok(req); });
    operation('REMOVE', (req, path) => { fs.unlinkSync(safePath(path)); ok(req); });
    operation('RENAME', (req, from, to) => { fs.renameSync(safePath(from), safePath(to)); ok(req); });
    operation('SETSTAT', (req, path, data) => { const full = safePath(path); fs.statSync(full); if (data.mode != null) metrics.modes.set(full, (fs.statSync(full).mode & 0o170000) | data.mode); ok(req); });
    operation('FSETSTAT', (req, raw, data) => { if (data.mode != null) metrics.modes.set(files.get(id(raw)).path, data.mode); ok(req); });
    stream.on('close', () => { for (const { fd } of files.values()) { try { fs.closeSync(fd); } catch {} } files.clear(); });
  };
  const server = new ssh2.Server({ hostKeys: [hostKey] }, (client) => {
    metrics.connections++; clients.add(client); client.on('error', () => {}); client.on('close', () => clients.delete(client));
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === 'tester' && ctx.password === 'local-test-password') return ctx.accept();
      if (ctx.method === 'publickey' && ctx.username === 'tester') {
        const key = authorized.find((k) => k.getPublicSSH().equals(ctx.key.data));
        if (key && (!ctx.signature || key.verify(ctx.blob, ctx.signature, ctx.hashAlgo) === true)) return ctx.accept();
      }
      ctx.reject(['publickey', 'password']);
    });
    client.on('session', (accept) => {
      const session = accept();
      session.on('pty', (acceptPty) => acceptPty());
      session.on('window-change', (acceptWindow, _reject, info) => { metrics.resizes.push(info); acceptWindow?.(); });
      session.on('shell', (acceptShell) => {
        const stream = acceptShell(); stream.write('local-ssh-ready\r\n');
        stream.on('data', (data) => { metrics.shellInput += data.toString(); stream.write('echo:' + data.toString() + '\r\n'); });
      });
      session.on('exec', (acceptExec, _reject, info) => {
        const stream = acceptExec(); const command = info.command; metrics.commands.push(command);
        if (command === 'uname -s') { stream.write('Linux\n'); stream.exit(0); }
        else if (command === 'cat /etc/os-release') { stream.write('ID=debian\nPRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nVERSION_ID="12"\n'); stream.exit(0); }
        else if (command.includes('authorized_keys')) {
          const match = /echo '([^']+)' >>/.exec(command);
          const key = match && ssh2.utils.parseKey(match[1]);
          if (key && !(key instanceof Error)) authorized.push(key);
          stream.write('OK\n'); stream.exit(key ? 0 : 1);
        } else if (command.startsWith('rm -rf ')) {
          try { const path = command.slice(8).slice(1, -1).replace(/'\\''/g, "'"); const full = safePath(path); if (full === resolve(base)) throw new Error(); fs.rmSync(full, { recursive: true }); stream.exit(0); }
          catch { stream.stderr.write('remove failed'); stream.exit(1); }
        } else if (command === 'test-stderr') { stream.stderr.write('expected-error'); stream.exit(7); }
        else { stream.write(command.replace(/^echo\s+/, '').replace(/^['"]|['"]$/g, '') + '\n'); stream.exit(0); }
        stream.end();
      });
      session.on('sftp', (acceptSftp) => sftp(acceptSftp()));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const parsedHostKey = ssh2.utils.parseKey(hostKey);
  return { port: server.address().port, agentPath, metrics,
    fingerprint: 'ssh-rsa 2048 ' + createHash('sha256').update(parsedHostKey.getPublicSSH()).digest('base64').replace(/=+$/, ''),
    authorize: (publicKey) => { const key = ssh2.utils.parseKey(publicKey); if (key instanceof Error) throw key; authorized.push(key); },
    close: async () => { for (const client of clients) client.end(); for (const socket of agentSockets) socket.destroy(); await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => agent.close(resolve))]); } };
}
