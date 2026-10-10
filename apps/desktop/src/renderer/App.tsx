import { useEffect, useState } from 'react';
import { mockGroups, mockHosts, mockKeys, mockSnippets } from '@hopdock/core';
import type { Host, HostGroup, KeyRef, Snippet } from '@hopdock/core';
import {
  AppShell,
  HostForm,
  HostsView,
  KeychainView,
  SettingsView,
  SnippetsView,
  SftpView,
  TerminalView,
} from '@hopdock/ui';
import type { HostDraft, RailView, Tab } from '@hopdock/ui';
import '@hopdock/ui/tokens.css';

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [rail, setRail] = useState<RailView>('hosts');
  const [hosts, setHosts] = useState<Host[]>(mockHosts);
  const [groups] = useState<HostGroup[]>(mockGroups);
  const [keys, setKeys] = useState<KeyRef[]>(mockKeys);
  const [snippets, setSnippets] = useState<Snippet[]>(mockSnippets);
  const [tabs, setTabs] = useState<Tab[]>([{ kind: 'vaults' }]);
  const [activeTab, setActiveTab] = useState(0);
  const [form, setForm] = useState<{ open: boolean; initial?: Host | null }>({ open: false });
  const [syncLine, setSyncLine] = useState('sync: not configured');

  const reload = async () => {
    try {
      const v = await window.hopdock.vault.get();
      setHosts(v.hosts);
      setKeys(v.keys);
      setSnippets(v.snippets);
      const s = await window.hopdock.sync.status();
      setSyncLine(s.configured ? `sync: last ${s.lastSyncAt}` : 'sync: not configured');
    } catch {
      /* preload unavailable (should not happen under Electron) */
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const openTerminal = (h: Host) => {
    setTabs((prev) => {
      const i = prev.findIndex((t) => t.kind === 'session' && t.host.id === h.id);
      if (i >= 0) {
        setActiveTab(i);
        return prev.map((t) => (t.kind === 'session' && t.host.id === h.id ? { kind: 'session', host: h } : t));
      }
      setActiveTab(prev.length);
      return [...prev, { kind: 'session', host: h }];
    });
  };

  const openSftp = (h: Host) => {
    openTerminal(h);
    setTabs((prev) => {
      const i = prev.findIndex((t) => t.kind === 'sftp');
      const tab: Tab = { kind: 'sftp', hostId: h.id };
      if (i >= 0) {
        const next = [...prev];
        next[i] = tab;
        setActiveTab(i);
        return next;
      }
      setActiveTab(prev.length);
      return [...prev, tab];
    });
  };

  const closeSession = (hostId: string) => {
    void window.hopdock.ssh.close(hostId).catch(() => undefined);
    setTabs((prev) => {
      const next = prev.filter((t) => !(t.kind === 'session' && t.host.id === hostId));
      setActiveTab((a) => Math.min(a, next.length - 1));
      return next.length > 0 ? next : [{ kind: 'vaults' }];
    });
  };

  const saveHost = async (d: HostDraft) => {
    const id = form.initial?.id;
    const saved = await window.hopdock.vault.saveHost(
      {
        name: d.name,
        host: d.host,
        port: d.port,
        username: d.username,
        auth: { type: d.auth },
        tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean),
        password: d.password,
      },
      id,
    );
    setForm({ open: false });
    await reload();
    openTerminal(saved);
  };

  const deleteHost = async (h: Host) => {
    if (!window.confirm(`Delete ${h.name}?`)) return;
    await window.hopdock.vault.deleteHost(h.id);
    closeSession(h.id);
    await reload();
  };

  const tab = tabs[activeTab] ?? { kind: 'vaults' as const };
  const sftpHost = tab.kind === 'sftp' ? hosts.find((h) => h.id === tab.hostId) ?? null : null;

  return (
    <AppShell
      theme={theme}
      railView={rail}
      onRailView={(v) => {
        setRail(v);
        setActiveTab(0);
      }}
      tabs={tabs}
      activeTab={activeTab}
      onPickTab={setActiveTab}
      onCloseSession={closeSession}
      status={
        <>
          <span>hopdock {window.hopdock?.version ?? 'dev'}</span>
          <span>{syncLine}</span>
          <button className="hd-btn" style={{ marginLeft: 'auto' }} type="button" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </>
      }
    >
      {tab.kind === 'session' && <TerminalView key={tab.host.id} host={tab.host} />}
      {tab.kind === 'sftp' && <SftpView host={sftpHost} />}
      {tab.kind === 'vaults' && rail === 'hosts' && (
        <HostsView
          groups={groups}
          hosts={hosts}
          onOpenTerminal={openTerminal}
          onOpenSftp={openSftp}
          onNew={() => setForm({ open: true })}
          onEdit={(h) => setForm({ open: true, initial: h })}
          onDelete={(h) => void deleteHost(h)}
        />
      )}
      {tab.kind === 'vaults' && rail === 'keys' && <KeychainView keys={keys} hosts={hosts} onChanged={() => void reload()} />}
      {tab.kind === 'vaults' && rail === 'snippets' && <SnippetsView snippets={snippets} hosts={hosts} onChanged={() => void reload()} />}
      {tab.kind === 'vaults' && rail === 'settings' && <SettingsView />}
      {form.open && <HostForm initial={form.initial} onSave={(d) => void saveHost(d)} onClose={() => setForm({ open: false })} />}
    </AppShell>
  );
}
