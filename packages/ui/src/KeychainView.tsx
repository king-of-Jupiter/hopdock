import { useState } from 'react';
import type { Host, KeyRef } from '@hopdock/core';
import { confirmAction } from './TextPrompt';
import { pickFiles } from './FilePicker';
import { Drawer } from './Drawer';
import { KeyDetails } from './KeyDetails';
import { ErrorNotice } from './ErrorNotice';

interface Props {
  keys: KeyRef[];
  hosts: Host[];
  onChanged: () => void;
}

export function KeychainView({ keys, hosts, onChanged }: Props) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedKey, setSelectedKey] = useState<KeyRef | null>(null);
  const [editor, setEditor] = useState<'generate' | 'import' | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'ed25519' | 'rsa'>('ed25519');
  const [passphrase, setPassphrase] = useState('');
  const [file, setFile] = useState('');
  const [copyKey, setCopyKey] = useState<KeyRef | null>(null);
  const [targetId, setTargetId] = useState('');

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

  const startEditor = (mode: 'generate' | 'import') => {
    setErr(''); setName(mode === 'generate' ? 'id_ed25519' : ''); setKind('ed25519'); setPassphrase(''); setFile(''); setEditor(mode);
  };
  const saveKey = async () => {
    if (!name.trim() || (editor === 'import' && !file)) return;
    await run(async () => {
      if (editor === 'generate') await window.hopdock.keys.generate(name.trim(), kind, passphrase);
      else await window.hopdock.keys.importFile(name.trim(), passphrase || undefined, file);
      setEditor(null);
    });
  };

  const copyId = async (key: KeyRef) => {
    if (hosts.length === 0) {
      setErr('No hosts to copy to.');
      return;
    }
    setErr(''); setCopyKey(key); setTargetId(hosts[0]?.id ?? '');
  };

  return (
    <>
      <div className="hd-toolbar">
        <button className="hd-btn primary" type="button" disabled={busy} onClick={() => startEditor('generate')}>
          New key
        </button>
        <button className="hd-btn" type="button" disabled={busy} onClick={() => startEditor('import')}>
          Import key
        </button>
      </div>
      {!editor && !copyKey && <ErrorNotice error={err} context="Keychain" onDismiss={() => setErr('')} />}
      {keys.length === 0 ? (
        <div className="hd-empty" data-testid="keys-empty">
          <h2>No keys yet</h2>
          <p>Generate an ed25519 key or import an existing private key. Keys sync encrypted with your vault.</p>
        </div>
      ) : (
      <div className="hd-list" data-testid="keys-table">
        <table className="hd-table">
          <thead>
            <tr><th>Name</th><th>Type</th><th>Fingerprint</th><th>Updated</th><th></th></tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="row" onClick={() => setSelectedKey(k)}>
                <td><button className="hd-key-name" type="button" aria-label={`Edit key ${k.name}`} onClick={(event) => { event.stopPropagation(); setSelectedKey(k); }}>{k.name}</button></td>
                <td><span className="hd-badge">{k.kind}</span></td>
                <td style={{ fontFamily: 'var(--hd-font-mono)', fontSize: 12 }}>{k.fingerprint}</td>
                <td>{new Date(k.updatedAt).toLocaleDateString()}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="hd-btn" type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); copyId(k); }}>
                    Copy ID
                  </button>{' '}
                  <button className="hd-btn" type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); void confirmAction(`Delete ${k.name}?`, 'This key will be removed from Keychain and synced devices.').then((yes) => { if (yes) void run(() => window.hopdock.keys.delete(k.id)); }); }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {selectedKey && <KeyDetails key={selectedKey.id} entry={selectedKey} onClose={() => setSelectedKey(null)} onChanged={onChanged} />}
      {editor && <Drawer title={editor === 'generate' ? 'New SSH key' : 'Import SSH key'} eyebrow="KEYCHAIN" description={editor === 'generate' ? 'A private key for your connections.' : 'Bring an existing private key into Hopdock.'} busy={busy} onClose={() => setEditor(null)} onSubmit={() => void saveKey()} footer={<><button className="hd-btn" type="button" disabled={busy} onClick={() => setEditor(null)}>Cancel</button><button className="hd-btn primary" type="submit" disabled={busy || !name.trim() || (editor === 'import' && !file)}>{busy ? 'Working…' : editor === 'generate' ? 'Create key' : 'Import key'}</button></>}>
        <div className="hd-form hd-key-editor">
          <label>Key name<input autoFocus className="hd-input" aria-label="Key name" value={name} onChange={(e) => setName(e.target.value)} placeholder="work-laptop" /></label>
          {editor === 'generate' ? <fieldset className="hd-algorithms"><legend>Algorithm</legend><div className="hd-algorithm-options">{(['ed25519', 'rsa'] as const).map((algorithm) => <button key={algorithm} className={'hd-algorithm' + (kind === algorithm ? ' selected' : '')} type="button" aria-label={algorithm === 'ed25519' ? 'Ed25519' : 'RSA'} aria-pressed={kind === algorithm} onClick={() => setKind(algorithm)}><span><strong>{algorithm === 'ed25519' ? 'Ed25519' : 'RSA'}</strong>{algorithm === 'ed25519' && <small>Recommended</small>}</span><p>{algorithm === 'ed25519' ? 'Fast, compact and modern.' : '3072-bit · wider compatibility.'}</p></button>)}</div></fieldset> : <label>Private key file<div className="hd-row"><input className="hd-input mono" aria-label="Private key file" readOnly value={file} placeholder="Choose a file…" /><button className="hd-btn" type="button" onClick={async () => { const paths = await pickFiles('Choose private key').catch((error) => { setErr(String(error)); return null; }); if (paths?.[0]) { setFile(paths[0]); if (!name) setName(paths[0].split(/[\\/]/).pop() ?? 'imported'); } }}>Browse</button></div></label>}
          <label>Passphrase <span className="hd-field-optional">optional</span><input className="hd-input" aria-label="Key passphrase" type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder={editor === 'generate' ? 'Protect this key with a passphrase' : 'Passphrase used by this key'} /></label>
          <p className="hd-dialog-note">{editor === 'generate' ? 'Private keys and passphrases are encrypted during sync.' : 'The original file is kept unchanged.'}</p>
          <ErrorNotice error={err} context="Save key" onDismiss={() => setErr('')} />
        </div>
      </Drawer>}
      {copyKey && <Drawer title="Install public key" eyebrow="KEYCHAIN" description={`Add ${copyKey.name} to a host’s authorized keys.`} busy={busy} onClose={() => setCopyKey(null)} onSubmit={() => void run(async () => { await window.hopdock.keys.copyId(copyKey.id, targetId); setCopyKey(null); })} footer={<><button className="hd-btn" type="button" disabled={busy} onClick={() => setCopyKey(null)}>Cancel</button><button className="hd-btn primary" type="submit" disabled={busy || !targetId}>{busy ? 'Installing…' : 'Install key'}</button></>}><div className="hd-form"><label>Host<select className="hd-input" aria-label="Target host" value={targetId} onChange={(e) => setTargetId(e.target.value)}>{hosts.map((host) => <option key={host.id} value={host.id}>{host.name} · {host.username}@{host.host}</option>)}</select></label><ErrorNotice error={err} context="Install public key" onDismiss={() => setErr('')} /></div></Drawer>}
    </>
  );
}
