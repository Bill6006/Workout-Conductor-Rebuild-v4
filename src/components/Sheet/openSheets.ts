import { useSyncExternalStore } from 'react';

/**
 * How many sheets are open (Maintenance 25): one sheet closing while another stays open leaves the
 * page locked, and the last one closing gives it back. The workout card's clip rests in place
 * while any is open, so the card and a sheet never play the same clip at once (the phone review).
 */
let openSheets = 0;
const listeners = new Set<() => void>();

/** One sheet more open (+1) or closed (-1); the count after it. */
export function changeOpenSheets(by: 1 | -1): number {
  openSheets = Math.max(0, openSheets + by);
  for (const listener of [...listeners]) listener();
  return openSheets;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function ignore(): () => void {
  return () => {};
}

/**
 * Whether any sheet is open. Only what asks (watch) follows the sheets: a list's still rows never
 * render again when one opens (the re-check of the phone review).
 */
export function useAnySheetOpen(watch = true): boolean {
  return useSyncExternalStore(
    watch ? subscribe : ignore,
    () => watch && openSheets > 0,
    () => false,
  );
}
