/**
 * Thin promise wrapper over IndexedDB: the single durable-data owner.
 *
 * Stores are keyed by `id`. Schema upgrades happen in `upgradeDatabase`, which
 * only ever adds stores or indexes; a deployment can never wipe user data.
 *
 * Seven stores are mirrored to the optional cloud copy. Every put, delete, and
 * clear on one of them writes an outbox entry in the same transaction, so the
 * outbox can never disagree with the store. Records that arrive from the cloud
 * are written with `applyRemote` and `applyRemoteDelete`, which touch no
 * outbox, so a pull never re-enqueues what it applied.
 */

/**
 * Every GitHub Pages project of one account shares the same origin, and IndexedDB is
 * per origin, so the name carries the app generation to stay clear of earlier apps.
 */
export const DB_NAME = 'workout-conductor-v4';
export const DB_VERSION = 5;

export const STORE_NAMES = [
  'profile',
  'locations',
  'workouts',
  'meta',
  'customExercises',
  'customInstructions',
  'customMedia',
  'savedWorkouts',
  'backups',
  /** Local writes waiting for the cloud copy: one entry per record, latest operation wins. */
  'outbox',
  /** The cloud token and sync state. This device only; never in a backup. */
  'cloud',
] as const;
export type StoreName = (typeof STORE_NAMES)[number];

/** The stores the cloud copy mirrors. Never custom media, never backups, never the outbox itself. */
export const SYNCED_STORES = [
  'profile',
  'locations',
  'workouts',
  'meta',
  'customExercises',
  'customInstructions',
  'savedWorkouts',
] as const;
export type SyncedStore = (typeof SYNCED_STORES)[number];

const SYNCED = new Set<string>(SYNCED_STORES);

export function isSyncedStore(store: string): store is SyncedStore {
  return SYNCED.has(store);
}

export class StorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export interface Identified {
  id: string;
}

/** A local write the cloud copy has not received yet. */
export interface OutboxEntry extends Identified {
  store: SyncedStore;
  recordId: string;
  op: 'put' | 'delete';
  queuedAt: string;
}

export function outboxKey(store: SyncedStore, recordId: string): string {
  return `${store}|${recordId}`;
}

export interface Database {
  readonly name: string;
  get<T extends Identified>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T extends Identified>(store: StoreName): Promise<T[]>;
  /** A local write. On a synced store it also queues the record for the cloud copy. */
  put<T extends Identified>(store: StoreName, value: T): Promise<void>;
  /** A local delete. On a synced store it also queues a tombstone for the cloud copy. */
  delete(store: StoreName, key: string): Promise<void>;
  /** Empties a store. On a synced store every record present queues a tombstone. */
  clear(store: StoreName): Promise<void>;
  count(store: StoreName): Promise<number>;
  /** Writes a record that arrived from the cloud copy. No outbox entry. */
  applyRemote<T extends Identified>(store: SyncedStore, value: T): Promise<void>;
  /** Removes a record the cloud copy deleted. No outbox entry. */
  applyRemoteDelete(store: SyncedStore, key: string): Promise<void>;
  /** Called after any write to the outbox, so the app can schedule a push. */
  watchOutbox(listener: () => void): () => void;
  close(): void;
}

export interface OpenDatabaseOptions {
  factory?: IDBFactory;
  name?: string;
  /** Clock for outbox timestamps; tests pin it. */
  now?: () => string;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export function upgradeDatabase(db: IDBDatabase): void {
  for (const name of STORE_NAMES) {
    if (!db.objectStoreNames.contains(name)) {
      db.createObjectStore(name, { keyPath: 'id' });
    }
  }
}

function resolveFactory(explicit?: IDBFactory): IDBFactory {
  if (explicit) return explicit;
  if (typeof indexedDB !== 'undefined' && indexedDB) return indexedDB;
  throw new StorageUnavailableError('IndexedDB is not available in this browser.');
}

function openAt(factory: IDBFactory, name: string, version?: number): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = version === undefined ? factory.open(name) : factory.open(name, version);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => upgradeDatabase(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'));
    request.onblocked = () =>
      reject(new StorageUnavailableError('IndexedDB is blocked by another open tab.'));
  });
}

function isVersionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'VersionError'
  );
}

function toUnavailable(error: unknown): StorageUnavailableError {
  if (error instanceof StorageUnavailableError) return error;
  return new StorageUnavailableError(
    error instanceof Error ? error.message : 'Could not open IndexedDB.',
  );
}

function missingStores(db: IDBDatabase): boolean {
  return STORE_NAMES.some((store) => !db.objectStoreNames.contains(store));
}

export async function openDatabase(options: OpenDatabaseOptions = {}): Promise<Database> {
  const factory = resolveFactory(options.factory);
  const name = options.name ?? DB_NAME;
  const now = options.now ?? (() => new Date().toISOString());

  let db: IDBDatabase;
  try {
    db = await openAt(factory, name, DB_VERSION);
  } catch (error) {
    if (!isVersionError(error)) throw toUnavailable(error);
    // A database with this name already exists at a higher version: another app on this
    // origin, or a newer build. Open it as it is and add any missing stores one version up.
    // Existing stores are never removed.
    try {
      const existing = await openAt(factory, name);
      const currentVersion = existing.version;
      const missing = missingStores(existing);
      existing.close();
      db = await openAt(factory, name, missing ? currentVersion + 1 : currentVersion);
    } catch (recoveryError) {
      throw toUnavailable(recoveryError);
    }
  }
  // The same version number can exist with stores missing (created by another app at exactly
  // our version). An open at an equal version never upgrades, so add the stores one version up.
  if (missingStores(db)) {
    const currentVersion = db.version;
    db.close();
    try {
      db = await openAt(factory, name, currentVersion + 1);
    } catch (recoveryError) {
      throw toUnavailable(recoveryError);
    }
  }

  db.onversionchange = () => db.close();

  const outboxListeners = new Set<() => void>();
  const notifyOutbox = () => {
    for (const listener of outboxListeners) listener();
  };

  async function run<T>(
    store: StoreName,
    mode: IDBTransactionMode,
    operation: (objectStore: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const transaction = db.transaction(store, mode);
    const request = operation(transaction.objectStore(store));
    const [result] = await Promise.all([requestToPromise(request), transactionDone(transaction)]);
    return result;
  }

  /** One readwrite transaction across a synced store and the outbox, so they cannot disagree. */
  async function runWithOutbox(
    store: SyncedStore,
    operation: (objectStore: IDBObjectStore, outbox: IDBObjectStore) => void,
  ): Promise<void> {
    const transaction = db.transaction([store, 'outbox'], 'readwrite');
    operation(transaction.objectStore(store), transaction.objectStore('outbox'));
    await transactionDone(transaction);
    notifyOutbox();
  }

  const entry = (store: SyncedStore, recordId: string, op: OutboxEntry['op']): OutboxEntry => ({
    id: outboxKey(store, recordId),
    store,
    recordId,
    op,
    queuedAt: now(),
  });

  return {
    name,
    get: (store, key) => run(store, 'readonly', (objectStore) => objectStore.get(key)),
    getAll: (store) => run(store, 'readonly', (objectStore) => objectStore.getAll()),
    put: async (store, value) => {
      if (isSyncedStore(store)) {
        await runWithOutbox(store, (objectStore, outbox) => {
          objectStore.put(value);
          outbox.put(entry(store, value.id, 'put'));
        });
        return;
      }
      await run(store, 'readwrite', (objectStore) => objectStore.put(value));
    },
    delete: async (store, key) => {
      if (isSyncedStore(store)) {
        await runWithOutbox(store, (objectStore, outbox) => {
          objectStore.delete(key);
          outbox.put(entry(store, key, 'delete'));
        });
        return;
      }
      await run(store, 'readwrite', (objectStore) => objectStore.delete(key));
    },
    clear: async (store) => {
      if (isSyncedStore(store)) {
        await runWithOutbox(store, (objectStore, outbox) => {
          const keys = objectStore.getAllKeys();
          keys.onsuccess = () => {
            for (const key of keys.result) outbox.put(entry(store, String(key), 'delete'));
            objectStore.clear();
          };
        });
        return;
      }
      await run(store, 'readwrite', (objectStore) => objectStore.clear());
    },
    count: (store) => run(store, 'readonly', (objectStore) => objectStore.count()),
    applyRemote: async (store, value) => {
      await run(store, 'readwrite', (objectStore) => objectStore.put(value));
    },
    applyRemoteDelete: async (store, key) => {
      await run(store, 'readwrite', (objectStore) => objectStore.delete(key));
    },
    watchOutbox: (listener) => {
      outboxListeners.add(listener);
      return () => outboxListeners.delete(listener);
    },
    close: () => db.close(),
  };
}
