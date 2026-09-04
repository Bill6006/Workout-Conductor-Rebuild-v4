/**
 * Thin promise wrapper over IndexedDB: the single durable-data owner.
 *
 * Stores are keyed by `id`. Schema upgrades happen in `upgradeDatabase`, which
 * only ever adds stores or indexes; a deployment can never wipe user data.
 */

/**
 * Every GitHub Pages project of one account shares the same origin, and IndexedDB is
 * per origin, so the name carries the app generation to stay clear of earlier apps.
 */
export const DB_NAME = 'workout-conductor-v4';
export const DB_VERSION = 3;

export const STORE_NAMES = [
  'profile',
  'locations',
  'workouts',
  'meta',
  'customExercises',
  'customInstructions',
  'customMedia',
  'savedWorkouts',
] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export class StorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export interface Identified {
  id: string;
}

export interface Database {
  readonly name: string;
  get<T extends Identified>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T extends Identified>(store: StoreName): Promise<T[]>;
  put<T extends Identified>(store: StoreName, value: T): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
  count(store: StoreName): Promise<number>;
  close(): void;
}

export interface OpenDatabaseOptions {
  factory?: IDBFactory;
  name?: string;
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

export async function openDatabase(options: OpenDatabaseOptions = {}): Promise<Database> {
  const factory = resolveFactory(options.factory);
  const name = options.name ?? DB_NAME;

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
      const missing = STORE_NAMES.some((store) => !existing.objectStoreNames.contains(store));
      existing.close();
      db = await openAt(factory, name, missing ? currentVersion + 1 : currentVersion);
    } catch (recoveryError) {
      throw toUnavailable(recoveryError);
    }
  }

  db.onversionchange = () => db.close();

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

  return {
    name,
    get: (store, key) => run(store, 'readonly', (objectStore) => objectStore.get(key)),
    getAll: (store) => run(store, 'readonly', (objectStore) => objectStore.getAll()),
    put: async (store, value) => {
      await run(store, 'readwrite', (objectStore) => objectStore.put(value));
    },
    delete: async (store, key) => {
      await run(store, 'readwrite', (objectStore) => objectStore.delete(key));
    },
    clear: async (store) => {
      await run(store, 'readwrite', (objectStore) => objectStore.clear());
    },
    count: (store) => run(store, 'readonly', (objectStore) => objectStore.count()),
    close: () => db.close(),
  };
}
