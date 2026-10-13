import { useEffect, useRef, useState } from 'react';
import { Drawer } from './Drawer';

type Request = { message: string; initial: string; secret: boolean; confirmation?: boolean; danger?: boolean; detail?: string; action?: string; resolve: (value: string | null) => void };
let open: ((request: Request) => void) | null = null;
export function promptText(message: string, initial = '', secret = false): Promise<string | null> {
  return new Promise((resolve) => { if (open) open({ message, initial, secret, resolve }); else resolve(null); });
}
export function confirmAction(message: string, detail = '', action = 'Delete', danger = true): Promise<boolean> {
  return new Promise((resolve) => { if (open) open({ message, initial: '', secret: false, confirmation: true, detail, action, danger, resolve: (value) => resolve(value !== null) }); else resolve(false); });
}

/** Electron does not implement window.prompt. Keep text entry inside the renderer. */
export function TextPrompt() {
  const [request, setRequest] = useState<Request | null>(null);
  const [value, setValue] = useState('');
  const current = useRef<Request | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    open = (next) => { current.current?.resolve(null); current.current = next; setValue(next.initial); setRequest(next); };
    return () => { open = null; current.current?.resolve(null); };
  }, []);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, [request]);
  const finish = (result: string | null) => { current.current?.resolve(result); current.current = null; setRequest(null); };
  if (!request) return null;
  return <Drawer key={request.message} title={request.message} eyebrow={request.confirmation ? 'CONFIRMATION' : 'FILE OPERATION'} onClose={() => finish(null)} onSubmit={() => finish(value)} footer={<><button autoFocus={request.confirmation} className="hd-btn" type="button" onClick={() => finish(null)}>Cancel</button><button className={'hd-btn ' + (request.danger ? 'danger' : 'primary')} type="submit">{request.action ?? 'Apply'}</button></>}>
      {request.confirmation ? <p className="hd-dialog-note">{request.detail}</p> : <input ref={input} className="hd-input" aria-label={request.message} type={request.secret ? 'password' : 'text'} autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />}
  </Drawer>;
}
