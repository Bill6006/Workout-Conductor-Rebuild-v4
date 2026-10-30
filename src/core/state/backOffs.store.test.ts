import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { requireExercise } from '../../catalog/exercises/catalog';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 32, the owner's item 11, in the store: a main lift's top set lifted at another load
 * than planned moves its back-offs with it, and the workout saved keeps each set's tier and the
 * drop, which the next plan starts from. TEST_NOW is a Wednesday, here a day the schedule ticks.
 * Synthetic data only.
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

/** A lifter whose main lifts have two clean straight sessions each, three and seven days ago. */
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

describe('a main lift’s top set and back-offs in the store', () => {
  it('a top set lifted heavier moves its back-offs; the saved workout keeps the tiers and the drop', async () => {
    const handle = await trainedLifter();
    const workout = () => handle.store.getSnapshot().session!.workout;
    const main = (): WorkoutEntry =>
      allEntries(workout().blocks).find((entry) => entry.backOffDrop !== undefined)!;
    expect(main(), describeWorkout(workout()).join('; ')).toBeDefined();
    const top = main().sets.find((set) => set.tier === 'top')!;
    const before = main().sets.find((set) => set.tier === 'back-off')!.targetWeight!;
    expect(before).toBeLessThan(top.targetWeight!);
    handle.store.startWorkout();
    // Ten more than planned: the back-offs follow it, 5% under it.
    const lifted = top.targetWeight! + 10;
    await handle.store.logSet(main().id, top.index, { weight: lifted, reps: 5, rir: 1 });
    const backOffs = main().sets.filter((set) => set.tier === 'back-off');
    const expected = Math.round((lifted * 0.95) / 5) * 5;
    expect(backOffs.map((set) => set.targetWeight)).toEqual(backOffs.map(() => expected));
    // Six reps on each back-off: more weight times reps than the top set's five.
    for (const set of backOffs) {
      await handle.store.logSet(main().id, set.index, {
        weight: set.targetWeight,
        reps: 6,
        rir: 2,
      });
    }
    const exerciseId = main().exerciseId;
    const name = requireExercise(exerciseId).name;
    await handle.store.finishWorkout(null);
    // The best set is the top set, as lifted.
    expect(handle.store.getSnapshot().session?.completion?.highlights).toContain(
      `Best set: ${name} ${lifted} lb × 5.`,
    );
    handle.store.dismissCompletion();
    const saved = handle.store
      .getSnapshot()
      .history.find((item) => item.startedAt === TEST_NOW)!
      .entries.find((entry) => entry.exerciseId === exerciseId)!;
    expect(saved.backOffDrop).toBe(0.05);
    expect(saved.sets.filter((set) => set.kind === 'working').map((set) => set.tier)).toEqual([
      'top',
      ...backOffs.map(() => 'back-off'),
    ]);
  });
});
