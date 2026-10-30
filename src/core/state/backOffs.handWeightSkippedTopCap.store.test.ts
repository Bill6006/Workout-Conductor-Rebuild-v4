import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The eleventh review of round N. The tenth pass caps the store's replay of back-offs with their
 * own weight (`manual.backOffs`) at "the top set as lifted, or as planned once its log is taken
 * back" (`top: liftedTop?.weight ?? top.targetWeight`). A top set skipped is neither: it was never
 * lifted and no log of it was taken back. The replay then caps at the top set's planned load,
 * under the weight the lifter took for the back-offs, where the live follow caps at nothing for a
 * skipped top set (the `performance` trigger's `topLifted` is null). So a log taken back or
 * corrected throws away the weight set by hand and the step a clearly easy back-off gave, and puts
 * the back-offs under where they stood before the set was logged.
 *
 * The rules (docs/reports/maintenance-32.md): the eighth pass, "A weight set by hand stays through
 * corrections and logs taken back"; the ninth, "every replay of back-offs with their own weight
 * starts from it"; the third, "a top set skipped is no top set lifted"; the seventh, "a back-off
 * corrected replays the ones after it from the logs as corrected" (and the fourth: a back-off's log
 * taken back leaves the ones after it where the logs left standing put them); `backOffsReplayed`:
 * each back-off still logged moves the ones after it "as its log did when it was made".
 *
 * Steps (the app's path: the coach offers a weight only on a lift with no set lifted, so after the
 * top set is skipped): the main lift planned at 140 × 4-6 at 1, back-offs 135. The top set skipped;
 * the coach's "Take 145 lb today" taken (a `target-weight` of 145, the top set done, so the
 * back-offs take it: `manual.backOffs`); back-off 1 logged clearly easy (145 × 8 at 4): back-offs 2
 * and 3 step up to 150, as the live follow moves them. Back-off 2 logged as asked (150 × 5 at 2),
 * then undone, deleted, or corrected (5 at 3, still on target).
 *
 * What happens on 905ce7f: back-off 3 (and back-off 2, where its log is gone) at 140, the top set's
 * planned load: under the weight the lifter took (145) and a step under where the logs put it
 * (150); a clearly easy back-off's step up became a step down. Passes on 480d5a1 (the replay
 * uncapped, 150 each time): a regression of the tenth pass. Synthetic data only.
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
  const backOffs = () =>
    main()
      .sets.filter((set) => set.tier === 'back-off')
      .map((set) => set.targetWeight);
  return { store, main, top, first: first!, second: second!, backOffs };
}

describe('the coach’s weight taken after the top set is skipped, a back-off logged clearly easy', () => {
  for (const how of ['an undo', 'a delete', 'a correction'] as const) {
    it(`${how} of the next back-off keeps the weight taken and the easy back-off’s step`, async () => {
      const { store, main, top, first, second, backOffs } = await startedMain();
      expect(top.targetWeight).toBe(140);
      store.skipSet(main().id, top.index);
      // The coach's "Take 145 lb today": the top set done (skipped), the weight is the back-offs'.
      await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 145 });
      expect(main().manual?.backOffs).toBe(145);
      expect(backOffs()).toEqual([145, 145, 145]);
      // Clearly easy (8 reps at 4 against 4-6 at 2): the live follow takes the rest a step up.
      await store.logSet(main().id, first.index, { weight: 145, reps: 8, rir: 4 });
      expect(backOffs()).toEqual([145, 150, 150]);
      await store.logSet(main().id, second.index, { weight: 150, reps: 5, rir: 2 });
      expect(backOffs()).toEqual([145, 150, 150]);
      if (how === 'an undo') store.undoLastSet();
      else if (how === 'a delete') store.deleteLoggedSet(main().id, second.index);
      else await store.logSet(main().id, second.index, { weight: 150, reps: 5, rir: 3 });
      // On 905ce7f: [145, 140, 140] after an undo or a delete, [145, 150, 140] after the correction:
      // capped at the skipped top set's planned 140, under the 145 taken. On 480d5a1: 150.
      expect(
        backOffs(),
        main()
          .sets.map((set) => set.targetWeight)
          .join(', '),
      ).toEqual([145, 150, 150]);
    });
  }
});
