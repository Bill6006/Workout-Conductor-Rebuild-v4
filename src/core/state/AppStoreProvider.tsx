import { useEffect, type ReactNode } from 'react';
import type { AppStore } from './appStore';
import { AppStoreContext } from './appStoreContext';

interface AppStoreProviderProps {
  store: AppStore;
  children: ReactNode;
}

export function AppStoreProvider({ store, children }: AppStoreProviderProps) {
  useEffect(() => {
    void store.hydrate();
  }, [store]);

  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}
