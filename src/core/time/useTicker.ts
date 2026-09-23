import { useEffect, useState } from 'react';

/**
 * Epoch milliseconds refreshed every `intervalMs` while `active`, for the
 * elapsed clock, the rest timer and a hold's countdown. Inactive components
 * pay nothing, and a countdown passes its end time so the ticks stop there.
 */
export function useTicker(
  intervalMs: number,
  active: boolean,
  untilMs: number | null = null,
): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (untilMs !== null && current >= untilMs) window.clearInterval(id);
    };
    // Waking up (a resume, a start) reads the clock at once rather than a tick later, so a
    // countdown never shows the time from before the pause.
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [intervalMs, active, untilMs]);
  return now;
}
