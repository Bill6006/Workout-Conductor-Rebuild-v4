import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The eleventh review of round N. A top set's log deleted, then logged again (its row deleted and
 * the set logged afresh, rather than corrected), takes the step a back-off logged before it gave the
 * back-offs after that one off them: the store sends the `performance` trigger the back-offs' logs
 * (`backOffLogs`) only for a correction of the top set, never for a top set logged with back-offs
 * already logged, so the follow reads each of those as logged with no step. The same numbers given
 * as a correction keep the step, and so does every later replay of the same logs: an undo or a
 * delete of the next back-off, a correction of it, a swap back or the lift picked up again back at
 * the gym all put the step back, so the load the lifter sees moves with no new log.
 *
 * The rules (docs/reports/maintenance-32.md): the sixth review's LOW, "a correction of the top set
 * after a back-off was logged took that back-off's step off the ones after it, and so did a delete
 * of the top set's log" (fixed: "a correction or a delete of the top set's log replays each back-off
 * still logged"); the eighth: "Back-offs are replayed from the logs as corrected or left standing";
 * "A correction to the top set moves its back-offs as the set logged right would have".
 *
 * Steps: the main lift's top set logged as planned (140 × 5 at 1, back-offs 135); back-off 1 a grind
 * (135 × 3 at 0): back-offs 2 and 3 a step down, 130. The top set's row deleted: the back-offs keep
 * the grind's step (130). The top set logged again at what was lifted, 145 × 5 at 1: back-offs 2 and
 * 3 at 140, the drop off 145 with no step. The same 145 given as a correction of the top set's log
 * instead: 130, the grind's step kept (read from 135, never over the top set). Then back-off 2
 * logged as asked (140 × 5 at 2) and undone: back-off 2 and 3 at 130, where they stood at 140 before
 * it was logged.
 *
 * What happens on 905ce7f (and on 480d5a1): 140 after the top set logged again, 130 after the
 * correction; 130 after the undo. Synthetic data only.
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

/** The top set lifted as planned, back-off 1 a grind: back-offs 2 and 3 a step down. */
async function afterGrind() {
  const started = await startedMain();
  const { store, main, top, first, backOffs } = started;
  expect(top.targetWeight).toBe(140);
  await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
  expect(backOffs()).toEqual([135, 135, 135]);
  await store.logSet(main().id, first.index, { weight: 135, reps: 3, rir: 0 });
  expect(backOffs()).toEqual([135, 130, 130]);
  return started;
}

describe('a top set logged again after its log was deleted, a back-off logged before it', () => {
  it('keeps the logged back-off’s step, as a correction of the top set to the same numbers does', async () => {
    const corrected = await afterGrind();
    await corrected.store.logSet(corrected.main().id, corrected.top.index, {
      weight: 145,
      reps: 5,
      rir: 1,
    });
    // The correction replays the grind's step: 130.
    expect(corrected.backOffs()).toEqual([135, 130, 130]);

    const again = await afterGrind();
    again.store.deleteLoggedSet(again.main().id, again.top.index);
    // The delete keeps the grind's step (the sixth review).
    expect(again.backOffs()).toEqual([135, 130, 130]);
    await again.store.logSet(again.main().id, again.top.index, { weight: 145, reps: 5, rir: 1 });
    // On 905ce7f: [135, 140, 140], the grind's step gone.
    expect(again.backOffs()).toEqual(corrected.backOffs());
  });

  it('an undo of the next back-off leaves the back-offs where they stood before it was logged', async () => {
    const { store, main, top, second, backOffs } = await afterGrind();
    store.deleteLoggedSet(main().id, top.index);
    await store.logSet(main().id, top.index, { weight: 145, reps: 5, rir: 1 });
    const before = backOffs().slice(1);
    await store.logSet(main().id, second.index, {
      weight: before[0] ?? null,
      reps: 5,
      rir: 2,
    });
    store.undoLastSet();
    // On 905ce7f: [140, 140] before back-off 2 was logged, [130, 130] once it is undone.
    expect(backOffs().slice(1), `before: ${before.join(', ')}`).toEqual(before);
  });
});
