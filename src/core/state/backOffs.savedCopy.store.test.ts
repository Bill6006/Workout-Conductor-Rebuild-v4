import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { backOffDropFor } from '../../engine/progression/backOffs';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 32, the owner's item 11, and saved workouts (the first review of round N): a saved
 * copy loaded after the lift's own sessions moved its drop takes the drop in force, so a session of
 * an old copy never throws away what the sessions taught. TEST_NOW is a Wednesday, a day the
 * schedule ticks. Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: {
    ...schedule,
    availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    weeklyFrequency: 5,
  },
  programStyle: 'hybrid',
};
const LIFTS = ['barbell-bench-press', 'back-squat', 'barbell-row'];
const at = (daysAgo: number) => new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();

/** A session of a lift on the structure, `daysAgo`, at a drop, its back-offs on target. */
function structured(exerciseId: string, daysAgo: number, drop: number): WorkoutRecord {
  const done = record(
    0,
    exerciseId,
    [
      [5, 140, 1],
      [5, 120, 2],
      [5, 120, 2],
      [5, 120, 2],
    ],
    [4, 6],
    2,
    { id: `w-${exerciseId}-s${daysAgo}`, startedAt: at(daysAgo), completedAt: at(daysAgo) },
  );
  const entry = done.entries[0]!;
  entry.backOffDrop = drop;
  entry.sets.forEach((set, index) => {
    set.tier = index === 0 ? 'top' : 'back-off';
    set.targetRir = index === 0 ? 1 : 2;
  });
  return done;
}

describe('a saved copy loaded after the drop moved, the first review of round N', () => {
  it('never throws away the drop the lift’s own sessions taught', async () => {
    const handle = createTestStore({ now: () => TEST_NOW });
    const { store } = handle;
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...everyDay },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await store.getDatabase();
    for (const daysAgo of [12, 9]) {
      for (const exerciseId of LIFTS) {
        await db.put('workouts', {
          ...record(
            0,
            exerciseId,
            [
              [5, 135, 2],
              [5, 135, 2],
              [5, 135, 2],
            ],
            [4, 6],
            2,
          ),
          id: `w-${exerciseId}-${daysAgo}`,
          startedAt: at(daysAgo),
          completedAt: at(daysAgo),
        });
      }
    }
    await store.hydrate();
    const main = (): WorkoutEntry =>
      allEntries(store.getSnapshot().session!.workout.blocks).find(
        (entry) => entry.backOffDrop !== undefined,
      )!;
    expect(main().backOffDrop).toBe(0.05);
    // Saved now, at the 5% the lift starts from.
    const saved = await store.saveCurrentWorkout('Main day');

    // Since then, two sessions of each lift at 13%, the back-offs on target: 13% is the drop now.
    for (const daysAgo of [6, 3]) {
      for (const exerciseId of LIFTS)
        await db.put('workouts', structured(exerciseId, daysAgo, 0.13));
    }
    await store.hydrate();
    expect(main().backOffDrop).toBe(0.13);

    // The old copy, loaded and lifted: the top set as planned, the back-offs ground out.
    store.loadSavedWorkout(saved.id);
    store.startWorkout();
    // Before: 0.05, the copy's own drop. Its back-offs drop the 13% in force off its top set.
    expect(main().backOffDrop).toBe(0.13);
    const top = main().sets.find((set) => set.tier === 'top')!;
    for (const set of main().sets.filter((candidate) => candidate.tier === 'back-off')) {
      expect(set.targetWeight).toBeLessThanOrEqual(top.targetWeight! * 0.87);
      expect(set.targetWeight).toBeGreaterThan(top.targetWeight! * 0.8);
    }
    // The copy's main lift, whose own sessions moved its drop to 13%.
    const exerciseId = main().exerciseId;
    expect(backOffDropFor(exerciseId, store.getSnapshot().history)).toBe(0.13);
    for (const set of main().sets.filter((candidate) => candidate.kind === 'working')) {
      const top = set.tier === 'top';
      await store.logSet(main().id, set.index, {
        weight: set.targetWeight,
        reps: top ? 5 : 4,
        rir: top ? 1 : 0,
      });
    }
    await store.finishWorkout(null);
    store.dismissCompletion();
    // Back-offs too hard at 5% once more: the next plan must not go back to 5%.
    expect(backOffDropFor(exerciseId, store.getSnapshot().history)).toBeGreaterThanOrEqual(0.13);
  });
});
