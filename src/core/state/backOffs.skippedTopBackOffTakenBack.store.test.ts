import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The thirteenth pass of round N: a top set skipped is no top set lifted (the third review), so a
 * back-off's log taken back while it is skipped puts the back-offs where the plan has them, the drop
 * off the load the top set asks, never a step its skip's numbers would give (`backOffsAsLogged`).
 *
 * Steps (synthetic data only): the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135.
 * The top set skipped; back-off 1 logged as asked, then undone or deleted.
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
  return { store, main, toCome };
}

describe('a back-off’s log taken back while the top set is skipped', () => {
  for (const how of ['an undo', 'a delete'] as const) {
    it(`puts the back-offs where the plan has them (${how})`, async () => {
      const { store, main, toCome } = await startedMain();
      const top = main().sets.find((set) => set.tier === 'top')!;
      expect(top.targetWeight).toBe(140);
      expect(toCome()).toEqual([135, 135, 135]);
      store.skipSet(main().id, top.index);
      const first = main().sets.find((set) => set.tier === 'back-off')!;
      await store.logSet(main().id, first.index, { weight: 135, reps: 5, rir: 2 });
      if (how === 'an undo') store.undoLastSet();
      else store.deleteLoggedSet(main().id, first.index);
      expect(toCome()).toEqual([135, 135, 135]);
    });
  }
});
