import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The ninth review of round N. The eighth pass's fix for a weight set by hand ("A weight set by
 * hand stays through corrections and logs taken back") returns early in `backOffsAsPlanned`
 * whenever `entry.manual.weight` is set, so nothing a slip did to the back-offs is ever taken back
 * once any weight on the lift was set by hand, the top set's own included.
 *
 * The spec (docs/reports/maintenance-32.md): "A weight set by hand before the top set is done is
 * the top set's, the back-offs following at the drop"; the top set's "log taken back (an undo, a
 * delete, a correction to a skip) puts them back where the plan has them" (the second review's
 * MEDIUM: a top set's log taken back left the back-offs where the slip had put them); "a back-off
 * corrected replays the ones after it from the logs as corrected" (the seventh review), and a
 * back-off's log taken back puts the ones after it where the logs left standing put them (the
 * fourth). `backOffLoad`: while a drop is in force, a back-off is under the top set where the place
 * has a weight under it.
 *
 * 1. The lifter sets the top set's weight by hand before lifting it, 150 for the 140 planned: the
 *    back-offs follow at the drop, 145. The top set is logged at 160, a slip of the dial: the
 *    back-offs follow it to 150. The slip taken back (an undo, a delete, or a correction to a skip):
 *    the top set is back at 150 and the back-offs stay at 150, the top set's own load, with a 5%
 *    drop in force. On 412666e (before the eighth pass) each puts them back at 145.
 * 2. The same weight set by hand (150, back-offs 145), the top set logged as asked, back-off 1
 *    logged clearly easy by a slip (8 reps at 4 in reserve): back-offs 2 and 3 step up to 150. The
 *    slip corrected to what was lifted (5 at 2), or undone: back-offs 2 and 3 stay at 150, the
 *    slip's step kept. On 412666e both put them back at 145. (With the weight set by hand after the
 *    top set, 115, the easy slip takes back-offs 2 and 3 to 120 and its correction leaves them
 *    there, where the logs as corrected leave them at 115.)
 *
 * Passes on 412666e: a regression of the eighth pass's fix. Synthetic data only.
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
  store.startWorkout();
  const backOffs = () =>
    main()
      .sets.filter((set) => set.tier === 'back-off')
      .map((set) => set.targetWeight);
  const topWeight = () => main().sets.find((set) => set.tier === 'top')!.targetWeight;
  return { store, main, top, first: first!, backOffs, topWeight };
}

/** The top set's weight set by hand before it is lifted, 10 lb over the plan. */
async function handSetBeforeTop() {
  const started = await startedMain();
  const { store, main, top, backOffs, topWeight } = started;
  const hand = top.targetWeight! + 10;
  await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: hand });
  expect(topWeight()).toBe(hand);
  const following = backOffs()[0]!;
  expect(following).toBeLessThan(hand);
  expect(backOffs()).toEqual([following, following, following]);
  return { ...started, hand, following };
}

describe('the top set’s slip taken back after its weight was set by hand', () => {
  for (const how of ['an undo', 'a delete', 'a correction to a skip'] as const) {
    it(`${how} puts the back-offs back at the drop off the top set`, async () => {
      const { store, main, top, backOffs, topWeight, hand, following } = await handSetBeforeTop();
      // A slip of the dial: 10 lb over the weight set, the back-offs following it.
      await store.logSet(main().id, top.index, { weight: hand + 10, reps: 5, rir: 1 });
      expect(backOffs()[0]).toBeGreaterThan(following);
      if (how === 'an undo') store.undoLastSet();
      else if (how === 'a delete') store.deleteLoggedSet(main().id, top.index);
      else await store.logSet(main().id, top.index, { weight: hand + 10, reps: 0, rir: null });
      expect(topWeight()).toBe(hand);
      // On 34dc615: [150, 150, 150], the top set's own load. On 412666e: [145, 145, 145].
      expect(backOffs()).toEqual([following, following, following]);
    });
  }
});

describe('a back-off’s slip taken back after the top set’s weight was set by hand', () => {
  for (const how of ['a correction', 'an undo'] as const) {
    it(`${how} takes the slip’s step off the back-offs after it`, async () => {
      const { store, main, top, first, backOffs, hand, following } = await handSetBeforeTop();
      await store.logSet(main().id, top.index, { weight: hand, reps: 5, rir: 1 });
      expect(backOffs()).toEqual([following, following, following]);
      // Back-off 1 logged clearly easy by a slip: the ones after it step up.
      await store.logSet(main().id, first.index, { weight: following, reps: 8, rir: 4 });
      expect(backOffs()[1]).toBeGreaterThan(following);
      if (how === 'a correction') {
        await store.logSet(main().id, first.index, { weight: following, reps: 5, rir: 2 });
      } else {
        store.undoLastSet();
      }
      // On 34dc615: [145, 150, 150]. On 412666e: [145, 145, 145].
      expect(backOffs()).toEqual([following, following, following]);
    });
  }
});

describe('the saved session keeps the load the drop gave the back-offs', () => {
  it('off the top set as lifted, for the drop’s correction to read only back-offs lifted at it', async () => {
    const { store, main, top, backOffs } = await startedMain();
    // The top set lifted 10 lb heavier than planned: the back-offs follow it.
    await store.logSet(main().id, top.index, { weight: top.targetWeight! + 10, reps: 5, rir: 1 });
    const followed = backOffs()[0]!;
    for (const set of main().sets.filter((each) => each.tier === 'back-off')) {
      await store.logSet(main().id, set.index, { weight: followed - 5, reps: 5, rir: 3 });
    }
    await store.finishWorkout(null);
    const saved = store.getSnapshot().history.at(-1)!;
    const entry = saved.entries.find((each) => each.backOffDrop !== undefined)!;
    expect(entry.backOffAt).toBe(followed);
  });
});
