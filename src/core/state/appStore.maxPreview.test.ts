import { describe, expect, it } from 'vitest';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import type { AppStore } from './appStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

/**
 * Maintenance 25, the owner's item 36: the max sheet's preview is the save's own rebuild, run
 * without saving, so what it shows is the target the plan then has, and it says why when the
 * logged sets, or a lift under way, keep the target where it is.
 */

const BENCH = 'barbell-bench-press';

async function seeded(withHistory: boolean): Promise<AppStore> {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  if (withHistory) {
    const db = await handle.store.getDatabase();
    for (const daysAgo of [7, 4]) {
      const when = new Date(Date.parse(TEST_NOW) - daysAgo * 86_400_000).toISOString();
      await db.put('workouts', {
        ...record(
          daysAgo,
          BENCH,
          [
            [6, 155, 2],
            [6, 155, 2],
            [5, 155, 2],
          ],
          [4, 6],
          2,
        ),
        id: `bench-${daysAgo}`,
        startedAt: when,
        completedAt: when,
      });
    }
    await handle.store.hydrate();
    // Pushing was trained last: a chest focus brings the bench press back today.
    await handle.store.setCoachFocus('chest');
  }
  return handle.store;
}

function bench(store: AppStore): WorkoutEntry {
  const entry = allEntries(store.getSnapshot().session!.workout.blocks).find(
    (candidate) => candidate.exerciseId === BENCH,
  );
  if (!entry) throw new Error('no bench press');
  return entry;
}

const firstWorking = (entry: WorkoutEntry) => {
  const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
  return { weight: set.targetWeight, reps: set.targetReps, rir: set.targetRir };
};

describe('the max sheet’s preview', () => {
  it('is the first target the save then sets, and changes nothing until then', async () => {
    const store = await seeded(false);
    const before = store.getSnapshot();
    const preview = store.previewStrengthMax(BENCH, bench(store).id, { kind: 'max', e1rm: 225 });
    expect(preview?.outcome).toBe('first');
    // Nothing is saved or changed by a preview.
    expect(store.getSnapshot().strengthMaxes).toBe(before.strengthMaxes);
    expect(store.getSnapshot().session).toBe(before.session);
    await store.recordStrengthMax(BENCH, { kind: 'max', e1rm: 225 });
    expect(preview?.target).toEqual(firstWorking(bench(store)));
  });

  it('says so when the logged sets already put the lift where the max would', async () => {
    const store = await seeded(true);
    const plan = firstWorking(bench(store));
    const lower = store.previewStrengthMax(BENCH, bench(store).id, { kind: 'max', e1rm: 150 });
    expect(lower?.outcome).toBe('kept');
    expect(lower?.target).toEqual(plan);
  });

  it('moves toward a higher max two steps at most, in the engine’s words, as the save does', async () => {
    const store = await seeded(true);
    const plan = firstWorking(bench(store));
    const input = { kind: 'max', e1rm: 260 } as const;
    const preview = store.previewStrengthMax(BENCH, bench(store).id, input);
    expect(preview?.outcome).toBe('moved');
    expect(preview?.target?.weight).toBe((plan.weight as number) + 10);
    expect(preview?.lines).toEqual([
      'Your max of 260 lb, entered after you began this lift last time, says more than your logged sets: up 2 steps toward it. Your next logged session takes over.',
    ]);
    await store.recordStrengthMax(BENCH, input);
    expect(preview?.target).toEqual(firstWorking(bench(store)));
  });

  it('counts from the next session once a set of the lift is logged today', async () => {
    const store = await seeded(false);
    store.startWorkout();
    const entry = bench(store);
    store.skipWarmup(entry.id);
    const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
    await store.logSet(entry.id, set.index, { weight: set.targetWeight, reps: 6, rir: 2 });
    const preview = store.previewStrengthMax(BENCH, entry.id, { kind: 'max', e1rm: 300 });
    expect(preview?.outcome).toBe('logged');
  });

  it('shows no line from a max saved before, on a lift the new one leaves as it was', async () => {
    // 260 saved moved the bench and said so; under way, the lines of that save are not this one's.
    const store = await seeded(true);
    await store.recordStrengthMax(BENCH, { kind: 'max', e1rm: 260 });
    expect(bench(store).progression?.evidence.at(-1)).toMatch(/^Your max of 260 lb/);
    store.startWorkout();
    const entry = bench(store);
    store.skipWarmup(entry.id);
    const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
    await store.logSet(entry.id, set.index, { weight: set.targetWeight, reps: 6, rir: 2 });
    const preview = store.previewStrengthMax(BENCH, entry.id, { kind: 'max', e1rm: 300 });
    expect(preview?.outcome).toBe('logged');
    expect(preview?.lines).toEqual([]);
  });
});

/** Two sessions of the bench short of its floor at nothing in reserve: the plan takes it lighter. */
async function missing(): Promise<AppStore> {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  for (const daysAgo of [7, 4]) {
    const when = new Date(Date.parse(TEST_NOW) - daysAgo * 86_400_000).toISOString();
    await db.put('workouts', {
      ...record(
        daysAgo,
        BENCH,
        [
          [3, 185, 0],
          [3, 185, 0],
          [2, 185, 0],
        ],
        [4, 6],
        2,
      ),
      id: `bench-${daysAgo}`,
      startedAt: when,
      completedAt: when,
    });
  }
  await handle.store.hydrate();
  await handle.store.setCoachFocus('chest');
  return handle.store;
}

describe('a max the plan does not follow', () => {
  it('says the lift is lighter to win back missed reps, never that the log says as much', async () => {
    const store = await missing();
    expect(bench(store).progression?.mode).toBe('deload');
    const plan = firstWorking(bench(store));
    const preview = store.previewStrengthMax(BENCH, bench(store).id, { kind: 'max', e1rm: 300 });
    expect(preview?.outcome).toBe('eased');
    expect(preview?.stays).toBe(true);
    expect(preview?.target).toEqual(plan);
    await store.recordStrengthMax(BENCH, { kind: 'max', e1rm: 300 });
    expect(store.getSnapshot().session?.lastSummary?.headline).toBe(
      'Max saved. Barbell Bench Press is lighter today to win back missed reps; a max does not change that.',
    );
  });

  it('keeps a target the work before it today moved, and does not credit the max with the move', async () => {
    const store = await seeded(true);
    store.startWorkout();
    const entries = allEntries(store.getSnapshot().session!.workout.blocks);
    const benchAt = entries.findIndex((entry) => entry.exerciseId === BENCH);
    // Every lift after the bench is logged before it: the bench's work before it today goes up.
    for (const entry of entries.slice(benchAt + 1)) {
      store.skipWarmup(entry.id);
      for (const set of entry.sets.filter((candidate) => candidate.kind === 'working')) {
        await store.logSet(entry.id, set.index, { weight: set.targetWeight, reps: 10, rir: 2 });
      }
    }
    const plan = firstWorking(bench(store));
    const preview = store.previewStrengthMax(BENCH, bench(store).id, { kind: 'max', e1rm: 150 });
    // A max under what the log says moves nothing: whatever moved the target, it was not the max.
    expect(preview?.outcome).toBe('kept');
    expect(preview?.target?.weight).toBeLessThan(plan.weight as number);
    expect(preview?.stays).toBe(false);
    expect(preview?.lines.some((line) => line.startsWith('Before this today: '))).toBe(true);
  });

  describe('a max a deload week holds', () => {
    it('says the deload week holds the target, not the weights here (the third review)', async () => {
      const handle = createTestStore();
      await handle.store.hydrate();
      await handle.store.completeOnboarding(
        { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
        createDefaultLocations({ gymAccess: true }, TEST_NOW),
      );
      const db = await handle.store.getDatabase();
      for (const daysAgo of [7, 4]) {
        const when = new Date(Date.parse(TEST_NOW) - daysAgo * 86_400_000).toISOString();
        await db.put('workouts', {
          ...record(
            daysAgo,
            BENCH,
            [
              [6, 175, 2],
              [6, 175, 2],
              [6, 175, 2],
            ],
            [4, 6],
            2,
          ),
          id: `bench-${daysAgo}`,
          startedAt: when,
          completedAt: when,
        });
      }
      await handle.store.hydrate();
      await handle.store.setCoachFocus('chest');
      await handle.store.planDeloadWeek({
        recommended: true,
        window: { startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-08T00:00:00.000Z' },
        reasons: ['test'],
      });
      const store = handle.store;
      const previews = Array.from({ length: 40 }, (_, at) => 220 + at * 2).map((e1rm) =>
        store.previewStrengthMax(BENCH, bench(store).id, { kind: 'max', e1rm }),
      );
      const held = previews.filter((preview) => preview?.outcome === 'held');
      expect(held.length).toBeGreaterThan(0);
      for (const preview of held) expect(preview?.heldBy).toBe('deload');
    });
  });
});
