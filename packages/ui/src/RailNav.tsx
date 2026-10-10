import { Icons } from './icons';

export type RailView = 'hosts' | 'keys' | 'snippets' | 'settings';

interface Props {
  view: RailView;
  onView: (v: RailView) => void;
}

const ITEMS: Array<{ id: RailView | 'portforward' | 'known' | 'history'; label: string; icon: () => React.JSX.Element; soon?: boolean }> = [
  { id: 'hosts', label: 'Hosts', icon: Icons.hosts },
  { id: 'keys', label: 'Keychain', icon: Icons.key },
  { id: 'portforward', label: 'Port forwarding', icon: Icons.swap, soon: true },
  { id: 'snippets', label: 'Snippets', icon: Icons.code },
  { id: 'known', label: 'Known Hosts', icon: Icons.target, soon: true },
  { id: 'history', label: 'History', icon: Icons.clock, soon: true },
];

export function RailNav({ view, onView }: Props) {
  return (
    <nav className="hd-rail" aria-label="Sections">
      {ITEMS.map((it) => {
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            type="button"
            className={'hd-rail-item' + (view === it.id ? ' active' : '')}
            disabled={it.soon}
            title={it.soon ? 'Coming after v0.0.1' : it.label}
            onClick={() => !it.soon && onView(it.id as RailView)}
          >
            <span className="ic">
              <Icon />
            </span>
            {it.label}
          </button>
        );
      })}
      <div className="hd-rail-foot">
        <button
          type="button"
          className={'hd-rail-item' + (view === 'settings' ? ' active' : '')}
          onClick={() => onView('settings')}
        >
          <span className="ic">
            <Icons.gear />
          </span>
          Settings
        </button>
      </div>
    </nav>
  );
}
