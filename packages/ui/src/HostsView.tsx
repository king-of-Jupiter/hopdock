import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
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
}
export function HostsView({ groups, hosts, hideGroupedHosts, onHideGroupedHosts, onOpenTerminal, onOpenSftp, onNew, onEdit, onDelete, onChanged }: Props) {
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
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [winSCP, setWinSCP] = useState(false);
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
  return <div className="hd-hosts">
    <div className="hd-search"><Icons.search /><input aria-label="Search hosts" data-testid="host-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search hosts, tags, or addresses…" /></div>
    <div className="hd-toolbar hd-host-toolbar"><div className="hd-new-host-split"><button className="hd-btn primary" type="button" onClick={() => onNew(groupId)}><Icons.plus />New host</button><button className="hd-btn primary" type="button" aria-label="New host options" aria-expanded={!!menu?.items.some((item) => item.label === 'New group')} onClick={(event) => { event.stopPropagation(); if (menu?.items.some((item) => item.label === 'New group')) setMenu(null); else { const rect = event.currentTarget.getBoundingClientRect(); setMenu({ x: rect.left, y: rect.bottom + 6, items: [{ label: 'New group', onClick: () => { setGroupError(''); setGroupName(''); } }] }); } }}><IconChevronDown size={15} /></button></div></div>
    {!group && <section aria-label="Groups">
      <div className="hd-section-head"><h2>Groups</h2><span>{groups.length} groups</span></div>
      <div className="hd-group-grid">{groups.map((g, index) => <button key={g.id} className="hd-group-card" style={{ '--hd-reveal-delay': `${Math.min(index, 8) * 24}ms` } as CSSProperties} type="button" onClick={() => { setGroupId(g.id); setQuery(''); }}>
        <span className="hd-group-icon"><Icons.folder /></span><span className="hd-card-copy"><span className="name">{g.name}</span><span className="sub">{hosts.filter((h) => h.groupId === g.id).length} hosts</span></span><Icons.chevron />
      </button>)}</div>
    </section>}
    <section aria-label={group ? group.name : 'Hosts'}>
      <div className="hd-section-head hd-hosts-heading">
        {group && <button className="hd-icon-btn" aria-label="Back to all hosts" onClick={() => { setGroupId(null); setQuery(''); }}><Icons.back /></button>}
        <h2>{group?.name ?? 'Hosts'}</h2><span>{visible.length} hosts</span>
        {!group && <label className="hd-hide-grouped"><input type="checkbox" checked={hideGroupedHosts} onChange={(e) => onHideGroupedHosts(e.target.checked)} />Hide grouped hosts</label>}
      </div>
      {visible.length === 0 ? <div className="hd-empty" data-testid="hosts-empty">
        <Icons.folder /><h2>{q ? `No hosts match “${query.trim()}”` : group ? 'This group is empty' : hideGroupedHosts ? 'All your hosts are in groups' : 'No hosts yet'}</h2>
        <p>{q ? 'Try a different name, address, or tag.' : hideGroupedHosts && !group ? 'Open a group above, or show all hosts here.' : 'Add a host to get started.'}</p>
        {q ? <button className="hd-btn" onClick={() => setQuery('')}>Clear search</button> : hideGroupedHosts && !group ? <button className="hd-btn" onClick={() => onHideGroupedHosts(false)}>Show all hosts</button> : <button className="hd-btn primary" onClick={() => onNew(groupId)}>New host</button>}
      </div> : <div className="hd-grid" key={groupId ?? 'all'}>{visible.map((h, index) => <div key={h.id} className="hd-card hd-host-card" style={{ '--hd-reveal-delay': `${Math.min(index, 10) * 20}ms` } as CSSProperties} data-testid="host-card" data-name={h.name} onContextMenu={(e) => { e.preventDefault(); openMenu(h, e.clientX, e.clientY); }}>
        <button className="hd-host-connect" type="button" aria-label={`Connect to ${h.name}`} onClick={() => onOpenTerminal(h)}>
          <OsIcon host={h} /><span className="hd-card-copy"><span className="name">{h.name}</span><span className="sub hd-host-address" title={`${h.username}@${h.host}:${h.port}`}>{h.username}@{h.host.includes(':') ? `[${h.host}]` : h.host}{h.port !== 22 ? `:${h.port}` : ''}</span></span>
        </button><button className="hd-icon-btn hd-host-menu" type="button" aria-label={`Actions for ${h.name}`} onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); openMenu(h, r.left, r.bottom); }}><Icons.more /></button>
      </div>)}</div>}
    </section>
    {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    {groupName !== null && <Drawer title="New group" eyebrow="HOSTS" busy={savingGroup} onClose={() => setGroupName(null)} onSubmit={() => void saveGroup()} footer={<><button className="hd-btn" type="button" disabled={savingGroup} onClick={() => setGroupName(null)}>Cancel</button><button className="hd-btn primary" type="submit" disabled={savingGroup || !groupName.trim()}>Create group</button></>}><div className="hd-form"><label>Group name<input className="hd-input" value={groupName} onChange={(event) => setGroupName(event.target.value)} autoFocus /></label><ErrorNotice error={groupError} context="Create group" onDismiss={() => setGroupError('')} /></div></Drawer>}
  </div>;
}
