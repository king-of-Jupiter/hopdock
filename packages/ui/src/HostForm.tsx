import { useState } from 'react';
import type { AuthType, Host } from '@hopdock/core';

export interface HostDraft {
  name: string;
  host: string;
  port: number;
  username: string;
  auth: AuthType;
  tags: string;
  password?: string;
}

export function HostForm({ initial, onSave, onClose }: { initial?: Host | null; onSave: (d: HostDraft) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [host, setHost] = useState(initial?.host ?? '');
  const [port, setPort] = useState(initial?.port ?? 22);
  const [username, setUsername] = useState(initial?.username ?? 'root');
  const [auth, setAuth] = useState<AuthType>(initial?.auth.type ?? 'key');
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const errors = {
    name: name.trim() === '' ? 'Name is required.' : '',
    host: host.trim() === '' ? 'Address is required.' : !/^[A-Za-z0-9._-]+$/.test(host.trim()) ? 'Use a hostname or IP address.' : '',
    port: port < 1 || port > 65535 ? 'Port must be 1–65535.' : '',
    username: username.trim() === '' ? 'Username is required.' : '',
  };
  const valid = !errors.name && !errors.host && !errors.port && !errors.username;
  const show = (msg: string) => touched && msg !== '';

  return (
    <div className="hd-overlay" onClick={onClose}>
      <div className="hd-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? 'Edit host' : 'New host'}</h2>
        <div className="hd-form">
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
          <div className="hd-row">
            <label>
              Username
              <input className={'hd-input' + (show(errors.username) ? ' invalid' : '')} value={username} onChange={(e) => setUsername(e.target.value)} />
              {show(errors.username) && <span className="hd-err">{errors.username}</span>}
            </label>
            <label>
              Auth
              <select value={auth} onChange={(e) => setAuth(e.target.value as AuthType)}>
                <option value="key">SSH key</option>
                <option value="password">Password</option>
                <option value="agent">SSH agent</option>
                <option value="cert">Certificate</option>
              </select>
            </label>
          </div>
          {auth === 'password' && (
            <label>
              Password (stored in OS keychain, never synced)
              <input className="hd-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}
          <label>
            Tags (comma separated)
            <input className="hd-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="prod, nginx" />
          </label>
          <div className="hd-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="hd-btn" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="hd-btn primary"
              type="button"
              onClick={() => {
                setTouched(true);
                if (valid) onSave({ name: name.trim(), host: host.trim(), port, username: username.trim(), auth, tags, password: password || undefined });
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
