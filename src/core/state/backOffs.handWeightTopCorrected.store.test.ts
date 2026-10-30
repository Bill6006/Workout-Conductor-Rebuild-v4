import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The ninth review of round N. The top set's log corrected after the back-offs' weight was set by
 * hand: the correction throws the weight set by hand away.
 *
 * The spec (docs/reports/maintenance-32.md): "A weight set by hand before the top set is done is
 * the top set's, the back-offs following at the drop; once it is done, the back-offs take it"; the
 * eighth pass: "A weight set by hand stays through corrections and logs taken back"; `withBackOffs`
 * and `withDropsToday`: "a weight the back-offs took by hand after it is theirs". A correction to
 * the top set moves its back-offs "as the set logged right would have": logged right, the back-offs
 * would have followed it, and the weight set by hand after it would still be theirs.
 *
 * What happens: the eighth pass's fix returns early in `backOffsAsPlanned` (a back-off corrected, a
 * log taken back) when `entry.manual.weight` is set, but a correction of the top set's numbers
 * takes the other road: `logSet` sends a `performance` recalibration with `backOffLogs`, and its
 * top-set branch in `execute` (`backOffLoadAfter`, `backOffsReplayed`) puts every back-off not
 * logged at the load the corrected top set gives them, with no look at the weight set by hand.
 *
 * Steps: the main lift's top set logged as planned (140, back-offs 135); the lifter sets the
 * back-offs to 115 by hand (the top set done, so the back-offs take it); the top set's reps
 * corrected, a typo, 5 to 6 (still in range at its reserve), or its reserve, 1 to 2. The back-offs
 * jump back to 135, 20 lb over the weight the lifter set, with no word. Also fails on 412666e (the
 * seventh pass's fixes, before the eighth pass): the eighth pass's fix did not reach this road.
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

/** The top set logged as planned, then the back-offs' weight set by hand, 20 lb lighter. */
async function handSetAfterTop() {
  const started = await startedMain();
  const { store, main, top, planned, backOffs } = started;
  await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
  expect(backOffs()).toEqual(planned);
  const hand = planned[0]! - 20;
  await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: hand });
  expect(backOffs()).toEqual([hand, hand, hand]);
  expect(main().manual?.weight).toBe(true);
  return { ...started, hand };
}

describe('the top set’s log corrected after the back-offs’ weight was set by hand', () => {
  it('a typo in its reps (5 to 6, still in range) leaves the back-offs at the weight set by hand', async () => {
    const { store, main, top, backOffs, hand } = await handSetAfterTop();
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 6, rir: 1 });
    // On 34dc615 and 412666e: [135, 135, 135].
    expect(backOffs()).toEqual([hand, hand, hand]);
    expect(store.getSnapshot().session!.lastSummary?.headline).toContain(
      `back-offs kept at ${hand} lb, the weight you set`,
    );
  });

  it('a typo in its reserve (1 to 2) leaves the back-offs at the weight set by hand', async () => {
    const { store, main, top, backOffs, hand } = await handSetAfterTop();
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 2 });
    // On 34dc615 and 412666e: [135, 135, 135].
    expect(backOffs()).toEqual([hand, hand, hand]);
  });
});

describe('a back-off’s slip taken back after the back-offs’ weight was set by hand', () => {
  for (const how of ['a correction', 'an undo'] as const) {
    it(`${how} takes the slip’s step off the back-offs after it, back to the weight set`, async () => {
      const { store, main, backOffs, hand } = await handSetAfterTop();
      const [first] = main().sets.filter((set) => set.tier === 'back-off');
      // Back-off 1 logged clearly easy by a slip: the ones after it step up from the weight set.
      await store.logSet(main().id, first!.index, { weight: hand, reps: 8, rir: 4 });
      expect(backOffs()[1]).toBeGreaterThan(hand);
      if (how === 'a correction') {
        await store.logSet(main().id, first!.index, { weight: hand, reps: 5, rir: 2 });
      } else {
        store.undoLastSet();
      }
      // Before: the slip's step kept, [hand, hand + 5, hand + 5].
      expect(backOffs()).toEqual([hand, hand, hand]);
    });
  }

  it('the top set taken back leaves them at the weight set by hand', async () => {
    const { store, main, top, backOffs, hand } = await handSetAfterTop();
    store.deleteLoggedSet(main().id, top.index);
    expect(backOffs()).toEqual([hand, hand, hand]);
  });

  it('a weight then set on the top set, taken back, is the top set’s: the back-offs follow it', async () => {
    const { store, main, top, backOffs } = await handSetAfterTop();
    store.deleteLoggedSet(main().id, top.index);
    // The top set not done again: the weight set now is the top set's.
    await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 150 });
    expect(main().manual?.backOffs).toBeUndefined();
    const following = backOffs()[0]!;
    expect(following).toBeLessThan(150);
    // A slip on it taken back: the back-offs follow the top set again, not the old weight.
    await store.logSet(main().id, top.index, { weight: 160, reps: 5, rir: 1 });
    store.undoLastSet();
    expect(backOffs()).toEqual([following, following, following]);
  });

  it('a swap after the top set is taken back gives the new lift none of the old weight', async () => {
    const { store, main, top } = await handSetAfterTop();
    store.deleteLoggedSet(main().id, top.index);
    const id = main().id;
    await store.recalibrate({ type: 'replace', entryId: id, exerciseId: 'dumbbell-bench-press' });
    const swapped = allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.id === id,
    )!;
    expect(swapped.exerciseId).toBe('dumbbell-bench-press');
    expect(swapped.manual?.backOffs).toBeUndefined();
  });
});
