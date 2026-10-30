import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The eleventh review of round N. The tenth pass has a lift picked up again back at the gym drop the
 * weight its back-offs took by hand "as a swap back does", but it deletes `manual.backOffs` alone:
 * `manual.weight` stays, where a swap back clears both (`withoutHandTargets`: "the reps or the weight
 * set by hand were for the sets it had, and no longer apply", Maintenance 23). The back-offs picked
 * up are the plan's (the drop off the top set), yet every later refit reads them as a weight set by
 * hand and leaves them as they are (`refitEntry` returns early on `manual.weight`): a plate marked
 * missing leaves them at a load the plates left cannot make, where after a swap back they are fitted.
 *
 * The rules (docs/reports/maintenance-32.md): the tenth pass, "a lift picked up again drops the
 * back-offs' weight set by hand, as a swap back does"; item 11, "A lift picked up again, back at the
 * gym or swapped back to, carries on its back-offs after its top set"; the `loading` trigger: "every
 * entry's sets still to come take loads that exist here ... Logged sets and weights set by hand stay
 * as they are".
 *
 * Steps (the app's path for a weight on a lift whose top set is done: the coach's offer after the
 * top set is skipped): the main lift planned at 160 × 4-6 at 1, back-offs 150 (two sessions at 155
 * before). The top set skipped; the coach's "Take 165 lb today" taken (the back-offs' own, 165).
 * (a) Home, where the lift stops (no barbell), and back to the gym: the back-offs come back at 150,
 * the plan's drop. (b) Instead, swapped to the dumbbell row and back: 150. Then the 2.5 lb plates
 * marked missing: 150 needs them (52.5 a side).
 *
 * What happens on 905ce7f (and on 480d5a1): after (b) the back-offs are fitted to 145 (standing in
 * for 150; since the twelfth pass 155, the drop rule's nearest); after (a) they stay at 150,
 * `manual` still `{ weight: true }`. Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

async function withCoachWeight() {
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
          [5, 155, 2],
          [5, 155, 2],
          [5, 155, 2],
        ]),
        id: `w-${exerciseId}-${daysAgo}`,
        startedAt: when,
        completedAt: when,
      });
    }
  }
  await store.hydrate();
  const entries = () => allEntries(store.getSnapshot().session!.workout.blocks);
  const exerciseId = entries().find((entry) => entry.backOffDrop !== undefined)!.exerciseId;
  expect(exerciseId).toBe('barbell-row');
  const main = (): WorkoutEntry =>
    entries().find((entry) => entry.exerciseId === exerciseId && !entry.stopped)!;
  store.startWorkout();
  const toCome = () => {
    const done = store.getSnapshot().session!.completed.sets;
    return main()
      .sets.filter(
        (set) =>
          set.tier === 'back-off' &&
          !done.some((log) => log.entryId === main().id && log.setIndex === set.index),
      )
      .map((set) => set.targetWeight);
  };
  const top = main().sets.find((set) => set.tier === 'top')!;
  expect(top.targetWeight).toBe(160);
  expect(toCome()).toEqual([150, 150, 150]);
  store.skipSet(main().id, top.index);
  // The coach's "Take 165 lb today": the top set done (skipped), the weight is the back-offs'.
  await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 165 });
  expect(main().manual?.backOffs).toBe(165);
  return { store, main, entries, toCome };
}

describe('a lift picked up again after its back-offs took a weight by hand, then a plate missing', () => {
  it('back at the gym, its back-offs are fitted to the plates left, as after a swap back', async () => {
    const swapped = await withCoachWeight();
    await swapped.store.swapExercise(swapped.main().id, 'dumbbell-row');
    const standIn = swapped.entries().find((entry) => entry.exerciseId === 'dumbbell-row')!;
    await swapped.store.swapExercise(standIn.id, 'barbell-row');
    expect(swapped.toCome()).toEqual([150, 150, 150]);
    await swapped.store.setMissingPlates([2.5]);
    // The drop off the top set's plan, 152, on the plates left: 155 is the nearest (the twelfth
    // review of round N: a refit fits the back-offs as every replay does, not as a stand-in, 145).
    expect(swapped.toCome()).toEqual([155, 155, 155]);

    const back = await withCoachWeight();
    await back.store.setCurrentLocation('home');
    await back.store.setCurrentLocation('gym');
    expect(back.toCome()).toEqual([150, 150, 150]);
    await back.store.setMissingPlates([2.5]);
    // On 905ce7f: [150, 150, 150], which the plates left cannot make, `manual` `{ weight: true }`.
    expect(back.toCome(), JSON.stringify(back.main().manual)).toEqual(swapped.toCome());
  });
});
