import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { gatherSignals, type CoachInput } from '../coach/coachConductor';
import type { LastingSwap } from '../planning/lastingSwaps';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { allEntries } from '../workout/types';
import { accessoryPicker, generateWorkout, pickAccessoryFor } from './generate';
import { RECORD_NOW, record } from '../../test/records';

/**
 * Maintenance 30, the fourth re-check of round L: a kept swap from the Bulgarian split squat to its
 * own loaded version (in its substitutions, so the swap sheet offers it). The swap keeps the split
 * squat out, which reads as one that never loads, so the loaded split squat the lifter chose was held
 * down wherever the swap itself did not put it in: the coach's extra work never offered it. A kept
 * swap's own exercise is the lifter's choice, and the rule never holds it back.
 */
const BSS = 'bulgarian-split-squat';
const DB_BSS = 'dumbbell-bulgarian-split-squat';
const NOW = RECORD_NOW;
const [home] = createDefaultLocations({ gymAccess: true }, NOW);
const profile = { ...createDefaultProfile(NOW, 'home'), bodyweight: 185 };
const toLoaded: LastingSwap[] = [
  { from: BSS, to: DB_BSS, setAt: NOW, until: '2026-12-01T00:00:00.000Z' },
];

/** An upper day at home, ten minutes of room, two pressing workouts done this week. */
function upperDay(swaps: LastingSwap[]): CoachInput {
  const history: WorkoutRecord[] = [
    record(1, 'dumbbell-bench-press', [[10, 50, 2]], [8, 12], 2, { locationId: 'home' }),
    record(3, 'dumbbell-bench-press', [[10, 50, 2]], [8, 12], 2, { locationId: 'home' }),
  ];
  const workout = generateWorkout({
    profile,
    location: home,
    history,
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'upper', swaps },
  });
  const fatigue = interpretFatigue(history, NOW, null);
  return {
    workout: {
      ...workout,
      duration: { ...workout.duration, targetMinutes: workout.duration.estimatedMinutes + 10 },
    },
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history,
    now: NOW,
    fatigue,
    strategy: analyzeStrategy({ history, profile, now: NOW, fatigue }),
    lastExportAt: NOW,
    workoutCount: history.length,
    location: home,
    swaps,
  };
}

const coverageAction = (input: CoachInput) =>
  gatherSignals(input).find((signal) => signal.source === 'weekly coverage')?.action;

describe('a kept swap from the split squat to its loaded version', () => {
  it('applies the swap in the plan; with no swap, the coach offers the split squat', () => {
    const lower = generateWorkout({
      profile,
      location: home,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'lower', swaps: toLoaded },
    });
    expect(allEntries(lower.blocks).map((entry) => entry.exerciseId)).toContain(DB_BSS);
    const action = coverageAction(upperDay([]));
    expect(action?.kind === 'recalibrate' && action.label).toBe(
      'Add 2 sets of Bulgarian Split Squat',
    );
  });

  it('the coach’s extra work offers the loaded split squat the lifter swapped to', () => {
    const action = coverageAction(upperDay(toLoaded));
    // Not "Add 2 sets of Dumbbell Romanian Deadlift".
    expect(action?.kind === 'recalibrate' && action.label).toBe(
      'Add 2 sets of Dumbbell Bulgarian Split Squat',
    );
  });

  it('the coach’s extra quad work does not hold the chosen loaded split squat below every other', () => {
    const input = upperDay(toLoaded);
    const today = allEntries(input.workout.blocks).map((entry) =>
      requireExercise(entry.exerciseId),
    );
    const picker = accessoryPicker({
      profile,
      location: home,
      history: [],
      now: NOW,
      swaps: toLoaded,
    });
    // Not the reverse lunge, a bodyweight lunge the lifter never chose, over the one they did.
    expect(pickAccessoryFor('quads', today, picker)?.id).toBe(DB_BSS);
  });
});
