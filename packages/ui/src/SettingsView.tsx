import { useEffect, useState } from 'react';
import type { SyncStatus, UpdateStatus, TermiusImportResult, AccountStatus } from './preload-api';
import { pickFiles } from './FilePicker';
import { ErrorNotice, notifyError } from './ErrorNotice';
import { IconDownload } from '@tabler/icons-react';

export function SettingsView({ hideGroupedHosts, onHideGroupedHosts, onSynced, account, onAccount }: { hideGroupedHosts: boolean; onHideGroupedHosts: (value: boolean) => void; onSynced?: () => Promise<void>; account?: AccountStatus; onAccount?: () => void }) {
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' });
  const [msg, setMsg] = useState('');
  const [syncError, setSyncError] = useState('');
  const [busy, setBusy] = useState(false);
  const [winSCP, setWinSCP] = useState<{ supported: boolean; path: string | null } | null>(null);
  const [winSCPError, setWinSCPError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<TermiusImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const importTermius = async () => {
    if (importing) return;
    setImporting(true); setImportError('');
    try {
      setImportResult(null);
      setImportResult(await window.hopdock.vault.importTermius());
      await onSynced?.();
    } catch (error) { setImportError(String(error)); }
    finally { setImporting(false); }
  };

  const refresh = async () => {
    try {
      setStatus(await window.hopdock.sync.status());
    } catch (error) {
      setSyncError(String(error));
    }
  };
  useEffect(() => {
    void refresh();
    const stopSync = window.hopdock.sync.onStatus((next) => {
      setStatus(next);
      setSyncError(next.lastError ?? '');
    });
    void window.hopdock.winscp.status().then(setWinSCP).catch((error) => notifyError(error, 'Load WinSCP integration'));
    const apply = (next: UpdateStatus) => setUpdate((previous) => (next.revision ?? 0) >= (previous.revision ?? 0) ? next : previous);
    const stop = window.hopdock.updater.onStatus(apply);
    void window.hopdock.updater.status().then(apply).catch((error) => setUpdate({ state: 'error', message: String(error) }));
    return () => { stop(); stopSync(); };
  }, []);

  const syncNow = async () => {
    setBusy(true);
    setMsg(''); setSyncError('');
    try {
      const r = await window.hopdock.sync.syncNow();
      await onSynced?.();
      setMsg(r.pushed || r.pulled ? `Sent ${r.pushed} changed items, received ${r.pulled} changed items.` : 'Everything is synced. No changes.');
      await refresh();
    } catch (e) {
      setSyncError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveEncryptionPassword = async () => {
    setBusy(true);
    setMsg(''); setSyncError('');
    try {
      await window.hopdock.sync.setEncryptionPassword(encryptionPassword);
      setEncryptionPassword('');
      setMsg('Encryption password saved on this device.');
      await refresh();
    } catch (e) { setSyncError(String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="hd-settings">
      <h1 className="hd-page-title">Settings</h1>
      <div className="hd-settings-library-heading"><h2 className="hd-sec">Host library</h2><button className="hd-btn hd-import-button" type="button" disabled={importing || busy} onClick={() => void importTermius()}><IconDownload size={16} stroke={1.6} aria-hidden="true" />{importing ? 'Importing…' : 'Import from Termius'}</button></div>
      {(importResult || importError) && <div>
        {importResult && <div className="hd-import-result" role="status"><strong>Imported</strong><ul className="hd-import-counts"><li>{importResult.hosts} hosts</li><li>{importResult.groups} groups</li><li>{importResult.keys} keys</li><li>{importResult.snippets} snippets</li>{importResult.repaired ? <li>{importResult.repaired} hosts repaired</li> : null}{importResult.skipped > 0 ? <li>{importResult.skipped} skipped or already imported</li> : null}</ul>{importResult.warnings.length > 0 && <details><summary>Import notes ({importResult.warnings.length})</summary><ul>{[...new Set(importResult.warnings)].map((note) => <li key={note}>{note}</li>)}</ul></details>}</div>}
        <ErrorNotice error={importError} context="Import from Termius" onDismiss={() => setImportError('')} />
      </div>}
      <label className="hd-preference">
        <span><strong>Hide grouped hosts</strong><span className="sub">Show only ungrouped hosts in the main list. Open a group to see its hosts.</span></span>
        <input type="checkbox" checked={hideGroupedHosts} onChange={(e) => onHideGroupedHosts(e.target.checked)} />
      </label>
      {winSCP?.supported && <>
        <div className="hd-sec">WinSCP integration</div>
        <div className="hd-card hd-settings-panel">
          <p className="hd-dialog-note">Open a host’s menu and choose “Open in WinSCP” to manage its files with your saved credentials.</p>
          <label className="hd-form">WinSCP executable<input className="hd-input mono" readOnly value={winSCP.path ?? ''} placeholder="WinSCP was not found" /></label>
          <div className="hd-row end"><button className="hd-btn" type="button" onClick={async () => {
            setWinSCPError('');
            try { const paths = await pickFiles('Choose WinSCP.exe'); if (paths?.[0]) { await window.hopdock.winscp.configure(paths[0]); setWinSCP(await window.hopdock.winscp.status()); } }
            catch (error) { setWinSCPError(String(error)); }
          }}>Browse WinSCP</button><button className="hd-btn" type="button" onClick={async () => { try { await window.hopdock.winscp.configure(''); setWinSCP(await window.hopdock.winscp.status()); setWinSCPError(''); } catch (error) { setWinSCPError(String(error)); } }}>Detect automatically</button></div>
          <ErrorNotice error={winSCPError} context="WinSCP configuration" onDismiss={() => setWinSCPError('')} />
        </div>
      </>}
      <div className="hd-sec">Application updates</div>
      <div className="hd-card hd-settings-panel">
        <div className="hd-setting-line">
          Current version: <strong>{window.hopdock?.version ?? 'dev'}</strong>
        </div>
        <div className="hd-dialog-note">
          {update.state === 'idle' && 'Updates install automatically from GitHub Releases.'}
          {update.state === 'up-to-date' && `You’re up to date. Latest release: ${update.version ?? window.hopdock.version}.`}
          {update.state === 'checking' && 'Checking for updates…'}
          {update.state === 'available' && `Update ${update.version ?? ''} found, downloading…`}
          {update.state === 'downloading' && `Downloading… ${update.percent ?? 0}%`}
          {update.state === 'downloaded' && `Version ${update.version ?? ''} downloaded — restart to install.`}
        </div>
        {update.state === 'error' && <ErrorNotice error={update.message || 'Update failed'} context="Check updates" onDismiss={() => setUpdate({ state: 'idle' })} />}
        <div className="hd-row end">
          <button className="hd-btn" type="button" disabled={busy || update.state === 'checking' || update.state === 'available' || update.state === 'downloading' || update.state === 'downloaded'} onClick={() => void window.hopdock.updater.check().catch((error) => setUpdate({ state: 'error', message: String(error) }))}>
            Check for updates
          </button>
          {update.state === 'downloaded' && <button className="hd-btn primary" type="button" onClick={() => void window.hopdock.updater.install().catch((error) => setUpdate({ state: 'error', message: String(error) }))}>Restart to install</button>}
        </div>
        {update.checkedAt && <p className="hd-dialog-note">Last checked: {new Date(update.checkedAt).toLocaleString()}</p>}
      </div>
      <div className="hd-sec">Cloud sync</div>
      <div className="hd-card hd-settings-panel">
        <div className="hd-settings-account">
          <div><strong>{account?.signedIn ? account.email : 'Sign in to sync your library'}</strong><p className="hd-dialog-note">{account?.signedIn ? 'Hosts, keys and snippets sync automatically.' : 'Your local library works without an account.'}</p></div>
          <button className="hd-btn" type="button" onClick={onAccount}>{account?.signedIn ? 'Account' : 'Sign in'}</button>
        </div>
        {!status?.backendConfigured && <p className="hd-dialog-note">Cloud sync is unavailable in this build.</p>}
        <hr className="hd-settings-divider" />
        <div className="hd-form">
          <label>Sync encryption password<input className="hd-input" type="password" autoComplete="off" minLength={12} value={encryptionPassword} onChange={(e) => setEncryptionPassword(e.target.value)} placeholder={status?.passwordsConfigured ? 'Saved on this device' : 'At least 12 characters'} /></label>
          <div className="hd-dialog-note">Use the same encryption password on every device. It encrypts host passwords, private keys and snippets before upload. Keep it safe: it cannot be recovered or changed after the first successful sync.</div>
          <div className="hd-row end"><button className="hd-btn" type="button" disabled={busy || encryptionPassword.length < 12} onClick={() => void saveEncryptionPassword()}>Save encryption password</button></div>
        </div>
        <button className="hd-btn" type="button" disabled={busy || status?.syncing || !status?.configured || !status?.passwordsConfigured} onClick={() => void syncNow()}>{status?.syncing ? 'Syncing…' : 'Sync now'}</button>
        <div className="hd-dialog-note">
          {status?.syncing ? 'Syncing changes…' : status?.configured && status.passwordsConfigured ? 'Automatic sync is on.' : 'Sync is not configured.'}
          {status && Date.parse(status.lastSyncAt) > 0 && ` Last synced: ${new Date(status.lastSyncAt).toLocaleString()}.`}
          {msg && <div>{msg}</div>}
        </div>
        <ErrorNotice error={syncError || status?.lastError} context="Vault sync" onDismiss={() => { setSyncError(''); setStatus((previous) => previous ? { ...previous, lastError: null } : previous); }} />
      </div>
      <div className="hd-card hd-settings-panel">
        <h3>What syncs</h3>
        <div className="hd-dialog-note">
          Host passwords, Keychain private keys with their passphrases, and Snippets sync with end-to-end encryption.
          Received keys and snippets are ready to use on this device. Host metadata and public key details are not end-to-end encrypted.
        </div>
      </div>
    </div>
  );
}
