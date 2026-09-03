import { useContext, useSyncExternalStore } from 'react';
import type { AppState, AppStore } from './appStore';
import { AppStoreContext } from './appStoreContext';

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error('useAppStore must be used inside AppStoreProvider.');
  }
  return store;
}

export function useAppState(): AppState {
  const store = useAppStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/**
 * Subscribes to one slice of the state. React skips the re-render when the
 * selected value is referentially unchanged, so a set edit only re-renders the
 * components that read the session.
 */
export function useAppSelector<T>(selector: (state: AppState) => T): T {
  const store = useAppStore();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
    () => selector(store.getSnapshot()),
  );
}
