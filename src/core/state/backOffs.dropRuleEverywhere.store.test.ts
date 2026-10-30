import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The twelfth pass of round N, on what its fixes reach beyond the review's own tests. The back-offs'
 * load is the drop off the top set, "to the nearest weight the place has" (item 11; the fifth review),
 * at the same reps (the owner: "back-offs 5% lighter, same reps"), wherever it is worked out: a refit
 * for the place's weights, the follow of a top set, a replay, a step after a back-off. A cap held on
 * the top set as lifted is a weight the place has; a weight the back-offs took by hand stays the
 * most an easy back-off's step takes them to through a replay too.
 *
 * Steps (synthetic data only): the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135,
 * or at 160 (back-offs 150); the 2.5 lb plates marked missing at points through it.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

/** A started workout whose main lift's sessions before were at `load` (135: 140 today; 155: 160). */
async function startedMain(load: number) {
  const { store } = createTestStore({ now: () => TEST_NOW });
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...everyDay },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await store.getDatabase();
  for (const daysAgo of [7, 3]) {
    for (const exerciseId of ['barbell-bench-press', 'back-squat', 'barbell-row']) {
      const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
      await db.put('workouts', {
        ...record(0, exerciseId, [
          [5, load, 2],
          [5, load, 2],
          [5, load, 2],
        ]),
        id: `w-${exerciseId}-${daysAgo}`,
        startedAt: when,
        completedAt: when,
      });
    }
  }
  await store.hydrate();
  const main = (): WorkoutEntry =>
    allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.backOffDrop !== undefined,
    )!;
  expect(main()).toBeDefined();
  store.startWorkout();
  const backOffsToCome = () => {
    const done = store.getSnapshot().session!.completed.sets;
    return main().sets.filter(
      (set) =>
        set.tier === 'back-off' &&
        !done.some((log) => log.entryId === main().id && log.setIndex === set.index),
    );
  };
  const toCome = () => backOffsToCome().map((set) => set.targetWeight as number);
  /** The back-offs still to come as the lifter sees them: load, reps, and a load asked. */
  const shown = () =>
    backOffsToCome().map(
      (set) => `${set.targetWeight} × ${set.targetReps.join('-')}${set.asked ? ' asked' : ''}`,
    );
  return { store, main, toCome, shown };
}

/** Loads a barbell makes with 45, 35, 25, 10 and 5 lb plates a side, no 2.5s. */
const noSmallPlates = (load: number) => (load - 45) % 10 === 0;

describe('the back-offs at the drop, wherever their load is worked out', () => {
  it('a step held at a top set the place can no longer make stays on a weight it has', async () => {
    const { store, main, toCome } = await startedMain(135);
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    await store.logSet(main().id, top.index, { weight: 130, reps: 5, rir: 1 });
    await store.setMissingPlates([2.5]);
    expect(toCome()).toEqual([125, 125, 125]);
    // Clearly easy: the step up is held at the top set as lifted, 130, which needs a 2.5.
    await store.logSet(main().id, first!.index, { weight: 125, reps: 8, rir: 4 });
    expect(toCome()).toEqual([125, 125]);
    expect(toCome().every(noSmallPlates)).toBe(true);
  });

  it('a refit after the top set was skipped gives the back-offs their own reps', async () => {
    const { store, main, shown } = await startedMain(155);
    const top = main().sets.find((set) => set.tier === 'top')!;
    const warmup = main().sets.find((set) => set.kind === 'warmup');
    expect(warmup).toBeDefined();
    // A ramp done: the lift is under way, fitted in place, its top set as a stand-in where a load
    // is missing, its back-offs at the drop off the load it asks, standing in for nothing (the
    // thirteenth review of round N: they stood in for a load too).
    await store.logSet(main().id, warmup!.index, {
      weight: warmup!.targetWeight,
      reps: 5,
      rir: null,
    });
    await store.setMissingPlates([2.5]);
    expect(main().sets.find((set) => set.index === top.index)?.asked).toBeDefined();
    expect(shown().some((line) => line.endsWith('asked'))).toBe(false);
    store.skipSet(main().id, top.index);
    await store.setMissingPlates([]);
    // No top set lifted: the back-offs at the drop off the top set as it stands, at their own reps,
    // no stand-in for a load the place now makes.
    const lines = shown();
    expect(
      lines.length === 3 && lines.every((line) => line.endsWith('× 4-6')),
      lines.join('; '),
    ).toBe(true);
  });

  it('the follow of the top set gives the back-offs their own reps after a refit', async () => {
    const { store, main, shown } = await startedMain(155);
    const top = main().sets.find((set) => set.tier === 'top')!;
    const warmup = main().sets.find((set) => set.kind === 'warmup');
    expect(warmup).toBeDefined();
    await store.logSet(main().id, warmup!.index, {
      weight: warmup!.targetWeight,
      reps: 5,
      rir: null,
    });
    await store.setMissingPlates([2.5]);
    expect(main().sets.find((set) => set.index === top.index)?.asked).toBeDefined();
    expect(shown().some((line) => line.endsWith('asked'))).toBe(false);
    // The top set lifted at another load than shown: its back-offs follow it.
    await store.logSet(main().id, top.index, { weight: 145, reps: 5, rir: 1 });
    // At the drop off 145 (137.75), the nearest the place has without a 2.5, at their own reps.
    expect(shown()).toEqual(['135 × 4-6', '135 × 4-6', '135 × 4-6']);
  });

  it('a top set’s weight set by hand: the refit keeps it and fits the back-offs at the drop', async () => {
    const { store, main, shown } = await startedMain(135);
    const top = main().sets.find((set) => set.tier === 'top')!;
    await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 145 });
    expect(main().manual?.backOffs).toBeUndefined();
    expect(shown()).toEqual(['140 × 4-6', '140 × 4-6', '140 × 4-6']);
    await store.setMissingPlates([2.5]);
    expect(main().sets.find((set) => set.index === top.index)?.targetWeight).toBe(145);
    // The drop off 145 is 137.75: 135 is the nearest the place has without a 2.5.
    expect(shown()).toEqual(['135 × 4-6', '135 × 4-6', '135 × 4-6']);
  });

  it('back-offs at a weight set by hand: a replay keeps an easy back-off’s step under it', async () => {
    const { store, main, toCome } = await startedMain(135);
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first, second] = main().sets.filter((set) => set.tier === 'back-off');
    store.skipSet(main().id, top.index);
    await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 145 });
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    await store.logSet(main().id, first!.index, { weight: 140, reps: 6, rir: 4 });
    expect(toCome()).toEqual([145, 145]);
    await store.logSet(main().id, second!.index, { weight: 145, reps: 5, rir: 2 });
    store.undoLastSet();
    expect(toCome()).toEqual([145, 145]);
  });
});
