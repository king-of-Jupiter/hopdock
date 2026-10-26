import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IconMenu2, IconBraces } from '@tabler/icons-react';
import { RailNav } from './RailNav';
import type { RailView, ThemePreference } from './RailNav';
import { TopTabs } from './TopTabs';
import type { Tab } from './TopTabs';

interface Props {
  theme: 'dark' | 'light';
  themePreference?: ThemePreference;
  onTheme: (theme: ThemePreference) => void;
  railView: RailView;
  onRailView: (v: RailView) => void;
  tabs: Tab[];
  activeTab: number;
  onPickTab: (i: number) => void;
  onCloseSession: (index: number) => void;
  onTabMenu?: (index: number, x: number, y: number) => void;
  status: ReactNode;
  children: ReactNode;
  snippetsOpen: boolean;
  accountEmail?: string | null;
  onAccount?: () => void;
  onToggleSnippets: () => void;
}

export function AppShell({ theme, themePreference = theme, onTheme, railView, onRailView, tabs, activeTab, onPickTab, onCloseSession, onTabMenu, status, children, snippetsOpen, onToggleSnippets, accountEmail, onAccount }: Props) {
  const terminal = tabs[activeTab]?.kind === 'session';
  const [navigation, setNavigation] = useState(false);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    if (terminal || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const content = Array.from(main.current?.children ?? []).find((child) => !(child as HTMLElement).hidden);
    if (!content) return;
    const animation = content.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'cubic-bezier(.16,1,.3,1)' });
    return () => animation.cancel();
  }, [activeTab, railView, terminal]);
  useEffect(() => { if (!terminal) setNavigation(false); }, [terminal]);
  return (
    <div className={'hd-app' + (terminal ? ' hd-session-layout' : '') + (navigation ? ' hd-navigation-open' : '')} data-theme={theme}>
      <RailNav view={railView} onView={onRailView} theme={themePreference} onTheme={onTheme} accountEmail={accountEmail} onAccount={onAccount} />
      {terminal && navigation && <button className="hd-navigation-backdrop" aria-label="Close navigation" onClick={() => setNavigation(false)} />}
      <TopTabs tabs={tabs} active={activeTab} onPick={onPickTab} onCloseSession={onCloseSession} onTabMenu={onTabMenu} leading={terminal && <button className="hd-icon-btn" type="button" aria-label="Toggle navigation" aria-expanded={navigation} onClick={() => setNavigation((value) => !value)}><IconMenu2 size={20} stroke={1.6} /></button>} trailing={terminal && <button className="hd-icon-btn hd-snippets-toggle" type="button" aria-label="Toggle snippets" title="Snippets" aria-expanded={snippetsOpen} onClick={onToggleSnippets}><IconBraces size={18} stroke={1.6} /></button>} />
      <main ref={main} className="hd-main">{children}</main>
      <footer className="hd-status">{status}</footer>
    </div>
  );
}
