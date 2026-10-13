import type { Host } from '@hopdock/core';
import type { ReactNode } from 'react';
import { OsIcon } from './OsIcon';
import { Icons } from './icons';

export type Tab =
  | { kind: 'vaults' }
  | { kind: 'sftp'; hostId: string | null }
  | { kind: 'session'; host: Host };

interface Props {
  tabs: Tab[];
  active: number;
  onPick: (i: number) => void;
  onCloseSession: (hostId: string) => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function TopTabs({ tabs, active, onPick, onCloseSession, leading, trailing }: Props) {
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
          <div key={t.host.id} className={'hd-pill hd-session-pill' + (i === active ? ' active' : '')}>
            <button className="hd-tab-select" type="button" onClick={() => onPick(i)}><OsIcon host={t.host} small />{t.host.name}</button>
            <button type="button" aria-label={`Close ${t.host.name}`}
              className="x"
              onClick={(e) => {
                e.stopPropagation();
                onCloseSession(t.host.id);
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
