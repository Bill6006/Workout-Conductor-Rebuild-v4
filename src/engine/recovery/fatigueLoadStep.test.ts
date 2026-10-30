import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { interpretFatigue } from './fatigue';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';

/**
 * The first adversarial review of Maintenance 33: the plan's own load step, lifted exactly as
 * asked, reads as falling performance in the fatigue score.
 *
 * Steps: double progression on an accessory, as the plan runs it: the incline dumbbell press at 30,
 * 6-10 reps at 1 in reserve, the reps climbing a session at a time from 6 to 10. The plan then steps
 * the load up (35 for 6-10 reps at 1 in reserve), and the lifter does exactly what is asked: 6 reps
 * on every set, 1 in reserve.
 *
 * The rule: Maintenance 33's fatigue score reads "falling performance" (the report, Fatigue: "A
 * lift's estimated max is read against what its sets asked, session to session, so a load planned
 * lighter ... and lifted as asked is no fall"); the fatigue module: "Never a diagnosis from one poor
 * set"; recovery-time-course.md: "A single session must fall about 9-11% to mean anything".
 *
 * What happens: the drift is each session's best estimated max over the estimate its targets asked
 * at the bottom of their range: 10 reps on 6 asked read 1.11, 6 on 6 read 1.00, so the step reads
 * 10% down: the score takes +2 and the evidence says "Lifts fell 10% further short of their
 * targets over the last two sessions." No target was missed, and the estimated max rose (30 x 10 to
 * 35 x 6 is about +5%). With other lifts holding steady the average is smaller but still a fall (a
 * simulated push day read 6.7%, +1). Before Maintenance 33 the step read as the rise it is (this
 * test passes on 34dc615).
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

/** A session of the incline press, three sets at the load and reps given, 6-10 asked at 1. */
function presses(index: number, incline: [number, number]) {
  const at = new Date(Date.parse(START) + index * 3.5 * DAY).toISOString();
  const lift = (exerciseId: string, role: string, [weight, reps]: [number, number]) => ({
    exerciseId,
    role,
    plannedSets: 3,
    sets: [0, 1, 2].map((setIndex) => ({
      kind: 'working' as const,
      reps,
      weight,
      rir: 1,
      completed: true,
      setIndex,
      targetReps: [6, 10] as [number, number],
      targetRir: 1,
      targetWeight: weight,
    })),
  });
  const record: WorkoutRecord = {
    id: `presses-${index}`,
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
    entries: [lift('incline-dumbbell-press', 'primary-hypertrophy', incline)],
  };
  return { at, record };
}

describe('the fatigue score at a load step lifted as asked', () => {
  it('reads no fall', () => {
    const history = [6, 7, 8, 9, 10].map((reps, index) => presses(index, [30, reps]).record);
    const next = presses(5, [35, 6]);
    // The plan's own step: after 10 reps at 30, 35 for 6-10 at 1 in reserve.
    const plan = generateWorkout({
      profile,
      location: gym,
      history,
      now: next.at,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const asked = (exerciseId: string) => {
      const set = allEntries(plan.blocks)
        .find((entry) => entry.exerciseId === exerciseId)!
        .sets.find((each) => each.kind === 'working')!;
      return [set.targetWeight, set.targetReps, set.targetRir];
    };
    expect(asked('incline-dumbbell-press')).toEqual([35, [6, 10], 1]);

    const fatigue = interpretFatigue([...history, next.record], next.at);
    expect(fatigue.performanceDrift ?? 0).toBeGreaterThan(-5);
    expect(fatigue.evidence.join(' ')).not.toMatch(/fell/);
    expect(fatigue.score).toBe(0);
  });
});
