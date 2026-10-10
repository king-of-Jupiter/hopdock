export type RailView = 'hosts' | 'keys' | 'snippets' | 'settings';

interface Props {
  view: RailView;
  onView: (v: RailView) => void;
}

const ITEMS: Array<{ id: RailView | 'portforward' | 'known' | 'history'; label: string; icon: string; soon?: boolean }> = [
  { id: 'hosts', label: 'Hosts', icon: '▦' },
  { id: 'keys', label: 'Keychain', icon: '⚿' },
  { id: 'portforward', label: 'Port forwarding', icon: '⇄', soon: true },
  { id: 'snippets', label: 'Snippets', icon: '{ }' },
  { id: 'known', label: 'Known Hosts', icon: '◉', soon: true },
  { id: 'history', label: 'History', icon: '◷', soon: true },
];

export function RailNav({ view, onView }: Props) {
  return (
    <nav className="hd-rail">
      {ITEMS.map((it) => (
        <button
          key={it.id}
          type="button"
          className={'hd-rail-item' + (view === it.id ? ' active' : '')}
          disabled={it.soon}
          title={it.soon ? 'Coming after v0.0.1' : it.label}
          onClick={() => !it.soon && onView(it.id as RailView)}
        >
          <span className="ic">{it.icon}</span>
          {it.label}
        </button>
      ))}
      <div className="hd-rail-foot">
        <button
          type="button"
          className={'hd-rail-item' + (view === 'settings' ? ' active' : '')}
          onClick={() => onView('settings')}
        >
          <span className="ic">⚙</span>
          Settings
        </button>
      </div>
    </nav>
  );
}
