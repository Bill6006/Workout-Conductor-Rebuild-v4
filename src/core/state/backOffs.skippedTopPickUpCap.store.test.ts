import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The eleventh review of round N. With the top set skipped, the live follow moves the back-offs
 * with no cap ("a top set skipped is no top set lifted": the `performance` trigger's `topLifted` is
 * null), and so does the store's replay of a back-off's log taken back. A lift picked up again, back
 * at the gym or swapped back to, replays the same logs through `owedBackOffLoad` capped at the top
 * set as planned (`top: done?.weight ?? top.targetWeight`), so the step a clearly easy back-off gave
 * the ones after it comes back cut to the skipped top set's planned load: the loads the lifter was
 * shown move down a step with no new log, though the logs say the back-offs went up.
 *
 * The rules (docs/reports/maintenance-32.md): the seventh pass, "a lift picked up again carries on
 * its back-offs at the step each logged back-off gave them, read from its log as the top set's own
 * is"; item 11, "A lift picked up again, back at the gym or swapped back to, carries on its back-offs
 * after its top set, as it was lifted"; the third pass, "a top set skipped is no top set lifted".
 * (The same cap is what the tenth pass put on the store's replay of a weight set by hand, the
 * finding in `backOffs.handWeightSkippedTopCap.store.test.ts`.)
 *
 * Steps: the main lift planned at 140 × 4-6 at 1, back-offs 135. The top set skipped; back-off 1
 * clearly easy (135 × 8 at 4): back-offs 2 and 3 at 140; back-off 2 clearly easy (140 × 8 at 4):
 * back-off 3 at 145, as the live follow moves it. Then (a) the lifter goes home (no barbell there:
 * the lift stops) and back to the gym, or (b) swaps the row for the dumbbell row and back.
 *
 * What happens on 905ce7f (and on 480d5a1): back-off 3 comes back at 140 either way. Synthetic data
 * only.
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
  return { store, main, toCome, entries };
}

/** The top set skipped, two back-offs clearly easy: the live follow takes back-off 3 to 145. */
async function afterEasyBackOffs() {
  const started = await startedMain();
  const { store, main, toCome } = started;
  const top = main().sets.find((set) => set.tier === 'top')!;
  const [first, second] = main().sets.filter((set) => set.tier === 'back-off');
  expect(top.targetWeight).toBe(140);
  store.skipSet(main().id, top.index);
  await store.logSet(main().id, first!.index, { weight: 135, reps: 8, rir: 4 });
  expect(toCome()).toEqual([140, 140]);
  await store.logSet(main().id, second!.index, { weight: 140, reps: 8, rir: 4 });
  expect(toCome()).toEqual([145]);
  return started;
}

describe('the top set skipped, two back-offs clearly easy, then the lift picked up again', () => {
  it('home and back to the gym, back-off 3 keeps the step the logs gave it', async () => {
    const { store, toCome } = await afterEasyBackOffs();
    await store.setCurrentLocation('home');
    await store.setCurrentLocation('gym');
    // On 905ce7f: [140], cut to the skipped top set's planned load.
    expect(toCome()).toEqual([145]);
  });

  it('swapped to the dumbbell row and back, back-off 3 keeps the step the logs gave it', async () => {
    const { store, main, toCome, entries } = await afterEasyBackOffs();
    await store.swapExercise(main().id, 'dumbbell-row');
    const standIn = entries().find((entry) => entry.exerciseId === 'dumbbell-row')!;
    await store.swapExercise(standIn.id, 'barbell-row');
    // On 905ce7f: [140].
    expect(toCome()).toEqual([145]);
  });
});
