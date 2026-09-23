import { useEffect } from 'react';

/**
 * Keeps the screen awake while `active`: the barcode at the desk, a hold counting down. The
 * browser drops the lock whenever the page is hidden, so it is taken again on the way back, and
 * a lock that is refused (no user gesture, low battery) only means the screen may dim.
 */
export function useWakeLock(active = true): void {
  useEffect(() => {
    if (!active) return undefined;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return undefined;
    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;
    const request = () => {
      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          if (cancelled) void lock.release().catch(() => undefined);
          else sentinel = lock;
        })
        .catch(() => undefined);
    };
    request();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
