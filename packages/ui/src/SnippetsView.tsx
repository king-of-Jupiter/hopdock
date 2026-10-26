import { useMemo, useState } from 'react';
import type { Host, Snippet } from '@hopdock/core';
import { confirmAction } from './TextPrompt';
import { ErrorNotice } from './ErrorNotice';
import { Drawer } from './Drawer';

interface Props {
  snippets: Snippet[];
  hosts: Host[];
  onChanged: () => void;
}

export function SnippetsView({ snippets, hosts, onChanged }: Props) {
  const folders = useMemo(() => [...new Set(snippets.map((s) => s.folder))], [snippets]);
  const [folder, setFolder] = useState<string | null>(null);
  const [targetId, setTargetId] = useState(hosts[0]?.id ?? '');
  const [varValues, setVarValues] = useState<Record<string, Record<string, string>>>({});
  const [result, setResult] = useState<{ name: string; out: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<{ id?: string; name: string; folder: string; script: string } | null>(null);

  const list = folder ? snippets.filter((s) => s.folder === folder) : snippets;

  const saveSnippet = async () => {
    if (!editing || !editing.name.trim() || !editing.script.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await window.hopdock.snippets.save({ name: editing.name.trim(), folder: editing.folder.trim() || 'general', script: editing.script }, editing.id);
      setEditing(null);
      onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };
  const run = async (s: Snippet) => {
    if (!targetId) {
      setErr('Pick a target host first.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const r = await window.hopdock.snippets.run(s.id, targetId, varValues[s.id] ?? {});
      if (r.code !== 0) setErr('Snippet exited with non-zero status.');
      setResult({ name: s.name, out: `$ exit ${r.code}\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}` });
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="hd-toolbar">
        <button className="hd-btn primary" type="button" onClick={() => setEditing({ name: '', folder: folder ?? 'general', script: '' })}>
          New snippet
        </button>
        <select className="hd-input" value={folder ?? ''} onChange={(e) => setFolder(e.target.value || null)}>
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <select className="hd-input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          {hosts.map((h) => (
            <option key={h.id} value={h.id}>{h.name} ({h.username}@{h.host})</option>
          ))}
        </select>
      </div>
      {!editing && <ErrorNotice error={err} context="Snippet operation" onDismiss={() => setErr('')} />}
      {list.length === 0 ? (
        <div className="hd-empty" data-testid="snippets-empty">
          <h2>No snippets here</h2>
          <p>Save a command once, run it on any host with variables.</p>
        </div>
      ) : (
      <div className="hd-list" data-testid="snippets-table">
        <table className="hd-table">
          <thead>
            <tr><th>Name</th><th>Folder</th><th>Script</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.name}</strong></td>
                <td><span className="hd-badge">{s.folder}</span></td>
                <td>
                  <code>{s.script}</code>
                  {s.vars.length > 0 && (
                    <div className="hd-row">
                      {s.vars.map((v) => (
                        <input
                          key={v}
                          className="hd-input"
                          placeholder={`$${v}`}
                          value={varValues[s.id]?.[v] ?? ''}
                          onChange={(e) => setVarValues((prev) => ({ ...prev, [s.id]: { ...prev[s.id], [v]: e.target.value } }))}
                        />
                      ))}
                    </div>
                  )}
                </td>
                <td className="actions">
                  <button className="hd-btn quiet run" type="button" disabled={busy} onClick={() => void run(s)}>
                    Run
                  </button>
                  <button className="hd-btn quiet" type="button" disabled={busy} onClick={() => setEditing({ id: s.id, name: s.name, folder: s.folder, script: s.script })}>
                    Edit
                  </button>
                  <button className="hd-btn quiet danger" type="button" disabled={busy} onClick={() => { void confirmAction(`Delete ${s.name}?`, 'The snippet will be removed from this library and synced devices.').then(async (yes) => { if (yes) { try { await window.hopdock.snippets.remove(s.id); onChanged(); } catch (error) { setErr(String(error)); } } }); }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {result && (
        <Drawer title={result.name} eyebrow="COMMAND OUTPUT" onClose={() => setResult(null)} footer={<button className="hd-btn" type="button" onClick={() => setResult(null)}>Close</button>}>
          <pre>{result.out}</pre>
        </Drawer>
      )}
      {editing && (
        <Drawer title={editing.id ? 'Edit snippet' : 'New snippet'} eyebrow="SNIPPETS" busy={busy} onClose={() => setEditing(null)} onSubmit={() => void saveSnippet()} footer={<><button className="hd-btn" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button className="hd-btn primary" type="submit" disabled={busy || !editing.name.trim() || !editing.script.trim()}>Save</button></>}>
            <div className="hd-form">
              <label>Name<input className="hd-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
              <label>Folder<input className="hd-input" value={editing.folder} onChange={(e) => setEditing({ ...editing, folder: e.target.value })} /></label>
              <label>Script (use ${`{var}`} for inputs)<textarea className="hd-input mono" rows={5} value={editing.script} onChange={(e) => setEditing({ ...editing, script: e.target.value })} /></label>
              <ErrorNotice error={err} context="Save snippet" onDismiss={() => setErr('')} />
            </div>
        </Drawer>
      )}
    </>
  );
}
