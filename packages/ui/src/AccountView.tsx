import { useState } from 'react';
import type { AccountStatus } from './preload-api';
import { Drawer } from './Drawer';
import { ErrorNotice } from './ErrorNotice';
import { confirmAction } from './TextPrompt';
import { IconEye, IconEyeOff, IconMoon, IconSun, IconUserCircle } from '@tabler/icons-react';

function useAccountForm(account: AccountStatus, onSignedIn: (account: AccountStatus) => void) {
  const [email, setEmail] = useState(account.email ?? '');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submit = async () => {
    if (busy) return;
    setError(''); setNotice('');
    if (!email.trim() || !password) { setError('Enter your account email and password.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid account email address.'); return; }
    if (create && password.length < 8) { setError('Use at least 8 characters for the account password.'); return; }
    setBusy(true);
    try {
      if (create) {
        const result = await window.hopdock.auth.signUp({ email: email.trim(), password });
        if (result.confirmationRequired) {
          setNotice('Check your email to confirm your account, then sign in here.'); setCreate(false);
        } else onSignedIn(result.account);
      } else onSignedIn(await window.hopdock.auth.signIn({ email: email.trim(), password }));
      setPassword(''); setVisible(false);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const fields = <div className="hd-form hd-account-fields">
    {!account.backendConfigured && <p className="hd-dialog-note">Cloud sign-in is unavailable in this build. You can still work offline.</p>}
    <label>Email<input className="hd-input" type="email" autoComplete="email" value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} /></label>
    <label>Password<span className="hd-password-field"><input className="hd-input" type={visible ? 'text' : 'password'} autoComplete={create ? 'new-password' : 'current-password'} value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} /><button className="hd-icon-btn" type="button" aria-label={visible ? 'Hide account password' : 'Show account password'} aria-pressed={visible} disabled={busy} onClick={() => setVisible(!visible)}>{visible ? <IconEyeOff size={18} /> : <IconEye size={18} />}</button></span></label>
    <ErrorNotice error={error} context={create ? 'Create account' : 'Sign in'} onDismiss={() => setError('')} />
    {notice && <p className="hd-account-notice" role="status">{notice}</p>}
    <button className="hd-btn primary hd-account-submit" type="submit" disabled={busy || !account.backendConfigured}>{busy ? 'Please wait…' : create ? 'Create account' : 'Sign in'}</button>
    <p className="hd-account-alternative">{create ? 'Already have an account?' : 'New to Hopdock?'} <button className="hd-text-button" type="button" disabled={busy} onClick={() => { setCreate(!create); setError(''); setNotice(''); }}>{create ? 'Sign in' : 'Create account'}</button></p>
  </div>;
  return { fields, submit, busy, create };
}

export function AuthScreen({ account, theme, onTheme, onSignedIn, onOffline, version }: {
  account: AccountStatus; theme: 'light' | 'dark'; onTheme: (value: 'light' | 'dark') => void;
  onSignedIn: (account: AccountStatus) => void; onOffline: () => void; version: string;
}) {
  const form = useAccountForm(account, onSignedIn);
  return <main className="hd-app hd-auth-screen" data-theme={theme}>
    <header className="hd-auth-header"><div className="hd-brand"><img className="hd-brand-mark" src={new URL('./assets/hopdock-mark.svg', import.meta.url).href} alt="" /><span>Hopdock</span></div><button className="hd-icon-btn" type="button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={() => onTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <IconMoon size={20} /> : <IconSun size={20} />}</button></header>
    <section className="hd-auth-content"><h1>{form.create ? 'Create your account' : 'Sign in to Hopdock'}</h1><p className="hd-auth-description">Your hosts, keys and snippets, on every device.</p><form noValidate onSubmit={(e) => { e.preventDefault(); void form.submit(); }}>{form.fields}</form><div className="hd-auth-offline"><button className="hd-text-button" type="button" disabled={form.busy} onClick={onOffline}>Continue offline</button><p>Use your local library without an account.</p></div></section>
    <footer className="hd-auth-footer">{version}</footer>
  </main>;
}

export function AccountDrawer({ account, onSignedIn, onSignedOut, onClose, onSyncSettings }: {
  account: AccountStatus; onSignedIn: (account: AccountStatus) => void; onSignedOut: (account: AccountStatus) => void;
  onClose: () => void; onSyncSettings: () => void;
}) {
  const form = useAccountForm(account, onSignedIn);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const signOut = async () => {
    if (!await confirmAction('Sign out on this device?', 'Cloud sync will stop. Your local hosts, keys and snippets stay available.', 'Sign out', false)) return;
    setSigningOut(true);
    try { onSignedOut(await window.hopdock.auth.signOut()); }
    catch (e) { setError(String(e)); }
    finally { setSigningOut(false); }
  };
  return <Drawer noValidate title={account.signedIn ? 'Your account' : form.create ? 'Create account' : 'Sign in'} eyebrow="Hopdock" busy={form.busy || signingOut} onClose={onClose} onSubmit={account.signedIn ? undefined : () => void form.submit()} footer={account.signedIn ? <button className="hd-btn danger" type="button" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? 'Signing out…' : 'Sign out'}</button> : <p className="hd-dialog-note">Local connections are available without signing in.</p>}>
    {account.signedIn ? <div className="hd-account-profile"><IconUserCircle size={40} stroke={1.3} /><strong>{account.email}</strong><p className="hd-dialog-note">Signed in on this device. Manage your cloud sync in Settings.</p><button className="hd-btn" type="button" onClick={onSyncSettings}>Sync settings</button><ErrorNotice error={error} context="Sign out" onDismiss={() => setError('')} /></div> : form.fields}
  </Drawer>;
}
