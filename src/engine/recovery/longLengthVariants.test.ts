import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { recoveryWindows } from './recovery';

/**
 * The second adversarial review of Maintenance 33: the long-length adjuster reads the barbell
 * Romanian deadlift and the dumbbell overhead extension, but not the dumbbell Romanian deadlift (the
 * plan's own hinge on the full-body day) nor the cable overhead triceps extension.
 *
 * Steps: two sessions of the same work at the same reserve, three sets of 8 at 2 in reserve: one of
 * the Romanian deadlift, one of the Dumbbell Romanian Deadlift ("Dumbbell RDL"); and two of the
 * triceps: the Overhead Triceps Extension and the Cable Overhead Triceps Extension ("Rope Overhead
 * Extension").
 *
 * The rule: the windows' adjuster for long-length work (the report: "long-length work such as
 * Romanian deadlifts (12 h)"; recovery-time-course.md: "Eccentric or long-length (RDL, Nordic, deep
 * fly, overhead extension): +12 h"); recovery.ts `LONG_LENGTH_LIFTS`: "Lifts that load a muscle at
 * long lengths ...: the Romanian deadlift, the deep fly, the overhead extension".
 *
 * What happens: the set lists four catalogue ids, so the same hinge with dumbbells and the same
 * overhead extension on a cable set windows 12 h shorter than their namesakes: the hamstrings 48 h
 * after the dumbbell RDL against 60 h after the RDL, the triceps 36 h after the cable overhead
 * extension against 48 h after the dumbbell one.
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
          reps: 8,
          weight,
          rir: 2,
          completed: true,
          setIndex,
          targetReps: [6, 10] as [number, number],
          targetRir: 2,
          targetWeight: weight,
        })),
      },
    ],
  };
}

const hours = (record: WorkoutRecord, muscle: 'hamstrings' | 'triceps') =>
  recoveryWindows([record], { now: DONE }).get(muscle)?.hours;

describe('long-length work by any of its variants', () => {
  it('lengthens the hamstrings window after a dumbbell Romanian deadlift as after a barbell one', () => {
    expect(hours(session('dumbbell-romanian-deadlift', 50), 'hamstrings')).toBe(
      hours(session('romanian-deadlift', 135), 'hamstrings'),
    );
  });

  it('lengthens the triceps window after a cable overhead extension as after a dumbbell one', () => {
    expect(hours(session('cable-overhead-triceps-extension', 40), 'triceps')).toBe(
      hours(session('overhead-triceps-extension', 40), 'triceps'),
    );
  });
});
