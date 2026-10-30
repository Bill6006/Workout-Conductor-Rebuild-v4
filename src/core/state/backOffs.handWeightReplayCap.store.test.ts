import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The tenth review of round N. With the back-offs' weight set by hand (`manual.backOffs`), a
 * back-off's log corrected or taken back replays the back-offs with no cap at the top set as
 * lifted, so the steps two clearly easy back-offs logged take the one still to come over the top
 * set, where the same logs, made, held it at the top set's load.
 *
 * The spec (docs/reports/maintenance-32.md): "The back-offs are never heavier than the top set as
 * lifted"; the third review's LOW, "a back-off logged clearly easy took the back-offs after it over
 * the top set as lifted" (fixed: "the back-offs are never over the top set as lifted"); the seventh,
 * "a back-off corrected replays the ones after it from the logs as corrected"; `backOffsReplayed`:
 * each back-off still logged moves the ones after it as its log did, "never over the top set as
 * lifted nor under the bar"; the ninth, "every replay of back-offs with their own weight starts from
 * it".
 *
 * What happens: the ninth pass's branch in the store's `backOffsAsPlanned` replays from
 * `manual.backOffs` with `top: null` (no cap), where its other branches cap at the top set as lifted
 * (or as planned), and so does the `performance` trigger's own branch (`top: lifted`).
 *
 * Steps: the main lift's top set logged as planned (140 × 5 at 1, back-offs 135); the lifter sets
 * the back-offs to 140 by hand (the top set done, so the back-offs take it); back-offs 1 and 2
 * logged clearly easy (140 × 8 at 4): back-off 3 holds at 140, the top set's load. Then back-off
 * 2's log corrected (9 reps for 8, still clearly easy), undone, or deleted: back-off 3 (and back-off
 * 2, where its log is gone) at 145, over the 140 top set. With back-off 1 alone logged so, the top
 * set's log deleted (the top set in front again at 140): back-offs 2 and 3 at 145, where the plan's
 * own replay of a top set taken back caps them at the top set's load (`top.targetWeight`).
 *
 * Reached in the app where a weight is set after the top set is done: the coach's offers come on a
 * lift with no set lifted, so after a top set skipped, its skip then corrected to what was lifted.
 * Passes on 1bbd451 (before the ninth pass, a weight set by hand returned early and kept the
 * back-offs as they stood): a regression of the ninth pass. Synthetic data only.
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

describe('back-offs set by hand at the top set’s load, two logged clearly easy', () => {
  for (const how of ['a correction', 'an undo', 'a delete'] as const) {
    it(`${how} of back-off 2 keeps every back-off at or under the top set as lifted`, async () => {
      const { store, main, top, first, second, backOffs } = await startedMain();
      const lifted = top.targetWeight!;
      expect(lifted).toBe(140);
      await store.logSet(main().id, top.index, { weight: lifted, reps: 5, rir: 1 });
      expect(backOffs()).toEqual([135, 135, 135]);
      // The top set done: the weight is the back-offs' own (`manual.backOffs` since the ninth pass).
      await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: lifted });
      expect(backOffs()).toEqual([lifted, lifted, lifted]);
      // Clearly easy, twice: the step the logs give is held at the top set's load.
      await store.logSet(main().id, first.index, { weight: lifted, reps: 8, rir: 4 });
      await store.logSet(main().id, second.index, { weight: lifted, reps: 8, rir: 4 });
      expect(backOffs()).toEqual([lifted, lifted, lifted]);
      if (how === 'a correction') {
        await store.logSet(main().id, second.index, { weight: lifted, reps: 9, rir: 4 });
      } else if (how === 'an undo') {
        store.undoLastSet();
      } else {
        store.deleteLoggedSet(main().id, second.index);
      }
      // On 25fd689: [140, 140, 145] after a correction, [140, 145, 145] after an undo or a delete.
      expect(Math.max(...backOffs().map((load) => load ?? 0)), backOffs().join(', ')).toBe(lifted);
    });
  }

  it('the top set’s log deleted keeps the back-offs still to come at or under the top set', async () => {
    const { store, main, top, first, backOffs } = await startedMain();
    const lifted = top.targetWeight!;
    await store.logSet(main().id, top.index, { weight: lifted, reps: 5, rir: 1 });
    await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: lifted });
    await store.logSet(main().id, first.index, { weight: lifted, reps: 8, rir: 4 });
    expect(backOffs()).toEqual([lifted, lifted, lifted]);
    // The top set in front again, at 140: the plan's own replay caps at it (`top.targetWeight`).
    store.deleteLoggedSet(main().id, top.index);
    expect(main().sets.find((set) => set.tier === 'top')!.targetWeight).toBe(lifted);
    // On 25fd689: [140, 145, 145], over the top set.
    expect(Math.max(...backOffs().map((load) => load ?? 0)), backOffs().join(', ')).toBe(lifted);
  });
});
