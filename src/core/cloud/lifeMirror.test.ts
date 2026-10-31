import { describe, expect, it } from 'vitest';
import { createFakeCloud } from '../../test/fakeCloud';
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
    const columns = parts![1]!.split(/, (?=json_extract|updated_at)/);
    expect(columns[0]).toBe('updated_at');
    const paths = columns.slice(1).map((column) => {
      const read = /^json_extract\(body, '\$\.([\w.]+)'\) AS \w+$/.exec(column);
      expect(read, column).not.toBeNull();
      return read![1];
    });
    expect(paths.sort()).toEqual(
      [
        'block',
        'completedAt',
        'updatedAt',
        'answers.energy',
        'answers.mood',
        'answers.stress',
        'answers.sleepHours',
        'answers.sleepQuality',
        'answers.motivation',
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
