import { useEffect, type ReactNode } from 'react';
import type { AppStore } from './appStore';
import { AppStoreContext } from './appStoreContext';

interface AppStoreProviderProps {
  store: AppStore;
  children: ReactNode;
}

export function AppStoreProvider({ store, children }: AppStoreProviderProps) {
  useEffect(() => {
    void store.hydrate().then(() => {
      store.startCloud();
      // Asks the browser to keep this app's storage, once per open (Maintenance 25).
      void store.ensurePersistence();
    });
    return () => store.stopCloud();
  }, [store]);

  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}
