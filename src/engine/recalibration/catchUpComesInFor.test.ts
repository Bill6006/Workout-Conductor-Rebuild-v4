import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { CATCH_UP, type CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type { RecalibrationRequest, RecalibrationTrigger } from '../../engine/recalibration/types';
import { allEntries, isStopped, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, profileOf, session } from '../../test/clockDays';

/**
 * Maintenance 31 (the twelfth review of round M): in a catch-up, what comes in for a lift ("Uncomfortable",
 * "Hurts") works directly a muscle of the catch-up the lift went in for, as the plan's own picks do
 * (the third review: a catch-up's slot takes no lift that misses its muscle), or nothing comes in and
 * the muscle waits. Before: any lift that shared a main muscle with it, so a muscle not behind took
 * the sets and the one behind lost them: the hammer curl for the forearms gave way to a dumbbell
 * curl, though the wrist curl was there (and the next rebuild put the wrist curl in); the dumbbell row
 * for the lats to a rear-delt fly, while "Why this workout" still named the lats. Synthetic data only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
/** Dumbbells and nothing else. */
const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const behind = (...muscles: ('forearms' | 'chest' | 'lats' | 'quads')[]): CatchUpSpec => ({
  kind: 'catch-up',
  muscles: muscles.map((muscle) => ({ muscle, sets: 3, minRir: 1, why: 'behind' as const })),
  sitOut: [],
});
const request = (
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  spec: CatchUpSpec,
  options: Partial<RecalibrationRequest> = {},
): RecalibrationRequest => ({
  trigger,
  workout,
  completed: emptyCompleted(),
  lockedEntryIds: [],
  currentEntryId: null,
  duration: 'default',
  profile: profileOf(),
  location: home,
  loading: { missingPlates: [] },
  history: records,
  constraints: { ...emptyConstraints(), catchUp: spec },
  reason: 'test',
  timestamp: NOW,
  ...options,
});

describe('what comes in for a lift works a muscle it went in for, the twelfth review of round M', () => {
  it.each([
    [
      '"Uncomfortable" on the hammer curl, for the forearms (before: a dumbbell curl)',
      behind('forearms', 'chest'),
      'hammer-curl',
      (entryId: string): RecalibrationTrigger => ({ type: 'uncomfortable', entryId }),
    ],
    [
      '"Uncomfortable" on the dumbbell row, for the lats (before: a rear-delt fly)',
      behind('lats', 'quads'),
      'dumbbell-row',
      (entryId: string): RecalibrationTrigger => ({ type: 'uncomfortable', entryId }),
    ],
    [
      '"Hurts" (wrist) on the push-up, for the chest (before: a dumbbell shoulder press)',
      behind('forearms', 'chest'),
      'push-up',
      (entryId: string): RecalibrationTrigger => ({ type: 'pain', entryId, joint: 'wrist' }),
    ],
  ])('%s', (_, spec, tappedId, tap) => {
    const day = spec.muscles.map((item) => item.muscle as string);
    const plan = generateWorkout({
      profile: profileOf(),
      location: home,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const tapped = allEntries(plan.blocks).find((entry) => entry.exerciseId === tappedId);
    expect(tapped, lifts(plan)).toBeDefined();
    // The plan's own picks each work a muscle of the day's directly.
    const missing = (workout: GeneratedWorkout) =>
      allEntries(workout.blocks)
        .filter(
          (entry) =>
            !isStopped(entry) &&
            !requireExercise(entry.exerciseId).primaryMuscles.some((muscle) =>
              day.includes(muscle),
            ),
        )
        .map(
          (entry) =>
            `${entry.exerciseId} (${requireExercise(entry.exerciseId).primaryMuscles.join(', ')})`,
        );
    expect(missing(plan), lifts(plan)).toEqual([]);
    const result = recalibrate(request(tap(tapped!.id), plan, spec));
    if (!result.ok) throw new Error(result.error);
    // So does what comes in. Before: "Hammer Curl replaced by Dumbbell Curl for comfort.", "Dumbbell
    // Row replaced by Rear Delt Fly for comfort.", "Protecting your wrist: 1 exercise replaced." (the
    // dumbbell shoulder press).
    expect(missing(result.workout), `${result.summary.headline} ${lifts(result.workout)}`).toEqual(
      [],
    );
    // And none goes to failure: at least the catch-up's 1 in reserve. Before: "dumbbell-curl x2
    // @RIR 0/0", held to no muscle of the day's.
    expect(
      Math.min(
        ...allEntries(result.workout.blocks)
          .flatMap((entry) => entry.sets)
          .filter((set) => set.kind === 'working')
          .map((set) => set.targetRir),
      ),
      lifts(result.workout),
    ).toBeGreaterThanOrEqual(CATCH_UP.MIN_RIR);
  });
});
