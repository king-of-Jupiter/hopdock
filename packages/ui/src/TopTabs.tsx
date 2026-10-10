import type { Host } from '@hopdock/core';
import { osTile } from './os';

export type Tab =
  | { kind: 'vaults' }
  | { kind: 'sftp'; hostId: string | null }
  | { kind: 'session'; host: Host };

interface Props {
  tabs: Tab[];
  active: number;
  onPick: (i: number) => void;
  onCloseSession: (hostId: string) => void;
}

export function TopTabs({ tabs, active, onPick, onCloseSession }: Props) {
  return (
    <div className="hd-tabs">
      {tabs.map((t, i) => {
        if (t.kind === 'vaults') {
          return (
            <button key="vaults" type="button" className={'hd-pill' + (i === active ? ' active' : '')} onClick={() => onPick(i)}>
              ▣ Vaults
            </button>
          );
        }
        if (t.kind === 'sftp') {
          return (
            <button key="sftp" type="button" className={'hd-pill' + (i === active ? ' active' : '')} onClick={() => onPick(i)}>
              ▤ SFTP
            </button>
          );
        }
        const tile = osTile(t.host);
        return (
          <button key={t.host.id} type="button" className={'hd-pill' + (i === active ? ' active' : '')} onClick={() => onPick(i)}>
            <span className="hd-tile sm" style={{ background: tile.color }}>
              {tile.glyph}
            </span>
            {t.host.name}
            <span
              className="x"
              onClick={(e) => {
                e.stopPropagation();
                onCloseSession(t.host.id);
              }}
            >
              ×
            </span>
          </button>
        );
      })}
    </div>
  );
}
