import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import type { Host, Snippet } from '@hopdock/core';
import { TerminalSnippets } from './TerminalSnippets';
import type { HopdockApi } from './preload-api';
import { ErrorNotice, notifyError } from './ErrorNotice';

declare global {
  interface Window {
    hopdock: HopdockApi;
  }
}

function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const textDecoder = new TextDecoder();

export function TerminalView({ host, snippets, snippetsOpen, onHideSnippets, onChanged }: { host: Host; snippets: Snippet[]; snippetsOpen: boolean; onHideSnippets: () => void; onChanged: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'closed' | 'error'>('connecting');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let alive = true;
    let opened = false;
    const term = new Terminal({
      theme: { background: '#1b1c19', foreground: '#e9e6df', green: '#91b17d', cursor: '#c3c9ac', selectionBackground: 'rgba(145,177,125,0.25)' },
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 13,
      cursorStyle: 'bar',
      cursorBlink: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    termRef.current = term;
    fit.fit();

    const offData = window.hopdock.ssh.onData((e) => {
      if (e.id === host.id && alive) term.write(textDecoder.decode(b64decode(e.data)));
    });
    const offClose = window.hopdock.ssh.onClose((e) => {
      if (e.id === host.id && alive) { setStatus('closed'); if (opened) setError('Connection closed'); }
    });
    term.onData((d) => {
      void window.hopdock.ssh.write(host.id, b64encode(d)).catch((error) => notifyError(error, 'Send terminal input'));
    });

    const ro = new ResizeObserver(() => {
      if (!alive) return;
      try {
        fit.fit();
        const dims = fit.proposeDimensions();
        if (dims?.cols && dims?.rows) void window.hopdock.ssh.resize(host.id, dims.cols, dims.rows).catch((error) => notifyError(error, 'Resize terminal'));
      } catch {
        /* terminal not laid out yet */
      }
    });
    ro.observe(el);

    (async () => {
      try {
        const dims = fit.proposeDimensions();
        await window.hopdock.ssh.connect({ hostId: host.id, cols: dims?.cols ?? 80, rows: dims?.rows ?? 24 });
        opened = true;
        if (alive) setStatus('live');
        else void window.hopdock.ssh.close(host.id);
      } catch (err) {
        if (alive) {
          setError(String(err));
          setStatus('error');
        }
      }
    })();

    return () => {
      alive = false;
      offData();
      offClose();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      if (opened) void window.hopdock.ssh.close(host.id);
    };
  }, [host.id, attempt]);

  return (
    <div className={'hd-terminal-workspace' + (snippetsOpen ? ' hd-with-snippets' : '')}>
    <div className="hd-term-wrap" data-testid="terminal" data-status={status}>
      <div className="hd-term-bar">
        <span className="hd-badge ok">{status === 'live' ? 'Connected' : status}</span>
        <span>
          {host.username}@{host.host}:{host.port}
        </span>
        <span style={{ marginLeft: 'auto' }} />
        {(status === 'closed' || status === 'error') && (
          <button className="hd-btn" type="button" onClick={() => { setStatus('connecting'); setError(''); setAttempt((a) => a + 1); }}>
            Reconnect
          </button>
        )}
      </div>
      <ErrorNotice error={error} context="SSH connection" onDismiss={() => setError('')} />
      <div className="hd-term" ref={boxRef} />
    </div>
    {snippetsOpen && <TerminalSnippets snippets={snippets} connected={status === 'live'} onHide={onHideSnippets} onChanged={onChanged} onRun={async (script) => {
      if (status !== 'live') throw new Error('Connection closed');
      await window.hopdock.ssh.write(host.id, b64encode(script.replace(/\r\n/g, '\n').replace(/\n?$/, '\n')));
      termRef.current?.focus();
    }} />}
    </div>
  );
}
