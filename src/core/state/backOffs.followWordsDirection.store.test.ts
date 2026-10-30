import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The thirteenth review of round N. The twelfth pass's follow names where the back-offs still to
 * come stand after the replay of the back-offs logged (`standing`), and gives the reason by comparing
 * that load with the load the top set gives them (`load`): under it is "a step down after a hard
 * back-off", over it "a step up after an easy back-off". But a back-off's step is from the weight it
 * was lifted at ("The weight actually lifted is the ground truth; the plan moves from it"), so a
 * back-off lifted lighter than the load and clearly easy steps the ones after it up from where it
 * was lifted, still under the load: the follow says they came down after a hard back-off.
 *
 * The rules (docs/reports/maintenance-32.md): the first review's LOW, "the follow's headline said
 * the sets come down when a heavier top set took them up" (fixed: the follow says what it did, "in
 * its own words", the recalibrate.ts comment on the headline); the twelfth's, "the follow names
 * where the back-offs stand after the replay".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. The top set logged
 * at 140 × 5 at 1 (a slip: it was lifted at 150). Back-off 1 lifted at 135 × 8 at 4, clearly easy:
 * the two after it at 140. The top set corrected to 150 × 5 at 1: its drop is 145, the easy
 * back-off's step from 135 keeps them at 140. Or, with the back-offs' weight set by hand (the top
 * set skipped, the coach's 145 taken, the skip corrected to 140 × 5 at 1): back-off 1 lifted at 135
 * × 8 at 4, then the top set corrected to 140 × 4 at 1.
 *
 * What happens at 85ee7b6: "Barbell Row: back-offs at 140 lb, from the top set at 150 lb, a step down
 * after a hard back-off." and "back-offs at 140 lb, from the weight you set, a step down after a
 * hard back-off.", after a back-off that was clearly easy and took them up. On 5762c00 neither says
 * so (it named the load before the replay, the twelfth review's finding). Synthetic data only.
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
  const headline = () => store.getSnapshot().session!.lastSummary?.headline ?? '';
  return { store, main, toCome, headline };
}

describe('the follow’s reason, after the replay of a back-off logged', () => {
  it('never calls a clearly easy back-off a hard one', async () => {
    const { store, main, toCome, headline } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    expect(top.targetWeight).toBe(140);
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    expect(toCome()).toEqual([135, 135, 135]);
    // Clearly easy (8 reps at 4 in reserve against 4-6 at 2): the ones after it a step up.
    await store.logSet(main().id, first!.index, { weight: 135, reps: 8, rir: 4 });
    expect(toCome()).toEqual([140, 140]);
    // The slip fixed: lifted at 150. Its drop is 145; the easy back-off's step from 135 gives 140.
    await store.logSet(main().id, top.index, { weight: 150, reps: 5, rir: 1 });
    expect(toCome()).toEqual([140, 140]);
    // At 85ee7b6: "..., a step down after a hard back-off."
    expect({ hard: headline().includes('hard back-off') }, headline()).toEqual({ hard: false });
  });

  it('never calls one a hard back-off under a weight set by hand either', async () => {
    const { store, main, toCome, headline } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const [first] = main().sets.filter((set) => set.tier === 'back-off');
    store.skipSet(main().id, top.index);
    await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 145 });
    await store.logSet(main().id, top.index, { weight: 140, reps: 5, rir: 1 });
    expect(main().manual?.backOffs).toBe(145);
    expect(toCome()).toEqual([145, 145, 145]);
    // Lifted lighter than the weight set, and clearly easy: a step up from 135.
    await store.logSet(main().id, first!.index, { weight: 135, reps: 8, rir: 4 });
    expect(toCome()).toEqual([140, 140]);
    await store.logSet(main().id, top.index, { weight: 140, reps: 4, rir: 1 });
    expect(toCome()).toEqual([140, 140]);
    // At 85ee7b6: "..., from the weight you set, a step down after a hard back-off."
    expect({ hard: headline().includes('hard back-off') }, headline()).toEqual({ hard: false });
  });
});
