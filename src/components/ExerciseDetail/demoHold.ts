import { useSyncExternalStore } from 'react';

/**
 * Demonstrations the lifter paused (Maintenance 25, the phone review). Pause in the workout's How
 * to holds that exercise's demonstration still there and on its workout card until Play, for this
 * workout only: the key names the session, the entry and the exercise, so a swap, another workout
 * or a How to opened anywhere else (the library, Today's details) holds nothing. It lasts while
 * the app stays open; a reload starts every demonstration moving again. A pause the browser makes
 * (a refused autoplay, a page in the background) is not the lifter's, and holds nothing.
 */
const held = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function announce(): void {
  for (const listener of [...listeners]) listener();
}

/** The key a workout's card and its How to share for one exercise of one entry. */
export function demoHoldKey(sessionId: string, entryId: string, exerciseId: string): string {
  return `${sessionId}|${entryId}|${exerciseId}`;
}

/** Holds a demonstration still, or lets it move again. */
export function holdDemo(key: string, hold: boolean): void {
  if (held.has(key) === hold) return;
  if (hold) held.add(key);
  else held.delete(key);
  announce();
}

export function isDemoHeld(key: string | null): boolean {
  return key !== null && held.has(key);
}

/** Whether the lifter paused this demonstration; never, without a key. */
export function useDemoHeld(key: string | null): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isDemoHeld(key),
    () => false,
  );
}

/** Tests only: every demonstration moving again. */
export function releaseAllDemos(): void {
  if (held.size === 0) return;
  held.clear();
  announce();
}
