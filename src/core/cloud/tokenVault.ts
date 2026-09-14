import type { Database, Identified } from '../storage/indexedDb';
import type { KeyValueStorage } from '../storage/localSettings';
import { putVerified } from '../storage/verifiedSave';
import { CLOUD_TOKEN_ID, type CloudToken } from './model';

/**
 * The token's home on the device: two independent copies, and the evidence of
 * what happened to them.
 *
 * The database copy sits in the `cloud` store of IndexedDB. The second copy
 * sits in the app's local storage, a different storage engine in the same
 * browser, so one of them losing its records does not lose the token. A save
 * is read back from the database before it counts, and from local storage
 * after. When one copy has gone missing the other supplies it, and the loss is
 * written to a small log with the layer named, so the next loss explains
 * itself instead of looking like the copy was never on.
 *
 * Nothing here records the token itself anywhere but the two copies: a mark
 * carries only times, a log entry only times and words. None of it reaches a
 * backup, an export, or the cloud copy; the `cloud` store is never mirrored
 * and these local keys are never read by the backup.
 */

export const TOKEN_MIRROR_KEY = 'wc.v1.cloudToken';
export const TOKEN_MARK_KEY = 'wc.v1.cloudTokenMark';
export const TOKEN_LOG_KEY = 'wc.v1.cloudTokenLog';
export const TOKEN_MARK_ID = 'tokenMark';
export const TOKEN_LOG_ID = 'tokenLog';
const LOG_LIMIT = 8;

/** When the token was saved on this device and when it was last found. Never the token. */
export interface TokenMark {
  savedAt: string;
  lastSeenAt: string;
}

export type TokenEventKind = 'saved' | 'restored' | 'missing' | 'removed';

export interface TokenEvent {
  at: string;
  kind: TokenEventKind;
  detail: string;
  /** On a `missing` entry: when a copy was last found. */
  lastSeenAt?: string;
}

export interface TokenResolution {
  token: string | null;
  /** The layer that had lost the token and was written again from the other, if any. */
  healed: 'database' | 'local' | null;
  /**
   * True when the whole history should be pulled again: the database copy had
   * gone, so other records may have gone with it; or this is the first run
   * with two copies, which checks everything once.
   */
  recover: boolean;
  /** Set when both copies are gone after a mark says one was saved. */
  lost: TokenMark | null;
  /** The latest event worth showing on the card, if the last thing that happened was a loss. */
  notice: TokenEvent | null;
}

interface MarkRecord extends Identified, TokenMark {
  id: typeof TOKEN_MARK_ID;
}

interface LogRecord extends Identified {
  id: typeof TOKEN_LOG_ID;
  events: TokenEvent[];
}

// ---------------------------------------------------------------- local storage layer

function readLocal(storage: KeyValueStorage, key: string): string | null {
  try {
    const value = storage.getItem(key);
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Writes and reads back; false when the value did not stick. */
function writeLocal(storage: KeyValueStorage, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return storage.getItem(key) === value;
  } catch {
    return false;
  }
}

function removeLocal(storage: KeyValueStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // nothing to remove, or nowhere to remove it from
  }
}

function isMark(value: unknown): value is TokenMark {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as TokenMark).savedAt === 'string' &&
    typeof (value as TokenMark).lastSeenAt === 'string'
  );
}

function isEvent(value: unknown): value is TokenEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as TokenEvent;
  return (
    typeof event.at === 'string' &&
    typeof event.detail === 'string' &&
    (event.kind === 'saved' ||
      event.kind === 'restored' ||
      event.kind === 'missing' ||
      event.kind === 'removed')
  );
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function readLocalMark(storage: KeyValueStorage): TokenMark | null {
  const parsed = parseJson(readLocal(storage, TOKEN_MARK_KEY));
  return isMark(parsed) ? { savedAt: parsed.savedAt, lastSeenAt: parsed.lastSeenAt } : null;
}

function readLocalLog(storage: KeyValueStorage): TokenEvent[] {
  const parsed = parseJson(readLocal(storage, TOKEN_LOG_KEY));
  return Array.isArray(parsed) ? parsed.filter(isEvent) : [];
}

// ---------------------------------------------------------------- database layer

async function readDatabaseToken(db: Database): Promise<string | null> {
  const record = await db.get<CloudToken>('cloud', CLOUD_TOKEN_ID);
  return record && typeof record.value === 'string' && record.value.length > 0
    ? record.value
    : null;
}

/** Written and read back before it counts; throws when the read-back disagrees. */
async function writeDatabaseToken(db: Database, value: string, now: string): Promise<void> {
  const token: CloudToken = { id: CLOUD_TOKEN_ID, value, savedAt: now };
  await putVerified(db, 'cloud', token, { now: () => now });
}

async function readDatabaseMark(db: Database): Promise<TokenMark | null> {
  const record = await db.get<MarkRecord>('cloud', TOKEN_MARK_ID);
  return isMark(record) ? { savedAt: record.savedAt, lastSeenAt: record.lastSeenAt } : null;
}

async function readDatabaseLog(db: Database): Promise<TokenEvent[]> {
  const record = await db.get<LogRecord>('cloud', TOKEN_LOG_ID);
  return record && Array.isArray(record.events) ? record.events.filter(isEvent) : [];
}

// ---------------------------------------------------------------- marks and the log

async function writeMarks(db: Database, storage: KeyValueStorage, mark: TokenMark): Promise<void> {
  const record: MarkRecord = { id: TOKEN_MARK_ID, ...mark };
  await db.put('cloud', record);
  writeLocal(storage, TOKEN_MARK_KEY, JSON.stringify(mark));
}

async function clearMarks(db: Database, storage: KeyValueStorage): Promise<void> {
  await db.delete('cloud', TOKEN_MARK_ID);
  removeLocal(storage, TOKEN_MARK_KEY);
}

function mergeLogs(a: TokenEvent[], b: TokenEvent[]): TokenEvent[] {
  const seen = new Map<string, TokenEvent>();
  for (const event of [...a, ...b]) {
    const key = `${event.at}|${event.kind}|${event.detail}`;
    seen.delete(key);
    seen.set(key, event);
  }
  return [...seen.values()].sort((x, y) => x.at.localeCompare(y.at)).slice(-LOG_LIMIT);
}

/** Every event either copy still holds, oldest first, the newest eight. */
export async function readTokenLog(db: Database, storage: KeyValueStorage): Promise<TokenEvent[]> {
  return mergeLogs(await readDatabaseLog(db), readLocalLog(storage));
}

async function appendEvent(
  db: Database,
  storage: KeyValueStorage,
  event: TokenEvent,
): Promise<TokenEvent> {
  const events = mergeLogs(await readTokenLog(db, storage), [event]);
  const record: LogRecord = { id: TOKEN_LOG_ID, events };
  await db.put('cloud', record);
  writeLocal(storage, TOKEN_LOG_KEY, JSON.stringify(events));
  return event;
}

/** The newest event, when the last thing that happened to the token was a loss. */
export function latestNotice(log: readonly TokenEvent[]): TokenEvent | null {
  const last = log[log.length - 1];
  return last && (last.kind === 'restored' || last.kind === 'missing') ? last : null;
}

// ---------------------------------------------------------------- the three operations

/**
 * Saves the token to both copies. The database write is verified by reading
 * it back and throws when it does not stick; the local copy is read back too,
 * and a local copy that would not stick is noted rather than fatal, because
 * the verified database copy is the one the sync reads.
 */
export async function saveToken(
  db: Database,
  storage: KeyValueStorage,
  token: string,
  now: string,
  detail: string,
): Promise<TokenEvent> {
  await writeDatabaseToken(db, token, now);
  const localOk = writeLocal(storage, TOKEN_MIRROR_KEY, token);
  await writeMarks(db, storage, { savedAt: now, lastSeenAt: now });
  return appendEvent(db, storage, {
    at: now,
    kind: 'saved',
    detail: localOk ? detail : `${detail} The phone's local copy could not be written.`,
  });
}

/** Removes both copies and the marks; the log keeps the removal. */
export async function clearToken(
  db: Database,
  storage: KeyValueStorage,
  now: string,
): Promise<void> {
  await db.delete('cloud', CLOUD_TOKEN_ID);
  removeLocal(storage, TOKEN_MIRROR_KEY);
  await clearMarks(db, storage);
  await appendEvent(db, storage, { at: now, kind: 'removed', detail: 'Removed in Settings.' });
}

/**
 * Finds the token, healing whichever copy has gone missing from the other,
 * and says what it found. Called when the app opens and before every sync.
 */
export async function resolveToken(
  db: Database,
  storage: KeyValueStorage,
  now: string,
): Promise<TokenResolution> {
  const database = await readDatabaseToken(db);
  const local = readLocal(storage, TOKEN_MIRROR_KEY);
  const databaseMark = await readDatabaseMark(db);
  const localMark = readLocalMark(storage);
  const mark = databaseMark ?? localMark;
  const none: TokenResolution = {
    token: null,
    healed: null,
    recover: false,
    lost: null,
    notice: null,
  };

  if (database !== null && local !== null) {
    if (database !== local) {
      // Two different tokens: a later save reached only one copy. The later mark wins.
      const preferLocal =
        databaseMark !== null && localMark !== null && localMark.savedAt > databaseMark.savedAt;
      const token = preferLocal ? local : database;
      if (preferLocal) await writeDatabaseToken(db, token, now);
      else writeLocal(storage, TOKEN_MIRROR_KEY, token);
      await writeMarks(db, storage, { savedAt: mark?.savedAt ?? now, lastSeenAt: now });
      const notice = await appendEvent(db, storage, {
        at: now,
        kind: 'restored',
        detail: 'The two copies of the token disagreed; the more recently saved one was kept.',
      });
      return {
        token,
        healed: preferLocal ? 'database' : 'local',
        recover: preferLocal,
        lost: null,
        notice,
      };
    }
    await writeMarks(db, storage, { savedAt: mark?.savedAt ?? now, lastSeenAt: now });
    return { ...none, token: database, notice: latestNotice(await readTokenLog(db, storage)) };
  }

  if (database !== null) {
    writeLocal(storage, TOKEN_MIRROR_KEY, database);
    const firstRun = mark === null;
    await writeMarks(db, storage, { savedAt: mark?.savedAt ?? now, lastSeenAt: now });
    const event = await appendEvent(
      db,
      storage,
      firstRun
        ? {
            at: now,
            kind: 'saved',
            detail:
              "A second copy of the token was written to the phone's local storage, and the whole history was checked against the cloud copy.",
          }
        : {
            at: now,
            kind: 'restored',
            detail:
              "The phone's local copy of the token was missing and was written again from the database copy.",
          },
    );
    return firstRun
      ? { ...none, token: database, recover: true }
      : { ...none, token: database, healed: 'local', notice: event };
  }

  if (local !== null) {
    await writeDatabaseToken(db, local, now);
    await writeMarks(db, storage, { savedAt: mark?.savedAt ?? now, lastSeenAt: now });
    const event = await appendEvent(db, storage, {
      at: now,
      kind: 'restored',
      detail:
        "The database copy of the token was missing and was written again from the phone's local copy. Everything in the cloud copy was pulled back.",
    });
    return { ...none, token: local, healed: 'database', recover: true, notice: event };
  }

  if (mark === null) return none;
  // Both copies gone after a token was saved here. Say so once, not on every open.
  const log = await readTokenLog(db, storage);
  const last = log[log.length - 1];
  const event =
    last && last.kind === 'missing'
      ? last
      : await appendEvent(db, storage, {
          at: now,
          kind: 'missing',
          detail:
            "The token is missing from both the database and the phone's local copy. Paste it again and everything in the cloud copy is pulled back.",
          lastSeenAt: mark.lastSeenAt,
        });
  return { ...none, lost: mark, notice: event };
}
