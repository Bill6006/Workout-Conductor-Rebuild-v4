import { describe, expect, it } from 'vitest';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type { RecalibrationTrigger } from '../../engine/recalibration/types';
import { allEntries, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, directSets, gym, profileOf, session } from '../../test/clockDays';

/**
 * Maintenance 31 (the eleventh review of round M): what comes in for a lift in a catch-up
 * ("Uncomfortable", "Hurts") works directly no muscle the plan's other lifts have given its sets,
 * as the plan's own picks do not: no muscle gets more than it lacks. Synthetic data only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const behind = (...muscles: ('quads' | 'glutes' | 'hamstrings' | 'biceps')[]): CatchUpSpec => ({
  kind: 'catch-up',
  muscles: muscles.map((muscle) => ({ muscle, sets: 3, minRir: 1, why: 'behind' as const })),
  sitOut: [],
});

describe('what comes in for a lift keeps every muscle to its catch-up sets, the eleventh review of round M', () => {
  it.each([
    [
      '"Uncomfortable" on the leg curl: the glutes, which the back squat gave 3 sets',
      behind('quads', 'glutes', 'hamstrings'),
      'leg-curl',
      (entryId: string): RecalibrationTrigger => ({ type: 'uncomfortable', entryId }),
      'glutes' as const,
    ],
    [
      '"Hurts" (lower back) on the Romanian deadlift: the quads, which the leg press gives 3 sets',
      behind('quads', 'hamstrings', 'biceps'),
      'dumbbell-romanian-deadlift',
      (entryId: string): RecalibrationTrigger => ({ type: 'pain', entryId, joint: 'lower-back' }),
      'quads' as const,
    ],
  ])('%s', (_, spec, tappedId, tap, muscle) => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const tapped = allEntries(plan.blocks).find((entry) => entry.exerciseId === tappedId);
    expect(tapped, lifts(plan)).toBeDefined();
    expect(directSets(plan, muscle), lifts(plan)).toBe(3);
    const result = recalibrate({
      trigger: tap(tapped!.id),
      workout: plan,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: profileOf(),
      location: gym,
      loading: { missingPlates: [] },
      history: records,
      constraints: { ...emptyConstraints(), catchUp: spec },
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    // Before: 6. "back-squat x3; dumbbell-romanian-deadlift x3" for the glutes; "leg-press x3;
    // dumbbell-bulgarian-split-squat x3; ..." for the quads.
    expect(directSets(result.workout, muscle), lifts(result.workout)).toBeLessThanOrEqual(3);
  });
});
