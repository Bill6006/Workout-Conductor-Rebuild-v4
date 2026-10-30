import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 32, the owner's item 11, in the store (the second review of round N): a top set's log
 * taken back (Undo, a delete from the inline correction, a correction to a skip) takes its moves
 * off the back-offs, which go back where the plan has them; logged again as planned, they stay
 * there. TEST_NOW is a Wednesday, a day the schedule ticks. Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

async function startedMain() {
  const handle = createTestStore({ now: () => TEST_NOW });
  const { store } = handle;
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
          [5, 135, 2],
          [5, 135, 2],
          [5, 135, 2],
        ]),
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
  const top = main().sets.find((set) => set.tier === 'top')!;
  const planned = main()
    .sets.filter((set) => set.tier === 'back-off')
    .map((set) => set.targetWeight);
  store.startWorkout();
  const backOffs = () =>
    main()
      .sets.filter((set) => set.tier === 'back-off')
      .map((set) => set.targetWeight);
  return { store, main, top, planned, backOffs };
}

describe('a top set logged at the wrong load, taken back and logged again as planned, the second review of round N', () => {
  it('taken back with Undo: the back-offs come back to 5% under the top set as lifted', async () => {
    const { store, main, top, planned, backOffs } = await startedMain();
    // A slip on the dial: a hundred over. The back-offs follow it.
    await store.logSet(main().id, top.index, { weight: top.targetWeight! + 100, reps: 5, rir: 1 });
    expect(backOffs()[0]!).toBeGreaterThan(planned[0]!);
    store.undoLastSet();
    // Logged again at what was lifted: the plan's own load.
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    expect(backOffs()).toEqual(planned);
  });

  it('deleted from the inline correction: the same', async () => {
    const { store, main, top, planned, backOffs } = await startedMain();
    await store.logSet(main().id, top.index, { weight: top.targetWeight! + 100, reps: 5, rir: 1 });
    expect(backOffs()[0]!).toBeGreaterThan(planned[0]!);
    store.deleteLoggedSet(main().id, top.index);
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    expect(backOffs()).toEqual(planned);
  });

  it('corrected to a skip (0 reps): the back-offs come back to where the plan had them', async () => {
    const { store, main, top, planned, backOffs } = await startedMain();
    await store.logSet(main().id, top.index, { weight: top.targetWeight! + 100, reps: 5, rir: 1 });
    expect(backOffs()[0]!).toBeGreaterThan(planned[0]!);
    // Not lifted after all: the top set corrected to a skip.
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 0, rir: null });
    expect(backOffs()).toEqual(planned);
  });
});
