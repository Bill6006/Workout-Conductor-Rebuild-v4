import { describe, expect, it } from 'vitest';
import { createFakeCloud } from '../../test/fakeCloud';
import type { CloudClient } from './model';
import {
  LIFE_MIRROR_APP,
  LIFE_MIRROR_QUERY,
  LIFE_MIRROR_STORE,
  readLifeMirrorDay,
} from './lifeMirror';

/**
 * Item 48: Life Mirror's check-ins read from the shared database, read-only, the approved readings
 * alone leaving it. Synthetic data only: every body here is made up, its "private" parts too.
 */

const DAY = '2026-09-02';

function checkIn(
  id: string,
  body: Record<string, unknown>,
  extra: { day?: string; deleted?: number; updated?: string; app?: string } = {},
) {
  return {
    app: extra.app ?? LIFE_MIRROR_APP,
    store: LIFE_MIRROR_STORE,
    id,
    day: extra.day ?? DAY,
    body: JSON.stringify(body),
    updated_at: extra.updated ?? '2026-09-02T11:00:00.000Z',
    deleted: extra.deleted ?? 0,
  };
}

const morning = {
  block: 'morning',
  completedAt: '2026-09-02T11:40:00.000Z',
  updatedAt: '2026-09-02T11:41:00.000Z',
  answers: {
    energy: 4,
    mood: 3,
    stress: 2,
    sleepHours: 2,
    sleepQuality: 4,
    motivation: 3,
    focus: 5,
  },
  // What Workout Conductor must never read.
  extras: { note: 'SYNTHETIC-PRIVATE-NOTE' },
};

describe('the question put to the shared database', () => {
  it('asks for the approved readings alone, of Life Mirror’s check-ins of the day, not deleted', () => {
    const parts = /^SELECT (.+) FROM records WHERE (.+)$/.exec(LIFE_MIRROR_QUERY);
    expect(parts).not.toBeNull();
    const columns = parts![1]!.split(/, (?=CASE|json_extract|updated_at)/);
    expect(columns[0]).toBe('updated_at');
    // Each value only of its type (the review of item 48): a whole number, or text.
    const paths = columns.slice(1).map((column) => {
      const read =
        /^CASE WHEN json_type\(body, '\$\.([\w.]+)'\) = '(integer|text)' THEN json_extract\(body, '\$\.\1'\) END AS \w+$/.exec(
          column,
        );
      expect(read, column).not.toBeNull();
      return `${read![1]} ${read![2]}`;
    });
    expect(paths.sort()).toEqual(
      [
        'block text',
        'completedAt text',
        'updatedAt text',
        'answers.energy integer',
        'answers.mood integer',
        'answers.stress integer',
        'answers.sleepHours integer',
        'answers.sleepQuality integer',
        'answers.motivation integer',
      ].sort(),
    );
    expect(parts![2]).toBe(
      'app = ? AND store = ? AND deleted = 0 AND day = ? AND json_valid(body)',
    );
  });
});

describe('Life Mirror’s check-ins, read from the shared database', () => {
  it('bring back the approved readings and nothing else of a body', async () => {
    const cloud = createFakeCloud();
    cloud.seed(checkIn('1', morning));
    const raw = await cloud.client.execute({
      sql: LIFE_MIRROR_QUERY,
      args: [LIFE_MIRROR_APP, LIFE_MIRROR_STORE, DAY],
    });
    expect(Object.keys(raw.rows[0]!).sort()).toEqual(
      [
        'block',
        'body_updated_at',
        'completed_at',
        'energy',
        'motivation',
        'mood',
        'sleep_hours',
        'sleep_quality',
        'stress',
        'updated_at',
      ].sort(),
    );
    expect(JSON.stringify(raw.rows)).not.toContain('SYNTHETIC-PRIVATE-NOTE');
    expect(await readLifeMirrorDay(cloud.client, DAY)).toEqual([
      {
        block: 'morning',
        at: '2026-09-02T11:40:00.000Z',
        readings: { energy: 4, mood: 3, stress: 2, sleepHours: 2, sleepQuality: 4, motivation: 3 },
      },
    ]);
  });

  it('bring back nothing kept where a reading or a time should be, whatever it is', async () => {
    // Life Mirror's shapes may change: an object at a reading's place stays in the database.
    const cloud = createFakeCloud();
    cloud.seed(
      checkIn('1', {
        block: { name: 'morning', note: 'SYNTHETIC-PRIVATE-BLOCK' },
        completedAt: { at: '2026-09-02T11:40:00.000Z', note: 'SYNTHETIC-PRIVATE-TIME' },
        updatedAt: ['SYNTHETIC-PRIVATE-LIST'],
        answers: {
          energy: { value: 4, note: 'SYNTHETIC-PRIVATE-READING' },
          mood: 'SYNTHETIC-PRIVATE-TEXT',
          stress: true,
          motivation: 3,
        },
      }),
    );
    const raw = await cloud.client.execute({
      sql: LIFE_MIRROR_QUERY,
      args: [LIFE_MIRROR_APP, LIFE_MIRROR_STORE, DAY],
    });
    expect(JSON.stringify(raw.rows)).not.toContain('SYNTHETIC-PRIVATE');
    expect(raw.rows[0]).toMatchObject({
      block: null,
      completed_at: null,
      body_updated_at: null,
      energy: null,
      mood: null,
      stress: null,
      motivation: 3,
    });
  });

  it('read each row on their own terms, whatever the database answers', async () => {
    // The query's type check keeps a fraction in the database; the read never leans on it.
    const client: CloudClient = {
      execute: async () => ({
        rows: [
          {
            updated_at: '2026-09-02T11:00:00.000Z',
            block: 'morning',
            completed_at: null,
            body_updated_at: '2026-09-02T11:41:00.000Z',
            energy: 2.5,
            mood: 3,
          },
        ],
        rowsAffected: 0,
      }),
      batch: async () => [],
      close: () => undefined,
    };
    expect(await readLifeMirrorDay(client, DAY)).toEqual([
      { block: 'morning', at: '2026-09-02T11:41:00.000Z', readings: { mood: 3 } },
    ]);
  });

  it('read only Life Mirror’s rows of the day, not deleted', async () => {
    const cloud = createFakeCloud();
    cloud.seed(checkIn('1', morning, { day: '2026-09-01' }));
    cloud.seed(checkIn('2', morning, { deleted: 1 }));
    cloud.seed(checkIn('3', morning, { app: 'another-app' }));
    expect(await readLifeMirrorDay(cloud.client, DAY)).toEqual([]);
  });

  it('keep one check-in a block, the later', async () => {
    const cloud = createFakeCloud();
    cloud.seed(checkIn('1', { ...morning, updatedAt: '2026-09-02T11:41:00.000Z' }));
    cloud.seed(
      checkIn('2', {
        ...morning,
        updatedAt: '2026-09-02T11:50:00.000Z',
        completedAt: '2026-09-02T11:49:00.000Z',
        answers: { energy: 2 },
      }),
    );
    const read = await readLifeMirrorDay(cloud.client, DAY);
    expect(read).toEqual([
      { block: 'morning', at: '2026-09-02T11:49:00.000Z', readings: { energy: 2 } },
    ]);
  });

  it('drop what does not read: a reading off the scale, a block it does not know, a body not JSON', async () => {
    const cloud = createFakeCloud();
    cloud.seed(
      checkIn('1', {
        block: 'evening',
        updatedAt: '2026-09-02T20:00:00.000Z',
        answers: { energy: 7, mood: 2.5, stress: '4', sleepHours: { hours: 7 }, motivation: 2 },
      }),
    );
    cloud.seed(checkIn('2', { block: 'night', updatedAt: '2026-09-02T23:00:00.000Z' }));
    cloud.seed({ ...checkIn('3', {}), body: 'not json' });
    expect(await readLifeMirrorDay(cloud.client, DAY)).toEqual([
      { block: 'evening', at: '2026-09-02T20:00:00.000Z', readings: { motivation: 2 } },
    ]);
  });
});
