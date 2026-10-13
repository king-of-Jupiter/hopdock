import ssh2 from 'ssh2';
import type { Client, ClientChannel, SFTPWrapper } from 'ssh2';
import { posix } from 'node:path';

export interface ConnectOpts {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  agent?: string;
  readyTimeoutMs?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
  signal?: string;
}

export interface DirEntry {
  filename: string;
  longname: string;
  size: number;
  mtime: number;
  mode: number;
  isDirectory: boolean;
}

export type Emit = (channel: string, payload: unknown) => void;

interface Session {
  client: Client;
  shell?: ClientChannel;
  sftp?: SFTPWrapper;
  banner?: string;
}

const DEFAULT_TIMEOUT = 15000;

/** One ssh2 Client per session: shell channel + cached SFTP channel. */
export class SessionManager {
  private sessions = new Map<string, Session>();

  constructor(private emit: Emit) {}

  async connect(id: string, opts: ConnectOpts, cols = 80, rows = 24): Promise<void> {
    await this.close(id).catch(() => undefined);
    const client = new ssh2.Client();
    const session: Session = { client };
    client.on('banner', (message: string) => { session.banner = message.slice(0, 4096); });
    this.sessions.set(id, session);

    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('SSH ready timeout')), opts.readyTimeoutMs ?? DEFAULT_TIMEOUT);
      client.on('ready', () => {
        client.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
          clearTimeout(timer);
          if (err) {
            reject(err);
            return;
          }
          session.shell = stream;
          stream.on('data', (d: Buffer) => this.emit('ssh:data', { id, data: d.toString('base64') }));
          stream.stderr.on('data', (d: Buffer) => this.emit('ssh:data', { id, data: d.toString('base64') }));
          stream.on('close', () => { if (this.sessions.get(id) === session) this.emit('ssh:close', { id }); });
          resolve();
        });
      });
      client.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      client.on('close', () => {
        clearTimeout(timer);
        if (this.sessions.get(id) === session) { this.sessions.delete(id); this.emit('ssh:close', { id }); }
        reject(new Error('SSH connection closed before the session was ready'));
      });
      client.on('keyboard-interactive', (_name, _instructions, _language, prompts, finish) => {
        // Never send a saved password to an OTP or arbitrary interactive challenge.
        if (opts.password && prompts.length === 1 && !prompts[0]?.echo && /password/i.test(prompts[0]?.prompt ?? '')) finish([opts.password]);
        else if (prompts.length === 0) finish([]);
        else { reject(new Error('This server requires an interactive challenge that cannot use the saved password.')); client.destroy(); }
      });
      client.connect({
        host: opts.host,
        port: opts.port,
        username: opts.username,
        password: opts.password,
        privateKey: opts.privateKey,
        passphrase: opts.passphrase,
        agent: opts.agent,
        authHandler: opts.privateKey && opts.password ? ['publickey', 'password', 'keyboard-interactive'] : undefined,
        tryKeyboard: !!opts.password,
        readyTimeout: opts.readyTimeoutMs ?? DEFAULT_TIMEOUT,
        keepaliveInterval: 15000,
      });
    }); } catch (error) {
      clearTimeout(timer);
      if (this.sessions.get(id) === session) this.sessions.delete(id);
      client.destroy();
      throw error;
    }
  }

  write(id: string, dataB64: string): void {
    this.sessions.get(id)?.shell?.write(Buffer.from(dataB64, 'base64'));
  }

  resize(id: string, cols: number, rows: number): void {
    const shell = this.sessions.get(id)?.shell;
    if (shell) shell.setWindow(rows, cols, 0, 0);
  }

  sessionIdentity(id: string): object | undefined { return this.sessions.get(id); }
  banner(id: string): string { return this.sessions.get(id)?.banner ?? ''; }
  exec(id: string, command: string, options?: { timeoutMs: number; maxOutputBytes: number }): Promise<ExecResult> {
    const session = this.sessions.get(id);
    if (!session) return Promise.reject(new Error(`no session: ${id}`));
    return new Promise((resolve, reject) => {
      let channel: ClientChannel | undefined, settled = false, bytes = 0;
      const fail = (error: Error) => { if (settled) return; settled = true; clearTimeout(timer); reject(error); channel?.close(); };
      const timer = options ? setTimeout(() => fail(new Error('OS probe timeout')), options.timeoutMs) : undefined;
      session.client.exec(command, (err, stream) => {
        if (settled) { stream?.close(); return; }
        if (err) {
          fail(err);
          return;
        }
        let stdout = '';
        let stderr = '';
        channel = stream;
        stream.on('error', fail);
        stream.on('data', (d: Buffer) => {
          bytes += d.length; if (options && bytes > options.maxOutputBytes) { fail(new Error('OS probe output limit')); return; }
          stdout += d.toString();
        });
        stream.stderr.on('data', (d: Buffer) => {
          bytes += d.length; if (options && bytes > options.maxOutputBytes) { fail(new Error('OS probe output limit')); return; }
          stderr += d.toString();
        });
        stream.on('close', (code: number, signal: string) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ stdout, stderr, code, signal }); });
      });
    });
  }

  private sftpOf(id: string): Promise<SFTPWrapper> {
    const session = this.sessions.get(id);
    if (!session) return Promise.reject(new Error(`no session: ${id}`));
    if (session.sftp) return Promise.resolve(session.sftp);
    return new Promise((resolve, reject) => {
      session.client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }
        session.sftp = sftp;
        resolve(sftp);
      });
    });
  }

  async list(id: string, path: string): Promise<DirEntry[]> {
    const sftp = await this.sftpOf(id);
    return new Promise((resolve, reject) => {
      sftp.readdir(path, (err, list) =>
        err
          ? reject(err)
          : resolve(
              list.map((e) => ({
                filename: e.filename,
                longname: e.longname,
                size: Number(e.attrs.size),
                mtime: e.attrs.mtime,
                mode: e.attrs.mode,
                isDirectory: e.attrs.isDirectory(),
              })),
            ),
      );
    });
  }

  async realpath(id: string, path: string): Promise<string> {
    const sftp = await this.sftpOf(id);
    return new Promise((resolve, reject) => sftp.realpath(path, (error, value) => error ? reject(error) : resolve(value)));
  }

  async download(id: string, remotePath: string, localPath: string, op = 'download'): Promise<void> {
    const sftp = await this.sftpOf(id);
    return new Promise((resolve, reject) => {
      sftp.fastGet(
        remotePath,
        localPath,
        {
          step: (transferred, _chunk, total) =>
            this.emit('sftp:progress', { id, op, path: remotePath, transferred, total }),
        },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  async upload(id: string, localPath: string, remotePath: string): Promise<void> {
    const sftp = await this.sftpOf(id);
    return new Promise((resolve, reject) => {
      sftp.fastPut(
        localPath,
        remotePath,
        {
          step: (transferred, _chunk, total) =>
            this.emit('sftp:progress', { id, op: 'upload', path: remotePath, transferred, total }),
        },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  async mkdir(id: string, path: string): Promise<void> {
    const sftp = await this.sftpOf(id);
    return new Promise((resolve, reject) => {
      sftp.mkdir(path, (err) => (err ? reject(err) : resolve()));
    });
  }

  async remove(id: string, path: string, recursive: boolean): Promise<void> {
    if (recursive) {
      // Directories go through the shell: single round trip, server-side recursion.
      const q = `'${path.replace(/'/g, `'\\''`)}'`;
      const r = await this.exec(id, `rm -rf ${q}`);
      if (r.code !== 0) throw new Error(r.stderr || `rm exited ${r.code}`);
      return;
    }
    const sftp = await this.sftpOf(id);
    return new Promise((resolve, reject) => {
      sftp.unlink(path, (err) => (err ? reject(err) : resolve()));
    });
  }

  async rename(id: string, from: string, to: string): Promise<void> {
    const sftp = await this.sftpOf(id);
    return new Promise((resolve, reject) => {
      sftp.rename(from, to, (err) => (err ? reject(err) : resolve()));
    });
  }

  async chmod(id: string, path: string, mode: number): Promise<void> {
    const sftp = await this.sftpOf(id);
    return new Promise((resolve, reject) => {
      sftp.chmod(path, mode, (err) => (err ? reject(err) : resolve()));
    });
  }

  /** Server-side copy via SFTP stream pump (works across sessions/hosts). */
  async copy(id: string, from: string, to: string): Promise<void> {
    if (posix.normalize(from) === posix.normalize(to)) throw new Error('Source and destination are the same file.');
    const sftp = await this.sftpOf(id);
    const size = await new Promise<number>((resolve, reject) => {
      sftp.stat(from, (err, stats) => (err ? reject(err) : resolve(Number(stats.size))));
    });
    return new Promise((resolve, reject) => {
      let done = 0;
      const rs = sftp.createReadStream(from);
      const ws = sftp.createWriteStream(to);
      rs.on('data', (chunk: Buffer) => {
        done += chunk.length;
        this.emit('sftp:progress', { id, op: 'copy', path: to, transferred: done, total: size });
      });
      rs.on('error', reject);
      ws.on('error', reject);
      ws.on('close', () => resolve());
      rs.pipe(ws);
    });
  }

  async close(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    this.emit('ssh:close', { id });
    session.shell?.close();
    session.client.end();
  }
}
