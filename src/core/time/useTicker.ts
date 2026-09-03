import { useEffect, useState } from 'react';

/**
 * Epoch milliseconds refreshed every `intervalMs` while `active`, for the
 * elapsed clock and the rest timer. Inactive components pay nothing.
 */
export function useTicker(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    // The first value comes from the initial state; ticks refresh it from here on.
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active]);
  return now;
}
