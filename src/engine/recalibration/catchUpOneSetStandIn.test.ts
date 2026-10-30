import { describe, expect, it } from 'vitest';
import { CATCH_UP, type CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationResult,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from '../../engine/recalibration/types';
import { allEntries, isStopped, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import {
  at,
  describeWorkout,
  directSets,
  gym,
  profileOf,
  session,
  working,
} from '../../test/clockDays';

/**
 * Maintenance 31 (the twelfth review of round M): what comes in for a lift begun in a catch-up counts the sets
 * the lift has done as given, as the plan's own budget counts a stopped lift's (the eleventh review's
 * `givenBeside` passes over the lift itself). Two of the back squat's three sets done, the quads and
 * the glutes have one set left: no lift takes it (CATCH_UP.MIN_SETS), as the plan's own picks do not.
 * Before: a stand-in with one working set came in, and the next rebuild left it out. Synthetic data
 * only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: (['quads', 'glutes', 'chest'] as const).map((muscle) => ({
    muscle,
    sets: 3,
    minRir: 1,
    why: 'behind' as const,
  })),
  sitOut: [],
};
const succeeded = (result: RecalibrationResult): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
const request = (
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  options: Partial<RecalibrationRequest> = {},
): RecalibrationRequest => ({
  trigger,
  workout,
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
  ...options,
});

describe('what comes in for a lift begun counts its sets done, the twelfth review of round M', () => {
  it.each([
    [
      '"Uncomfortable"',
      (entryId: string): RecalibrationTrigger => ({ type: 'uncomfortable', entryId }),
    ],
    [
      '"Hurts" (knee)',
      (entryId: string): RecalibrationTrigger => ({ type: 'pain', entryId, joint: 'knee' }),
    ],
  ])('two of the back squat’s three sets done, then %s, then "45 min"', (_, tap) => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const squat = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'back-squat');
    expect(squat, lifts(plan)).toBeDefined();
    expect(working(squat!).length, lifts(plan)).toBe(3);
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 600,
      sets: working(squat!)
        .slice(0, 2)
        .map((set, index) => ({
          entryId: squat!.id,
          exerciseId: squat!.exerciseId,
          setIndex: set.index,
          kind: 'working' as const,
          reps: 5,
          weight: set.targetWeight,
          rir: 2,
          completedAt: at(9, 18, index * 4),
        })),
    };
    const tapped = recalibrate(
      request(tap(squat!.id), plan, { completed, currentEntryId: squat!.id }),
    );
    expect(tapped.ok ? 'changed' : tapped.error).toBe('changed');
    const after = succeeded(tapped).workout;
    // No lift still to do takes fewer than two working sets. Before: "back-squat x3 (2 done,
    // stopped); leg-press x1" ("Uncomfortable"), "trap-bar-deadlift x1" ("Hurts").
    expect(
      allEntries(after.blocks)
        .filter((entry) => !isStopped(entry) && working(entry).length < CATCH_UP.MIN_SETS)
        .map((entry) => `${entry.exerciseId} x${working(entry).length}`),
      lifts(after),
    ).toEqual([]);
    expect(directSets(after, 'quads'), lifts(after)).toBeLessThanOrEqual(3);
    // The next rebuild, a length picked, leaves nothing out. Before: "Recalibrated to 45 min with 10
    // min done: 1 exercise removed." ("Left out Leg Press.").
    const shorter = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 45 }, after, {
          completed,
          constraints: succeeded(tapped).constraints,
        }),
      ),
    );
    expect(
      shorter.changes.filter((change) => change.kind === 'removed').map((change) => change.detail),
      `${shorter.summary.headline} ${lifts(after)} -> ${lifts(shorter.workout)}`,
    ).toEqual([]);
  });
});
