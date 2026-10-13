import { useEffect, useState } from 'react';
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
  TextPrompt,
  ErrorNotifications,
  notifyError,
  confirmAction,
} from '@hopdock/ui';
import type { HostDraft, RailView, Tab } from '@hopdock/ui';
import '@hopdock/ui/tokens.css';
import { buildVersion, buildCommit } from '../build-info';

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('hopdock.theme') === 'dark' ? 'dark' : 'light');
  const [hideGroupedHosts, setHideGroupedHosts] = useState(() => localStorage.getItem('hopdock.hideGroupedHosts') === 'true');
  useEffect(() => { localStorage.setItem('hopdock.theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('hopdock.hideGroupedHosts', String(hideGroupedHosts)); }, [hideGroupedHosts]);
  useEffect(() => {
    const navigate = (event: Event) => { const view = (event as CustomEvent).detail; if (view === 'keys' || view === 'hosts' || view === 'settings') { setRail(view); setActiveTab(0); } };
    window.addEventListener('hopdock:navigate', navigate);
    const rejected = (event: PromiseRejectionEvent) => { event.preventDefault(); notifyError(event.reason, 'Background operation'); };
    window.addEventListener('unhandledrejection', rejected);
    return () => { window.removeEventListener('hopdock:navigate', navigate); window.removeEventListener('unhandledrejection', rejected); };
  }, []);
  useEffect(() => {
    const keepModalFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const modal = Array.from(document.querySelectorAll<HTMLElement>('.hd-overlay > .hd-modal')).at(-1);
      if (!modal) return;
      const controls = Array.from(modal.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
      const first = controls[0], last = controls.at(-1);
      if (!first || !last) return;
      if (!modal.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    };
    document.addEventListener('keydown', keepModalFocus);
    return () => document.removeEventListener('keydown', keepModalFocus);
  }, []);
  const [rail, setRail] = useState<RailView>('hosts');
  const [hosts, setHosts] = useState<Host[]>([]);
  const [groups, setGroups] = useState<HostGroup[]>([]);
  const [keys, setKeys] = useState<KeyRef[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [snippetsOpen, setSnippetsOpen] = useState(() => window.innerWidth >= 900);
  const [tabs, setTabs] = useState<Tab[]>([{ kind: 'vaults' }]);
  const [activeTab, setActiveTab] = useState(0);
  useEffect(() => window.hopdock.vault.onHostUpdated((host) => {
    setHosts((previous) => previous.map((item) => item.id === host.id ? host : item));
    setTabs((previous) => previous.map((tab) => tab.kind === 'session' && tab.host.id === host.id ? { ...tab, host } : tab));
  }), []);
  const [form, setForm] = useState<{ open: boolean; initial?: Host | null; groupId?: string | null }>({ open: false });
  const [syncLine, setSyncLine] = useState('sync: not configured');
  const [updateReady, setUpdateReady] = useState<string | null>(null);
  useEffect(() => {
    const apply = (status: import('@hopdock/ui').UpdateStatus) => {
    if (status.state === 'downloaded') setUpdateReady(status.version ?? '');
    if (status.state === 'error' && !document.querySelector('.hd-settings')) notifyError(status.message || 'Update failed', 'Check updates');
    };
    const stop = window.hopdock.updater.onStatus(apply);
    void window.hopdock.updater.status().then(apply).catch((error) => notifyError(error, 'Load update status'));
    return stop;
  }, []);

  const reload = async () => {
    try {
      const v = await window.hopdock.vault.get();
      setHosts(v.hosts);
      setGroups(v.groups);
      setKeys(v.keys);
      setSnippets(v.snippets);
      const s = await window.hopdock.sync.status();
      setSyncLine(s.configured ? `sync: last ${s.lastSyncAt}` : 'sync: not configured');
    } catch (error) {
      notifyError(error, 'Load library');
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
    void window.hopdock.ssh.close(hostId).catch((error) => notifyError(error, 'Close connection'));
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
        auth: { type: d.auth, keyId: d.keyId },
        tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean),
        password: d.password,
        groupId: d.groupId,
      },
      id,
    );
    setForm({ open: false });
    await reload();
    openTerminal(saved);
  };

  const deleteHost = async (h: Host) => {
    if (!await confirmAction(`Delete ${h.name}?`, 'The saved host and its password will be removed.')) return;
    try { await window.hopdock.vault.deleteHost(h.id); closeSession(h.id); await reload(); }
    catch (error) { notifyError(error, 'Delete host'); }
  };

  const tab = tabs[activeTab] ?? { kind: 'vaults' as const };
  const sftpHost = tab.kind === 'sftp' ? hosts.find((h) => h.id === tab.hostId) ?? null : null;

  return (
    <AppShell
      theme={theme}
      onTheme={setTheme}
      railView={rail}
      onRailView={(v) => {
        setRail(v);
        setActiveTab(0);
      }}
      tabs={tabs}
      activeTab={activeTab}
      onPickTab={setActiveTab}
      onCloseSession={closeSession}
      snippetsOpen={snippetsOpen}
      onToggleSnippets={() => setSnippetsOpen((value) => !value)}
      status={
        <>
          <span>hopdock {buildVersion} <span className="hd-commit" title="Git commit used for this build">· {buildCommit}</span></span>
          <span>{syncLine}</span>
          {updateReady !== null && <button className="hd-status-update" onClick={async () => { if (await confirmAction('Update ready', `Hopdock ${updateReady} is ready. Restarting will close active connections.`, 'Restart now', false)) await window.hopdock.updater.install(); }}>Update ready · Restart</button>}
        </>
      }
    >
      {tab.kind === 'session' && <TerminalView key={tab.host.id} host={tab.host} snippets={snippets} snippetsOpen={snippetsOpen} onHideSnippets={() => setSnippetsOpen(false)} onChanged={() => void reload()} />}
      {tab.kind === 'sftp' && <SftpView host={sftpHost} />}
      {tab.kind === 'vaults' && rail === 'hosts' && (
        <HostsView
          groups={groups}
          hosts={hosts}
          hideGroupedHosts={hideGroupedHosts}
          onHideGroupedHosts={setHideGroupedHosts}
          onOpenTerminal={openTerminal}
          onOpenSftp={openSftp}
          onNew={(groupId) => setForm({ open: true, groupId })}
          onChanged={() => void reload()}
          onEdit={(h) => setForm({ open: true, initial: h })}
          onDelete={(h) => void deleteHost(h)}
        />
      )}
      {tab.kind === 'vaults' && rail === 'keys' && <KeychainView keys={keys} hosts={hosts} onChanged={() => void reload()} />}
      {tab.kind === 'vaults' && rail === 'snippets' && <SnippetsView snippets={snippets} hosts={hosts} onChanged={() => void reload()} />}
      {tab.kind === 'vaults' && rail === 'settings' && <SettingsView hideGroupedHosts={hideGroupedHosts} onHideGroupedHosts={setHideGroupedHosts} onSynced={reload} />}
      {form.open && <HostForm initial={form.initial} keys={keys} groups={groups} defaultGroupId={form.groupId} onChanged={() => void reload()} onSave={saveHost} onClose={() => setForm({ open: false })} />}
      <TextPrompt />
      <ErrorNotifications />
    </AppShell>
  );
}
