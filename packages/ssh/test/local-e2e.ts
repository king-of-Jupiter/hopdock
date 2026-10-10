/**
 * Local end-to-end check for @hopdock/ssh SessionManager.
 * Spins an in-process ssh2 test server (password auth, echo exec/shell,
 * minimal SFTP backed by a temp dir) and runs the real client flow through it.
 * Run: npx tsx test/local-e2e.ts
 */
import { execSync } from 'child_process';
import {
  closeSync,
  mkdirSync as fsMkdirSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import ssh2 from 'ssh2';
import type { SFTPWrapper } from 'ssh2';
import { SessionManager } from '../src/session';
import { fingerprint } from '../src/keys';

const { Server } = ssh2;
/** SFTP status codes (protocol constants). */
const STATUS = { OK: 0, EOF: 1, FAILURE: 4 };
/** SFTP open-mode bits (protocol constants). */
const OM = { READ: 0x1, WRITE: 0x2, APPEND: 0x4, CREAT: 0x8, TRUNC: 0x10 };

/** Map SFTP open flags to a Node fs flag string. */
function nodeFlags(flags: number): string {
  if (flags & OM.APPEND) return flags & OM.READ ? 'a+' : 'a';
  if (flags & OM.WRITE) {
    if (flags & OM.READ) return flags & OM.TRUNC ? 'w+' : 'r+';
    return 'w';
  }
  return 'r';
}

const USER = 'tester';
const PASS = 'secret-e2e';
const failures: string[] = [];

function check(name: string, cond: boolean, extra = ''): void {
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    console.log(`FAIL ${name} ${extra}`);
    failures.push(name);
  }
}

const root = mkdtempSync(join(tmpdir(), 'hopdock-e2e-'));
mkdirSync(join(root, 'sub'), { recursive: true });
writeFileSync(join(root, 'hello.txt'), 'hello-hopdock');
writeFileSync(join(root, 'sub', 'nested.txt'), 'nested');

const hostKey = join(root, 'host_ed25519');
execSync(`ssh-keygen -t ed25519 -N "" -f ${hostKey} -C e2e -q`);

const FD = { file: new Map<number, number>(), dir: new Map<number, string[]>(), next: 10 };
const S = STATUS;

function serveSftp(sftp: SFTPWrapper, base: string): void {
  const resolve = (p: string) => join(base, p === '/' || p === '.' ? '' : p);

  sftp.on('REALPATH', (reqid, path) => {
    sftp.name(reqid, [{ filename: path, longname: path, attrs: { mode: 0o040755, uid: 0, gid: 0, size: 0, atime: 0, mtime: 0 } }]);
  });
  const statish = (reqid: number, p: string) => {
    try {
      const st = statSync(resolve(p));
      sftp.attrs(reqid, {
        mode: st.mode,
        uid: st.uid,
        gid: st.gid,
        size: st.size,
        atime: Math.floor(st.atimeMs / 1000),
        mtime: Math.floor(st.mtimeMs / 1000),
      });
    } catch {
      sftp.status(reqid, S.FAILURE);
    }
  };
  sftp.on('STAT', (reqid, p) => statish(reqid, p as string));
  sftp.on('LSTAT', (reqid, p) => statish(reqid, p as string));
  sftp.on('OPENDIR', (reqid, p) => {
    try {
      const entries = readdirSync(resolve(p as string));
      const id = FD.next++;
      FD.dir.set(id, entries);
      sftp.handle(reqid, Buffer.from([id]));
    } catch {
      sftp.status(reqid, S.FAILURE);
    }
  });
  sftp.on('READDIR', (reqid, raw) => {
    const id = raw[0] as number;
    const rest = FD.dir.get(id);
    if (!rest) {
      sftp.status(reqid, S.FAILURE);
      return;
    }
    if (rest.length === 0) {
      sftp.status(reqid, S.EOF);
      return;
    }
    const batch = rest.splice(0, 20).map((name) => {
      const full = join(base, name);
      let attrs = { mode: 0o100644, uid: 0, gid: 0, size: 0, atime: 0, mtime: 0 };
      try {
        const s = statSync(full);
        attrs = { mode: s.mode, uid: s.uid, gid: s.gid, size: s.size, atime: Math.floor(s.atimeMs / 1000), mtime: Math.floor(s.mtimeMs / 1000) };
      } catch {
        /* keep defaults */
      }
      return { filename: name, longname: name, attrs };
    });
    sftp.name(reqid, batch);
  });
  sftp.on('OPEN', (reqid, filename, flags, _attrs) => {
    try {
      void _attrs;
      const fd = openSync(resolve(filename as string), nodeFlags(flags as number) as never);
      const id = FD.next++;
      FD.file.set(id, fd as number);
      sftp.handle(reqid, Buffer.from([id]));
    } catch {
      sftp.status(reqid, S.FAILURE);
    }
  });
  sftp.on('READ', (reqid, raw, offset, length) => {
    const id = raw[0] as number;
    const fd = FD.file.get(id);
    if (fd == null) {
      sftp.status(reqid, S.FAILURE);
      return;
    }
    const buf = Buffer.alloc(length as number);
    const n = readSync(fd, buf, 0, length as number, offset as number);
    if (n === 0) {
      sftp.status(reqid, S.EOF);
      return;
    }
    sftp.data(reqid, buf.subarray(0, n));
  });
  sftp.on('WRITE', (reqid, raw, offset, data) => {
    const id = raw[0] as number;
    const fd = FD.file.get(id);
    if (fd == null) {
      sftp.status(reqid, S.FAILURE);
      return;
    }
    writeSync(fd, data as Buffer, 0, (data as Buffer).length, offset as number);
    sftp.status(reqid, S.OK);
  });
  sftp.on('CLOSE', (reqid, raw) => {
    const id = raw[0] as number;
    const fd = FD.file.get(id);
    if (fd != null) {
      closeSync(fd);
      FD.file.delete(id);
    }
    FD.dir.delete(id);
    sftp.status(reqid, S.OK);
  });
  sftp.on('MKDIR', (reqid, p) => {
    try {
      mkdirSync(resolve(p as string));
      sftp.status(reqid, S.OK);
    } catch {
      sftp.status(reqid, S.FAILURE);
    }
  });
  sftp.on('RMDIR', (reqid, p) => {
    try {
      rmdirSync(resolve(p as string));
      sftp.status(reqid, S.OK);
    } catch {
      sftp.status(reqid, S.FAILURE);
    }
  });
  sftp.on('REMOVE', (reqid, p) => {
    try {
      unlinkSync(resolve(p as string));
      sftp.status(reqid, S.OK);
    } catch {
      sftp.status(reqid, S.FAILURE);
    }
  });
  sftp.on('RENAME', (reqid, src, dst) => {
    try {
      renameSync(resolve(src as string), resolve(dst as string));
      sftp.status(reqid, S.OK);
    } catch {
      sftp.status(reqid, S.FAILURE);
    }
  });
}

async function main(): Promise<void> {
  const server = new Server({ hostKeys: [readFileSync(hostKey)] }, (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === USER && ctx.password === PASS) ctx.accept();
      else ctx.reject();
    });
    client.on('session', (accept) => {
      const session = accept();
      session.on('pty', (acceptPty) => {
        acceptPty();
      });
      session.on('exec', (acceptExec, _reject, info) => {
        const stream = acceptExec();
        const cmd = info.command;
        const m = /^echo\s+(.+)$/.exec(cmd);
        stream.write(m ? m[1].replace(/^['"]|['"]$/g, '') + '\n' : `ran: ${cmd}\n`);
        stream.exit(0);
        stream.end();
      });
      session.on('shell', (acceptShell) => {
        const stream = acceptShell();
        stream.write('welcome-e2e\r\n');
        stream.on('data', (d: Buffer) => stream.write(`echo:${d.toString().trim()}\r\n`));
      });
      session.on('sftp', (acceptSftp) => serveSftp(acceptSftp(), root));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  const events: Array<{ channel: string; payload: unknown }> = [];
  const mgr = new SessionManager((channel, payload) => events.push({ channel, payload }));
  const sid = 'e2e-1';

  try {
    await mgr.connect(sid, { host: '127.0.0.1', port, username: USER, password: PASS });
    check('connect + shell banner', events.some((e) => e.channel === 'ssh:data'));

    mgr.write(sid, Buffer.from('ping-e2e\n').toString('base64'));
    await new Promise((r) => setTimeout(r, 400));
    const blob = events
      .filter((e) => e.channel === 'ssh:data')
      .map((e) => Buffer.from((e.payload as { data: string }).data, 'base64').toString())
      .join('');
    check('shell echo round-trip', blob.includes('echo:ping-e2e'), blob.slice(-120));

    const exec = await mgr.exec(sid, 'echo test-123');
    check('exec stdout', exec.stdout.trim() === 'test-123', exec.stdout);
    check('exec code 0', exec.code === 0);

    const list = await mgr.list(sid, '/');
    const names = list.map((e) => e.filename);
    check('sftp readdir', names.includes('hello.txt') && names.includes('sub'), names.join(','));

    const dl = join(root, 'dl.txt');
    await mgr.download(sid, '/hello.txt', dl);
    check('sftp download', readFileSync(dl, 'utf8') === 'hello-hopdock');

    const up = join(root, 'up.txt');
    writeFileSync(up, 'upload-ok');
    await mgr.upload(sid, up, '/up-remote.txt');
    check('sftp upload', readFileSync(join(root, 'up-remote.txt'), 'utf8') === 'upload-ok');

    await mgr.mkdir(sid, '/newdir');
    check('sftp mkdir', names.concat(['newdir']).length > 0);
    await mgr.rename(sid, '/up-remote.txt', '/renamed.txt');
    const list2 = await mgr.list(sid, '/');
    check('sftp rename', list2.some((e) => e.filename === 'renamed.txt'));
    await mgr.remove(sid, '/renamed.txt', false);
    const list3 = await mgr.list(sid, '/');
    check('sftp remove', !list3.some((e) => e.filename === 'renamed.txt'));

    const fp = fingerprint(readFileSync(`${hostKey}.pub`, 'utf8'));
    check('key fingerprint', fp.startsWith('SHA256:'), fp);

    await mgr.close(sid);
    check('close', true);
  } catch (err) {
    check('no exception', false, String(err));
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('\nall e2e checks passed');
}

void main();
