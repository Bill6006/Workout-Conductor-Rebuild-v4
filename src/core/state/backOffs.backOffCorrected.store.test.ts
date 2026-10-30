import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The seventh review of round N. A back-off's log corrected to other numbers (not taken back): the
 * slip on the reserve dial that logged back-off 1 clearly easy (6 reps at 4 in reserve, asked 5 at
 * 2) took the back-offs after it a step up; the lifter taps the logged set and fixes it to what was
 * lifted, 5 at 2. `logSet`'s correction branch moves the back-offs only for a top set's correction
 * (or a correction to a skip), so back-offs 2 and 3 stay a step up, over what the logs now say,
 * while the same slip undone and logged again, or deleted, puts them back (the fourth review). And
 * the other way: back-off 1 logged as asked, then corrected to the grind it was, leaves the ones
 * after it at the plan's load. The spec: a correction, undo or delete of a top set or back-off puts
 * the later back-offs where the logs left them, each back-off still logged moving the ones after it
 * as its log did. Synthetic data only.
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

describe('a back-off’s log corrected to other numbers', () => {
  it('a clearly easy slip fixed to what was lifted puts the back-offs after it back', async () => {
    const { store, main, top, first, planned, backOffs } = await startedMain();
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    expect(backOffs()).toEqual(planned);
    // The slip: 6 reps at 4 in reserve. The back-offs after it go up a step.
    await store.logSet(main().id, first.index, { weight: planned[0]!, reps: 6, rir: 4 });
    expect(backOffs()[1]!).toBeGreaterThan(planned[1]!);
    // Fixed: 5 reps at 2, as asked. Logged so, it moves nothing.
    await store.logSet(main().id, first.index, { weight: planned[0]!, reps: 5, rir: 2 });
    // On e6ed7ed: back-offs 2 and 3 stay a step up.
    expect(backOffs().slice(1)).toEqual(planned.slice(1));
  });

  it('one logged as asked, fixed to the grind it was, takes the back-offs after it down', async () => {
    const { store, main, top, first, planned, backOffs } = await startedMain();
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    await store.logSet(main().id, first.index, { weight: planned[0]!, reps: 5, rir: 2 });
    expect(backOffs()).toEqual(planned);
    // Fixed: a rep under the floor at no reserve. Logged so, the ones after it came down.
    await store.logSet(main().id, first.index, { weight: planned[0]!, reps: 3, rir: 0 });
    // On e6ed7ed: back-offs 2 and 3 stay at the plan's load.
    expect(backOffs()[1]!).toBeLessThan(planned[1]!);
  });
});
