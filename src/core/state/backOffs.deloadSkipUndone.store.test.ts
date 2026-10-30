import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The thirteenth review of round N. Since the twelfth pass, the coach's deload taken after a skipped
 * top set takes the structure off the sets still to come (no tier, the back-offs' reserve, no drop)
 * at the deload's load; the top set, done as a skip, keeps its tier and its planned load. The skip
 * then taken back (Undo, or its log deleted, the lifter having tapped Skip by mistake) puts the top
 * set back in front at 140 × 4-6 at 1 as a top set, in a lift whose other sets run straight at the
 * deload's 125: the deload never reaches it, and no replay of the back-offs runs (the structure is
 * off). A deload taken before the top set takes every set, the top set too.
 *
 * The rules (docs/reports/maintenance-32.md): the first review's MEDIUM, "the coach's deload of a
 * stalled main lift ('Deload to 170 lb this week') kept a top set one rep short of failure, where
 * every eased load runs straight"; the twelfth: "a deload after a skipped top set runs straight, as
 * one before it does"; the target-weight code, "A deload the coach offered runs the lighter load on
 * straight sets".
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. The top set skipped;
 * the coach's deload to 125 taken; the skip undone (Undo), or its log deleted.
 *
 * What happens at 85ee7b6: the first working set still to come is a top set at 140 at 1 in reserve,
 * the rest straight at 125. On 5762c00 the deload is lost altogether (the twelfth review's MEDIUM).
 * Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

async function deloadedAfterSkip() {
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
  const top = main().sets.find((set) => set.tier === 'top')!;
  expect(top.targetWeight).toBe(140);
  store.skipSet(main().id, top.index);
  await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 125, deload: true });
  /** The working sets still to come: load, reserve, tier. */
  const toCome = () => {
    const done = store.getSnapshot().session!.completed.sets;
    return main()
      .sets.filter(
        (set) =>
          set.kind === 'working' &&
          !done.some((log) => log.entryId === main().id && log.setIndex === set.index),
      )
      .map((set) => `${set.targetWeight} @ ${set.targetRir} ${set.tier ?? 'straight'}`);
  };
  expect(toCome()).toEqual(['125 @ 2 straight', '125 @ 2 straight', '125 @ 2 straight']);
  return { store, main, toCome, top };
}

describe('the coach’s deload after a skipped top set, the skip taken back', () => {
  it('reaches the top set put back by an Undo', async () => {
    const { store, toCome } = await deloadedAfterSkip();
    store.undoLastSet();
    // At 85ee7b6: ["140 @ 1 top", "125 @ 2 straight", ...]: a top set at its plan in a deloaded lift.
    expect({ first: toCome()[0] }).toEqual({ first: '125 @ 2 straight' });
  });

  it('reaches the top set put back by its log deleted', async () => {
    const { store, main, toCome, top } = await deloadedAfterSkip();
    store.deleteLoggedSet(main().id, top.index);
    expect({ first: toCome()[0] }).toEqual({ first: '125 @ 2 straight' });
  });
});
