import { useEffect, useState } from 'react';
import type { SyncStatus } from './preload-api';

export function SettingsView() {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setStatus(await window.hopdock.sync.status());
    } catch {
      /* preload unavailable */
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await window.hopdock.sync.saveCreds({ url: url.trim(), anonKey: anonKey.trim(), email: email.trim(), password });
      setPassword('');
      setMsg('Credentials saved to OS keychain.');
      await refresh();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await window.hopdock.sync.syncNow();
      setMsg(`Synced: pushed ${r.pushed}, pulled ${r.pulled}.`);
      await refresh();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="hd-sec">Encrypted vault sync (Supabase)</div>
      <div className="hd-card" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch' }}>
        <div className="hd-form">
          <label>Supabase URL<input className="hd-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xyz.supabase.co" /></label>
          <label>Anon key<input className="hd-input mono" type="password" value={anonKey} onChange={(e) => setAnonKey(e.target.value)} /></label>
          <div className="hd-row">
            <label>Email<input className="hd-input" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Password<input className="hd-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          </div>
          <div className="hd-row" style={{ justifyContent: 'flex-end' }}>
            <button className="hd-btn" type="button" disabled={busy} onClick={() => void save()}>Save</button>
            <button className="hd-btn primary" type="button" disabled={busy} onClick={() => void syncNow()}>Sync now</button>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--hd-muted)', marginTop: 8 }}>
          Status: {status ? `${status.configured ? 'configured' : 'not configured'} · last sync ${status.lastSyncAt}` : '…'}
          {status?.lastError && <div style={{ color: 'var(--hd-danger)' }}>{status.lastError}</div>}
          {msg && <div>{msg}</div>}
        </div>
      </div>
      <div className="hd-card" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Security model (v0.0.1)</h3>
        <div style={{ fontSize: 12, color: 'var(--hd-muted)' }}>
          Private keys and passwords live only in the OS keychain on this device. Sync carries hosts, snippets and key
          metadata (public parts); secrets never leave the machine. Apply <code>supabase/schema.sql</code> to your project first.
        </div>
      </div>
    </div>
  );
}
