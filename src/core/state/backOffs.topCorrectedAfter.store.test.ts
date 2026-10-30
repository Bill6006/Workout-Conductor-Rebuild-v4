import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The sixth review of round N. A correction to a top set's numbers, made after a back-off was
 * logged, puts the back-offs still to come where the corrected top set alone puts them
 * (`logSet`'s correction branch sends a `performance` trigger whose top-set branch sets every
 * back-off left to `backOffLoadAfter`): the step the logged back-off's own log gave the ones after
 * it is dropped: after a grind on back-off 1, the ones after it go back up. The top set's log
 * deleted does the same through `backOffsAsLogged`. The spec: a correction or undo of a top
 * set or back-off puts the later back-offs where the logs left them (the fourth review's rule for a
 * back-off's log taken back: each back-off still logged moves the ones after it as its log did).
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

describe('a top set corrected after a back-off was logged', () => {
  it('keeps the step a clearly easy back-off 1 gave the back-offs after it', async () => {
    const { store, main, top, first, planned, backOffs } = await startedMain();
    // The top set as asked: nothing moves.
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    expect(backOffs()).toEqual(planned);
    // Back-off 1 clearly easy (6 reps at 4 in reserve, asked 2): the ones after it go up a step.
    await store.logSet(main().id, first.index, { weight: planned[0]!, reps: 6, rir: 4 });
    const stepped = backOffs();
    expect(stepped[1]!).toBeGreaterThan(planned[1]!);
    // The lifter fixes a typo on the top set: 4 reps, not 5, the same load and reserve. Logged so,
    // the top set leaves its back-offs at the drop, as it did; back-off 1's easy log still stands.
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 4, rir: 1 });
    // On 6f2d5ea: back-offs 2 and 3 back at the drop's load (the plan's), back-off 1's step gone.
    expect(backOffs().slice(1)).toEqual(stepped.slice(1));
  });

  it('keeps the step down a grinding back-off 1 gave the back-offs after it', async () => {
    const { store, main, top, first, planned, backOffs } = await startedMain();
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    expect(backOffs()).toEqual(planned);
    // Back-off 1 a grind: a rep under the floor at no reserve. The ones after it come down.
    await store.logSet(main().id, first.index, { weight: planned[0]!, reps: 3, rir: 0 });
    const stepped = backOffs();
    expect(stepped[1]!).toBeLessThan(planned[1]!);
    // The same typo fixed on the top set.
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 4, rir: 1 });
    // On 6f2d5ea: back-offs 2 and 3 back up at the plan's load, heavier than the grind left them.
    expect(backOffs().slice(1)).toEqual(stepped.slice(1));
  });

  it('a delete of the top set’s log keeps the step a clearly easy back-off 1, still logged, gave', async () => {
    const { store, main, top, first, planned, backOffs } = await startedMain();
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    await store.logSet(main().id, first.index, { weight: planned[0]!, reps: 6, rir: 4 });
    const stepped = backOffs();
    expect(stepped[1]!).toBeGreaterThan(planned[1]!);
    // The top set's log deleted (logged on the wrong lift, say): back-off 1's log still stands.
    store.deleteLoggedSet(main().id, top.index);
    // On 6f2d5ea: back-offs 2 and 3 back at the plan's load, back-off 1's step gone.
    expect(backOffs().slice(1)).toEqual(stepped.slice(1));
  });
});
