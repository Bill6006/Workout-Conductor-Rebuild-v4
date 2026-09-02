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
