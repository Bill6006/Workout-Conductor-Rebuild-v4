import { useEffect, useState } from 'react';
import { useAppStore } from '../../core/state/useAppStore';
import type { LifeMirrorPrefill } from '../../engine/readiness/lifeMirror';

/** How long the check-in waits for Life Mirror's: a read later than this changes nothing on it. */
export const PREFILL_WAIT_MS = 3000;

/**
 * Today's Life Mirror check-in for the check-in sheet (item 48), read each time the sheet opens with
 * nothing told today (`open`), and never again while it is open: a later change in Life Mirror
 * changes no plan. A read slower than `PREFILL_WAIT_MS` is let go, so no value the lifter has looked
 * at changes under them (the review of item 48). Null while it reads, with the switch off, and on
 * anything missing.
 */
export function useLifeMirrorPrefill(open: boolean): LifeMirrorPrefill | null {
  const store = useAppStore();
  const [prefill, setPrefill] = useState<{ read: LifeMirrorPrefill | null } | null>(null);
  useEffect(() => {
    if (!open) return;
    let waiting = true;
    const done = (read: LifeMirrorPrefill | null) => {
      if (!waiting) return;
      waiting = false;
      setPrefill({ read });
    };
    const timer = setTimeout(() => done(null), PREFILL_WAIT_MS);
    void store.lifeMirrorPrefill().then(done);
    return () => {
      waiting = false;
      clearTimeout(timer);
      setPrefill(null);
    };
  }, [open, store]);
  return prefill?.read ?? null;
}
