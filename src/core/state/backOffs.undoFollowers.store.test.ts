import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 32, the owner's item 11, in the store (the fourth review of round N): a back-off's
 * log taken back puts every back-off still to come where the top set as it stands puts them, each
 * back-off still logged moving the ones after it as its log did. Synthetic data only.
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
  const [first] = main().sets.filter((set) => set.tier === 'back-off');
  const planned = main()
    .sets.filter((set) => set.tier === 'back-off')
    .map((set) => set.targetWeight);
  store.startWorkout();
  const backOffs = () =>
    main()
      .sets.filter((set) => set.tier === 'back-off')
      .map((set) => set.targetWeight);
  return { store, main, top, first: first!, planned, backOffs };
}

describe('a back-off’s clearly easy log taken back, the fourth review of round N', () => {
  async function easyBackOffLogged() {
    const ctx = await startedMain();
    const { store, main, top, first, planned, backOffs } = ctx;
    // The top set as asked: nothing moves.
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    expect(backOffs()).toEqual(planned);
    // Back-off 1 logged clearly easy (a slip on the reserve dial: 4 for 2, and 6 reps for 5).
    await store.logSet(main().id, first.index, { weight: planned[0]!, reps: 6, rir: 4 });
    // The back-offs after it go up a step, never over the top set.
    expect(
      backOffs()
        .slice(1)
        .every((weight) => weight! > planned[0]!),
    ).toBe(true);
    expect(Math.max(...backOffs().map((weight) => weight!))).toBeLessThanOrEqual(top.targetWeight!);
    return ctx;
  }

  it('Undo: every back-off still to come goes back where the top set as it stands puts it', async () => {
    const { store, backOffs, planned } = await easyBackOffLogged();
    store.undoLastSet();
    // Fails on 5894333: back-off 1 back at the plan's load, back-offs 2 and 3 a step up still.
    expect(backOffs()).toEqual(planned);
  });

  it('a delete of back-off 1: the same', async () => {
    const { store, main, first, backOffs, planned } = await easyBackOffLogged();
    store.deleteLoggedSet(main().id, first.index);
    expect(backOffs()).toEqual(planned);
  });

  it('logged again as asked after the Undo, the back-offs after it are where the plan has them', async () => {
    const { store, main, first, backOffs, planned } = await easyBackOffLogged();
    store.undoLastSet();
    await store.logSet(main().id, first.index, { weight: planned[0]!, reps: 5, rir: 2 });
    expect(backOffs().slice(1)).toEqual(planned.slice(1));
  });

  it('a later back-off’s log taken back keeps the step the earlier easy back-off, still logged, gave it', async () => {
    const { store, main, backOffs, planned } = await easyBackOffLogged();
    const stepped = backOffs();
    const second = main().sets.filter((set) => set.tier === 'back-off')[1]!;
    // Back-off 2 at the load the easy back-off 1 gave it, on target.
    await store.logSet(main().id, second.index, { weight: stepped[1]!, reps: 5, rir: 2 });
    store.undoLastSet();
    // Fails on 5894333: back-off 2 back at the top set's drop (130), under back-off 3 still at 135,
    // though back-off 1's easy log, which moved them both, still stands.
    expect(backOffs()[1]).toBe(backOffs()[2]);
    expect(backOffs()[1]).toBe(stepped[1]);
    expect(planned[1]).toBeLessThan(stepped[1]!);
  });
});
