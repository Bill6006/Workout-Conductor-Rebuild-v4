import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 32, the owner's item 11, in the store (the first review of round N): a correction to
 * the top set's load moves its back-offs as the set logged right would have. TEST_NOW is a
 * Wednesday, a day the schedule ticks. Synthetic data only.
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

async function trainedLifter() {
  const handle = createTestStore({ now: () => TEST_NOW });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...everyDay },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  for (const daysAgo of [7, 3]) {
    for (const exerciseId of ['barbell-bench-press', 'back-squat', 'barbell-row']) {
      const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
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
        startedAt: when,
        completedAt: when,
      });
    }
  }
  await handle.store.hydrate();
  return handle;
}

describe('a correction to the top set, the first review of round N', () => {
  it('moves its back-offs as the same set logged right would have', async () => {
    const handle = await trainedLifter();
    const workout = () => handle.store.getSnapshot().session!.workout;
    const main = (): WorkoutEntry =>
      allEntries(workout().blocks).find((entry) => entry.backOffDrop !== undefined)!;
    expect(main()).toBeDefined();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const planned = main().sets.find((set) => set.tier === 'back-off')!.targetWeight!;
    handle.store.startWorkout();
    // A typo: a hundred over what was lifted.
    const typo = top.targetWeight! + 100;
    await handle.store.logSet(main().id, top.index, { weight: typo, reps: 5, rir: 1 });
    const backOffs = () => main().sets.filter((set) => set.tier === 'back-off');
    expect(backOffs()[0]!.targetWeight).toBe(Math.round((typo * 0.95) / 5) * 5);
    // Corrected to the planned load, as lifted.
    await handle.store.logSet(main().id, top.index, {
      weight: top.targetWeight,
      reps: 5,
      rir: 1,
    });
    expect(
      handle.store.getSnapshot().session!.completed.sets.find((set) => set.setIndex === top.index)
        ?.weight,
    ).toBe(top.targetWeight);
    // The back-offs follow the top set as it now stands: where the plan had them.
    expect(backOffs().map((set) => set.targetWeight)).toEqual(backOffs().map(() => planned));
  });
});
