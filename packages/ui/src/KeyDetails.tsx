import { useEffect, useState } from 'react';
import type { KeyRef } from '@hopdock/core';
import { Icons } from './icons';
import { pickFiles } from './FilePicker';
import { ErrorNotice } from './ErrorNotice';
import { useBackdropDismiss } from './useBackdropDismiss';

export function KeyDetails({ entry, onClose, onChanged }: { entry: KeyRef; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState(entry.name);
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [publicKey, setPublicKey] = useState(entry.publicKey);
  const [fingerprint, setFingerprint] = useState(entry.fingerprint);
  const [format, setFormat] = useState<'original' | 'ppk'>('original');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState<{ name: string; privateKey: string; passphrase: string } | null>(null);
  const dirty = saved !== null && (name !== saved.name || privateKey !== saved.privateKey || passphrase !== saved.passphrase);
  useEffect(() => {
    let active = true;
    window.hopdock.keys.read(entry.id).then((material) => {
      if (active) { setPrivateKey(material.privateKey); setPassphrase(material.passphrase); setSaved({ name: entry.name, ...material }); }
    }).catch((error) => { if (active) setError(String(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [entry.id]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (error) { setError(String(error)); } finally { setBusy(false); }
  };
  const copy = (text: string, label: string) => void run(async () => { await navigator.clipboard.writeText(text); setNotice(`${label} copied.`); });
  const close = () => { if (!busy) onClose(); };
  const backdrop = useBackdropDismiss(close);
  return <div className="hd-overlay hd-drawer-overlay" {...backdrop}>
    <form className="hd-modal hd-key-drawer" role="dialog" aria-modal="true" aria-label="Edit key" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') close(); }} onSubmit={(event) => { event.preventDefault(); void run(async () => {
      const updated = await window.hopdock.keys.update(entry.id, { name, privateKey, passphrase });
      setPublicKey(updated.publicKey); setFingerprint(updated.fingerprint); setSaved({ name: name.trim(), privateKey, passphrase }); setName(name.trim()); setNotice('Key saved.'); onChanged();
    }); }}>
      <header className="hd-key-drawer-heading"><div><span className="hd-dialog-eyebrow">KEYCHAIN</span><h2>Edit key</h2></div><button className="hd-icon-btn" type="button" aria-label="Close key details" disabled={busy} onClick={close}><Icons.close /></button></header>
      <div className="hd-key-drawer-body hd-form">
        <div className="hd-key-vault"><Icons.folder /><span>Personal</span><span className="hd-badge">{entry.kind}</span></div>
        <label>Label<input autoFocus aria-label="Label" className="hd-input" value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label>Private key<textarea aria-label="Private key" className="hd-input mono hd-key-material" value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} spellCheck={false} autoComplete="off" disabled={loading || busy} placeholder={loading ? 'Loading private key…' : 'Private key is unavailable'} /></label>
        <div className="hd-key-copy-row"><span className="hd-dialog-note">Keep the private key on devices you trust.</span><button className="hd-btn" type="button" disabled={!privateKey || busy} onClick={() => copy(privateKey, 'Private key')}>Copy private key</button></div>
        <label>Passphrase for this private key<input aria-label="Passphrase for this private key" className="hd-input" type="password" autoComplete="off" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} disabled={loading || busy} placeholder="Optional" /></label>
        <label>Public key<textarea aria-label="Public key" className="hd-input mono hd-key-public" readOnly value={publicKey} spellCheck={false} /></label>
        <div className="hd-key-copy-row"><span className="hd-dialog-note">Share this key with your servers.</span><button className="hd-btn" type="button" disabled={busy} onClick={() => copy(publicKey, 'Public key')}>Copy public key</button></div>
        <label>Fingerprint<input aria-label="Fingerprint" className="hd-input mono" readOnly value={fingerprint} /></label>
        <div className="hd-key-export"><label>Export format<select aria-label="Export format" className="hd-input" value={format} onChange={(event) => setFormat(event.target.value as 'original' | 'ppk')}><option value="original">Original private key</option><option value="ppk">PuTTY (.ppk) · WinSCP</option></select></label><button className="hd-btn" type="button" disabled={loading || !privateKey || busy || dirty} onClick={() => void run(async () => {
          const paths = await pickFiles('Export private key', { save: true, filename: name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') + (format === 'ppk' ? '.ppk' : '.key') });
          if (paths?.[0]) { await window.hopdock.keys.export(entry.id, paths[0], format); setNotice('Private key exported.'); }
        })}>Export private key</button></div>
        <p className="hd-dialog-note">Exports preserve the saved key’s passphrase protection. {dirty && 'Save changes before exporting.'}</p>
        <ErrorNotice error={error} context="Edit key" onDismiss={() => setError('')} />{notice && <p className="hd-dialog-note" role="status">{notice}</p>}
      </div>
      <footer className="hd-key-drawer-footer"><button className="hd-btn" type="button" disabled={busy} onClick={close}>Close</button><button className="hd-btn primary" type="submit" disabled={busy || loading || !dirty || !name.trim() || !privateKey}>{busy ? 'Saving…' : 'Save changes'}</button></footer>
    </form>
  </div>;
}
