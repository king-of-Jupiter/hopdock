import { useEffect, useState } from 'react';
import { IconAlertCircle } from '@tabler/icons-react';
import { explainError } from '@hopdock/core';
import { Icons } from './icons';

export function ErrorNotice({ error, context = '', onDismiss, onRetry }: { error: unknown; context?: string; onDismiss?: () => void; onRetry?: () => void }) {
  if (!error) return null;
  const issue = explainError(error, context);
  return <div className="hd-error-notice" role="alert">
    <IconAlertCircle className="hd-error-icon" size={22} stroke={1.7} aria-hidden="true" />
    <div className="hd-error-copy"><strong>{issue.title}</strong><p>{issue.message}</p><p className="hd-error-hint">{issue.hint}</p>
      {(issue.action || onRetry) && <div className="hd-error-actions">
        {issue.action && <button className="hd-btn" type="button" onClick={() => window.dispatchEvent(new CustomEvent('hopdock:navigate', { detail: issue.action }))}>{issue.action === 'keys' ? 'Open Keychain' : issue.action === 'settings' ? 'Open Settings' : 'Open hosts'}</button>}
        {onRetry && <button className="hd-btn" type="button" onClick={onRetry}>Try again</button>}
      </div>}
      <details className="hd-error-details"><summary>Error details</summary><code>{issue.code}{issue.operation ? ` (${issue.operation})` : ''}</code></details>
    </div>
    {onDismiss && <button className="hd-icon-btn hd-error-dismiss" type="button" aria-label="Dismiss error" onClick={onDismiss}><Icons.close /></button>}
  </div>;
}

type Notification = { id: number; error: unknown; context: string; retry?: () => void };
let nextId = 0;
let notices: Notification[] = [];
const subscribers = new Set<() => void>();
export function notifyError(error: unknown, context = '', retry?: () => void): void {
  const issue = explainError(error, context);
  notices = notices.filter((item) => { const previous = explainError(item.error, item.context); return previous.code !== issue.code || previous.operation !== issue.operation || item.context !== context; });
  notices = [...notices, { id: ++nextId, error, context, retry }].slice(-3);
  for (const subscriber of subscribers) subscriber();
}
export function ErrorNotifications() {
  const [items, setItems] = useState(notices);
  useEffect(() => { const update = () => setItems([...notices]); subscribers.add(update); update(); return () => { subscribers.delete(update); }; }, []);
  const dismiss = (id: number) => { notices = notices.filter((item) => item.id !== id); for (const subscriber of subscribers) subscriber(); };
  return <div className="hd-error-notifications" aria-label="Notifications">{items.map((item) => <ErrorNotice key={item.id} error={item.error} context={item.context} onDismiss={() => dismiss(item.id)} onRetry={item.retry ? () => { dismiss(item.id); item.retry?.(); } : undefined} />)}</div>;
}
