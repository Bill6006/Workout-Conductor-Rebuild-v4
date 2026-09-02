import { useSyncExternalStore } from 'react';

/**
 * A tiny clock store so components can read "now" without calling impure
 * functions during render. Updates once a minute while anything subscribes.
 */

const TICK_MS = 60_000;

let snapshot = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      snapshot = Date.now();
      for (const notify of listeners) notify();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function getSnapshot(): number {
  return snapshot;
}

function getServerSnapshot(): number {
  return 0;
}

/** Epoch milliseconds, refreshed about once a minute. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDayLabel(epochMs: number, locale = 'en-US'): string {
  if (!epochMs) return '';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(epochMs));
}

export function formatDateTime(iso: string | null | undefined, locale = 'en-US'): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
