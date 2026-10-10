import { useState } from 'react';
import type { Host, HostGroup } from '@hopdock/core';
import { ContextMenu } from './ContextMenu';
import type { MenuItem } from './ContextMenu';
import { osTile } from './os';

interface Props {
  groups: HostGroup[];
  hosts: Host[];
  onOpenTerminal: (h: Host) => void;
  onOpenSftp: (h: Host) => void;
  onNew: () => void;
  onEdit: (h: Host) => void;
  onDelete: (h: Host) => void;
}

export function HostsView({ groups, hosts, onOpenTerminal, onOpenSftp, onNew, onEdit, onDelete }: Props) {
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const q = query.trim().toLowerCase();
  const match = (h: Host) =>
    !q || h.name.toLowerCase().includes(q) || h.host.toLowerCase().includes(q) || h.username.toLowerCase().includes(q) || h.tags.some((t) => t.toLowerCase().includes(q));

  const card = (h: Host) => {
    const tile = osTile(h);
    return (
      <div
        key={h.id}
        className="hd-card"
        onClick={() => onOpenTerminal(h)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
              { label: 'Open terminal', onClick: () => onOpenTerminal(h) },
              { label: 'Open SFTP', onClick: () => onOpenSftp(h) },
              { label: 'Edit', onClick: () => onEdit(h) },
              { label: 'Delete', danger: true, onClick: () => onDelete(h) },
            ],
          });
        }}
      >
        <span className="hd-tile" style={{ background: tile.color }} title={tile.label}>
          {tile.glyph}
        </span>
        <span>
          <div className="name">{h.name}</div>
          <div className="sub">{h.tags.length > 0 ? h.tags.join(', ') : `${h.username}@${h.host}`}</div>
        </span>
      </div>
    );
  };

  return (
    <>
      <div className="hd-toolbar">
        <button className="hd-btn primary" type="button" onClick={onNew}>
          NEW HOST ▾
        </button>
        <button className="hd-btn" type="button" disabled title="Local terminal after v0.0.1">
          TERMINAL
        </button>
        <div className="hd-search" style={{ marginLeft: 'auto' }}>
          <span>⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search hosts, tags..." />
        </div>
      </div>
      <div className="hd-sec">Groups</div>
      <div className="hd-grid">
        {groups.map((g) => {
          const n = hosts.filter((h) => h.groupId === g.id).length;
          return (
            <div key={g.id} className="hd-card" onClick={() => setQuery(g.name)}>
              <span className="hd-tile" style={{ background: '#1c4ed8' }}>
                ▦
              </span>
              <span>
                <div className="name">{g.name}</div>
                <div className="sub">{n} Hosts</div>
              </span>
            </div>
          );
        })}
      </div>
      <div className="hd-sec">Hosts</div>
      <div className="hd-grid">{hosts.filter(match).map(card)}</div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </>
  );
}
