import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The eleventh review of round N. A set added after the last back-off was logged with a step (a
 * grind, or one clearly easy) copies that back-off's target (the `sets` trigger: "a set added is a
 * back-off", at `last.targetWeight`), with no step. Every replay of the same logs gives it the step:
 * the store's replay reads each logged back-off's plan with at least one set after it
 * (`backOffLogOf`: `Math.max(1, after)`) and moves the ones after it, and so does the pick-up
 * (`owedBackOffLoad`). So the added set's load moves with no new log: an undo or a delete of its own
 * log, a correction of an earlier back-off, or the lifter going home and back puts it a step down
 * after the grind (where, by the rules below, it was due when it was added).
 *
 * The rules (docs/reports/maintenance-32.md): item 11, "A set added is a back-off"; the back-offs
 * move "a step up after one clearly easy and down after a grind"; the fourth review, "each back-off
 * still logged moving the ones after it as its log did"; the seventh, "a lift picked up again
 * carries on its back-offs at the step each logged back-off gave them".
 *
 * Steps: the main lift's top set logged as planned (140 × 5 at 1, back-offs 135); back-offs 1 and 2
 * as asked (135 × 5 at 2); back-off 3 a grind (135 × 3 at 0), the last. A set added: back-off 4 at
 * 135. Then (a) back-off 4 logged as asked and undone, or (b) the lifter goes home (no barbell there)
 * and back to the gym.
 *
 * What happens on 905ce7f (and on 480d5a1): back-off 4 is added at 135, the load just ground out,
 * and comes back at 130 after (a) or (b). Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

async function afterGrind() {
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
  const main = (): WorkoutEntry =>
    entries().find((entry) => entry.exerciseId === exerciseId && !entry.stopped)!;
  store.startWorkout();
  const top = main().sets.find((set) => set.tier === 'top')!;
  const [first, second, third] = main().sets.filter((set) => set.tier === 'back-off');
  expect(top.targetWeight).toBe(140);
  await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
  await store.logSet(main().id, first!.index, { weight: 135, reps: 5, rir: 2 });
  await store.logSet(main().id, second!.index, { weight: 135, reps: 5, rir: 2 });
  // The last back-off a grind: nothing after it to move.
  await store.logSet(main().id, third!.index, { weight: 135, reps: 3, rir: 0 });
  await store.recalibrate({ type: 'sets', entryId: main().id, workingDelta: 1 });
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
  return { store, main, toCome };
}

describe('a set added after the last back-off ground out', () => {
  it('an undo of the added set’s log leaves it where it was added', async () => {
    const { store, main, toCome } = await afterGrind();
    const added = toCome();
    const fourth = main()
      .sets.filter((set) => set.tier === 'back-off')
      .at(-1)!;
    await store.logSet(main().id, fourth.index, { weight: added[0] ?? null, reps: 5, rir: 2 });
    store.undoLastSet();
    // On 905ce7f: added at 135, the load just ground out; 130 once its log is undone.
    expect(toCome()).toEqual(added);
  });

  it('home and back to the gym, the set added keeps its load', async () => {
    const { store, toCome } = await afterGrind();
    const added = toCome();
    await store.setCurrentLocation('home');
    await store.setCurrentLocation('gym');
    // On 905ce7f: [135] when added, [130] back at the gym.
    expect(toCome()).toEqual(added);
  });
});
