import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { recommendDeload } from '../planning/deload';
import { interpretFatigue } from './fatigue';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';

/**
 * The second adversarial review of Maintenance 33: the plan's own load step after the reps went past
 * the top of the range, lifted exactly as asked, reads as falling performance.
 *
 * Steps: a hypertrophy-focus lifter's bench press asks 185 lb for 4-6 reps at 2 in reserve. They do
 * 5 a set one session and 9 a set the next (2 in reserve each time). The plan adds 5 lb ("Every set
 * cleared the floor with reps in reserve: add 5 lb"): 190 lb for 4-6 at 2. They lift it exactly as
 * asked, even at the top of the range: 6 reps a set, 2 in reserve.
 *
 * The rule: the first review's fix, "Every set against what it asked" (the report; againstAsked.ts):
 * "Where it asked something else (a load step ...), each is read against its own ask, reps anywhere
 * in its range at its load being as asked ...: the plan's own change, lifted as asked, is never a
 * fall, while a set short of its range, or lighter than asked, is"; the report: "So the plan's load
 * step after the reps climbed its range is no fall in the fatigue score".
 *
 * What happens: the earlier set is credited for its reps past the range (9 on a top of 6 reads 1.08
 * of what it asked), while today's set, stopped where the plan asked, can read no more than 1.00, so
 * the plan's own 5 lb step reads "Lifts fell 7.7% against what their sets asked over the last two
 * sessions" (+1), and the deload advice repeats it. After 10 reps on a top of 6 the as-asked step
 * reads 10% (+2), whatever the reps today within the range. A set lifted as asked, at the top of
 * its range, is no fall by the model's own words.
 *
 * Synthetic data only.
 */

const START = '2026-08-03T12:00:00.000Z';
const DAY = 86_400_000;
const profile = {
  ...createDefaultProfile(START),
  bodyweight: 185,
  programStyle: 'hypertrophy-focus' as const,
};
const gym = createDefaultLocations({ gymAccess: true }, START).find((place) => place.id === 'gym')!;

/** A session of the bench press: three sets at the load and reps given, 2 in reserve as asked. */
function bench(index: number, weight: number, reps: number): WorkoutRecord {
  const at = new Date(Date.parse(START) + index * 3.5 * DAY).toISOString();
  return {
    id: `bench-${index}`,
    startedAt: at,
    completedAt: at,
    locationId: 'gym',
    templateId: 'push-arms',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId: 'barbell-bench-press',
        role: 'primary-strength',
        plannedSets: 3,
        sets: [0, 1, 2].map((setIndex) => ({
          kind: 'working' as const,
          reps,
          weight,
          rir: 2,
          completed: true,
          setIndex,
          targetReps: [4, 6] as [number, number],
          targetRir: 2,
          targetWeight: weight,
        })),
      },
    ],
  };
}

describe('the fatigue score at the plan load step after reps past the range', () => {
  it('reads no fall when the step is lifted as asked', () => {
    const history = [bench(0, 185, 5), bench(1, 185, 9)];
    const at = new Date(Date.parse(START) + 2 * 3.5 * DAY).toISOString();
    const plan = generateWorkout({
      profile,
      location: gym,
      history,
      now: at,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const asked = allEntries(plan.blocks)
      .find((entry) => entry.exerciseId === 'barbell-bench-press')!
      .sets.filter((set) => set.kind === 'working')
      .map((set) => [set.targetWeight, set.targetReps, set.targetRir]);
    // The plan's own step: 5 lb more, 4-6 at 2 in reserve.
    expect(asked[0]).toEqual([190, [4, 6], 2]);

    // Lifted exactly as asked, at the top of the range.
    const next = bench(2, 190, 6);
    const fatigue = interpretFatigue([...history, next], at);
    expect(fatigue.performanceDrift ?? 0).toBeGreaterThan(-5);
    expect(fatigue.evidence.join(' ')).not.toMatch(/fell/);
    expect(fatigue.score).toBe(0);
    const advice = recommendDeload([...history, next], fatigue, profile, at);
    expect(advice.reasons.join(' ')).not.toMatch(/fell/);
  });
});
