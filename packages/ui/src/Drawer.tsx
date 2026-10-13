import { useEffect, useRef } from 'react';
import type { ReactNode, FormEventHandler } from 'react';
import { Icons } from './icons';
import { useBackdropDismiss } from './useBackdropDismiss';

export function Drawer({ title, eyebrow, description, children, footer, onClose, onSubmit, busy = false, className = '' }: {
  title: string; eyebrow?: string; description?: string; children: ReactNode; footer: ReactNode;
  onClose: () => void; onSubmit?: FormEventHandler<HTMLFormElement>; busy?: boolean; className?: string;
}) {
  const panel = useRef<HTMLFormElement>(null);
  const previousFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useEffect(() => {
    const control = panel.current?.querySelector<HTMLElement>('input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)');
    control?.focus();
    return () => { if (previousFocus.current?.isConnected) previousFocus.current.focus(); };
  }, []);
  const close = () => { if (!busy) onClose(); };
  const backdrop = useBackdropDismiss(close);
  return <div className="hd-overlay hd-drawer-overlay" {...backdrop}>
    <form ref={panel} className={`hd-modal hd-drawer ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }} onSubmit={(event) => { event.preventDefault(); onSubmit?.(event); }}>
      <header className="hd-drawer-heading"><div>{eyebrow && <span className="hd-dialog-eyebrow">{eyebrow}</span>}<h2>{title}</h2></div><button className="hd-icon-btn" type="button" aria-label={`Close ${title.toLowerCase()}`} disabled={busy} onClick={close}><Icons.close /></button></header>
      <div className="hd-drawer-body">{description && <p className="hd-dialog-note hd-drawer-description">{description}</p>}{children}</div>
      <footer className="hd-drawer-footer">{footer}</footer>
    </form>
  </div>;
}
