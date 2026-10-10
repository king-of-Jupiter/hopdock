import { useCallback, useEffect, useState } from 'react';
import type { DirEntry } from '@hopdock/ssh';
import type { Host } from '@hopdock/core';
import { ContextMenu } from './ContextMenu';
import type { MenuItem } from './ContextMenu';
import { osTile } from './os';

interface Pane {
  path: string;
  entries: DirEntry[];
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
  const [progress, setProgress] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const load = useCallback(
    async (side: 'left' | 'right', path: string) => {
      if (!host) return;
      setErr('');
      try {
        await window.hopdock.ssh.connect({ hostId: host.id });
        const entries = (await window.hopdock.sftp.list(host.id, path)).sort((a, b) =>
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
      void load('left', '/root');
      void load('right', '/root');
    }
  }, [host, load]);

  useEffect(() => window.hopdock.sftp.onProgress((p) => {
    setProgress(`${p.op} ${(p.transferred / 1024).toFixed(0)}kB / ${(p.total / 1024).toFixed(0)}kB`);
    if (p.transferred >= p.total) setTimeout(() => setProgress(null), 800);
  }), []);

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

  const pane = (side: 'left' | 'right', st: Pane) => {
    const crumbs = st.path.split('/').filter(Boolean);
    return (
      <div className={'hd-pane' + (active === side ? ' active' : '')} onClick={() => setActive(side)}>
        <div className="hd-pane-head">
          <span className="hd-tile sm" style={{ background: tile.color }}>{tile.glyph}</span>
          <strong>{host.name}</strong>
          <span style={{ marginLeft: 'auto' }} />
          <button className="hd-btn" type="button" disabled={busy} onClick={() => void run(() => window.hopdock.sftp.uploadFrom(host.id, st.path).then(() => undefined))}>
            Upload
          </button>
          <button
            className="hd-btn"
            type="button"
            disabled={busy}
            onClick={() => {
              const name = window.prompt('New folder name:');
              if (name) void run(() => window.hopdock.sftp.mkdir(host.id, `${st.path.replace(/\/$/, '')}/${name}`));
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
          <table className="hd-table">
            <thead>
              <tr><th>Name</th><th>Date Modified</th><th>Size</th></tr>
            </thead>
            <tbody>
              {st.entries.filter((e) => e.filename !== '.' && e.filename !== '..').map((e) => (
                <tr
                  key={e.filename}
                  className={'row' + (sel === `${side}:${e.filename}` ? ' sel' : '')}
                  onClick={() => { setActive(side); setSel(`${side}:${e.filename}`); }}
                  onDoubleClick={() => {
                    if (e.isDirectory) void load(side, `${st.path.replace(/\/$/, '')}/${e.filename}`);
                    else void run(() => window.hopdock.sftp.downloadTo(host.id, `${st.path.replace(/\/$/, '')}/${e.filename}`).then(() => undefined), false);
                  }}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    const full = `${st.path.replace(/\/$/, '')}/${e.filename}`;
                    const other = side === 'left' ? right : left;
                    setMenu({
                      x: ev.clientX,
                      y: ev.clientY,
                      items: [
                        { label: e.isDirectory ? 'Open' : 'Download', onClick: () => void run(() => (e.isDirectory ? load(side, full) : window.hopdock.sftp.downloadTo(host.id, full).then(() => undefined)), false) },
                        { label: 'Copy to target directory', disabled: e.isDirectory, onClick: () => void run(() => window.hopdock.sftp.copy(host.id, full, `${other.path.replace(/\/$/, '')}/${e.filename}`)) },
                        { label: 'Rename', onClick: () => { const n = window.prompt('New name:', e.filename); if (n) void run(() => window.hopdock.sftp.rename(host.id, full, `${st.path.replace(/\/$/, '')}/${n}`)); } },
                        { label: 'Edit Permissions', onClick: () => { const m = window.prompt('Octal mode (e.g. 644):', '644'); if (m) void run(() => window.hopdock.sftp.chmod(host.id, full, parseInt(m, 8))); } },
                        { label: 'Delete', danger: true, onClick: () => { if (window.confirm(`Delete ${e.filename}?`)) void run(() => window.hopdock.sftp.remove(host.id, full, e.isDirectory)); } },
                        { label: 'Refresh', onClick: () => void load(side, st.path) },
                      ],
                    });
                  }}
                >
                  <td>
                    {e.isDirectory ? '📁' : '📄'} {e.filename}
                    <span className="perm">{perms(e.mode)}</span>
                  </td>
                  <td>{fmtDate(e.mtime)}</td>
                  <td>{e.isDirectory ? '--' : fmtSize(e.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(err || progress) && (
        <div style={{ fontSize: 12, color: err ? 'var(--hd-danger)' : 'var(--hd-green)' }}>{err || progress}</div>
      )}
      <div className="hd-sftp">
        {pane('left', left)}
        {pane('right', right)}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
