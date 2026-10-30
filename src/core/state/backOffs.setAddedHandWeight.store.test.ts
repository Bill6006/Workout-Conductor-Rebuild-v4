import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The twelfth review of round N. Since the eleventh pass a set added after a back-off goes through
 * `asBackOffs` (the 'sets' trigger), which starts from the drop off the top set as lifted and never
 * reads a weight the back-offs took by hand (`manual.backOffs`). Every other replay of them starts
 * from that weight (the store's `backOffsAsPlanned`, its `own` branch), so the set added comes in at
 * the drop's load beside back-offs still at the weight the lifter set, and the next replay (an undo,
 * a delete, a correction) moves it to that weight with no new log.
 *
 * The rules (docs/reports/maintenance-32.md): item 11, "A weight set by hand before the top set is
 * done is the top set's, the back-offs following at the drop; once it is done, the back-offs take
 * it. A set added is a back-off."; the ninth pass, "every replay of back-offs with their own weight
 * starts from it"; the eleventh, "a set added after a back-off takes the load its logs give it, as
 * every replay does".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. The app's path to a
 * weight the back-offs take by hand (the coach offers one while no set is lifted): the top set
 * skipped, the coach's "Take 145 lb today" taken, the skip corrected to what was lifted, 140 × 5 at 1
 * (back-offs kept at 145). Back-off 1 lifted at 145 × 5 at 2. A set added. Then back-off 2 logged at
 * 145 × 5 at 2 and undone. And the back-offs' reps set by hand to 8-10 once the top set is done
 * (the lift's rep range), back-off 1 lifted, a set added.
 *
 * What happens on f858500: the set added comes in at 135 beside back-offs 2 and 3 at 145, and the
 * undo's replay takes it to 145; with the reps set by hand it comes in at the top set's 4-6. On
 * d119260 (before the eleventh pass) the set added took the last back-off's 145 and 8-10.
 * Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

async function startedMain() {
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
  const main = (): WorkoutEntry =>
    allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.backOffDrop !== undefined,
    )!;
  expect(main()).toBeDefined();
  store.startWorkout();
  const toCome = () => {
    const done = store.getSnapshot().session!.completed.sets;
    return main()
      .sets.filter(
        (set) =>
          set.tier === 'back-off' &&
          !done.some((log) => log.entryId === main().id && log.setIndex === set.index),
      )
      .map((set) => set.targetWeight as number);
  };
  return { store, main, toCome };
}

describe('a set added after a back-off, the back-offs at a weight or reps set by hand', () => {
  it('comes in at that weight, and a replay leaves it there', async () => {
    const { store, main, toCome } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first, second] = main().sets.filter((set) => set.tier === 'back-off');
    expect(top.targetWeight).toBe(140);
    // The app's path (the coach offers a weight while no set is lifted): the top set skipped, then
    // the coach's "Take 145 lb today" taken; the top set done, the weight is the back-offs' own.
    store.skipSet(main().id, top.index);
    await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 145 });
    expect(main().manual?.backOffs).toBe(145);
    // The skip corrected to what was lifted: the back-offs keep the weight taken.
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    expect(toCome()).toEqual([145, 145, 145]);
    await store.logSet(main().id, first!.index, { weight: 145, reps: 5, rir: 2 });
    await store.recalibrate({ type: 'sets', entryId: main().id, workingDelta: 1 });
    const added = toCome();
    // On f858500: [145, 145, 135], the set added at the drop off the top set.
    expect({ added }).toEqual({ added: [145, 145, 145] });
    // A replay of the same logs: back-off 2 logged as asked, then undone.
    await store.logSet(main().id, second!.index, { weight: 145, reps: 5, rir: 2 });
    store.undoLastSet();
    expect({ replayed: toCome() }).toEqual({ replayed: added });
  });

  it('comes in at the reps the back-offs took by hand', async () => {
    const { store, main } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    // The top set done: the back-offs at 8-10 by hand.
    await store.recalibrate({ type: 'rep-range', entryId: main().id, reps: [8, 10] });
    expect(main().manual?.reps).toBe(true);
    await store.logSet(main().id, first!.index, { weight: 135, reps: 9, rir: 2 });
    const ranges = () =>
      main()
        .sets.filter((set) => set.tier === 'back-off')
        .map((set) => set.targetReps.join('-'));
    expect(ranges()).toEqual(['8-10', '8-10', '8-10']);
    await store.recalibrate({ type: 'sets', entryId: main().id, workingDelta: 1 });
    // On f858500: the set added at the top set's 4-6.
    expect({ ranges: ranges() }).toEqual({ ranges: ['8-10', '8-10', '8-10', '8-10'] });
  });
});
