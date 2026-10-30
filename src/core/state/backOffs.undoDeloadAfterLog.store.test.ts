import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The thirteenth review of round N. Undo of a change (`undoRecalibration`) puts the previous workout
 * back while the sets logged since stay ("unless a set is logged since on an exercise it does not
 * have"). The coach's deload taken before the main lift's top set runs every set straight at the
 * deload's load (the first review of round N); the first set logged there, then the deload undone,
 * puts the structure back with that set as its top set, logged at the deload's load, and its
 * back-offs where the plan had them, at the drop off the top set as planned: heavier than the top
 * set as lifted. The twelfth pass kept the drop's load recorded through such an Undo ("a log is no
 * change to take back", `withBackOffAtKept`) but not the back-offs that follow the log.
 *
 * The same for the coach's heavier weight ("Take 150 lb today"): the top set lifted at it, then the
 * change undone, the back-offs fall back to the drop off the plan's 140, 135, under a top set
 * lifted at 150 (10% under it), and the saved session's drop load (145, kept) is no load they were
 * lifted at, so the drop's correction reads none of them. And the other way: a change made after
 * the top set's follow, the top set's log then deleted (the back-offs back at the plan's drop), the
 * change undone puts back the back-offs that followed the log deleted, over the top set to come.
 *
 * The rules (docs/reports/maintenance-32.md, item 11): "the top set lifted at another load moves its
 * back-offs with it, 5% under it as lifted"; "The back-offs are never heavier than the top set as
 * lifted" (the third review); "its log taken back (an undo, a delete, a correction to a skip) puts
 * them back where the plan has them" (the second review); the twelfth pass: "an Undo of an earlier
 * change keeps it".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. The coach's deload to
 * 125 taken (every set straight at 125); the first working set logged at 125 × 5 at 2; Undo. Or the
 * coach's 150 taken (back-offs 145), the top set lifted at 150 × 5 at 1, Undo. Or the top set lifted
 * at 150 × 5 at 2 (back-offs 145), the rep range set to 6-8, the top set's log deleted (back-offs
 * 135), Undo.
 *
 * What happens at 85ee7b6 (and at 5762c00): the back-offs still to come at 135 over a top set
 * lifted at 125; at 135 under a top set lifted at 150; at 145 over the top set to come at 140.
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
      (entry) => entry.exerciseId === 'barbell-row' && !entry.stopped,
    )!;
  expect(main().backOffDrop).toBeDefined();
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

describe('Undo of a change to the main lift’s load after its top set was logged', () => {
  it('never leaves the back-offs over the top set as lifted (the coach’s deload)', async () => {
    const { store, main, toCome } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    expect(top.targetWeight).toBe(140);
    await store.recalibrate({
      type: 'target-weight',
      entryId: main().id,
      weight: 125,
      deload: true,
    });
    expect(main().backOffDrop).toBeUndefined();
    await store.logSet(main().id, top.index, { weight: 125, reps: 5, rir: 2 });
    await store.undoRecalibration();
    // The structure back: the set logged is its top set again.
    expect(main().sets.find((set) => set.index === top.index)?.tier).toBe('top');
    // At 85ee7b6: [135, 135, 135], over the top set lifted at 125.
    expect({ overTop: toCome().filter((load) => load > 125) }).toEqual({ overTop: [] });
  });

  it('keeps the back-offs at the drop off the top set as lifted (the coach’s heavier weight)', async () => {
    const { store, main, toCome } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 150 });
    expect(toCome()).toEqual([145, 145, 145]);
    await store.logSet(main().id, top.index, { weight: 150, reps: 5, rir: 1 });
    await store.undoRecalibration();
    // At 85ee7b6: [135, 135, 135], the drop off the plan's 140 under a top set lifted at 150.
    expect({ backOffs: toCome() }).toEqual({ backOffs: [145, 145, 145] });
  });

  it('never puts back back-offs that followed a top set log taken back since', async () => {
    const { store, main, toCome } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    // The top set lifted at 150: its back-offs follow it, 145.
    await store.logSet(main().id, top.index, { weight: 150, reps: 5, rir: 2 });
    expect(toCome()).toEqual([145, 145, 145]);
    // A change made then (the rep range), and the top set's log deleted: back where the plan has
    // them, the drop off 140.
    await store.recalibrate({ type: 'rep-range', entryId: main().id, reps: [6, 8] });
    store.deleteLoggedSet(main().id, top.index);
    expect(toCome()).toEqual([135, 135, 135]);
    await store.undoRecalibration();
    // At 85ee7b6: [145, 145, 145], over the top set still to come at 140.
    expect({ overTop: toCome().filter((load) => load > 140) }).toEqual({ overTop: [] });
  });
});
