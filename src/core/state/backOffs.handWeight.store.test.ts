import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The eighth review of round N. A back-off's log corrected after the back-offs' weight was set by
 * hand.
 *
 * The spec: a load set by hand stays as it is (`withBackOffs`, `withDropsToday`: "a weight the
 * back-offs took by hand stays"); once the top set is done, a weight set by hand is the back-offs'
 * (docs/reports/maintenance-32.md); the seventh review's fix replays the back-offs after a corrected
 * one "from the logs as corrected", so that a slip fixed leaves them where the set logged right
 * would have.
 *
 * What happens on abb5566: `logSet`'s new `backOffFixed` branch runs `backOffsAsPlanned` for any
 * correction of a back-off, a typo in its reps included, and `backOffsReplayed` puts every back-off
 * not logged at the load the top set gives them, the weight set by hand thrown away.
 *
 * Steps: the main lift's top set logged as planned (140, back-offs 135); the lifter sets the
 * back-offs to 115 by hand (the coach's lighter load, or their own); back-off 1 logged at 115, 5
 * reps at 2 in reserve, as asked; its reps corrected to 6 (still in range, nothing moves). Back-offs
 * 2 and 3 jump back to 135, 20 lb over the weight the lifter set, with no word. On 5dc61a7 and
 * e6ed7ed they stay at 115 (the correction moves nothing): a regression of the seventh review's fix.
 * An undo or delete of back-off 1 puts them at 135 on every commit since the fourth review (its
 * replay), the same loss. Synthetic data only.
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

describe('a back-off’s typo corrected after the back-offs’ weight was set by hand', () => {
  it('leaves the back-offs after it at the weight set by hand', async () => {
    const { store, main, top, first, planned, backOffs } = await startedMain();
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    expect(backOffs()).toEqual(planned);
    const hand = planned[0]! - 20;
    await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: hand });
    expect(backOffs()).toEqual([hand, hand, hand]);
    // Back-off 1 as asked: nothing moves.
    await store.logSet(main().id, first.index, { weight: hand, reps: 5, rir: 2 });
    expect(backOffs()).toEqual([hand, hand, hand]);
    // Its reps corrected, 5 to 6: still in range at its reserve, nothing to move.
    await store.logSet(main().id, first.index, { weight: hand, reps: 6, rir: 2 });
    // On abb5566: [115, 135, 135].
    expect(backOffs()).toEqual([hand, hand, hand]);
  });
});

describe('a back-off’s log taken back after the back-offs’ weight was set by hand', () => {
  it('an undo leaves the back-offs still to come at the weight set by hand', async () => {
    const { store, main, top, first, planned, backOffs } = await startedMain();
    await store.logSet(main().id, top.index, { weight: top.targetWeight, reps: 5, rir: 1 });
    const hand = planned[0]! - 20;
    await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: hand });
    await store.logSet(main().id, first.index, { weight: hand, reps: 5, rir: 2 });
    expect(backOffs()).toEqual([hand, hand, hand]);
    store.undoLastSet();
    // On abb5566, 5dc61a7 and e6ed7ed: [135, 135, 135].
    expect(backOffs()).toEqual([hand, hand, hand]);
  });
});
