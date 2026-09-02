import { IDBFactory } from 'fake-indexeddb';
import type { ReactNode } from 'react';
import { ToastProvider } from '../components/Toast/Toast';
import { AppStoreProvider } from '../core/state/AppStoreProvider';
import { AppStore, type AppStoreOptions } from '../core/state/appStore';
import { openDatabase } from '../core/storage/indexedDb';
import { createMemoryStorage, type KeyValueStorage } from '../core/storage/localSettings';

export const TEST_NOW = '2026-09-02T12:00:00.000Z';

export interface TestStoreHandle {
  store: AppStore;
  factory: IDBFactory;
  storage: KeyValueStorage;
}

type TestStoreOptions = Partial<AppStoreOptions> & {
  factory?: IDBFactory;
  storage?: KeyValueStorage;
};

/** An AppStore backed by a private fake IndexedDB and in-memory settings. */
export function createTestStore(options: TestStoreOptions = {}): TestStoreHandle {
  const factory = options.factory ?? new IDBFactory();
  const storage = options.storage ?? createMemoryStorage();
  const store = new AppStore({
    openDb: () => openDatabase({ factory, name: 'wc-test' }),
    storage,
    now: () => TEST_NOW,
    ...options,
  });
  return { store, factory, storage };
}

export function Providers({ store, children }: { store: AppStore; children: ReactNode }) {
  return (
    <AppStoreProvider store={store}>
      <ToastProvider>{children}</ToastProvider>
    </AppStoreProvider>
  );
}
