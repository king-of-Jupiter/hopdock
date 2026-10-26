import type { Host } from '@hopdock/core';
import type { ReactNode } from 'react';
import { OsIcon } from './OsIcon';
import { Icons } from './icons';

export type Tab =
  | { kind: 'vaults' }
  | { kind: 'sftp'; hostId: string | null }
  | { kind: 'session'; host: Host; connection?: number; instance?: number };

export function sessionTabLabel(tab: { host: Host; instance?: number }): string {
  return (tab.instance ?? 1) > 1 ? `${tab.host.name} (${tab.instance})` : tab.host.name;
}

interface Props {
  tabs: Tab[];
  active: number;
  onPick: (i: number) => void;
  onCloseSession: (index: number) => void;
  onTabMenu?: (index: number, x: number, y: number) => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function TopTabs({ tabs, active, onPick, onCloseSession, onTabMenu, leading, trailing }: Props) {
  return (
    <div className="hd-tabs">
      {leading}
      {tabs.map((t, i) => {
        if (t.kind === 'vaults') {
          return (
            <button key="vaults" type="button" className={'hd-pill' + (i === active ? ' active' : '')} onClick={() => onPick(i)}>
              <Icons.hosts /> Vaults
            </button>
          );
        }
        if (t.kind === 'sftp') {
          return (
            <button key="sftp" type="button" className={'hd-pill' + (i === active ? ' active' : '')} onClick={() => onPick(i)}>
              <Icons.folder /> SFTP
            </button>
          );
        }
        return (
          <div key={`${t.host.id}#${t.instance ?? 1}`} className={'hd-pill hd-session-pill' + (i === active ? ' active' : '')} onContextMenu={(e) => { if (!onTabMenu) return; e.preventDefault(); onPick(i); onTabMenu(i, e.clientX, e.clientY); }}>
            <button className="hd-tab-select" type="button" onClick={() => onPick(i)}><OsIcon host={t.host} small />{sessionTabLabel(t)}</button>
            <button type="button" aria-label={`Close ${sessionTabLabel(t)}`}
              className="x"
              onClick={(e) => {
                e.stopPropagation();
                onCloseSession(i);
              }}
            >
              <Icons.close />
            </button>
          </div>
        );
      })}
      {trailing}
    </div>
  );
}
