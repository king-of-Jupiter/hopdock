import { useCallback, useEffect, useRef, useState } from 'react';
import type { DirEntry } from '@hopdock/ssh';
import type { Host } from '@hopdock/core';
import { ContextMenu } from './ContextMenu';
import type { MenuItem } from './ContextMenu';
import { osTile } from './os';
import { promptText, confirmAction } from './TextPrompt';
import { pickFiles } from './FilePicker';
import { ErrorNotice } from './ErrorNotice';

interface Pane {
  path: string;
  entries: DirEntry[];
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" style={{ verticalAlign: -2, marginRight: 6 }}>
      <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3l1.5 2h6A1.5 1.5 0 0 1 14.5 5.5v6a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 1.5 11.5v-8z" fill="#5aa9e6" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" style={{ verticalAlign: -2, marginRight: 6 }}>
      <path d="M3 1.5A1.5 1.5 0 0 1 4.5 0H9l4 4v10.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 14.5v-13z" fill="#8b94a3" />
    </svg>
  );
}
function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDate(ts: number): string {
  if (!ts) return '--';
  return new Date(ts * 1000).toLocaleString();
}

function perms(mode: number): string {
  const t = (b: number, c: string) => ((mode & b) !== 0 ? c : '-');
  return t(0o400, 'r') + t(0o200, 'w') + t(0o100, 'x') + t(0o40, 'r') + t(0o20, 'w') + t(0o10, 'x') + t(0o4, 'r') + t(0o2, 'w') + t(0o1, 'x');
}

export function SftpView({ host }: { host: Host | null }) {
  const [left, setLeft] = useState<Pane>({ path: '/root', entries: [] });
  const [right, setRight] = useState<Pane>({ path: '/root', entries: [] });
  const [active, setActive] = useState<'left' | 'right'>('left');
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const connection = useRef<Promise<string> | null>(null);
  const sessionId = `sftp:${host?.id ?? ''}`;

  useEffect(() => {
    if (!host) return;
    const pending = window.hopdock.ssh.connect({ hostId: host.id, purpose: 'sftp' });
    connection.current = pending;
    let disposed = false;
    void pending.then((id) => { if (disposed) void window.hopdock.ssh.close(id); }).catch(() => undefined);
    return () => {
      disposed = true;
      connection.current = null;
      void pending.then((id) => window.hopdock.ssh.close(id)).catch(() => undefined);
    };
  }, [host?.id]);

  const load = useCallback(
    async (side: 'left' | 'right', path: string) => {
      if (!host) return;
      setErr('');
      try {
        const id = await connection.current;
        if (!id) throw new Error('SFTP connection is unavailable.');
        const entries = (await window.hopdock.sftp.list(id, path)).sort((a, b) =>
          a.isDirectory === b.isDirectory ? a.filename.localeCompare(b.filename) : a.isDirectory ? -1 : 1,
        );
        (side === 'left' ? setLeft : setRight)({ path, entries });
      } catch (e) {
        setErr(String(e));
      }
    },
    [host],
  );

  useEffect(() => {
    if (host) {
      setLoading(true);
      void (async () => {
        try {
          const id = await connection.current;
          if (!id) throw new Error('SFTP connection is unavailable.');
          const home = await window.hopdock.sftp.realpath(id, '.');
          await Promise.all([load('left', home), load('right', home)]);
        } catch (error) { setErr(String(error)); }
        finally { setLoading(false); }
      })();
    }
  }, [host, load]);

  useEffect(() => window.hopdock.sftp.onProgress((p) => {
    if (p.id !== sessionId) return;
    setProgress(`${p.op} ${(p.transferred / 1024).toFixed(0)}kB / ${(p.total / 1024).toFixed(0)}kB`);
    if (p.transferred >= p.total) setTimeout(() => setProgress(null), 800);
  }), [sessionId]);

  if (!host) return <div className="hd-empty"><h2>No host selected</h2><p>Open a host first, then SFTP.</p></div>;

  const run = async (fn: () => Promise<unknown>, reload = true) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      if (reload) {
        await load('left', left.path);
        await load('right', right.path);
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const tile = osTile(host);
  const download = async (remotePath: string) => {
    const paths = await pickFiles('Save download', { save: true, filename: remotePath.split('/').pop() });
    if (!paths?.[0]) return;
    await window.hopdock.sftp.downloadTo(sessionId, remotePath, paths[0]);
  };
  const upload = async (remoteDir: string) => {
    const paths = await pickFiles('Upload files', { multiple: true });
    if (paths?.length) await window.hopdock.sftp.uploadFrom(sessionId, remoteDir, paths);
  };

  const pane = (side: 'left' | 'right', st: Pane) => {
    const crumbs = st.path.split('/').filter(Boolean);
    return (
      <div className={'hd-pane' + (active === side ? ' active' : '')} onClick={() => setActive(side)}>
        <div className="hd-pane-head">
          <span className="hd-tile sm" style={{ background: tile.color }}>{tile.glyph}</span>
          <strong>{host.name}</strong>
          <span style={{ marginLeft: 'auto' }} />
          <button className="hd-btn" type="button" disabled={busy} onClick={() => void run(() => upload(st.path))}>
            Upload
          </button>
          <button
            className="hd-btn"
            type="button"
            disabled={busy}
            onClick={async () => {
              const name = await promptText('New folder name:');
              if (name) void run(() => window.hopdock.sftp.mkdir(sessionId, `${st.path.replace(/\/$/, '')}/${name}`));
            }}
          >
            New Folder
          </button>
        </div>
        <div className="hd-crumb">
          <button type="button" onClick={() => void load(side, '/')}>/</button>
          {crumbs.map((c, i) => (
            <span key={i}>
              <button type="button" onClick={() => void load(side, `/${crumbs.slice(0, i + 1).join('/')}`)}>{c}</button>
              {i < crumbs.length - 1 && ' › '}
            </span>
          ))}
        </div>
        <div style={{ overflowY: 'auto' }}>
          {loading && st.entries.length === 0 ? (
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="sftp-skeleton">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="hd-sk" style={{ height: 34 }} />
              ))}
            </div>
          ) : (
          <table className="hd-table" data-testid="sftp-table">
            <thead>
              <tr><th>Name</th><th>Date Modified</th><th>Size</th></tr>
            </thead>
            <tbody>
              {st.entries.filter((e) => e.filename !== '.' && e.filename !== '..').map((e) => (
                <tr
                  key={e.filename}
                  data-testid="sftp-row"
                  data-name={e.filename}
                  className={'row' + (sel === `${side}:${e.filename}` ? ' sel' : '')}
                  onClick={() => { setActive(side); setSel(`${side}:${e.filename}`); }}
                  onDoubleClick={() => {
                    if (e.isDirectory) void load(side, `${st.path.replace(/\/$/, '')}/${e.filename}`);
                    else void run(() => download(`${st.path.replace(/\/$/, '')}/${e.filename}`), false);
                  }}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    const full = `${st.path.replace(/\/$/, '')}/${e.filename}`;
                    const other = side === 'left' ? right : left;
                    setMenu({
                      x: ev.clientX,
                      y: ev.clientY,
                      items: [
                        { label: e.isDirectory ? 'Open' : 'Download', onClick: () => void run(() => (e.isDirectory ? load(side, full) : download(full)), false) },
                        { label: 'Copy to target directory', disabled: e.isDirectory || st.path === other.path, onClick: () => void run(() => window.hopdock.sftp.copy(sessionId, full, `${other.path.replace(/\/$/, '')}/${e.filename}`)) },
                        { label: 'Rename', onClick: () => { void promptText('New name:', e.filename).then((n) => { if (n) void run(() => window.hopdock.sftp.rename(sessionId, full, `${st.path.replace(/\/$/, '')}/${n}`)); }); } },
                        { label: 'Edit Permissions', onClick: () => { void promptText('Octal mode (e.g. 644):', '644').then((m) => { if (!m) return; if (!/^[0-7]{3,4}$/.test(m)) { setErr('Enter a valid octal mode, for example 644.'); return; } void run(() => window.hopdock.sftp.chmod(sessionId, full, parseInt(m, 8))); }); } },
                        { label: 'Delete', danger: true, onClick: () => { void confirmAction(`Delete ${e.filename}?`, e.isDirectory ? 'The folder and all its contents will be permanently removed from the server.' : 'The file will be permanently removed from the server.').then((yes) => { if (yes) void run(() => window.hopdock.sftp.remove(sessionId, full, e.isDirectory)); }); } },
                        { label: 'Refresh', onClick: () => void load(side, st.path) },
                      ],
                    });
                  }}
                >
                  <td>
                    {e.isDirectory ? <FolderIcon /> : <FileIcon />}{e.filename}
                    <span className="perm">{perms(e.mode)}</span>
                  </td>
                  <td>{fmtDate(e.mtime)}</td>
                  <td>{e.isDirectory ? '--' : fmtSize(e.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <ErrorNotice error={err} context="File operation" onDismiss={() => setErr('')} />
      {progress && <div role="status" style={{ fontSize: 13, color: 'var(--hd-muted)' }}>{progress}</div>}
      <div className="hd-sftp">
        {pane('left', left)}
        {pane('right', right)}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
