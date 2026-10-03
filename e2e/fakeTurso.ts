import type { BrowserContext, Page } from '@playwright/test';

/**
 * A stand-in for the database, answered at the browser's network layer, so a
 * test can push and pull for real without a token that works. It speaks the
 * JSON pipeline the libsql web client falls back to (version 2), understands
 * exactly the statements the app issues, and keeps the same last-writer-wins
 * rule as the real upsert. Nothing here ever reaches the real host.
 */

export interface FakeRow {
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

interface FakeDevice {
  device_id: string;
  app: string;
  label: string;
  first_seen: string;
  last_sync: string;
}

export interface FakeTurso {
  rows: () => FakeRow[];
  devices: () => FakeDevice[];
  calls: () => number;
  /** The stand-in's own tables, so a second browser context can answer from the same database. */
  tables: { rows: Map<string, FakeRow>; devices: Map<string, FakeDevice> };
}

type WireValue =
  | { type: 'null' }
  | { type: 'integer'; value: string }
  | { type: 'float'; value: number }
  | { type: 'text'; value: string };

type Arg = string | number | null;

interface Stmt {
  sql?: string;
  sql_id?: number;
  args?: WireValue[];
}

interface StmtResult {
  cols: { name: string; decltype: null }[];
  rows: WireValue[][];
  affected_row_count: number;
  last_insert_rowid: null;
}

type StreamRequest =
  | { type: 'close' }
  | { type: 'execute'; stmt: Stmt }
  | { type: 'batch'; batch: { steps: { stmt: Stmt }[] } }
  | { type: 'store_sql'; sql_id: number; sql: string }
  | { type: 'close_sql'; sql_id: number }
  | { type: string };

function fromWire(value: WireValue): Arg {
  switch (value.type) {
    case 'null':
      return null;
    case 'integer':
      return Number(value.value);
    case 'float':
      return value.value;
    case 'text':
      return value.value;
  }
}

function toWire(value: Arg): WireValue {
  if (value === null) return { type: 'null' };
  if (typeof value === 'number') return { type: 'integer', value: String(value) };
  return { type: 'text', value };
}

/** What the live table says to a row with no body (its body column is NOT NULL). */
const NOT_NULL_BODY = 'SQLITE_CONSTRAINT: SQLite error: NOT NULL constraint failed: records.body';

/** The row a statement's VALUES list writes, its `?`s filled from the arguments in order. */
function valuesOf(sql: string, args: Arg[]): Arg[] {
  const list = /VALUES \(([^)]*)\)/.exec(sql)?.[1];
  if (list === undefined) throw new Error(`fake turso: no VALUES in ${sql.slice(0, 60)}`);
  let next = 0;
  return list.split(',').map((part) => {
    const token = part.trim();
    if (token === '?') return args[next++] ?? null;
    if (token === 'NULL') return null;
    if (/^'.*'$/.test(token)) return token.slice(1, -1);
    if (/^-?\d+$/.test(token)) return Number(token);
    throw new Error(`fake turso: a value it does not read, ${token}`);
  });
}

function result(cols: string[], rows: Arg[][], affected = 0): StmtResult {
  return {
    cols: cols.map((name) => ({ name, decltype: null })),
    rows: rows.map((row) => row.map(toWire)),
    affected_row_count: affected,
    last_insert_rowid: null,
  };
}

const RECORD_COLUMNS = [
  'store',
  'id',
  'day',
  'body',
  'updated_at',
  'deleted',
  'device_id',
  'synced_at',
];

export async function installFakeTurso(
  page: Page | BrowserContext,
  host = 'life-record-bill6006.aws-us-east-1.turso.io',
  shared?: FakeTurso,
): Promise<FakeTurso> {
  const rows = shared?.tables.rows ?? new Map<string, FakeRow>();
  const devices = shared?.tables.devices ?? new Map<string, FakeDevice>();
  /** SQL text the client stored once and refers to by id afterwards. */
  const storedSql = new Map<number, string>();
  let calls = 0;
  const key = (app: string, store: string, id: string) => `${app}|${store}|${id}`;
  const text = (value: Arg | undefined) => (typeof value === 'string' ? value : '');

  function run(stmt: Stmt): StmtResult {
    const source = stmt.sql ?? (stmt.sql_id === undefined ? undefined : storedSql.get(stmt.sql_id));
    if (source === undefined) throw new Error('fake turso: a statement with no text');
    const sql = source.replace(/\s+/g, ' ').trim();
    const args = (stmt.args ?? []).map(fromWire);
    if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return result([], []);
    if (sql.startsWith('SELECT name FROM sqlite_master')) {
      return result(['name'], [['records'], ['devices']]);
    }
    if (sql.startsWith('SELECT count(*) AS rows')) {
      const ours = [...rows.values()].filter((row) => row.app === args[0]);
      const ids = [...new Set(ours.map((row) => row.device_id).filter(Boolean))].join(',');
      return result(['rows', 'devices'], [[ours.length, ids || null]]);
    }
    if (sql.startsWith('UPDATE devices SET last_sync')) {
      const [lastSync, label, deviceId, app] = args;
      const device = devices.get(text(deviceId));
      if (!device || device.app !== app) return result([], [], 0);
      device.last_sync = text(lastSync);
      device.label = text(label);
      return result([], [], 1);
    }
    if (sql.startsWith('INSERT INTO devices')) {
      const [deviceId, app, label, firstSeen, lastSync] = args;
      devices.set(text(deviceId), {
        device_id: text(deviceId),
        app: text(app),
        label: text(label),
        first_seen: text(firstSeen),
        last_sync: text(lastSync),
      });
      return result([], [], 1);
    }
    if (sql.startsWith('INSERT INTO records')) {
      const [app, store, id, day, body, updatedAt, deleted, deviceId, syncedAt] = valuesOf(
        sql,
        args,
      );
      // As the live table: body is NOT NULL.
      if (body === null) throw new Error(NOT_NULL_BODY);
      const next: FakeRow = {
        app: text(app),
        store: text(store),
        id: text(id),
        day: typeof day === 'string' ? day : null,
        body: text(body),
        updated_at: text(updatedAt),
        deleted: Number(deleted) === 1 ? 1 : 0,
        device_id: text(deviceId),
        synced_at: text(syncedAt),
      };
      const k = key(next.app, next.store, next.id);
      const existing = rows.get(k);
      if (!existing || next.updated_at >= existing.updated_at) {
        // The conflict's update writes the body too: NULL there is refused the same way.
        if (existing && /DO UPDATE SET [^;]*\bbody = NULL\b/.test(sql)) {
          throw new Error(NOT_NULL_BODY);
        }
        rows.set(k, next);
        return result([], [], 1);
      }
      return result([], [], 0);
    }
    if (sql.includes('FROM records WHERE app = ? AND store = ? AND id = ?')) {
      const row = rows.get(key(text(args[0]), text(args[1]), text(args[2])));
      return result(
        RECORD_COLUMNS,
        row
          ? [
              [
                row.store,
                row.id,
                row.day,
                row.body,
                row.updated_at,
                row.deleted,
                row.device_id,
                row.synced_at,
              ],
            ]
          : [],
      );
    }
    if (sql.startsWith('SELECT store, id, day, body, updated_at, deleted, device_id, synced_at')) {
      const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? '500');
      const [app, cursor, , cursorId] = [
        text(args[0]),
        text(args[1]),
        text(args[2]),
        text(args[3]),
      ];
      const page = [...rows.values()]
        .filter(
          (row) =>
            row.app === app &&
            (row.synced_at > cursor || (row.synced_at === cursor && row.id > cursorId)),
        )
        // Plain string order, as SQLite's for this app's ids.
        .sort((a, b) =>
          a.synced_at < b.synced_at
            ? -1
            : a.synced_at > b.synced_at
              ? 1
              : a.id < b.id
                ? -1
                : a.id > b.id
                  ? 1
                  : 0,
        )
        .slice(0, limit)
        .map((row) => [
          row.store,
          row.id,
          row.day,
          row.body,
          row.updated_at,
          row.deleted,
          row.device_id,
          row.synced_at,
        ]);
      return result(RECORD_COLUMNS, page);
    }
    throw new Error(`fake turso: unexpected statement ${sql.slice(0, 60)}`);
  }

  function answer(request: StreamRequest): unknown {
    if (request.type === 'close') return { type: 'ok', response: { type: 'close' } };
    if (request.type === 'store_sql') {
      const stored = request as { sql_id: number; sql: string };
      storedSql.set(stored.sql_id, stored.sql);
      return { type: 'ok', response: { type: 'store_sql' } };
    }
    if (request.type === 'close_sql') {
      storedSql.delete((request as { sql_id: number }).sql_id);
      return { type: 'ok', response: { type: 'close_sql' } };
    }
    if (request.type === 'sequence') return { type: 'ok', response: { type: 'sequence' } };
    if (request.type === 'get_autocommit') {
      return { type: 'ok', response: { type: 'get_autocommit', is_autocommit: true } };
    }
    if (request.type === 'execute') {
      const stmt = (request as { stmt: Stmt }).stmt;
      return { type: 'ok', response: { type: 'execute', result: run(stmt) } };
    }
    if (request.type === 'batch') {
      const steps = (request as { batch: { steps: { stmt: Stmt }[] } }).batch.steps;
      // One transaction, as the live server's: a step refused undoes the steps before it.
      const keptRows = new Map(rows);
      const keptDevices = new Map([...devices].map(([k, device]) => [k, { ...device }]));
      try {
        const stepResults = steps.map((step) => run(step.stmt));
        return {
          type: 'ok',
          response: {
            type: 'batch',
            result: { step_results: stepResults, step_errors: steps.map(() => null) },
          },
        };
      } catch (error) {
        rows.clear();
        for (const [k, row] of keptRows) rows.set(k, row);
        devices.clear();
        for (const [k, device] of keptDevices) devices.set(k, device);
        throw error;
      }
    }
    return { type: 'error', error: { message: `fake turso: unsupported ${request.type}` } };
  }

  await page.route(new RegExp(host.replace(/\./g, '\\.')), async (route) => {
    calls += 1;
    const request = route.request();
    const path = new URL(request.url()).pathname;
    // Only the version-2 JSON pipeline is answered; the newer probes are refused so the client falls back to it.
    if (request.method() === 'GET') {
      await route.fulfill({ status: path.endsWith('/v2') ? 200 : 404, body: '' });
      return;
    }
    if (!path.endsWith('/v2/pipeline')) {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    let requests: StreamRequest[] = [];
    try {
      requests =
        (JSON.parse(request.postData() ?? '{}') as { requests?: StreamRequest[] }).requests ?? [];
    } catch {
      console.log(`fake turso: unreadable pipeline body ${request.postData() ?? ''}`);
    }
    // One result per request, always: an error in one statement is reported as that statement's error.
    const results = requests.map((item) => {
      try {
        return answer(item);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'fake turso: failed';
        console.log(message);
        return { type: 'error', error: { message } };
      }
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ baton: null, base_url: null, results }),
    });
  });

  return {
    rows: () => [...rows.values()].map((row) => ({ ...row })),
    devices: () => [...devices.values()].map((device) => ({ ...device })),
    calls: () => calls,
    tables: { rows, devices },
  };
}
