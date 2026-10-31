import { useEffect, useState } from 'react';
import { useAppStore } from '../../core/state/useAppStore';
import type { LifeMirrorPrefill } from '../../engine/readiness/lifeMirror';

/**
 * Today's Life Mirror check-in for the check-in sheet (item 48), read each time the sheet opens and
 * never again while it is open: a later change in Life Mirror changes no plan. Null while it reads,
 * with the switch off, and on anything missing.
 */
export function useLifeMirrorPrefill(open: boolean): LifeMirrorPrefill | null {
  const store = useAppStore();
  const [prefill, setPrefill] = useState<{ read: LifeMirrorPrefill | null } | null>(null);
  useEffect(() => {
    if (!open) return;
    let current = true;
    void store.lifeMirrorPrefill().then((read) => {
      if (current) setPrefill({ read });
    });
    return () => {
      current = false;
      setPrefill(null);
    };
  }, [open, store]);
  return prefill?.read ?? null;
}
