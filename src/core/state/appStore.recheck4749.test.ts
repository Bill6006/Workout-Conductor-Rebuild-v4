import { describe, expect, it, vi } from 'vitest';
import {
  COACH_DECLINES_ID,
  mergeDeclines,
  type CoachAction,
} from '../../engine/coach/coachConductor';
import { learnedSections } from '../../engine/learned/learned';
import { LEARNED_RESETS_ID } from '../../engine/learned/resets';
import { allEntries } from '../../engine/workout/types';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

/**
 * Maintenance 27, the re-check of items 47 and 49, through the store: a coach's four-week swap
 * records its route step only once kept; a decline a sync brought is kept; one that does not read
 * is dropped alone; a save that lands but cannot be read back leaves memory as the disk is.
 */

async function ready(options: Parameters<typeof createTestStore>[0] = {}) {
  const handle = createTestStore(options);
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle.store;
}

type Store = Awaited<ReturnType<typeof ready>>;

/** A four-week swap on the plan's first accessory, at its stall route's variation step. */
function swapOffer(store: Store): Extract<CoachAction, { kind: 'lasting-swap' }> {
  const entries = allEntries(store.getSnapshot().session!.workout.blocks);
  const entry = entries.find((one) => one.role === 'isolation')!;
  return {
    kind: 'lasting-swap',
    entryId: entry.id,
    exerciseId: entry.exerciseId === 'cable-curl' ? 'dumbbell-curl' : 'cable-curl',
    label: 'Use it for 4 weeks',
    route: { exerciseId: entry.exerciseId, step: 1, baselineE1rm: 100 },
  };
}

describe("a coach card's four-week swap", () => {
  it('records its route step once the swap is kept', async () => {
    const store = await ready();
    const action = swapOffer(store);
    await store.takeCoachSwap(action);
    expect(store.getSnapshot().coachRoutes.routes[action.route!.exerciseId]).toBeDefined();
  });

  it('records nothing when the swap was not made', async () => {
    const store = await ready({
      recalibrate: (request) => ({
        ok: false,
        scope: 'local',
        error: 'Today’s plan was made again while this ran.',
        workout: request.workout,
        durationMs: 0,
      }),
    });
    const action = swapOffer(store);
    await store.takeCoachSwap(action);
    expect(store.getSnapshot().coachRoutes.routes[action.route!.exerciseId]).toBeUndefined();
    expect(store.getSnapshot().lastingSwaps).toEqual([]);
  });
});

describe('the declined offers', () => {
  it('keep a decline a sync brought while one is made here', async () => {
    const store = await ready();
    const db = await store.getDatabase();
    await db.put('meta', {
      id: COACH_DECLINES_ID,
      declines: { 'extra set|barbell-row': { count: 1, lastAt: TEST_NOW } },
    });
    await store.declineCoachSignal({ source: 'extra set', exerciseId: 'barbell-bench-press' });
    const keys = ['extra set|barbell-bench-press', 'extra set|barbell-row'];
    expect(Object.keys(store.getSnapshot().coachDeclines.declines).sort()).toEqual(keys);
    const saved = (await db.get('meta', COACH_DECLINES_ID)) as unknown as { declines: object };
    expect(Object.keys(saved.declines).sort()).toEqual(keys);
  });

  it('drop one that does not read, never the rest, and the page lists them', async () => {
    const store = await ready();
    const db = await store.getDatabase();
    await db.put('meta', {
      id: COACH_DECLINES_ID,
      declines: {
        'extra set|barbell-row': { count: 1, lastAt: TEST_NOW },
        'capped|*': { count: 1 },
        'fewer reps|*': null,
      },
    });
    await store.hydrate();
    const { coachDeclines, profile, history, learnedResets } = store.getSnapshot();
    expect(Object.keys(coachDeclines.declines)).toEqual(['extra set|barbell-row']);
    const sections = learnedSections({
      history,
      profile: profile!,
      now: TEST_NOW,
      resets: learnedResets,
      declines: coachDeclines,
    });
    expect(sections.find((one) => one.key === 'declines')?.items).toHaveLength(1);
  });
});

describe('two records of declines', () => {
  it('merge as one: every offer either holds, the higher count and the later time', () => {
    const early = '2026-09-01T12:00:00.000Z';
    const late = '2026-09-20T12:00:00.000Z';
    const merged = mergeDeclines(
      {
        id: COACH_DECLINES_ID,
        declines: {
          'extra set|barbell-row': { count: 2, lastAt: early },
          'capped|*': { count: 1, lastAt: late },
        },
      },
      {
        id: COACH_DECLINES_ID,
        declines: {
          'extra set|barbell-row': { count: 1, lastAt: late },
          'capped|*': { count: 1, lastAt: early },
          'fewer reps|*': { count: 1, lastAt: early },
        },
      },
    );
    expect(merged.declines).toEqual({
      'extra set|barbell-row': { count: 2, lastAt: late },
      'capped|*': { count: 1, lastAt: late },
      'fewer reps|*': { count: 1, lastAt: early },
    });
  });
});

describe('a decline that lands but cannot be read back', () => {
  it('leaves the declines shown as they are saved, and says it failed', async () => {
    const store = await ready();
    const db = await store.getDatabase();
    const read = db.get.bind(db);
    let calls = 0;
    // The third read of the record is the save's own read-back: it fails once, after the write.
    vi.spyOn(db, 'get').mockImplementation(async (name: string, key: string) => {
      if (key === COACH_DECLINES_ID) {
        calls += 1;
        if (calls === 3) throw new Error('The read-back failed.');
      }
      return (await read(name as never, key)) as never;
    });
    await expect(
      store.declineCoachSignal({ source: 'extra set', exerciseId: 'barbell-row' }),
    ).rejects.toThrow();
    vi.mocked(db.get).mockImplementation(read as never);
    const saved = (await db.get('meta', COACH_DECLINES_ID)) as unknown as {
      declines: Record<string, unknown>;
    };
    expect(Object.keys(saved.declines)).toEqual(['extra set|barbell-row']);
    expect(Object.keys(store.getSnapshot().coachDeclines.declines)).toEqual(
      Object.keys(saved.declines),
    );
  });
});

describe('a reset that lands but cannot be read back', () => {
  it('leaves the reset shown as it is saved, and says it failed', async () => {
    const store = await ready();
    const db = await store.getDatabase();
    const read = db.get.bind(db);
    let calls = 0;
    // The third read of the record is the save's own read-back: it fails once, after the write.
    vi.spyOn(db, 'get').mockImplementation(async (name: string, key: string) => {
      if (key === LEARNED_RESETS_ID) {
        calls += 1;
        if (calls === 3) throw new Error('The read-back failed.');
      }
      return (await read(name as never, key)) as never;
    });
    await expect(store.resetLearned('habit')).rejects.toThrow();
    vi.mocked(db.get).mockImplementation(read as never);
    const saved = (await db.get('meta', LEARNED_RESETS_ID)) as unknown as { habit?: string };
    expect(saved.habit).toBe(TEST_NOW);
    expect(store.getSnapshot().learnedResets.habit).toBe(saved.habit);
  });
});
