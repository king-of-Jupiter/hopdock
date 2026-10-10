import { useEffect, useState } from 'react';

export interface MenuItem {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/** Minimal right-click menu. Owner controls visibility via null | {x,y,items}. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    setPos({ x: Math.min(x, window.innerWidth - 240), y: Math.min(y, window.innerHeight - items.length * 38 - 20) });
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [x, y, items.length, onClose]);
  return (
    <div className="hd-menu" style={{ left: pos.x, top: pos.y }}>
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          className={it.danger ? 'danger' : ''}
          disabled={it.disabled}
          onClick={() => {
            it.onClick();
            onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
