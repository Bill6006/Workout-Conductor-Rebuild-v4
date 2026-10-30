import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { gatherSignals, type CoachInput } from '../coach/coachConductor';
import type { LastingSwap } from '../planning/lastingSwaps';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { allEntries } from '../workout/types';
import { generateWorkout } from './generate';
import { RECORD_NOW, record } from '../../test/records';

/**
 * Maintenance 30, the fifth re-check of round L: a kept swap's own exercise is the lifter's choice,
 * and the rule never moves it, a bodyweight move swapped back to included. With the leg-press calf
 * raise swapped for the standing calf raise and kept, the lower day plans the standing calf raise
 * ("the swap you chose to keep"), and the coach's extra calf work offers it too. It offered the
 * Standing Calf Raise Machine, a loaded calf raise, the bodyweight move moved down below it.
 * Synthetic data only.
 */
const NOW = RECORD_NOW;
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const profile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const backToBodyweight: LastingSwap[] = [
  {
    from: 'leg-press-calf-raise',
    to: 'standing-calf-raise',
    setAt: NOW,
    until: '2026-12-01T00:00:00.000Z',
  },
];

/** A lower workout this week with no calf work: the calves fall behind. */
function lowerDay(daysAgo: number): WorkoutRecord {
  const sets = (weight: number): [number, number, number][] =>
    Array.from({ length: 4 }, () => [10, weight, 2]);
  const parts = [
    record(daysAgo, 'back-squat', sets(185), [6, 10], 2),
    record(daysAgo, 'romanian-deadlift', sets(135), [8, 12], 2),
    record(daysAgo, 'leg-extension', sets(80), [10, 15], 2),
    record(daysAgo, 'hip-thrust', sets(135), [8, 12], 2),
    record(daysAgo, 'rear-delt-fly', sets(20), [12, 20], 2),
    record(daysAgo, 'barbell-shrug', sets(185), [8, 12], 2),
    record(daysAgo, 'cable-crunch', sets(60), [10, 15], 2),
    record(daysAgo, 'pallof-press', sets(30), [10, 15], 2),
    record(daysAgo, 'wrist-curl', sets(30), [10, 15], 2),
  ];
  return {
    ...parts[0]!,
    id: `w-lower-${daysAgo}`,
    templateId: 'lower',
    entries: parts.flatMap((part) => part.entries),
  };
}

/** An upper day at the gym, ten minutes of room, two lower workouts done this week. */
function upperDay(swaps: LastingSwap[]): CoachInput {
  const history = [lowerDay(1), lowerDay(3)];
  const workout = generateWorkout({
    profile,
    location: gym,
    history,
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'upper', swaps },
  });
  const fatigue = interpretFatigue(history, NOW);
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
    location: gym,
    swaps,
  };
}

const coverageLabel = (input: CoachInput) => {
  const action = gatherSignals(input).find((signal) => signal.source === 'weekly coverage')?.action;
  return action?.kind === 'recalibrate' ? action.label : null;
};

describe('a kept swap from the leg-press calf raise back to the standing calf raise', () => {
  it('the lower day keeps the standing calf raise; with no swap the coach offers the leg-press one (baseline)', () => {
    const lower = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'lower', swaps: backToBodyweight },
    });
    expect(allEntries(lower.blocks).map((entry) => entry.exerciseId)).toContain(
      'standing-calf-raise',
    );
    expect(lower.explanation.reasons).toContain(
      'Standing Calf Raise in place of Leg Press Calf Raise, the swap you chose to keep.',
    );
    expect(coverageLabel(upperDay([]))).toBe('Add 2 sets of Leg Press Calf Raise');
  });

  it('the coach’s extra calf work offers the standing calf raise the lifter kept', () => {
    // Not "Add 2 sets of Standing Calf Raise Machine": a loaded calf raise for a lifter who swapped
    // back to bodyweight.
    expect(coverageLabel(upperDay(backToBodyweight))).toBe('Add 2 sets of Standing Calf Raise');
  });
});
