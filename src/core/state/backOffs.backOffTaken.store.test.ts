import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 32, the owner's item 11, in the store (the third review of round N): a back-off's log
 * taken back (Undo, a delete) puts it where its top set, as it now stands, puts the back-offs.
 * Synthetic data only.
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
  const firstBackOff = main().sets.find((set) => set.tier === 'back-off')!;
  const planned = main()
    .sets.filter((set) => set.tier === 'back-off')
    .map((set) => set.targetWeight);
  store.startWorkout();
  const backOffs = () =>
    main()
      .sets.filter((set) => set.tier === 'back-off')
      .map((set) => set.targetWeight);
  return { store, main, top, firstBackOff, planned, backOffs };
}

describe('a back-off logged before the top set is corrected, its log then taken back, the third review of round N', () => {
  async function slipLoggedThenCorrected() {
    const ctx = await startedMain();
    const { store, main, top, firstBackOff, planned, backOffs } = ctx;
    // A slip on the dial: twenty over. The back-offs follow it.
    await store.logSet(main().id, top.index, { weight: top.targetWeight! + 20, reps: 5, rir: 1 });
    expect(backOffs()[0]!).toBeGreaterThan(planned[0]!);
    // Back-off 1 done at what the lifter really lifts: the plan's back-off load.
    await store.logSet(main().id, firstBackOff.index, { weight: planned[0]!, reps: 5, rir: 2 });
    // The slip seen and corrected: the top set was lifted as planned, on target.
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    // The back-offs still to come go back where the plan has them.
    expect(backOffs().slice(1)).toEqual(planned.slice(1));
    return ctx;
  }

  it('Undo of back-off 1: it comes back where the corrected top set puts it, not at the slip’s load', async () => {
    const { store, top, backOffs, planned } = await slipLoggedThenCorrected();
    store.undoLastSet();
    // Never heavier than the top set as lifted...
    expect(Math.max(...backOffs().map((weight) => weight!))).toBeLessThanOrEqual(top.targetWeight!);
    // ...and where the top set logged right puts them.
    expect(backOffs()).toEqual(planned);
  });

  it('a delete of back-off 1: the same', async () => {
    const { store, main, firstBackOff, backOffs, planned } = await slipLoggedThenCorrected();
    store.deleteLoggedSet(main().id, firstBackOff.index);
    expect(backOffs()).toEqual(planned);
  });
});

describe('a back-off taken back after its top set was skipped, the third review of round N', () => {
  it('comes back where the plan has it: a skip is no top set lifted', async () => {
    const { store, main, top, firstBackOff, planned, backOffs } = await startedMain();
    store.skipSet(main().id, top.index);
    await store.logSet(main().id, firstBackOff.index, { weight: planned[0]!, reps: 5, rir: 2 });
    store.undoLastSet();
    expect(backOffs()).toEqual(planned);
  });
});
