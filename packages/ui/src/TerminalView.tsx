import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import type { Host, Snippet } from '@hopdock/core';
import { TerminalSnippets } from './TerminalSnippets';
import type { HopdockApi } from './preload-api';
import { ErrorNotice, notifyError } from './ErrorNotice';
import { ConnectScreen } from './ConnectScreen';
import type { StageEntry } from './ConnectScreen';
import { terminalSessionId, windowScope } from './session-scope';

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

export function TerminalView({ host, instance = 1, active = true, snippets, snippetsOpen, onHideSnippets, onChanged, onEditHost, onCloseTab }: {
  host: Host; instance?: number; active?: boolean; snippets: Snippet[]; snippetsOpen: boolean; onHideSnippets: () => void; onChanged: () => void;
  onEditHost?: () => void; onCloseTab?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'closed' | 'error'>('connecting');
  const [error, setError] = useState<unknown>('');
  const [attempt, setAttempt] = useState(0);
  const [log, setLog] = useState<StageEntry[]>([]);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [failedAt, setFailedAt] = useState<number | undefined>();
  const sessionId = terminalSessionId(host.id, instance);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let alive = true;
    let opened = false;
    setLog([]); setStartedAt(Date.now()); setFailedAt(undefined);
    const styles = getComputedStyle(el);
    const token = (name: string) => styles.getPropertyValue(name).trim() || undefined;
    const term = new Terminal({
      theme: { background: token('--hd-term-bg'), foreground: token('--hd-term-ink'), green: token('--hd-term-green'), cursor: token('--hd-term-cursor'), selectionBackground: token('--hd-term-selection') },
      fontFamily: token('--hd-font-mono'),
      fontSize: 13,
      cursorStyle: 'bar',
      cursorBlink: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    termRef.current = term;
    fitRef.current = fit;
    fit.fit();

    const offProgress = window.hopdock.ssh.onProgress((e) => {
      if (e.id === sessionId && alive) setLog((previous) => [...previous, { stage: e.stage, detail: e.detail, at: Date.now() }]);
    });
    const offData = window.hopdock.ssh.onData((e) => {
      if (e.id === sessionId && alive) term.write(textDecoder.decode(b64decode(e.data)));
    });
    const offClose = window.hopdock.ssh.onClose((e) => {
      if (e.id === sessionId && alive && opened) { setStatus('closed'); setError('Connection closed'); }
    });
    term.onData((d) => {
      void window.hopdock.ssh.write(sessionId, b64encode(d)).catch((error) => notifyError(error, 'Send terminal input'));
    });

    const ro = new ResizeObserver(() => {
      if (!alive || !el.offsetParent) return;
      try {
        fit.fit();
        const dims = fit.proposeDimensions();
        if (dims?.cols && dims?.rows) void window.hopdock.ssh.resize(sessionId, dims.cols, dims.rows).catch((error) => notifyError(error, 'Resize terminal'));
      } catch {
        /* terminal not laid out yet */
      }
    });
    ro.observe(el);

    (async () => {
      try {
        const dims = fit.proposeDimensions();
        await window.hopdock.ssh.connect({ hostId: host.id, cols: dims?.cols ?? 80, rows: dims?.rows ?? 24, scope: windowScope, instance });
        opened = true;
        if (alive) { setStatus('live'); term.focus(); }
        else void window.hopdock.ssh.close(sessionId);
      } catch (err) {
        if (alive) {
          setFailedAt(Date.now());
          setError(err);
          setStatus('error');
        }
      }
    })();

    return () => {
      alive = false;
      offProgress();
      offData();
      offClose();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      if (opened) void window.hopdock.ssh.close(sessionId);
    };
  }, [host.id, instance, attempt]);

  // A background tab keeps its session; when it comes forward, refit to the space it now has.
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      try { fitRef.current?.fit(); } catch { /* not laid out yet */ }
      if (status === 'live') termRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  const reconnect = () => { setStatus('connecting'); setError(''); setAttempt((a) => a + 1); };

  return (
    <div className={'hd-terminal-workspace' + (snippetsOpen && active ? ' hd-with-snippets' : '')} hidden={!active}>
    <div className="hd-term-wrap" data-testid={active ? 'terminal' : undefined} data-status={status}>
      {status === 'closed' && <div className="hd-term-bar">
        <span className="hd-badge">Disconnected</span>
        <span>
          {host.username}@{host.host}:{host.port}
        </span>
        <span className="hd-spacer" />
        <button className="hd-btn" type="button" onClick={reconnect}>
          Reconnect
        </button>
      </div>}
      {status === 'closed' && <ErrorNotice error={error} context="SSH connection" onDismiss={() => setError('')} />}
      <div className="hd-term-stage">
        <div className="hd-term" ref={boxRef} />
        {(status === 'connecting' || status === 'error') && <ConnectScreen host={host} log={log} startedAt={startedAt} failedAt={failedAt} error={status === 'error' ? error : undefined} onRetry={reconnect} onEditHost={onEditHost} onCloseTab={onCloseTab} />}
      </div>
    </div>
    {snippetsOpen && active && <TerminalSnippets snippets={snippets} connected={status === 'live'} onHide={onHideSnippets} onChanged={onChanged} onRun={async (script) => {
      if (status !== 'live') throw new Error('Connection closed');
      await window.hopdock.ssh.write(sessionId, b64encode(script.replace(/\r\n/g, '\n').replace(/\n?$/, '\n')));
      termRef.current?.focus();
    }} />}
    </div>
  );
}
