import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { FEWER_REPS_SOURCE, conductCoach, type CoachInput } from './coachConductor';
import { recommendNextTarget, summarizeProgression } from '../progression/progression';
import { prescribe } from '../progression/roles';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';

/**
 * Maintenance 30, the third re-check of round L: the coach's "fewer reps over more sets, or swap in"
 * for a standing calf raise short of its range still names the Leg Press Calf Raise, as before the
 * round. It is one of the calf raise's loaded versions (item 31), but its load lifts no bodyweight and
 * can be set lighter, unlike the loaded versions that add to it.
 */
const NOW = RECORD_NOW;
const CALF = 'standing-calf-raise';
const profile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);

function shortCalfAtGym(): CoachInput {
  const exercise = requireExercise(CALF);
  const range: [number, number] = [12, 20];
  const short: SetSpec[] = [
    [10, null, 1],
    [9, null, 1],
    [9, null, 0],
  ];
  const history: WorkoutRecord[] = [6, 2].map((daysAgo) => record(daysAgo, CALF, short, range, 1));
  // An upper day: nothing on the leg press today, so a leg press calf raise would fit.
  const workout = generateWorkout({
    profile,
    location: gym!,
    history,
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'upper' },
  });
  const role = 'isolation' as const;
  const target = recommendNextTarget({
    exercise,
    role,
    prescription: prescribe(exercise, role, profile),
    history,
    profile,
    now: NOW,
  });
  const blocks = workout.blocks.map((block, blockIndex) =>
    blockIndex === 0
      ? {
          ...block,
          kind: 'straight' as const,
          entries: [
            {
              ...block.entries[0]!,
              exerciseId: CALF,
              role,
              progression: summarizeProgression(target),
              manual: undefined,
              sets: [0, 1, 2].map((index) => ({
                index,
                kind: 'working' as const,
                targetReps: range,
                targetRir: 1,
                targetWeight: null,
                restSeconds: 90,
              })),
            },
          ],
        }
      : block,
  );
  const fatigue = interpretFatigue(history, NOW);
  return {
    workout: { ...workout, blocks },
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    location: gym,
    history,
    now: NOW,
    fatigue,
    strategy: analyzeStrategy({ history, profile, now: NOW, fatigue }),
    lastExportAt: NOW,
    workoutCount: history.length,
  };
}

describe('the coach’s swap for a standing calf raise that keeps falling short', () => {
  it('names the Leg Press Calf Raise, as before round L', () => {
    const input = shortCalfAtGym();
    const today = allEntries(input.workout.blocks).map((entry) => entry.exerciseId);
    expect(today).not.toContain('leg-press-calf-raise');
    const card = conductCoach(input);
    expect(card?.signal.source).toBe(FEWER_REPS_SOURCE);
    expect(card?.signal.why.join(' ')).toContain('swap in Leg Press Calf Raise for a few weeks');
  });
});
