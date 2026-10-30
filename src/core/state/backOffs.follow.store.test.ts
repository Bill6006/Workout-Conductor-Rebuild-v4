import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 32, the owner's item 11, in the store (the first review of round N): a top set lifted
 * heavier than planned and ground out takes its back-offs with it, and the headline says where they
 * went, never that they come down while they go up. TEST_NOW is a Wednesday, a day the schedule
 * ticks. Synthetic data only.
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

describe('the top set lifted heavier and ground out, the first review of round N', () => {
  it('never says the back-offs come down while it takes them up', async () => {
    const handle = await trainedLifter();
    const workout = () => handle.store.getSnapshot().session!.workout;
    const main = (): WorkoutEntry =>
      allEntries(workout().blocks).find((entry) => entry.backOffDrop !== undefined)!;
    expect(main()).toBeDefined();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const before = main().sets.find((set) => set.tier === 'back-off')!.targetWeight!;
    handle.store.startWorkout();
    // Ten over the plan, three reps with nothing left: under the floor of four, a grind.
    await handle.store.logSet(main().id, top.index, {
      weight: top.targetWeight! + 10,
      reps: 3,
      rir: 0,
    });
    const after = main().sets.find((set) => set.tier === 'back-off')!.targetWeight!;
    const headline = handle.store.getSnapshot().session!.lastSummary?.headline ?? '';
    // The back-offs went up...
    expect(after).toBeGreaterThan(before);
    // ...so the words must not tell the lifter they come down.
    expect(headline).not.toMatch(/come down/);
  });
});
