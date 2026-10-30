import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type { RecalibrationRequest, RecalibrationTrigger } from '../../engine/recalibration/types';
import { allEntries, isStopped, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Maintenance 31, the thirteenth review of round M. "Why this workout" names only the muscles a
 * lift of the catch-up went in for (`catchUpLines`: "only the muscles a lift went in for"). A
 * change made in place (a swap the lifter picks, "Uncomfortable" with nothing to come in, a skip)
 * leaves the catch-up's line as the plan was built, naming a muscle no lift works any more; the
 * next rebuild, a length picked, then drops it. The twelfth review counted the same symptom in its
 * finding ("while 'Why this workout' still named the lats"). Synthetic data only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const behind = (...muscles: ('forearms' | 'chest' | 'quads' | 'glutes' | 'hamstrings')[]) =>
  ({
    kind: 'catch-up',
    muscles: muscles.map((muscle) => ({ muscle, sets: 3, minRir: 1, why: 'behind' as const })),
    sitOut: [],
  }) satisfies CatchUpSpec;
const catchUpLine = (workout: GeneratedWorkout) =>
  workout.explanation.reasons.find((line) => line.startsWith('A catch-up for')) ?? '';
/** The day's muscles that a lift still to do works directly. */
const worked = (workout: GeneratedWorkout, spec: CatchUpSpec) =>
  spec.muscles
    .map((item) => item.muscle)
    .filter((muscle) =>
      allEntries(workout.blocks).some(
        (entry) =>
          !isStopped(entry) && requireExercise(entry.exerciseId).primaryMuscles.includes(muscle),
      ),
    );

describe('"Why this workout" names only what the catch-up still works, the thirteenth review of round M', () => {
  it.each([
    [
      'the hammer curl swapped for the cable curl: no lift for the forearms',
      behind('forearms', 'chest'),
      'hammer-curl',
      'forearms',
      (entryId: string): RecalibrationTrigger => ({
        type: 'replace',
        entryId,
        exerciseId: 'cable-curl',
      }),
    ],
    [
      '"Uncomfortable" on the leg curl, nothing to come in: no lift for the hamstrings',
      behind('quads', 'glutes', 'hamstrings'),
      'leg-curl',
      'hamstrings',
      (entryId: string): RecalibrationTrigger => ({ type: 'uncomfortable', entryId }),
    ],
    [
      'the leg curl skipped: no lift for the hamstrings',
      behind('quads', 'glutes', 'hamstrings'),
      'leg-curl',
      'hamstrings',
      (entryId: string): RecalibrationTrigger => ({ type: 'skip', entryId }),
    ],
  ])('%s', (_, spec, tappedId, gone, tap) => {
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
    expect(catchUpLine(plan), lifts(plan)).toContain(gone);
    const request: RecalibrationRequest = {
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
    };
    const result = recalibrate(request);
    if (!result.ok) throw new Error(result.error);
    // No lift still to do works the muscle...
    expect(worked(result.workout, spec), lifts(result.workout)).not.toContain(gone);
    // ... so the line no longer names it, as the next rebuild's line does not. On a9f07f3: "A
    // catch-up for what this week still lacks: forearms and chest, ..." (and "quads, glutes and
    // hamstrings"), until "30 min" rebuilds it.
    expect(
      catchUpLine(result.workout),
      `${result.summary.headline} ${lifts(result.workout)}`,
    ).not.toContain(gone);
  });
});
