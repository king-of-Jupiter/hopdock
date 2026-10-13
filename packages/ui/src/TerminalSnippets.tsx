import { useState } from 'react';
import { IconBraces, IconChevronRight, IconArrowLeft, IconPlus, IconSearch, IconX, IconPencil, IconTrash } from '@tabler/icons-react';
import type { Snippet } from '@hopdock/core';
import { Drawer } from './Drawer';
import { ErrorNotice } from './ErrorNotice';
import { confirmAction } from './TextPrompt';

interface Props {
  snippets: Snippet[];
  connected: boolean;
  onRun: (script: string) => Promise<void>;
  onChanged: () => void;
  onHide: () => void;
}
type Draft = { id?: string; name: string; folder: string; script: string };

export function TerminalSnippets({ snippets, connected, onRun, onChanged, onHide }: Props) {
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [pending, setPending] = useState<Snippet | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const variables = (script: string) => [...new Set([...script.matchAll(/\$\{(\w+)\}/g)].map((match) => match[1]!))];
  const list = snippets.filter((s) => (folder === null || s.folder === folder) && `${s.name} ${s.script} ${s.folder}`.toLowerCase().includes(search.toLowerCase()));
  const folders = [...new Set(list.map((s) => s.folder))].sort();
  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  const execute = (s: Snippet, inputs: Record<string, string>) => perform(async () => {
    await onRun(s.script.replace(/\$\{(\w+)\}/g, (_, name: string) => inputs[name] ?? ''));
    setPending(null);
  });
  const run = (s: Snippet) => {
    setError('');
    if (variables(s.script).length) { setValues({}); setPending(s); }
    else void execute(s, {});
  };
  const save = () => perform(async () => {
    if (!editing) return;
    await window.hopdock.snippets.save({ name: editing.name.trim(), folder: editing.folder.trim() || 'general', script: editing.script }, editing.id);
    setEditing(null); onChanged();
  });
  const remove = async (s: Snippet) => {
    if (await confirmAction(`Delete ${s.name}?`, 'The snippet will be removed from this library and synced devices.')) {
      await perform(async () => { await window.hopdock.snippets.remove(s.id); onChanged(); });
    }
  };
  return <>
    <aside className="hd-terminal-snippets" aria-label="Terminal snippets">
      <header className="hd-snippets-heading"><IconBraces size={19} /><strong>Snippets</strong><span>{snippets.length}</span><button className="hd-icon-btn" aria-label="Hide snippets" onClick={onHide}><IconX size={17} /></button></header>
      <div className="hd-snippets-tools"><button className="hd-btn" onClick={() => { setError(''); setEditing({ name: '', folder: folder ?? 'general', script: '' }); }}><IconPlus size={15} /> New snippet</button></div>
      <label className="hd-snippets-search"><IconSearch size={15} /><input aria-label="Search snippets" placeholder="Search snippets" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <div className="hd-snippets-content">
        {folder !== null && <button className="hd-snippets-back" onClick={() => setFolder(null)}><IconArrowLeft size={14} /> All folders</button>}
        {!editing && !pending && <ErrorNotice error={error} context="Snippet operation" onDismiss={() => setError('')} />}
        {list.length === 0 && <div className="hd-snippets-empty"><span>{search ? 'No matching snippets' : folder !== null ? 'This folder is empty' : 'No snippets yet'}</span><p>{search ? 'Try another name or command.' : 'Save a command to use it in this terminal.'}</p></div>}
        {(folder !== null ? [folder] : folders).map((name) => <section key={name} className="hd-snippets-folder">
          <button className="hd-snippets-folder-title" onClick={() => setFolder(folder === null ? name : null)}><strong>{name}</strong><span>{list.filter((s) => s.folder === name).length}</span><IconChevronRight size={14} /></button>
          {list.filter((s) => s.folder === name).map((s) => <div className="hd-terminal-snippet" key={s.id}>
            <button className="hd-snippet-command" aria-label={`Run ${s.name}`} title={connected ? `Run in current terminal: ${s.script}` : 'Connect to the host to run snippets'} disabled={!connected || busy} onClick={() => run(s)}><span><IconBraces size={14} />{s.name}</span><code>{s.script.replace(/\s+/g, ' ')}</code></button>
            <div className="hd-snippet-actions"><button className="hd-icon-btn" aria-label={`Edit ${s.name}`} disabled={busy} onClick={() => { setError(''); setEditing({ id: s.id, name: s.name, folder: s.folder, script: s.script }); }}><IconPencil size={14} /></button><button className="hd-icon-btn" aria-label={`Delete ${s.name}`} disabled={busy} onClick={() => void remove(s)}><IconTrash size={14} /></button></div>
          </div>)}
        </section>)}
      </div>
      <footer className="hd-snippets-footer">{connected ? 'Runs in the current terminal' : 'Waiting for connection'}</footer>
    </aside>
    {editing && <Drawer title={editing.id ? 'Edit snippet' : 'New snippet'} eyebrow="SNIPPETS" busy={busy} onClose={() => setEditing(null)} onSubmit={() => void save()} footer={<><button className="hd-btn" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button className="hd-btn primary" type="submit" disabled={busy || !editing.name.trim() || !editing.script.trim()}>Save</button></>}>
      <div className="hd-form"><label>Name<input className="hd-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label><label>Folder<input className="hd-input" value={editing.folder} onChange={(e) => setEditing({ ...editing, folder: e.target.value })} /></label><label>Script (use {'${var}'} for inputs)<textarea className="hd-input mono" rows={9} value={editing.script} onChange={(e) => setEditing({ ...editing, script: e.target.value })} /></label><ErrorNotice error={error} context="Save snippet" onDismiss={() => setError('')} /></div>
    </Drawer>}
    {pending && <Drawer title={pending.name} eyebrow="RUN SNIPPET" description="Fill in the variables, then run this command in the current terminal." busy={busy} onClose={() => setPending(null)} onSubmit={() => void execute(pending, values)} footer={<><button className="hd-btn" type="button" disabled={busy} onClick={() => setPending(null)}>Cancel</button><button className="hd-btn primary" type="submit" disabled={busy || !connected || variables(pending.script).some((v) => !values[v]?.trim())}>Run</button></>}>
      <div className="hd-form">{variables(pending.script).map((v) => <label key={v}>{v}<input className="hd-input" value={values[v] ?? ''} onChange={(e) => setValues({ ...values, [v]: e.target.value })} /></label>)}<pre className="hd-snippet-preview">{pending.script}</pre><ErrorNotice error={error} context="Run snippet" onDismiss={() => setError('')} /></div>
    </Drawer>}
  </>;
}
