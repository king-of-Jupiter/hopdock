import { Icons } from './icons';
import { IconUserCircle } from '@tabler/icons-react';

export type RailView = 'hosts' | 'keys' | 'snippets' | 'settings';
export type ThemePreference = 'system' | 'light' | 'dark';

interface Props {
  view: RailView;
  onView: (v: RailView) => void;
  theme: ThemePreference;
  onTheme: (theme: ThemePreference) => void;
  accountEmail?: string | null;
  onAccount?: () => void;
}

const ITEMS: Array<{ id: RailView | 'portforward' | 'known' | 'history'; label: string; icon: () => React.JSX.Element; soon?: boolean }> = [
  { id: 'hosts', label: 'Hosts', icon: Icons.hosts },
  { id: 'keys', label: 'Keychain', icon: Icons.key },
  { id: 'portforward', label: 'Port forwarding', icon: Icons.swap, soon: true },
  { id: 'snippets', label: 'Snippets', icon: Icons.code },
  { id: 'known', label: 'Known Hosts', icon: Icons.target, soon: true },
  { id: 'history', label: 'History', icon: Icons.clock, soon: true },
];

export function RailNav({ view, onView, theme, onTheme, accountEmail, onAccount }: Props) {
  return (
    <nav className="hd-rail" aria-label="Sections">
      <div className="hd-brand"><img className="hd-brand-mark" src={new URL('./assets/hopdock-mark.svg', import.meta.url).href} alt="" aria-hidden="true" /><span>Hopdock</span></div>
      {ITEMS.filter((it) => !it.soon).map((it) => {
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
        {onAccount && <button className="hd-rail-item hd-account-nav" type="button" onClick={onAccount} title={accountEmail ?? 'Sign in'}><span className="ic"><IconUserCircle size={20} stroke={1.5} /></span><span><strong>{accountEmail ? 'Account' : 'Sign in'}</strong><small>{accountEmail ?? 'Sync your library'}</small></span></button>}
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
      <div className="hd-theme-switch" aria-label="Color theme">
        <button type="button" aria-pressed={theme === 'light'} onClick={() => onTheme('light')}><Icons.sun />Light</button>
        <button type="button" aria-pressed={theme === 'dark'} onClick={() => onTheme('dark')}><Icons.moon />Dark</button>
        <button type="button" className="hd-theme-system" aria-pressed={theme === 'system'} title="Follow the light or dark appearance of your system" onClick={() => onTheme('system')}><Icons.monitor />System</button>
      </div>
    </nav>
  );
}
