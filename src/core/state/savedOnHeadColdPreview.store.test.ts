import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { Readiness } from '../../engine/recalibration/types';
import { allEntries, type GeneratedWorkout } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The fifth adversarial review of Maintenance 33: a workout saved on a head-cold day before the
 * start keeps the head cold, so loaded on a well day it is the head cold's plan, where the same copy
 * saved after the first warm-up is the plan.
 *
 * Steps: a hybrid lifter with drop sets on; today's plan runs the bench press on a top set (140 ×
 * 4-6 at 1 in reserve) and three back-offs (135 × 4-6 at 2), and the cable triceps pushdown at 1 in
 * reserve with a drop set. They save it ("Save today's workout": "Plain"). They check in with a head
 * cold ("Adjusted for today (every set 2 or more short of failure for the head cold)"): the bench
 * press runs four straight sets of 140 at 2, the pushdown's drop set goes, every set at 2 or more.
 * They save it again ("Cold"). The next day, well, they load "Cold" ("Use").
 *
 * The rule: `planUnderTheEase`'s own words, "A saved workout is a plan for another day, and the ease
 * was today's, as an illness's floor is: every set it holds has back what it had"; the report's
 * fourth pass: "A saved copy is the plan under the floor as under the ease"; and its third: "the
 * day's floor lies over the plan as a layer, as the hard start's ease does".
 *
 * What happens: on the preview the head cold is no layer: the plan is built with it
 * (`prescriptionToday` lays the floor, `straightToday` runs the main lift straight, the drop set is
 * left out), nothing is kept of what each set was (`floored`), so `planUnderTheEase` has nothing to
 * give back. The copy keeps the head cold for good: loaded on a well day with no check-in, the bench
 * press is 4 × 140 at 2 and the pushdown has no drop set, every set at 2 or more, under "Loaded
 * "Cold"." The same steps with the first warm-up logged before the check-in (the fourth review's
 * test) give the plan back.
 *
 * In the build since Maintenance 33 (older than the fourth pass, whose fix of a saved copy under the
 * floor it reaches). On the previous head (3d24e37) this test fails the same way.
 *
 * Synthetic data only.
 *
 * The fix (the fifth pass): a copy saved before the start on a day an illness holds is the plan the
 * day's check-in makes without the illness (`planWithoutIllness`).
 */

const DAY_TWO = '2026-09-03T12:00:00.000Z';
const DAY = 86_400_000;
const LIFTS = ['barbell-bench-press', 'back-squat', 'barbell-row'];
const at = (daysAgo: number) => new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();

const headCold: Readiness = {
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
  illness: 'head',
};

/** Each lift's working and drop sets: kind, reps, reserve and tier. */
const shape = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).map((entry) => [
    entry.exerciseId,
    entry.sets
      .filter((set) => set.kind !== 'warmup')
      .map((set) => [set.kind, set.targetReps, set.targetRir, set.tier ?? 'straight']),
  ]);

describe('a workout saved on a head-cold day before the start, loaded a well day', () => {
  it('is the plan, as the same copy saved under way is', async () => {
    let clock = TEST_NOW;
    const { store } = createTestStore({ now: () => clock });
    await store.hydrate();
    const base = createDefaultProfile(TEST_NOW);
    await store.completeOnboarding(
      {
        ...base,
        bodyweight: 185,
        programStyle: 'hybrid',
        techniques: { ...base.techniques, dropSets: true },
        // Every weekday ticked: today is a day of the plan.
        schedule: {
          ...base.schedule,
          availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
          weeklyFrequency: 5,
        },
      },
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
    const plain = await store.saveCurrentWorkout('Plain');
    // The plan: a top set at 1 in reserve, a drop set.
    const sets = allEntries(plain.workout.blocks).flatMap((entry) => entry.sets);
    expect(sets.some((set) => set.tier === 'top' && set.targetRir === 1)).toBe(true);
    expect(sets.some((set) => set.kind === 'drop')).toBe(true);

    await store.recalibrate({ type: 'readiness', readiness: headCold });
    expect(store.getSnapshot().session!.lastSummary?.headline).toMatch(
      /^Adjusted for today \(every set 2 or more short of failure for the head cold\)/,
    );
    const cold = await store.saveCurrentWorkout('Cold');

    clock = DAY_TWO;
    store.refreshSession();
    store.loadSavedWorkout(plain.id);
    const asPlanned = shape(store.getSnapshot().session!.workout);
    store.loadSavedWorkout(cold.id);
    const loaded = store.getSnapshot().session!;
    expect(loaded.lastSummary?.headline).toBe('Loaded "Cold".');
    expect(loaded.constraints.readiness).toBeNull();
    expect(shape(loaded.workout)).toEqual(asPlanned);
  });
});
