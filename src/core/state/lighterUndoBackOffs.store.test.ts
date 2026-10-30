import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record, type SetSpec } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * The first adversarial review of Maintenance 33: a set logged and undone after the lighter option
 * on a lift under way puts the lift's back-offs back at their un-eased load.
 *
 * Steps: Monday, a hybrid lifter's push day: the bench press's top set (190 for 4-6 at 1 in
 * reserve) and three back-offs (180 at 2). They log the top set as asked, then tap "Lighter for the
 * chest": the back-offs still to come become two at 175, 3 in reserve. They log the first back-off
 * as asked (175 for 4 at 3) and, a slip, undo it.
 *
 * The rule: the lighter option takes a lift under way "on its sets still to come, for good: the
 * workout never gives it back" (recalibrate.ts, `lightenUnderWay`); an undo of a set takes that set
 * back, and the sets still to come stand as they were before it was logged (the store replays the
 * back-offs from the logs only so the logs left standing move them as they did).
 *
 * What happens: `undoLastSet` replays the back-offs from the top set's log (`backOffsAsPlanned`),
 * which knows nothing of the ease: the back-offs still to come go back to 180 while keeping 3 in
 * reserve, a load the plan itself asks only at 2 in reserve. Before the slip they were 175.
 *
 * Synthetic data only.
 */

const NOW = '2026-09-07T12:00:00.000Z';
const DAY = 86_400_000;

function past(
  daysAgo: number,
  exerciseId: string,
  set: SetSpec,
  templateId: string,
): WorkoutRecord {
  const when = new Date(Date.parse(NOW) - daysAgo * DAY).toISOString();
  return {
    ...record(0, exerciseId, [set, set, set], set[0] <= 6 ? [4, 6] : [6, 10], 2),
    id: `${exerciseId}-${daysAgo}`,
    startedAt: when,
    completedAt: when,
    templateId,
  };
}

const backOffs = (entry: WorkoutEntry) =>
  entry.sets
    .filter((set) => set.tier === 'back-off')
    .map((set) => ({
      index: set.index,
      weight: set.targetWeight,
      reps: set.targetReps,
      rir: set.targetRir,
    }));

describe('an undo after the lighter option on a lift under way', () => {
  it('leaves the back-offs still to come as they were before the slip', async () => {
    const { store } = createTestStore({ now: () => NOW });
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(NOW), bodyweight: 185, programStyle: 'hybrid' },
      createDefaultLocations({ gymAccess: true }, NOW),
    );
    const db = await store.getDatabase();
    for (const record of [
      past(7, 'barbell-bench-press', [5, 185, 2], 'push-arms'),
      past(6, 'barbell-row', [8, 135, 2], 'pull-arms'),
      past(5, 'back-squat', [8, 135, 2], 'legs'),
      past(3, 'barbell-bench-press', [5, 185, 2], 'push-arms'),
      past(2, 'barbell-row', [8, 135, 2], 'pull-arms'),
      past(1, 'back-squat', [8, 135, 2], 'legs'),
    ]) {
      await db.put('workouts', record);
    }
    await store.hydrate();
    const benchOf = () =>
      allEntries(store.getSnapshot().session!.workout.blocks).find(
        (entry) => entry.exerciseId === 'barbell-bench-press',
      )!;
    const bench = benchOf();
    const top = bench.sets.find((set) => set.tier === 'top')!;
    expect([top.targetWeight, top.targetRir]).toEqual([190, 1]);

    store.startWorkout();
    await store.logSet(bench.id, top.index, { reps: 5, weight: 190, rir: 1 });
    const lighter = await store.recalibrate({ type: 'lighter', muscle: 'chest' });
    expect(lighter?.ok).toBe(true);
    const eased = backOffs(benchOf());
    // Two back-offs left, each a rep more in reserve (as built, at 175).
    expect(eased.map((set) => [set.index, set.rir])).toEqual([
      [3, 3],
      [4, 3],
    ]);

    const first = benchOf().sets.find((set) => set.index === 3)!;
    await store.logSet(bench.id, 3, {
      reps: first.targetReps[0],
      weight: first.targetWeight,
      rir: first.targetRir,
    });
    store.undoLastSet();
    expect(store.getSnapshot().session!.completed.sets.map((set) => set.setIndex)).toEqual([2]);
    expect(backOffs(benchOf())).toEqual(eased);
  });
});
