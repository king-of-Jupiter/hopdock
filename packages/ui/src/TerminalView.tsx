import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import type { Host } from '@hopdock/core';
import type { HopdockApi } from './preload-api';

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

export function TerminalView({ host }: { host: Host }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'closed' | 'error'>('connecting');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let alive = true;
    let opened = false;
    const term = new Terminal({
      theme: { background: '#0b0e13', foreground: '#c8d3e0', green: '#3fb27f', cursor: '#3fb27f', selectionBackground: 'rgba(63,178,127,0.3)' },
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 13,
      cursorStyle: 'bar',
      cursorBlink: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    const offData = window.hopdock.ssh.onData((e) => {
      if (e.id === host.id && alive) term.write(textDecoder.decode(b64decode(e.data)));
    });
    const offClose = window.hopdock.ssh.onClose((e) => {
      if (e.id === host.id && alive) setStatus('closed');
    });
    term.onData((d) => {
      void window.hopdock.ssh.write(host.id, b64encode(d));
    });

    const ro = new ResizeObserver(() => {
      if (!alive) return;
      try {
        fit.fit();
        const dims = fit.proposeDimensions();
        if (dims?.cols && dims?.rows) void window.hopdock.ssh.resize(host.id, dims.cols, dims.rows);
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
      if (opened) void window.hopdock.ssh.close(host.id);
    };
  }, [host.id, attempt]);

  return (
    <div className="hd-term-wrap">
      <div className="hd-term-bar">
        <span className="hd-badge ok">{status === 'live' ? 'Connected' : status}</span>
        <span>
          {host.username}@{host.host}:{host.port}
        </span>
        {error && <span style={{ color: 'var(--hd-danger)' }}>{error}</span>}
        <span style={{ marginLeft: 'auto' }} />
        {(status === 'closed' || status === 'error') && (
          <button className="hd-btn" type="button" onClick={() => { setStatus('connecting'); setError(''); setAttempt((a) => a + 1); }}>
            Reconnect
          </button>
        )}
      </div>
      <div className="hd-term" ref={boxRef} />
    </div>
  );
}
