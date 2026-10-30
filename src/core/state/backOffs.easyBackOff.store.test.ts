import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record, type SetSpec } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 32, the owner's item 11, in the store (the third review of round N): a back-off
 * logged clearly easy takes the back-offs after it up a step, never over the top set as lifted.
 * Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

/** A session of a lift on the structure: a top set, then back-offs, at a drop. */
function structured(
  exerciseId: string,
  top: SetSpec,
  backOffs: SetSpec[],
  drop = 0.05,
): WorkoutRecord {
  const done = record(0, exerciseId, [top, ...backOffs], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = drop;
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

async function startedMain() {
  const handle = createTestStore({ now: () => TEST_NOW });
  const { store } = handle;
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...everyDay },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await store.getDatabase();
  // Two sessions of every main lift on the structure, the back-offs far easier than asked (4 in
  // reserve against 2): the drop narrows to nothing.
  const easy: SetSpec[] = [
    [5, 130, 4],
    [5, 130, 4],
    [5, 130, 4],
  ];
  for (const daysAgo of [7, 3]) {
    for (const exerciseId of ['barbell-bench-press', 'back-squat', 'barbell-row']) {
      const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
      await db.put('workouts', {
        ...structured(exerciseId, [5, 135, 1], easy),
        id: `w-${exerciseId}-${daysAgo}`,
        startedAt: when,
        completedAt: when,
      });
    }
  }
  await store.hydrate();
  const workout = () => store.getSnapshot().session!.workout;
  const main = (): WorkoutEntry =>
    allEntries(workout().blocks).find((entry) => entry.backOffDrop !== undefined)!;
  expect(main()).toBeDefined();
  store.startWorkout();
  return { store, main };
}

describe('a back-off logged clearly easy, the third review of round N', () => {
  it('never takes the back-offs after it over the top set as lifted', async () => {
    const { store, main } = await startedMain();
    expect(main().backOffDrop).toBe(0);
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first, ...rest] = main().sets.filter((set) => set.tier === 'back-off');
    expect(rest.length).toBeGreaterThan(0);
    // The top set as planned, on target.
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    // At a drop of nothing, the back-offs are at the top set's load.
    expect(first!.targetWeight).toBe(top.targetWeight);
    // Back-off 1 clearly easy: the top of the range with 4 in reserve against 2.
    await store.logSet(main().id, first!.index, { weight: first!.targetWeight, reps: 6, rir: 4 });
    const after = main()
      .sets.filter((set) => set.tier === 'back-off' && rest.some((one) => one.index === set.index))
      .map((set) => set.targetWeight!);
    expect(Math.max(...after)).toBeLessThanOrEqual(top.targetWeight!);
  });
});

describe('a later back-off’s log taken back at a drop of nothing, the fourth review of round N', () => {
  it('the easy back-off’s step comes back no heavier than the top set as lifted', async () => {
    const { store, main } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first, second] = main().sets.filter((set) => set.tier === 'back-off');
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    await store.logSet(main().id, first!.index, { weight: first!.targetWeight, reps: 6, rir: 4 });
    // Back-off 2 at the load the follow left it, then its log taken back: the step back-off 1's
    // log gave the ones after it comes back with it, never over the top set.
    const at = main().sets.find((set) => set.index === second!.index)!.targetWeight;
    await store.logSet(main().id, second!.index, { weight: at, reps: 5, rir: 2 });
    store.undoLastSet();
    const after = main()
      .sets.filter((set) => set.tier === 'back-off' && set.index !== first!.index)
      .map((set) => set.targetWeight!);
    expect(Math.max(...after)).toBeLessThanOrEqual(top.targetWeight!);
  });
});
