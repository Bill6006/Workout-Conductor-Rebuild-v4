import type { Database, Identified, StoreName } from './indexedDb';

/**
 * Critical saves use write, read-back, and verify before reporting success.
 * If the read-back does not match, the previous record is restored and the
 * caller gets a SaveVerificationError instead of a silent partial state.
 */

export interface SaveReceipt {
  store: StoreName;
  id: string;
  verifiedAt: string;
  bytes: number;
}

export class SaveVerificationError extends Error {
  readonly store: StoreName;
  readonly id: string;
  readonly rolledBack: boolean;

  constructor(store: StoreName, id: string, rolledBack: boolean) {
    super(
      `Save verification failed for ${store}/${id}. ${
        rolledBack ? 'The previous value was restored.' : 'Rollback also failed.'
      }`,
    );
    this.name = 'SaveVerificationError';
    this.store = store;
    this.id = id;
    this.rolledBack = rolledBack;
  }
}

/** JSON with sorted object keys so two structurally equal values serialize identically. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) {
        sorted[key] = sortKeys(source[key]);
      }
    }
    return sorted;
  }
  return value;
}

export function structurallyEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

export interface VerifiedSaveOptions {
  now?: () => string;
}

export async function putVerified<T extends Identified>(
  db: Database,
  store: StoreName,
  record: T,
  options: VerifiedSaveOptions = {},
): Promise<SaveReceipt> {
  const previous = await db.get<T>(store, record.id);
  await db.put(store, record);
  const readBack = await db.get<T>(store, record.id);

  if (!structurallyEqual(readBack, record)) {
    let rolledBack: boolean;
    try {
      if (previous === undefined) {
        await db.delete(store, record.id);
      } else {
        await db.put(store, previous);
      }
      rolledBack = structurallyEqual(await db.get<T>(store, record.id), previous);
    } catch {
      rolledBack = false;
    }
    throw new SaveVerificationError(store, record.id, rolledBack);
  }

  return {
    store,
    id: record.id,
    verifiedAt: (options.now ?? (() => new Date().toISOString()))(),
    bytes: stableStringify(record).length,
  };
}

export async function deleteVerified(db: Database, store: StoreName, id: string): Promise<void> {
  await db.delete(store, id);
  const readBack = await db.get(store, id);
  if (readBack !== undefined) {
    throw new SaveVerificationError(store, id, false);
  }
}
