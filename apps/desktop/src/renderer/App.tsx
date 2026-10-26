import { useEffect, useRef, useState } from 'react';
import type { Host, HostGroup, KeyRef, Snippet } from '@hopdock/core';
import {
  AppShell,
  AuthScreen,
  AccountDrawer,
  HostForm,
  HostsView,
  KeychainView,
  SettingsView,
  SnippetsView,
  SftpView,
  TerminalView,
  TextPrompt,
  ErrorNotifications,
  ContextMenu,
  notifyError,
  confirmAction,
  launchHostId,
  terminalSessionId,
} from '@hopdock/ui';
import type { HostDraft, RailView, Tab, AccountStatus, MenuItem, ThemePreference } from '@hopdock/ui';
import '@hopdock/ui/tokens.css';
import { buildVersion, buildCommit } from '../build-info';

export function App() {
  // "system" (the default) follows the Windows or macOS appearance and switches live with it.
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => { const saved = localStorage.getItem('hopdock.theme'); return saved === 'light' || saved === 'dark' ? saved : 'system'; });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const theme = themePreference === 'system' ? (systemDark ? 'dark' : 'light') : themePreference;
  const setTheme = setThemePreference;
  const [hideGroupedHosts, setHideGroupedHosts] = useState(() => localStorage.getItem('hopdock.hideGroupedHosts') === 'true');
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => !!launchHostId || localStorage.getItem('hopdock.welcomeDismissed') === 'true');
  useEffect(() => { if (welcomeDismissed) localStorage.setItem('hopdock.welcomeDismissed', 'true'); }, [welcomeDismissed]);
  useEffect(() => {
    const stop = window.hopdock.auth.onStatus((next) => { setAccount(next); if (next.signedIn) setWelcomeDismissed(true); });
    void Promise.all([window.hopdock.auth.status(), window.hopdock.vault.get()]).then(([next, library]) => {
      setAccount(next);
      if (next.signedIn || library.hosts.length || library.keys.length || library.snippets.length) setWelcomeDismissed(true);
    }).catch((error) => { setAccount({ signedIn: false, email: null, backendConfigured: false }); notifyError(error, 'Load account'); });
    return stop;
  }, []);
  useEffect(() => { localStorage.setItem('hopdock.theme', themePreference); }, [themePreference]);
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
  const [hostsReset, setHostsReset] = useState(0);
  useEffect(() => window.hopdock.vault.onHostUpdated((host) => {
    setHosts((previous) => previous.map((item) => item.id === host.id ? host : item));
    setTabs((previous) => previous.map((tab) => tab.kind === 'session' && tab.host.id === host.id ? { ...tab, host } : tab));
  }), []);
  const [form, setForm] = useState<{ open: boolean; initial?: Host | null; groupId?: string | null }>({ open: false });
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [winSCP, setWinSCP] = useState(false);
  useEffect(() => { void window.hopdock.winscp.status().then((status) => setWinSCP(status.supported)).catch(() => setWinSCP(false)); }, []);
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
      setSyncLine(s.syncing ? 'syncing…' : s.lastError ? 'sync: needs attention' : s.configured && s.passwordsConfigured ? 'sync: automatic' : 'sync: not configured');
    } catch (error) {
      notifyError(error, 'Load library');
    }
  };

  useEffect(() => {
    void reload();
    const stopVault = window.hopdock.sync.onVaultUpdated(() => void reload());
    const stopStatus = window.hopdock.sync.onStatus((s) => {
      setSyncLine(s.syncing ? 'syncing…' : s.lastError ? 'sync: needs attention' : s.configured && s.passwordsConfigured ? 'sync: automatic' : 'sync: not configured');
    });
    return () => { stopVault(); stopStatus(); };
  }, []);

  /** Opens or focuses the host's tab; `reconnect` restarts its session (after the host was edited). */
  const openTerminal = (h: Host, reconnect = false) => {
    setTabs((prev) => {
      const i = prev.findIndex((t) => t.kind === 'session' && t.host.id === h.id);
      if (i >= 0) {
        setActiveTab(i);
        return prev.map((t) => (t.kind === 'session' && t.host.id === h.id ? { kind: 'session', host: h, connection: (t.connection ?? 0) + (reconnect ? 1 : 0) } : t));
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

  const closeTabs = (closing: Tab[]) => {
    if (closing.length === 0) return;
    for (const t of closing) if (t.kind === 'session') void window.hopdock.ssh.close(terminalSessionId(t.host.id, t.instance)).catch((error) => notifyError(error, 'Close connection'));
    const current = tabs[activeTab];
    const next = tabs.filter((t) => !closing.includes(t));
    const kept = current ? next.indexOf(current) : -1;
    setTabs(next.length > 0 ? next : [{ kind: 'vaults' }]);
    setActiveTab(kept >= 0 ? kept : Math.max(0, Math.min(activeTab - 1, next.length - 1)));
  };
  const closeTab = (tab: Tab | undefined) => { if (tab) closeTabs([tab]); };
  const closeHostSessions = (hostId: string) => closeTabs(tabs.filter((t) => t.kind === 'session' && t.host.id === hostId));

  /** Opens another tab with its own SSH session to the same host, right after the original. */
  const duplicateSession = (index: number) => {
    const source = tabs[index];
    if (source?.kind !== 'session') return;
    const instance = Math.max(...tabs.map((t) => t.kind === 'session' && t.host.id === source.host.id ? t.instance ?? 1 : 0)) + 1;
    setTabs([...tabs.slice(0, index + 1), { kind: 'session', host: source.host, instance }, ...tabs.slice(index + 1)]);
    setActiveTab(index + 1);
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
    openTerminal(saved, true);
  };

  const deleteHost = async (h: Host) => {
    if (!await confirmAction(`Delete ${h.name}?`, 'The saved host and its password will be removed.')) return;
    try { await window.hopdock.vault.deleteHost(h.id); closeHostSessions(h.id); await reload(); }
    catch (error) { notifyError(error, 'Delete host'); }
  };

  // A window opened from a tab starts on that host's session.
  const launched = useRef(false);
  useEffect(() => {
    if (!launchHostId || launched.current) return;
    const host = hosts.find((h) => h.id === launchHostId);
    if (!host) return;
    launched.current = true;
    document.title = `${host.name} — Hopdock`;
    openTerminal(host);
  }, [hosts]);

  const openWinSCP = (h: Host) => {
    const open = () => { void window.hopdock.winscp.open(h.id).catch((error) => notifyError(error, 'Open WinSCP', open)); };
    open();
  };
  const showTabMenu = (index: number, x: number, y: number) => {
    const tab = tabs[index];
    if (tab?.kind !== 'session') return;
    const h = tab.host;
    setTabMenu({ x, y, items: [
    { label: 'Duplicate session', onClick: () => duplicateSession(index) },
    ...(winSCP ? [{ label: 'Open in WinSCP', onClick: () => openWinSCP(h) }] : []),
    { label: 'Open in new window', onClick: () => { void window.hopdock.windows.openSession(h.id).catch((error) => notifyError(error, 'Open window')); } },
    { label: 'Open SFTP', onClick: () => openSftp(h) },
    { label: 'Edit host', onClick: () => setForm({ open: true, initial: hosts.find((item) => item.id === h.id) ?? h }) },
    { label: 'Close tab', onClick: () => closeTab(tab) },
    ] });
  };

  const tab = tabs[activeTab] ?? { kind: 'vaults' as const };
  const sftpHost = tab.kind === 'sftp' ? hosts.find((h) => h.id === tab.hostId) ?? null : null;
  const openSyncSettings = () => { setAccountOpen(false); setRail('settings'); setActiveTab(0); };
  const signedIn = (next: AccountStatus) => {
    setAccount(next); setWelcomeDismissed(true); setAccountOpen(false);
    void window.hopdock.sync.status().then((status) => { if (!status.passwordsConfigured) openSyncSettings(); }).catch((error) => notifyError(error, 'Load sync settings'));
    void reload();
  };
  if (!account) return <div className="hd-app hd-auth-screen" data-theme={theme}><div className="hd-auth-loading" role="status">Loading Hopdock…</div></div>;
  if (!welcomeDismissed && !account.signedIn) return <AuthScreen account={account} theme={theme} onTheme={setTheme} onSignedIn={signedIn} onOffline={() => setWelcomeDismissed(true)} version={`hopdock ${buildVersion} (${buildCommit})`} />;

  return (
    <AppShell
      theme={theme}
      themePreference={themePreference}
      onTheme={setTheme}
      railView={rail}
      accountEmail={account.signedIn ? account.email : null}
      onAccount={() => setAccountOpen(true)}
      onRailView={(v) => {
        if (v === 'hosts') setHostsReset((n) => n + 1);
        setRail(v);
        setActiveTab(0);
      }}
      tabs={tabs}
      activeTab={activeTab}
      onPickTab={(index) => { if (tabs[index]?.kind === 'vaults') setHostsReset((n) => n + 1); setActiveTab(index); }}
      onCloseSession={(index) => closeTab(tabs[index])}
      onTabMenu={showTabMenu}
      snippetsOpen={snippetsOpen}
      onToggleSnippets={() => setSnippetsOpen((value) => !value)}
      status={
        <>
          <span>hopdock {buildVersion} <span className="hd-commit" title="Git commit used for this build">{buildCommit}</span></span>
          <span>{syncLine}</span>
          {updateReady !== null && <button className="hd-status-update" onClick={async () => { if (await confirmAction('Update ready', `Hopdock ${updateReady} is ready. Restarting will close active connections.`, 'Restart now', false)) await window.hopdock.updater.install(); }} type="button">Restart to update</button>}
        </>
      }
    >
      {tabs.map((t, i) => t.kind === 'session' && <TerminalView key={`${t.host.id}#${t.instance ?? 1}:${t.connection ?? 0}`} host={t.host} instance={t.instance} active={i === activeTab} snippets={snippets} snippetsOpen={snippetsOpen} onHideSnippets={() => setSnippetsOpen(false)} onChanged={() => void reload()} onEditHost={() => setForm({ open: true, initial: hosts.find((item) => item.id === t.host.id) ?? t.host })} onCloseTab={() => closeTab(t)} />)}
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
          resetSignal={hostsReset}
          onDelete={(h) => void deleteHost(h)}
        />
      )}
      {tab.kind === 'vaults' && rail === 'keys' && <KeychainView keys={keys} hosts={hosts} onChanged={() => void reload()} />}
      {tab.kind === 'vaults' && rail === 'snippets' && <SnippetsView snippets={snippets} hosts={hosts} onChanged={() => void reload()} />}
      {tab.kind === 'vaults' && rail === 'settings' && <SettingsView hideGroupedHosts={hideGroupedHosts} onHideGroupedHosts={setHideGroupedHosts} onSynced={reload} account={account} onAccount={() => setAccountOpen(true)} />}
      {accountOpen && <AccountDrawer account={account} onSignedIn={signedIn} onSignedOut={(next) => { setAccount(next); setAccountOpen(false); void reload(); }} onClose={() => setAccountOpen(false)} onSyncSettings={openSyncSettings} />}
      {form.open && <HostForm initial={form.initial} keys={keys} groups={groups} defaultGroupId={form.groupId} onChanged={() => void reload()} onSave={saveHost} onClose={() => setForm({ open: false })} />}
      {tabMenu && <ContextMenu x={tabMenu.x} y={tabMenu.y} items={tabMenu.items} onClose={() => setTabMenu(null)} />}
      <TextPrompt />
      <ErrorNotifications />
    </AppShell>
  );
}
