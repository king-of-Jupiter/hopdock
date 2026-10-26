import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import type { Host, HostGroup } from '@hopdock/core';
import { ContextMenu } from './ContextMenu';
import type { MenuItem } from './ContextMenu';
import { Icons } from './icons';
import { OsIcon } from './OsIcon';
import { notifyError } from './ErrorNotice';
import { ErrorNotice } from './ErrorNotice';
import { Drawer } from './Drawer';
import { IconChevronDown } from '@tabler/icons-react';
interface Props {
  groups: HostGroup[]; hosts: Host[];
  hideGroupedHosts: boolean; onHideGroupedHosts: (value: boolean) => void;
  onOpenTerminal: (h: Host) => void; onOpenSftp: (h: Host) => void;
  onNew: (groupId?: string | null) => void; onEdit: (h: Host) => void; onDelete: (h: Host) => void; onChanged: () => void;
  /** Changes when the user asks for the top of the library (Hosts in the rail, the Vaults tab): an open group closes. */
  resetSignal?: number;
}
export function HostsView({ groups, hosts, hideGroupedHosts, onHideGroupedHosts, onOpenTerminal, onOpenSftp, onNew, onEdit, onDelete, onChanged, resetSignal = 0 }: Props) {
  const [groupName, setGroupName] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupError, setGroupError] = useState('');
  const saveGroup = async () => {
    if (!groupName?.trim() || savingGroup) return;
    setSavingGroup(true); setGroupError('');
    try { await window.hopdock.vault.saveGroup(groupName); setGroupName(null); onChanged(); }
    catch (error) { setGroupError(String(error)); } finally { setSavingGroup(false); }
  };
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  useEffect(() => { setGroupId(null); }, [resetSignal]);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [winSCP, setWinSCP] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  // The drag in flight is tracked synchronously; the drop targets are revealed a tick later (see onDragStart).
  const dragging = useRef<string | null>(null);
  const revealTargets = useRef<number | undefined>(undefined);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveMessage, setMoveMessage] = useState('');
  const suppressClickUntil = useRef(0);
  const dragType = 'application/x-hopdock-host';
  const dropProps = (destination: string | null) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!dragging.current || moving || !event.dataTransfer.types.includes(dragType)) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
      setDropTarget(destination ?? '__ungrouped__');
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      const id = event.dataTransfer.getData(dragType);
      if (!dragging.current || id !== dragging.current || moving || !hosts.some((h) => h.id === id)) return;
      event.preventDefault(); event.stopPropagation(); setDropTarget(null); dragging.current = null; window.clearTimeout(revealTargets.current); setDraggedId(null);
      suppressClickUntil.current = Date.now() + 350;
      const host = hosts.find((h) => h.id === id)!;
      if ((host.groupId ?? null) === destination) return;
      setMoving(true);
      void window.hopdock.vault.moveHost(id, destination).then(() => {
        setMoveMessage(`${host.name} moved to ${groups.find((g) => g.id === destination)?.name ?? 'Ungrouped hosts'}`);
        onChanged();
      }).catch((error) => notifyError(error, 'Move host')).finally(() => setMoving(false));
    },
  });
  useEffect(() => { void window.hopdock.winscp.status().then((status) => setWinSCP(status.supported)).catch((error) => notifyError(error, 'Load WinSCP integration')); }, []);
  const group = groups.find((g) => g.id === groupId);
  const q = query.trim().toLowerCase();
  const visible = hosts.filter((h) =>
    (group ? h.groupId === group.id : !hideGroupedHosts || !groups.some((g) => g.id === h.groupId)) &&
    (!q || `${h.name} ${h.host} ${h.username} ${h.tags.join(' ')}`.toLowerCase().includes(q)));
  const openMenu = (h: Host, x: number, y: number) => setMenu({ x, y, items: [
    { label: 'Open terminal', onClick: () => onOpenTerminal(h) },
    { label: 'Open SFTP', onClick: () => onOpenSftp(h) },
    ...(winSCP ? [{ label: 'Open in WinSCP', onClick: () => { const open = () => { void window.hopdock.winscp.open(h.id).catch((error) => notifyError(error, 'Open WinSCP', open)); }; open(); } }] : []),
    { label: 'Edit', onClick: () => onEdit(h) },
    { label: 'Delete', danger: true, onClick: () => onDelete(h) },
  ] });
  return <div className={'hd-hosts' + (draggedId ? ' hd-dragging' : '')}>
    <div className="hd-search"><Icons.search /><input aria-label="Search hosts" data-testid="host-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search hosts, tags, or addresses…" /></div>
    <div className="hd-toolbar hd-host-toolbar"><div className="hd-new-host-split"><button className="hd-btn primary" type="button" onClick={() => onNew(groupId)}><Icons.plus />New host</button><button className="hd-btn primary" type="button" aria-label="New host options" aria-expanded={!!menu?.items.some((item) => item.label === 'New group')} onClick={(event) => { event.stopPropagation(); if (menu?.items.some((item) => item.label === 'New group')) setMenu(null); else { const rect = event.currentTarget.getBoundingClientRect(); setMenu({ x: rect.left, y: rect.bottom + 6, items: [{ label: 'New group', onClick: () => { setGroupError(''); setGroupName(''); } }] }); } }}><IconChevronDown size={15} /></button></div></div>
    <span className="hd-sr-only" role="status" aria-live="polite">{moveMessage}</span>
    {(!group || draggedId) && <section aria-label="Groups">
      <div className="hd-section-head"><h2>Groups</h2><span>{draggedId ? 'Drop the host on a group to move it' : `${groups.length} groups`}</span></div>
      <div className="hd-group-grid">{groups.map((g, index) => <button key={g.id} {...dropProps(g.id)} className={`hd-group-card${dropTarget === g.id ? ' hd-drop-active' : ''}`} style={{ '--hd-reveal-delay': `${Math.min(index, 8) * 24}ms` } as CSSProperties} type="button" onClick={() => { setGroupId(g.id); setQuery(''); }}>
        <span className="hd-group-icon"><Icons.folder /></span><span className="hd-card-copy"><span className="name">{g.name}</span><span className="sub">{hosts.filter((h) => h.groupId === g.id).length} hosts</span></span><Icons.chevron />
      </button>)}</div>
    </section>}
    {draggedId && <div {...dropProps(null)} className={`hd-host-drop-zone${dropTarget === '__ungrouped__' ? ' hd-drop-active' : ''}`} data-testid="ungrouped-drop-target"><Icons.folder />Move to ungrouped hosts</div>}
    <section aria-label={group ? group.name : 'Hosts'}>
      <div className="hd-section-head hd-hosts-heading">
        {group && <button className="hd-icon-btn hd-back" type="button" aria-label="Back to all hosts" onClick={() => { setGroupId(null); setQuery(''); }}><Icons.back /></button>}
        <h2>{group?.name ?? 'Hosts'}</h2><span>{visible.length} hosts</span>
        {!group && <label className="hd-hide-grouped"><input type="checkbox" checked={hideGroupedHosts} onChange={(e) => onHideGroupedHosts(e.target.checked)} />Hide grouped hosts</label>}
      </div>
      {visible.length === 0 ? <div className="hd-empty" data-testid="hosts-empty">
        <Icons.folder /><h2>{q ? `No hosts match “${query.trim()}”` : group ? 'This group is empty' : hideGroupedHosts ? 'All your hosts are in groups' : 'No hosts yet'}</h2>
        <p>{q ? 'Try a different name, address, or tag.' : hideGroupedHosts && !group ? 'Open a group above, or show all hosts here.' : 'Add a host to get started.'}</p>
        {q ? <button className="hd-btn" onClick={() => setQuery('')}>Clear search</button> : hideGroupedHosts && !group ? <button className="hd-btn" onClick={() => onHideGroupedHosts(false)}>Show all hosts</button> : <button className="hd-btn primary" onClick={() => onNew(groupId)}>New host</button>}
      </div> : <div className="hd-grid" key={groupId ?? 'all'}>{visible.map((h, index) => <div key={h.id} draggable={!moving} onDragStart={(event) => { event.dataTransfer.setData(dragType, h.id); event.dataTransfer.effectAllowed = 'move'; suppressClickUntil.current = Infinity; dragging.current = h.id; /* Chromium cancels a native drag when the DOM shifts inside dragstart, so the drop targets appear a tick later. */ window.clearTimeout(revealTargets.current); revealTargets.current = window.setTimeout(() => { if (dragging.current === h.id) { setDraggedId(h.id); setMenu(null); } }); }} onDragEnd={() => { dragging.current = null; window.clearTimeout(revealTargets.current); setDraggedId(null); setDropTarget(null); suppressClickUntil.current = Date.now() + 350; }} className={`hd-card hd-host-card${draggedId === h.id ? ' hd-host-dragging' : ''}`} style={{ '--hd-reveal-delay': `${Math.min(index, 10) * 20}ms` } as CSSProperties} data-testid="host-card" data-name={h.name} onContextMenu={(e) => { e.preventDefault(); openMenu(h, e.clientX, e.clientY); }}>
        <button className="hd-host-connect" type="button" aria-label={`Connect to ${h.name}`} onClick={() => { if (Date.now() >= suppressClickUntil.current) onOpenTerminal(h); }}>
          <OsIcon host={h} /><span className="hd-card-copy"><span className="name">{h.name}</span><span className="sub hd-host-address" title={`${h.username}@${h.host}:${h.port}`}>{h.username}@{h.host.includes(':') ? `[${h.host}]` : h.host}{h.port !== 22 ? `:${h.port}` : ''}</span></span>
        </button><button className="hd-icon-btn hd-host-menu" type="button" aria-label={`Actions for ${h.name}`} onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); openMenu(h, r.left, r.bottom); }}><Icons.more /></button>
      </div>)}</div>}
    </section>
    {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    {groupName !== null && <Drawer title="New group" eyebrow="HOSTS" busy={savingGroup} onClose={() => setGroupName(null)} onSubmit={() => void saveGroup()} footer={<><button className="hd-btn" type="button" disabled={savingGroup} onClick={() => setGroupName(null)}>Cancel</button><button className="hd-btn primary" type="submit" disabled={savingGroup || !groupName.trim()}>Create group</button></>}><div className="hd-form"><label>Group name<input className="hd-input" value={groupName} onChange={(event) => setGroupName(event.target.value)} autoFocus /></label><ErrorNotice error={groupError} context="Create group" onDismiss={() => setGroupError('')} /></div></Drawer>}
  </div>;
}
