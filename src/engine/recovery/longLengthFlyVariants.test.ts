import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { recoveryWindows } from './recovery';

/**
 * The third adversarial review of Maintenance 33: the long-length adjuster reads the dumbbell fly but
 * not the cable fly, the fly the plan itself picks on the push day.
 *
 * Steps: two sessions of the same chest work at the same reserve, three sets of 12 at 2 in reserve:
 * one of the Dumbbell Fly, one of the Cable Fly ("Cable Crossover": "Let your arms rise and open
 * slowly along the same arc until you feel a stretch across your chest").
 *
 * The rule: the windows' adjuster for long-length work (recovery-time-course.md: "Eccentric or
 * long-length (RDL, Nordic, deep fly, overhead extension): +12 h"); recovery.ts `LONG_LENGTH_LIFTS`,
 * as the second review's fix words it: "the Romanian deadlift, the deep fly, the overhead extension,
 * and by the same reading the incline curl, each with every implement the catalog has for it"; the
 * report: "The long-length lifts include every implement of the lifts the research names."
 *
 * What happens: the set names `dumbbell-fly` alone of the catalog's three flies (`dumbbell-fly`,
 * `cable-fly`, `band-fly`, all of the `chest-fly` family), so the same fly on a cable stack windows
 * the chest 12 h shorter: 36 h after the cable fly against 48 h after the dumbbell fly. (Which flies
 * load the chest long enough to count is judgement; the fix's own rule is every implement.) It
 * fails before the second review's fix too (80893d4).
 *
 * Synthetic data only.
 */

const DONE = '2026-09-07T12:00:00.000Z';

function session(exerciseId: string, weight: number): WorkoutRecord {
  return {
    id: exerciseId,
    startedAt: DONE,
    completedAt: DONE,
    locationId: 'gym',
    templateId: null,
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId,
        plannedSets: 3,
        sets: [0, 1, 2].map((setIndex) => ({
          kind: 'working' as const,
          reps: 12,
          weight,
          rir: 2,
          completed: true,
          setIndex,
          targetReps: [10, 15] as [number, number],
          targetRir: 2,
          targetWeight: weight,
        })),
      },
    ],
  };
}

const chest = (record: WorkoutRecord) => recoveryWindows([record], { now: DONE }).get('chest');

describe('long-length work by any of its implements', () => {
  it('lengthens the chest window after a cable fly as after a dumbbell fly', () => {
    expect(chest(session('dumbbell-fly', 30))?.reasons).toContain(
      'work at long lengths: 12 h more',
    );
    expect(chest(session('cable-fly', 40))?.hours).toBe(chest(session('dumbbell-fly', 30))?.hours);
  });
});
