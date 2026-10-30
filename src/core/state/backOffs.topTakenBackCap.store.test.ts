import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The eleventh review of round N. The tenth pass caps every replay of the back-offs "at the top set
 * as lifted, or as planned once its log is taken back", but the store's own replay of a back-off's
 * log taken back or corrected (`backOffsAsPlanned`'s back-off branch, with no weight set by hand)
 * still caps at the top set as lifted alone (`top: lifted?.weight ?? null`): with the top set's log
 * deleted, it caps at nothing. A clearly easy back-off's step then takes the back-offs still to come
 * over the top set, now in front again at its planned load, where the replay of the same logs when
 * the top set's log itself was deleted held them at it. Logged as planned and on target, the top set
 * moves nothing (no `performance` trigger runs for it), so the back-offs stay over the top set as
 * lifted.
 *
 * The rules (docs/reports/maintenance-32.md): "The back-offs are never heavier than the top set as
 * lifted" (the third review: "the back-offs are never over the top set as lifted"); the tenth pass,
 * "every replay of the back-offs is capped at the top set as lifted, or as planned once its log is
 * taken back"; `backOffsReplayed`: "never over the top set as lifted nor under the bar".
 *
 * Steps: the main lift's top set logged as planned (140 × 5 at 1, back-offs 135); back-off 1 lifted
 * at 140, clearly easy (8 reps at 4): back-offs 2 and 3 at 140, held at the top set's load. Back-off
 * 2 logged as asked (140 × 5 at 2). The top set's row deleted: back-off 3 stays at 140, capped at
 * the top set as planned. Then back-off 2 undone, or its log corrected (5 at 3, still on target):
 * back-off 3 (and back-off 2, where its log is gone) at 145, over the 140 top set in front again.
 * The top set logged as planned (140 × 5 at 1): they stay at 145.
 *
 * What happens on 905ce7f (and on 480d5a1): 145 each time. Synthetic data only.
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
  const workout = () => store.getSnapshot().session!.workout;
  const main = (): WorkoutEntry =>
    allEntries(workout().blocks).find((entry) => entry.backOffDrop !== undefined)!;
  expect(main()).toBeDefined();
  const top = main().sets.find((set) => set.tier === 'top')!;
  const [first, second] = main().sets.filter((set) => set.tier === 'back-off');
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
  return { store, main, top, first: first!, second: second!, toCome };
}

describe('the top set’s log deleted, then a back-off’s log taken back or corrected', () => {
  for (const how of ['an undo', 'a correction'] as const) {
    it(`${how} of back-off 2 keeps the back-offs to come at or under the top set`, async () => {
      const { store, main, top, first, second, toCome } = await startedMain();
      expect(top.targetWeight).toBe(140);
      await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
      await store.logSet(main().id, first.index, { weight: 140, reps: 8, rir: 4 });
      // Clearly easy: a step up, held at the top set as lifted.
      expect(toCome()).toEqual([140, 140]);
      await store.logSet(main().id, second.index, { weight: 140, reps: 5, rir: 2 });
      store.deleteLoggedSet(main().id, top.index);
      // The replay of the top set taken back caps at it as planned.
      expect(toCome()).toEqual([140]);
      if (how === 'an undo') store.undoLastSet();
      else await store.logSet(main().id, second.index, { weight: 140, reps: 5, rir: 3 });
      // On 905ce7f: [145, 145] after the undo, [145] after the correction.
      expect(Math.max(...toCome()), toCome().join(', ')).toBeLessThanOrEqual(140);
      // Logged as planned, the top set moves nothing: the back-offs stay where the replay left them.
      await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
      expect(Math.max(...toCome()), toCome().join(', ')).toBeLessThanOrEqual(140);
    });
  }
});
