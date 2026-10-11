import { describe, expect, it } from 'vitest';
import { allEntries } from '../../engine/workout/types';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { WorkoutRecordSchema } from '../validation/workoutRecord';

/**
 * Maintenance 27, the owner's item 45, through the store: a pain report made on an exercise keeps
 * that exercise into the saved workout, which a pattern over weeks reads; and the pattern's swap is
 * the four-week lasting swap.
 */

async function ready() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle.store;
}

describe('a pain report on an exercise', () => {
  it('keeps its exercise into the saved workout', async () => {
    const store = await ready();
    store.startWorkout();
    const loaded = allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.exerciseId === 'barbell-bench-press',
    );
    expect(loaded).toBeDefined();
    const entry = loaded!;
    await store.recalibrate({ type: 'pain', entryId: entry.id, joint: 'shoulder' });
    expect(store.getSnapshot().session!.constraints.painReports).toEqual([
      { exerciseId: entry.exerciseId, joint: 'shoulder' },
    ]);
    await store.finishWorkout(null, { endedEarly: true });
    const saved = store.getSnapshot().history.at(-1)!;
    expect(saved.painReports).toEqual([{ exerciseId: entry.exerciseId, joint: 'shoulder' }]);
    expect(saved.painJoints).toEqual(['shoulder']);
  });

  it('keeps every report, each with its exercise, through later changes to the plan', async () => {
    const store = await ready();
    store.startWorkout();
    const entries = allEntries(store.getSnapshot().session!.workout.blocks);
    const bench = entries.find((entry) => entry.exerciseId === 'barbell-bench-press')!;
    const other = entries.find((entry) => entry.id !== bench.id)!;
    await store.recalibrate({ type: 'pain', entryId: bench.id, joint: 'shoulder' });
    // A change of length, then a second report on another exercise (the review of item 45).
    await store.recalibrate({ type: 'duration', choice: 45 });
    await store.recalibrate({ type: 'pain', entryId: other.id, joint: 'elbow' });
    expect(store.getSnapshot().session!.constraints.painReports).toEqual([
      { exerciseId: 'barbell-bench-press', joint: 'shoulder' },
      { exerciseId: other.exerciseId, joint: 'elbow' },
    ]);
    await store.finishWorkout(null, { endedEarly: true });
    expect(store.getSnapshot().history.at(-1)!.painReports).toHaveLength(2);
  });

  it('saves an empty list of reports on a workout without any', async () => {
    const store = await ready();
    store.startWorkout();
    await store.finishWorkout(null, { endedEarly: true });
    expect(store.getSnapshot().history.at(-1)!.painReports).toEqual([]);
  });

  it('reads back, and one this copy cannot read is dropped without the rest', () => {
    const record = WorkoutRecordSchema.parse({
      id: 'w-1',
      startedAt: TEST_NOW,
      entries: [],
      painReports: [
        { exerciseId: 'barbell-bench-press', joint: 'shoulder' },
        { exerciseId: 'back-squat', joint: 'spleen' },
      ],
    });
    expect(record.painReports).toEqual([{ exerciseId: 'barbell-bench-press', joint: 'shoulder' }]);
    const none = WorkoutRecordSchema.parse({ id: 'w-2', startedAt: TEST_NOW, entries: [] });
    expect(none.painReports).toBeUndefined();
  });

  it("makes the pattern's swap a lasting one", async () => {
    const store = await ready();
    const entry = allEntries(store.getSnapshot().session!.workout.blocks).find(
      (candidate) => candidate.exerciseId === 'barbell-bench-press',
    );
    expect(entry).toBeDefined();
    await store.swapExercise(entry!.id, 'dumbbell-bench-press', true);
    const swaps = store.getSnapshot().lastingSwaps;
    expect(swaps.some((swap) => swap.from === 'barbell-bench-press')).toBe(true);
  });
});
