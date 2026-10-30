import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { gatherSignals, type CoachInput } from '../coach/coachConductor';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { allEntries } from '../workout/types';
import { generateWorkout } from './generate';
import { RECORD_NOW, record } from '../../test/records';

/**
 * Maintenance 30, the sixth re-check of round L: a favourite moves in the coach's extra work as it does
 * in a slot's pick, and only a kept swap's own exercise stays where it is. With the standing calf
 * raise and its machine both favourites, the gym's lower day plans the machine, "in place of the
 * Standing Calf Raise: on two legs, bodyweight is too light for its reps", and the coach's extra calf
 * work names the machine too. It named the bodyweight calf raise the plan had just called too light.
 * Synthetic data only.
 */
const NOW = RECORD_NOW;
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const base = createDefaultProfile(NOW);
const bothFavourites: UserProfile = {
  ...base,
  bodyweight: 185,
  exercisePreferences: {
    ...base.exercisePreferences,
    preferred: ['Standing Calf Raise', 'Standing Calf Raise Machine'],
  },
};

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
function upperDay(profile: UserProfile): CoachInput {
  const history = [lowerDay(1), lowerDay(3)];
  const workout = generateWorkout({
    profile,
    location: gym,
    history,
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'upper' },
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
    swaps: [],
  };
}

const coverageLabel = (input: CoachInput) => {
  const action = gatherSignals(input).find((signal) => signal.source === 'weekly coverage')?.action;
  return action?.kind === 'recalibrate' ? action.label : null;
};

describe('the standing calf raise and its machine both favourites, at the gym', () => {
  it('the lower day plans the machine in place of the bodyweight raise, saying why (baseline)', () => {
    const lower = generateWorkout({
      profile: bothFavourites,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'lower' },
    });
    const ids = allEntries(lower.blocks).map((entry) => entry.exerciseId);
    expect(ids).toContain('standing-calf-raise-machine');
    expect(ids).not.toContain('standing-calf-raise');
    expect(lower.explanation.reasons).toContain(
      'Standing Calf Raise Machine in place of the Standing Calf Raise: on two legs, bodyweight is too light for its reps.',
    );
  });

  it('the coach’s extra calf work names the machine the plan uses, not the raise it replaced', () => {
    // Not "Add 2 sets of Standing Calf Raise": the bodyweight raise the lower day has just called
    // too light for its reps.
    expect(coverageLabel(upperDay(bothFavourites))).toBe(
      'Add 2 sets of Standing Calf Raise Machine',
    );
  });
});
