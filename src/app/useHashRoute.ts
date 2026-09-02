import { useSyncExternalStore } from 'react';
import { parseRouteId, type RouteId } from './navigation';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function getSnapshot(): string {
  return window.location.hash;
}

function getServerSnapshot(): string {
  return '';
}

/** Hash-based routing keeps deep links and reloads working under the Pages subpath. */
export function useHashRoute(): RouteId {
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return parseRouteId(hash);
}
