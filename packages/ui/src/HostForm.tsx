import { useState } from 'react';
import type { AuthType, Host, HostGroup, KeyRef } from '@hopdock/core';
import { ErrorNotice } from './ErrorNotice';
import { Drawer } from './Drawer';
import { IconEye, IconEyeOff } from '@tabler/icons-react';

export interface HostDraft {
  name: string;
  host: string;
  port: number;
  username: string;
  auth: AuthType;
  tags: string;
  password?: string;
  keyId?: string;
  groupId: string | null;
}

export function HostForm({ initial, keys, groups, defaultGroupId, onChanged, onSave, onClose }: { initial?: Host | null; keys: KeyRef[]; groups: HostGroup[]; defaultGroupId?: string | null; onChanged: () => void; onSave: (d: HostDraft) => Promise<void>; onClose: () => void }) {
  const [groupId, setGroupId] = useState(initial?.groupId ?? defaultGroupId ?? '');
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const [createdGroup, setCreatedGroup] = useState<HostGroup | null>(null);
  const availableGroups = createdGroup && !groups.some((g) => g.id === createdGroup.id) ? [...groups, createdGroup] : groups;
  const createGroup = async () => {
    if (!newGroup?.trim() || busy) return;
    setBusy(true); setSaveError('');
    try { const group = await window.hopdock.vault.saveGroup(newGroup); setCreatedGroup(group); setGroupId(group.id); setNewGroup(null); onChanged(); }
    catch (error) { setSaveError(String(error)); } finally { setBusy(false); }
  };
  const [name, setName] = useState(initial?.name ?? '');
  const [host, setHost] = useState(initial?.host ?? '');
  const [port, setPort] = useState(initial?.port ?? 22);
  const [username, setUsername] = useState(initial?.username ?? 'root');
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const togglePassword = async () => {
    if (passwordVisible) { setPasswordVisible(false); return; }
    if (!password && savedPassword && initial) {
      setLoadingPassword(true); setSaveError('');
      try { setPassword(await window.hopdock.vault.readHostPassword(initial.id)); setPasswordVisible(true); }
      catch (error) { setSaveError(String(error)); }
      finally { setLoadingPassword(false); }
    } else setPasswordVisible(true);
  };
  const [keyId, setKeyId] = useState(initial?.auth.keyId ?? '');
  const [savedPassword, setSavedPassword] = useState(initial?.auth.type === 'password' || initial?.auth.type === 'key-password');
  const hasPassword = password !== '' || savedPassword;
  const auth: AuthType = keyId ? (hasPassword ? 'key-password' : 'key') : 'password';
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [touched, setTouched] = useState(false);
  const errors = {
    name: name.trim() === '' ? 'Name is required.' : '',
    host: host.trim() === '' ? 'Address is required.' : !/^[A-Za-z0-9._:-]+$/.test(host.trim()) ? 'Use a hostname or IP address.' : '',
    port: !Number.isInteger(port) || port < 1 || port > 65535 ? 'Port must be 1–65535.' : '',
    username: username.trim() === '' ? 'Username is required.' : '',
    auth: keyId && !keys.some((k) => k.id === keyId) ? 'Select an available key from Keychain.'
      : !keyId && !hasPassword ? 'Enter a password or select an SSH key.' : '',
  };
  const valid = !errors.name && !errors.host && !errors.port && !errors.username && !errors.auth;
  const show = (msg: string) => touched && msg !== '';
  const save = async () => {
    setTouched(true); if (!valid || busy) return;
    setBusy(true); setSaveError('');
    try { await onSave({ name: name.trim(), host: host.trim(), port, username: username.trim(), auth, tags, groupId: groupId || null, keyId: auth === 'key' || auth === 'key-password' ? keyId : undefined, password: password || undefined }); }
    catch (error) { setSaveError(String(error)); }
    finally { setBusy(false); }
  };

  return (
    <Drawer title={initial ? 'Edit host' : 'New host'} eyebrow="HOSTS" onClose={onClose} busy={busy} onSubmit={() => void save()} footer={<><button className="hd-btn" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="hd-btn primary" type="submit" disabled={busy || loadingPassword || newGroup !== null}>{busy ? 'Saving…' : 'Save'}</button></>}>
        <div className="hd-form">
          <label>Group<select aria-label="Group" className="hd-input" value={groupId} disabled={busy} onChange={(e) => { if (e.target.value === '__new__') setNewGroup(''); else { setGroupId(e.target.value); setNewGroup(null); } }}><option value="">No group</option>{availableGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}<option value="__new__">+ New group…</option></select></label>
          {newGroup !== null && <div className="hd-inline-group"><label>New group name<input className="hd-input" aria-label="New group name" value={newGroup} disabled={busy} onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void createGroup(); } }} /></label><div className="hd-row"><button className="hd-btn" type="button" disabled={busy} onClick={() => setNewGroup(null)}>Cancel group</button><button className="hd-btn" type="button" disabled={busy || !newGroup.trim()} onClick={() => void createGroup()}>Create group</button></div></div>}
          <label>
            Name
            <input className={'hd-input' + (show(errors.name) ? ' invalid' : '')} value={name} onChange={(e) => setName(e.target.value)} placeholder="web-02" />
            {show(errors.name) && <span className="hd-err">{errors.name}</span>}
          </label>
          <div className="hd-row">
            <label>
              Address
              <input className={'hd-input' + (show(errors.host) ? ' invalid' : '')} value={host} onChange={(e) => setHost(e.target.value)} placeholder="3.12.44.11" />
              {show(errors.host) && <span className="hd-err">{errors.host}</span>}
            </label>
            <label style={{ maxWidth: 90 }}>
              Port
              <input className={'hd-input' + (show(errors.port) ? ' invalid' : '')} type="number" value={port} onChange={(e) => setPort(Number(e.target.value) || 0)} />
              {show(errors.port) && <span className="hd-err">{errors.port}</span>}
            </label>
          </div>
          <label>
            Username
            <input className={'hd-input' + (show(errors.username) ? ' invalid' : '')} value={username} onChange={(e) => setUsername(e.target.value)} />
            {show(errors.username) && <span className="hd-err">{errors.username}</span>}
          </label>
          <label>
            Password
            <span className="hd-password-field"><input aria-label="Password" disabled={busy || loadingPassword} className="hd-input" type={passwordVisible ? 'text' : 'password'} autoComplete="new-password" placeholder={savedPassword ? '********' : 'Account password'} value={password} onChange={(e) => setPassword(e.target.value)} /><button className="hd-icon-btn" type="button" aria-label={passwordVisible ? 'Hide password' : 'Show password'} aria-pressed={passwordVisible} disabled={busy || loadingPassword} onClick={() => void togglePassword()}>{passwordVisible ? <IconEyeOff size={18} stroke={1.6} /> : <IconEye size={18} stroke={1.6} />}</button></span>
          </label>
          {savedPassword && <button className="hd-btn" type="button" disabled={busy || loadingPassword} onClick={() => { setSavedPassword(false); setPassword(''); setPasswordVisible(false); }}>Remove saved password</button>}
          <label>SSH key<select aria-label="SSH key" className="hd-input" value={keyId} onChange={(e) => setKeyId(e.target.value)}><option value="">No key</option>{keyId && !keys.some((k) => k.id === keyId) && <option value={keyId} disabled>Key unavailable</option>}{keys.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
          <p className="hd-dialog-note">Use a password, an SSH key, or both.</p>
          {show(errors.auth) && <span className="hd-err">{errors.auth}</span>}
          <ErrorNotice error={saveError} context="Save host" onDismiss={() => setSaveError('')} />
          <label>
            Tags (comma separated)
            <input className="hd-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="prod, nginx" />
          </label>
        </div>
    </Drawer>
  );
}
