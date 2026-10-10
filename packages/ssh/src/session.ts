import ssh2 from 'ssh2';
import type { Client, ClientChannel, SFTPWrapper } from 'ssh2';

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
    this.sessions.set(id, session);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SSH ready timeout')), opts.readyTimeoutMs ?? DEFAULT_TIMEOUT);
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
          stream.on('close', () => this.emit('ssh:close', { id }));
          resolve();
        });
      });
      client.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      client.on('close', () => this.emit('ssh:close', { id }));
      client.connect({
        host: opts.host,
        port: opts.port,
        username: opts.username,
        password: opts.password,
        privateKey: opts.privateKey,
        passphrase: opts.passphrase,
        agent: opts.agent,
        readyTimeout: opts.readyTimeoutMs ?? DEFAULT_TIMEOUT,
        keepaliveInterval: 15000,
      });
    });
  }

  write(id: string, dataB64: string): void {
    this.sessions.get(id)?.shell?.write(Buffer.from(dataB64, 'base64'));
  }

  resize(id: string, cols: number, rows: number): void {
    const shell = this.sessions.get(id)?.shell;
    if (shell) shell.setWindow(rows, cols, 0, 0);
  }

  exec(id: string, command: string): Promise<ExecResult> {
    const session = this.sessions.get(id);
    if (!session) return Promise.reject(new Error(`no session: ${id}`));
    return new Promise((resolve, reject) => {
      session.client.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        let stdout = '';
        let stderr = '';
        stream.on('data', (d: Buffer) => {
          stdout += d.toString();
        });
        stream.stderr.on('data', (d: Buffer) => {
          stderr += d.toString();
        });
        stream.on('close', (code: number, signal: string) => resolve({ stdout, stderr, code, signal }));
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
    session.shell?.close();
    session.client.end();
  }
}
