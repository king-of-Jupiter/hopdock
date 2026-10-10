import { useState } from 'react';
import type { Host, KeyRef } from '@hopdock/core';

interface Props {
  keys: KeyRef[];
  hosts: Host[];
  onChanged: () => void;
}

export function KeychainView({ keys, hosts, onChanged }: Props) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPub, setShowPub] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const generate = () => {
    const name = window.prompt('Key name (e.g. id_ed25519):', 'id_ed25519');
    if (!name) return;
    const kind = window.confirm('OK = ed25519, Cancel = RSA') ? 'ed25519' : 'rsa';
    const passphrase = window.prompt('Passphrase (empty = none):', '') ?? '';
    void run(() => window.hopdock.keys.generate(name, kind as 'ed25519' | 'rsa', passphrase));
  };

  const importKey = () => {
    const name = window.prompt('Key name:', 'imported');
    if (!name) return;
    void run(() => window.hopdock.keys.importFile(name));
  };

  const copyId = (key: KeyRef) => {
    if (hosts.length === 0) {
      setErr('No hosts to copy to.');
      return;
    }
    const target = window.prompt(`Copy ${key.name} to which host? (id)\n` + hosts.map((h) => `${h.id} — ${h.username}@${h.host}`).join('\n'), hosts[0]?.id ?? '');
    if (!target) return;
    void run(() => window.hopdock.keys.copyId(key.id, target));
  };

  return (
    <>
      <div className="hd-toolbar">
        <button className="hd-btn primary" type="button" disabled={busy} onClick={generate}>
          GENERATE
        </button>
        <button className="hd-btn" type="button" disabled={busy} onClick={importKey}>
          IMPORT
        </button>
        {err && <span style={{ color: 'var(--hd-danger)', fontSize: 12 }}>{err}</span>}
      </div>
      {keys.length === 0 ? (
        <div className="hd-empty" data-testid="keys-empty">
          <h2>No keys yet</h2>
          <p>Generate an ed25519 key or import an existing private key. Private material never leaves this device.</p>
        </div>
      ) : (
      <div className="hd-list" data-testid="keys-table">
        <table className="hd-table">
          <thead>
            <tr><th>Name</th><th>Type</th><th>Fingerprint</th><th>Updated</th><th></th></tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="row" onClick={() => setShowPub(showPub === k.id ? null : k.id)}>
                <td><strong>{k.name}</strong></td>
                <td><span className="hd-badge">{k.kind}</span></td>
                <td style={{ fontFamily: 'var(--hd-font-mono)', fontSize: 12 }}>{k.fingerprint}</td>
                <td>{new Date(k.updatedAt).toLocaleDateString()}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="hd-btn" type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); copyId(k); }}>
                    Copy ID
                  </button>{' '}
                  <button className="hd-btn" type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete ${k.name}?`)) void run(() => window.hopdock.keys.delete(k.id)); }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {showPub && (
        <div className="hd-modal" style={{ marginTop: 12 }}>
          <h2>Public key</h2>
          <pre>{keys.find((k) => k.id === showPub)?.publicKey}</pre>
        </div>
      )}
    </>
  );
}
