import { describe, expect, it } from 'vitest';
import { allEntries, pushMarkOf } from '../../engine/workout/types';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, parseProfile, type UserProfile } from '../validation/profile';
import { WorkoutRecordSchema } from '../validation/workoutRecord';
import { GeneratedWorkoutSchema } from '../../engine/workout/workoutSchema';

/**
 * Maintenance 27, the owner's item 44: the lift to push through the store. The profile keeps it, the
 * plan leads with it and marks it, the saved workout keeps the mark the next week's counts read,
 * and ending the push from the coach takes it away and rebuilds the plan.
 */

const BENCH = 'barbell-bench-press';
const pushLift = {
  exerciseId: BENCH,
  target: 225,
  units: 'lb' as const,
  since: '2026-08-01T12:00:00.000Z',
};

async function ready(overrides: Partial<UserProfile> = {}) {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), pushLift, ...overrides },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle.store;
}

describe('the lift to push in the store', () => {
  it('leads the plan, marked, and the saved workout keeps the mark', async () => {
    const store = await ready();
    const plan = allEntries(store.getSnapshot().session!.workout.blocks);
    const pushed = plan.find((entry) => entry.push !== undefined);
    expect(pushed?.exerciseId).toBe(BENCH);
    expect(plan[0]).toBe(pushed);
    store.startWorkout();
    const set = pushed!.sets.find((candidate) => candidate.kind === 'working')!;
    await store.logSet(pushed!.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[0],
      rir: set.targetRir,
    });
    await store.finishWorkout(null, { endedEarly: true });
    const saved = store.getSnapshot().history.at(-1)!;
    expect(saved.entries.find((logged) => logged.entryId === pushed!.id)?.push).toBe(pushed!.push);
  });

  it('takes no mark onto a lift swapped in for it, and has it back when swapped back', async () => {
    const store = await ready();
    const pushed = allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.push !== undefined,
    )!;
    await store.swapExercise(pushed.id, 'dumbbell-bench-press');
    const swapped = allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.id === pushed.id,
    )!;
    expect(swapped.exerciseId).toBe('dumbbell-bench-press');
    expect(pushMarkOf(swapped)).toBeUndefined();
    await store.swapExercise(pushed.id, BENCH);
    const back = allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.id === pushed.id,
    )!;
    expect(back.exerciseId).toBe(BENCH);
    expect(pushMarkOf(back)).toBe(pushed.push);
  });

  it('ends from the coach, and the plan is rebuilt without it', async () => {
    const store = await ready();
    await store.endPush();
    expect(store.getSnapshot().profile?.pushLift).toBeUndefined();
    expect(
      allEntries(store.getSnapshot().session!.workout.blocks).some(
        (entry) => entry.push !== undefined,
      ),
    ).toBe(false);
  });
});

describe('the stored push and its marks', () => {
  it('read back, and an unreadable one is dropped without the rest', () => {
    const profile = { ...createDefaultProfile(TEST_NOW), pushLift };
    expect(parseProfile(JSON.parse(JSON.stringify(profile))).pushLift).toEqual(pushLift);
    const broken = parseProfile({
      ...profile,
      pushLift: { exerciseId: BENCH, target: -5, units: 'lb', since: 'soon' },
    });
    expect(broken.pushLift).toBeUndefined();
    expect(broken.goals).toEqual(profile.goals);
  });

  it('keeps an entry and a logged exercise whose mark this copy cannot read', () => {
    const record = WorkoutRecordSchema.parse({
      id: 'w-1',
      startedAt: TEST_NOW,
      entries: [{ exerciseId: BENCH, push: 'sideways', sets: [] }],
    });
    expect(record.entries[0]?.exerciseId).toBe(BENCH);
    expect(record.entries[0]?.push).toBeUndefined();
    const extra = WorkoutRecordSchema.parse({
      id: 'w-2',
      startedAt: TEST_NOW,
      entries: [{ exerciseId: BENCH, push: 'extra', sets: [] }],
    });
    expect(extra.entries[0]?.push).toBe('extra');
    expect(GeneratedWorkoutSchema.shape).toBeDefined();
  });
});
