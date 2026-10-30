import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 32, the owner's item 11, in the store (the second review of round N): a correction to
 * the top set moves its back-offs as the set logged right would have, the step its corrected
 * numbers give included, whatever of it changed. TEST_NOW is a Wednesday, a day the schedule ticks.
 * Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
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
  await handle.store.hydrate();
  return handle;
}

async function startedMain() {
  const handle = await trainedLifter();
  const workout = () => handle.store.getSnapshot().session!.workout;
  const main = (): WorkoutEntry =>
    allEntries(workout().blocks).find((entry) => entry.backOffDrop !== undefined)!;
  expect(main()).toBeDefined();
  const top = main().sets.find((set) => set.tier === 'top')!;
  handle.store.startWorkout();
  const backOffs = () =>
    main()
      .sets.filter((set) => set.tier === 'back-off')
      .map((set) => set.targetWeight);
  return { handle, main, top, backOffs };
}

describe('a correction to the top set, as the set logged right would have, the second review of round N', () => {
  it('a heavier top set ground out, corrected in, takes the back-offs where logging it right does', async () => {
    // Logged right: ten over the plan, three reps with nothing left, a grind.
    const right = await startedMain();
    const ground = { weight: right.top.targetWeight! + 10, reps: 3, rir: 0 };
    await right.handle.store.logSet(right.main().id, right.top.index, ground);
    const expected = right.backOffs();

    // Logged first as planned, on target (no change), then corrected to what was really lifted.
    const corrected = await startedMain();
    await corrected.handle.store.logSet(corrected.main().id, corrected.top.index, {
      weight: corrected.top.targetWeight,
      reps: 5,
      rir: 1,
    });
    await corrected.handle.store.logSet(corrected.main().id, corrected.top.index, ground);
    expect(
      corrected.handle.store
        .getSnapshot()
        .session!.completed.sets.find((set) => set.setIndex === corrected.top.index)?.weight,
    ).toBe(ground.weight);
    expect(corrected.backOffs()).toEqual(expected);
  });

  it('a grind typed by mistake at the planned load, corrected to on target, puts the back-offs back', async () => {
    // Logged right: the planned load, on target: the back-offs stay where the plan had them.
    const right = await startedMain();
    const planned = right.backOffs();
    const onTarget = { weight: right.top.targetWeight, reps: 5, rir: 1 };
    await right.handle.store.logSet(right.main().id, right.top.index, onTarget);
    expect(right.backOffs()).toEqual(planned);

    // Typed as a grind first (3 reps, nothing left): the back-offs take a step down...
    const corrected = await startedMain();
    await corrected.handle.store.logSet(corrected.main().id, corrected.top.index, {
      weight: corrected.top.targetWeight,
      reps: 3,
      rir: 0,
    });
    expect(corrected.backOffs()[0]!).toBeLessThan(planned[0]!);
    // ...and corrected to what was lifted, they come back where logging it right leaves them.
    await corrected.handle.store.logSet(corrected.main().id, corrected.top.index, onTarget);
    expect(corrected.backOffs()).toEqual(planned);
  });
});
