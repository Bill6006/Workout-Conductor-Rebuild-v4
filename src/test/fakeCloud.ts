import {
  CLOUD_APP,
  PULL_PAGE,
  type CloudClient,
  type CloudResult,
  type CloudStatement,
  type CloudValue,
} from '../core/cloud/model';

/**
 * An in-memory stand-in for the Turso database with the fixed shared schema.
 * It understands exactly the statements the sync engine issues, keeps the
 * same last-writer-wins rule as the real upsert, and counts every network
 * call so tests can prove that no token means no traffic.
 */

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
      const tombstone = sql.includes('NULL, NULL');
      const [app, store, id] = [text(args[0]), text(args[1]), text(args[2])];
      const row: FakeRemoteRecord = tombstone
        ? {
            app,
            store,
            id,
            day: null,
            body: null,
            updated_at: text(args[3]),
            deleted: 1,
            device_id: text(args[4]) || null,
            synced_at: text(args[5]),
          }
        : {
            app,
            store,
            id,
            day: args[3] === null ? null : text(args[3]),
            body: text(args[4]),
            updated_at: text(args[5]),
            deleted: 0,
            device_id: text(args[6]) || null,
            synced_at: text(args[7]),
          };
      const k = key(app, store, id);
      const existing = records.get(k);
      if (existing && !(row.updated_at >= existing.updated_at)) {
        return { rows: [], rowsAffected: 0 };
      }
      records.set(k, row);
      return { rows: [], rowsAffected: 1 };
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
        .sort((a, b) => a.synced_at.localeCompare(b.synced_at) || a.id.localeCompare(b.id))
        .slice(0, PULL_PAGE)
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
        for (const statement of statements) apply(statement);
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
        body: record.body ?? null,
        updated_at: record.updated_at ?? '2026-09-01T00:00:00.000Z',
        deleted: record.deleted ?? 0,
        device_id: record.device_id ?? 'other-device',
        synced_at: record.synced_at ?? record.updated_at ?? '2026-09-01T00:00:00.000Z',
      };
      records.set(key(row.app, row.store, row.id), row);
    },
    ours: () =>
      [...records.values()]
        .filter((row) => row.app === CLOUD_APP)
        .sort((a, b) => a.synced_at.localeCompare(b.synced_at) || a.id.localeCompare(b.id)),
  };
}
