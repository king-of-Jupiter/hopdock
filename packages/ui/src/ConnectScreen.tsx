import { useState } from 'react';
import { IconCheck, IconX, IconCopy, IconPencil, IconRefresh } from '@tabler/icons-react';
import type { Host } from '@hopdock/core';
import { explainError } from '@hopdock/core';
import type { ConnectStage } from './preload-api';
import { OsIcon } from './OsIcon';

export interface StageEntry { stage: ConnectStage; detail?: string; at: number }

const ORDER: ConnectStage[] = ['socket', 'connected', 'hostkey', 'handshake', 'auth', 'shell', 'ready'];
/** The visible steps and the stage that completes each one. */
const STEPS: { label: string; doneAt: ConnectStage; detailFrom: ConnectStage }[] = [
  { label: 'Network', doneAt: 'connected', detailFrom: 'socket' },
  { label: 'Host key', doneAt: 'hostkey', detailFrom: 'hostkey' },
  { label: 'Encryption', doneAt: 'handshake', detailFrom: 'handshake' },
  { label: 'Authentication', doneAt: 'shell', detailFrom: 'auth' },
  { label: 'Shell', doneAt: 'ready', detailFrom: 'shell' },
];

function reached(log: StageEntry[], stage: ConnectStage): StageEntry | undefined {
  return log.find((entry) => entry.stage === stage);
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.max(0, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Full-area connection screen: a live step trail while connecting, a diagnosis with next actions when it fails. */
export function ConnectScreen({ host, log, startedAt, failedAt, error, onRetry, onEditHost, onCloseTab }: {
  host: Host; log: StageEntry[]; startedAt: number; failedAt?: number; error?: unknown;
  onRetry: () => void; onEditHost?: () => void; onCloseTab?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const failed = error !== undefined && error !== '';
  const furthest = log.reduce((max, entry) => Math.max(max, ORDER.indexOf(entry.stage)), -1);
  const doneCount = STEPS.filter((step) => ORDER.indexOf(step.doneAt) <= furthest).length;
  const issue = failed ? explainError(error, 'ssh:connect') : null;
  const address = `${host.host.includes(':') ? `[${host.host}]` : host.host}:${host.port}`;
  const methods = reached(log, 'auth')?.detail?.match(/\(([^)]*)\)/)?.[1];
  const elapsed = formatMs((failedAt ?? Date.now()) - startedAt);
  const beforeNetwork = failed && log.length === 0;
  const failedStep = !failed ? '' : beforeNetwork ? 'Saved credentials' : STEPS[Math.min(doneCount, STEPS.length - 1)]!.label;

  const report = () => [
    `Host: ${host.name}`, `Address: ${address}`, `Username: ${host.username}`,
    ...(issue ? [`Error: ${issue.title} (${issue.code})`, `Failed at: ${failedStep}`] : []),
    `Elapsed: ${elapsed}`,
    ...log.map((entry) => `+${formatMs(entry.at - startedAt)} ${entry.stage}${entry.detail ? ` ${entry.detail}` : ''}`),
  ].join('\n');

  return <div className={'hd-connect' + (failed ? ' failed' : '')} role={failed ? 'alert' : 'status'} aria-live="polite" data-testid="connect-screen">
    <div className="hd-connect-inner">
      <div className="hd-connect-route" aria-hidden="true">
        <span className="hd-connect-node local"><img src={new URL('./assets/hopdock-mark.svg', import.meta.url).href} alt="" /></span>
        <span className="hd-connect-track">
          <span className="hd-connect-fill" style={{ transform: `scaleX(${failed ? doneCount / STEPS.length : Math.max(0.04, doneCount / STEPS.length)})` }} />
          {!failed && <span className="hd-connect-pulse" />}
          {failed && <span className="hd-connect-break" style={{ left: `${(doneCount / STEPS.length) * 100}%` }}><IconX size={14} stroke={2.4} /></span>}
        </span>
        <span className="hd-connect-node remote"><OsIcon host={host} /></span>
      </div>

      <div className="hd-connect-heading">
        <h2>{failed ? issue!.title : `Connecting to ${host.name}`}</h2>
        <p className="hd-connect-address">{host.username}@{address}</p>
      </div>

      {failed && <div className="hd-connect-diagnosis">
        <p>{issue!.message}</p>
        <p className="hd-connect-hint">{issue!.hint}</p>
      </div>}

      <ol className="hd-connect-steps">
        {STEPS.map((step, index) => {
          const done = index < doneCount;
          const current = index === doneCount && !failed;
          const broken = failed && !beforeNetwork && index === doneCount;
          const detail = reached(log, step.detailFrom)?.detail;
          const at = reached(log, step.doneAt)?.at;
          return <li key={step.label} className={done ? 'done' : broken ? 'broken' : current ? 'current' : 'pending'}>
            <span className="hd-connect-mark" aria-hidden="true">{done ? <IconCheck size={13} stroke={2.6} /> : broken ? <IconX size={13} stroke={2.6} /> : null}</span>
            <span className="hd-connect-step-label">{step.label}<span className="hd-sr-only">{done ? ', done' : broken ? ', failed' : current ? ', in progress' : ''}</span></span>
            <span className="hd-connect-step-detail" title={detail}>{detail ?? ''}</span>
            <span className="hd-connect-step-time">{done && at ? formatMs(at - startedAt) : ''}</span>
          </li>;
        })}
      </ol>

      {failed && <>
        <dl className="hd-connect-facts">
          <div><dt>Failed at</dt><dd>{failedStep}</dd></div>
          <div><dt>Auth methods</dt><dd>{methods ?? (host.auth.type === 'key' ? 'publickey' : host.auth.type)}</dd></div>
          <div><dt>Elapsed</dt><dd>{elapsed}</dd></div>
          <div><dt>Error code</dt><dd>{issue!.code}</dd></div>
        </dl>
        <div className="hd-connect-actions">
          <button className="hd-btn primary" type="button" onClick={onRetry}><IconRefresh size={16} stroke={1.8} />Reconnect</button>
          {onEditHost && <button className="hd-btn" type="button" onClick={onEditHost}><IconPencil size={16} stroke={1.8} />Edit host</button>}
          <button className="hd-btn quiet" type="button" onClick={() => { void navigator.clipboard.writeText(report()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => undefined); }}><IconCopy size={16} stroke={1.8} />{copied ? 'Copied' : 'Copy details'}</button>
          {onCloseTab && <button className="hd-btn quiet" type="button" onClick={onCloseTab}>Close tab</button>}
        </div>
      </>}
    </div>
  </div>;
}
