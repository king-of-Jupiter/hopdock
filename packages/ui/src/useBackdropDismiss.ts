import { useRef } from 'react';
import type { MouseEvent, PointerEvent } from 'react';

/** A backdrop click must start and finish on the backdrop without dragging. */
export function useBackdropDismiss(onDismiss: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      start.current = event.target === event.currentTarget && event.isPrimary && event.button === 0
        ? { x: event.clientX, y: event.clientY } : null;
    },
    onPointerCancel() { start.current = null; },
    onClick(event: MouseEvent<HTMLDivElement>) {
      const origin = start.current;
      start.current = null;
      if (origin && event.target === event.currentTarget && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) <= 5) onDismiss();
    },
  };
}
