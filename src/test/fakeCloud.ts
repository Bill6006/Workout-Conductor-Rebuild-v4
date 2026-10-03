import {
  CLOUD_APP,
  PULL_PAGE,
  TOMBSTONE_BODY,
  type CloudClient,
  type CloudResult,
  type CloudStatement,
  type CloudValue,
} from '../core/cloud/model';

/**
 * An in-memory stand-in for the Turso database with the fixed shared schema.
 * It understands exactly the statements the sync engine issues, keeps the
 * same last-writer-wins rule as the real upsert, and counts every network
 * call so tests can prove that no token means no traffic. As strict as the
 * live table (Maintenance 25): a row with no body is refused, and a write
 * batch is one transaction, so one refused row refuses the whole batch.
 */

/** What the live table says to a row with no body. */
export const NOT_NULL_BODY =
  'SQLITE_CONSTRAINT: SQLite error: NOT NULL constraint failed: records.body';

export interface FakeRemoteRecord {
  app: string;
  store: string;
  id: string;
  day: string | null;
  body: string | null;
  updated_at: string;
  deleted: number;
  device_id: string | null;
  synced_at: string;
}

export interface FakeDevice {
  device_id: string;
  app: string;
  label: string;
  first_seen: string;
  last_sync: string;
}

export interface FakeCloud {
  client: CloudClient;
  records: Map<string, FakeRemoteRecord>;
  devices: Map<string, FakeDevice>;
  /** Network calls made so far (execute or batch). */
  calls: () => number;
  /** Makes the next `times` calls throw, like a lost connection. */
  fail: (times: number) => void;
  /** A row written by another device of this owner. */
  seed: (record: Partial<FakeRemoteRecord> & Pick<FakeRemoteRecord, 'store' | 'id'>) => void;
  /** Rows of this app, oldest first. */
  ours: () => FakeRemoteRecord[];
  /** The tables the fake reports; empty one to test a database that is not set up. */
  setTables: (names: string[]) => void;
}

function key(app: string, store: string, id: string): string {
  return `${app}|${store}|${id}`;
}

/** The row a statement's VALUES list writes, its `?`s filled from the arguments in order. */
function valuesOf(sql: string, args: CloudValue[]): (CloudValue | null)[] {
  const list = /VALUES \(([^)]*)\)/.exec(sql)?.[1];
  if (list === undefined) throw new Error(`fake cloud does not understand: ${sql.slice(0, 40)}`);
  let next = 0;
  return list.split(',').map((part) => {
    const token = part.trim();
    if (token === '?') return args[next++] ?? null;
    if (token === 'NULL') return null;
    if (/^'.*'$/.test(token)) return token.slice(1, -1);
    if (/^-?\d+$/.test(token)) return Number(token);
    throw new Error(`fake cloud does not understand the value ${token}`);
  });
}

/** Plain string order, as the pull's ORDER BY and its filter use: SQLite's for this app's ids. */
function bySyncThenId(a: FakeRemoteRecord, b: FakeRemoteRecord): number {
  const order = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return order(a.synced_at, b.synced_at) || order(a.id, b.id);
}

function text(value: CloudValue | undefined): string {
  return typeof value === 'string'
    ? value
    : value === null || value === undefined
      ? ''
      : String(value);
}

export function createFakeCloud(): FakeCloud {
  const records = new Map<string, FakeRemoteRecord>();
  const devices = new Map<string, FakeDevice>();
  let calls = 0;
  let failuresLeft = 0;
  let tables: string[] = ['records', 'devices', 'schema_meta'];

  function apply(statement: CloudStatement): CloudResult {
    const { sql, args } = statement;
    if (sql.startsWith('INSERT INTO records')) {
      const [app, store, id, day, body, updatedAt, deleted, deviceId, syncedAt] = valuesOf(
        sql,
        args,
      );
      // As the live table: body is NOT NULL.
      if (body === null) throw new Error(NOT_NULL_BODY);
      const row: FakeRemoteRecord = {
        app: text(app),
        store: text(store),
        id: text(id),
        day: day === null ? null : text(day),
        body: text(body),
        updated_at: text(updatedAt),
        deleted: Number(deleted) === 1 ? 1 : 0,
        device_id: text(deviceId) || null,
        synced_at: text(syncedAt),
      };
      const k = key(row.app, row.store, row.id);
      const existing = records.get(k);
      if (existing && !(row.updated_at >= existing.updated_at)) {
        return { rows: [], rowsAffected: 0 };
      }
      // The conflict's update writes the body too: NULL there is refused the same way.
      if (existing && /DO UPDATE SET [^;]*\bbody = NULL\b/.test(sql)) {
        throw new Error(NOT_NULL_BODY);
      }
      records.set(k, row);
      return { rows: [], rowsAffected: 1 };
    }
    if (sql.includes('FROM records WHERE app = ? AND store = ? AND id = ?')) {
      const row = records.get(key(text(args[0]), text(args[1]), text(args[2])));
      return {
        rows: row
          ? [
              {
                store: row.store,
                id: row.id,
                day: row.day,
                body: row.body,
                updated_at: row.updated_at,
                deleted: row.deleted,
                device_id: row.device_id,
                synced_at: row.synced_at,
              },
            ]
          : [],
        rowsAffected: 0,
      };
    }
    if (sql.startsWith('SELECT store, id, day, body, updated_at, deleted, device_id, synced_at')) {
      const app = text(args[0]);
      const cursor = text(args[1]);
      const cursorId = text(args[3]);
      const rows = [...records.values()]
        .filter(
          (row) =>
            row.app === app &&
            (row.synced_at > cursor || (row.synced_at === cursor && row.id > cursorId)),
        )
        .sort(bySyncThenId)
        // As the live table does: no more rows than the request's LIMIT.
        .slice(0, Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? PULL_PAGE))
        .map(({ store, id, day, body, updated_at, deleted, device_id, synced_at }) => ({
          store,
          id,
          day,
          body,
          updated_at,
          deleted,
          device_id,
          synced_at,
        }));
      return { rows, rowsAffected: 0 };
    }
    if (sql.startsWith('UPDATE devices')) {
      const [lastSync, label, deviceId, app] = [
        text(args[0]),
        text(args[1]),
        text(args[2]),
        text(args[3]),
      ];
      const k = `${deviceId}|${app}`;
      const device = devices.get(k);
      if (!device) return { rows: [], rowsAffected: 0 };
      devices.set(k, { ...device, last_sync: lastSync, label });
      return { rows: [], rowsAffected: 1 };
    }
    if (sql.startsWith('INSERT INTO devices')) {
      const [deviceId, app, label, firstSeen, lastSync] = [
        text(args[0]),
        text(args[1]),
        text(args[2]),
        text(args[3]),
        text(args[4]),
      ];
      devices.set(`${deviceId}|${app}`, {
        device_id: deviceId,
        app,
        label,
        first_seen: firstSeen,
        last_sync: lastSync,
      });
      return { rows: [], rowsAffected: 1 };
    }
    if (sql.startsWith('SELECT name FROM sqlite_master')) {
      // A fake database always carries the tables, unless a test empties them.
      return { rows: tables.map((name) => ({ name })), rowsAffected: 0 };
    }
    if (sql.startsWith('SELECT count(*) AS rows, group_concat(DISTINCT device_id)')) {
      const app = text(args[0]);
      const mine = [...records.values()].filter((row) => row.app === app);
      const ids = [...new Set(mine.map((row) => row.device_id).filter(Boolean))];
      return {
        rows: [{ rows: mine.length, devices: ids.length > 0 ? ids.join(',') : null }],
        rowsAffected: 0,
      };
    }
    throw new Error(`fake cloud does not understand: ${sql.slice(0, 40)}`);
  }

  function call<T>(work: () => T): T {
    calls += 1;
    if (failuresLeft > 0) {
      failuresLeft -= 1;
      throw new Error('fake cloud unreachable');
    }
    return work();
  }

  const client: CloudClient = {
    execute: async (statement) => call(() => apply(statement)),
    batch: async (statements) =>
      call(() => {
        // One transaction, as libsql's write batch: a row refused refuses the whole batch.
        const kept = new Map(records);
        const keptDevices = new Map(devices);
        try {
          return statements.map((statement) => apply(statement).rowsAffected);
        } catch (error) {
          records.clear();
          for (const [k, row] of kept) records.set(k, row);
          devices.clear();
          for (const [k, device] of keptDevices) devices.set(k, device);
          throw error;
        }
      }),
    close: () => undefined,
  };

  return {
    client,
    records,
    devices,
    calls: () => calls,
    fail: (times) => {
      failuresLeft = times;
    },
    setTables: (names) => {
      tables = [...names];
    },
    seed: (record) => {
      const row: FakeRemoteRecord = {
        app: record.app ?? CLOUD_APP,
        store: record.store,
        id: record.id,
        day: record.day ?? null,
        // The live table holds no row without a body: a deletion's is '{}'.
        body: record.body ?? (record.deleted ? TOMBSTONE_BODY : null),
        updated_at: record.updated_at ?? '2026-09-01T00:00:00.000Z',
        deleted: record.deleted ?? 0,
        device_id: record.device_id ?? 'other-device',
        synced_at: record.synced_at ?? record.updated_at ?? '2026-09-01T00:00:00.000Z',
      };
      records.set(key(row.app, row.store, row.id), row);
    },
    ours: () => [...records.values()].filter((row) => row.app === CLOUD_APP).sort(bySyncThenId),
  };
}
