import type { ReactNode } from 'react';
import { RailNav } from './RailNav';
import type { RailView } from './RailNav';
import { TopTabs } from './TopTabs';
import type { Tab } from './TopTabs';

interface Props {
  theme: 'dark' | 'light';
  railView: RailView;
  onRailView: (v: RailView) => void;
  tabs: Tab[];
  activeTab: number;
  onPickTab: (i: number) => void;
  onCloseSession: (hostId: string) => void;
  status: ReactNode;
  children: ReactNode;
}

export function AppShell({ theme, railView, onRailView, tabs, activeTab, onPickTab, onCloseSession, status, children }: Props) {
  return (
    <div className="hd-app" data-theme={theme}>
      <RailNav view={railView} onView={onRailView} />
      <TopTabs tabs={tabs} active={activeTab} onPick={onPickTab} onCloseSession={onCloseSession} />
      <main className="hd-main">{children}</main>
      <footer className="hd-status">{status}</footer>
    </div>
  );
}
