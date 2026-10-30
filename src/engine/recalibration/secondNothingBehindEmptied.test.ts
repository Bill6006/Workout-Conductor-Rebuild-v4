import { describe, expect, it } from 'vitest';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { WorkoutSession } from '../../core/state/session';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  RecalibrationResult,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { dayNoteOf } from '../../features/today/dayNote';
import { at, describeWorkout, profileOf, session } from '../../test/clockDays';

/**
 * Sixteenth review of round M. "A lift begun with nothing to come in stops at its sets done; one not
 * begun is left out; a catch-up or second workout left with no lift by the lifter's changes (lifts
 * set aside, joints reported) has nothing more for today ... and Today says so with the full session
 * a tap away." A second workout with nothing behind this week is the usual plan without what was
 * trained today, and an empty one is a state of its own ("You trained today, and nothing is behind
 * this week: nothing more for today.", the full session a tap away: `dayNoteOf`, and the plan's
 * "Nothing more for today."). But `validateWorkout` lets only a catch-up or second workout with
 * muscles to give come to nothing (`catchUpToday(...).muscles.length > 0`), as the fifteenth pass
 * left it: the lifter's own change that leaves this second workout empty is refused with the
 * engine's own check, "The rebuilt workout came back empty, so nothing was changed." The lift the
 * lifter finds uncomfortable stays; "Hurts" is refused the same way and the joint goes unrecorded
 * (the thirteenth review fixed exactly this for a catch-up).
 *
 * At home with dumbbells, after a full-body workout this morning, nothing behind: the second
 * workout is the wrist curl and the dumbbell shrug (the forearms and the traps, untrained today).
 * "Uncomfortable" on the shrug leaves it out; "Uncomfortable" on the wrist curl brings the farmer
 * carry. Then "Uncomfortable", "Hurts" (wrist) or a skip on the farmer carry, not begun, with
 * nothing to come in: refused. Synthetic data only.
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const NOW = at(9, 18);
const profile = profileOf();
// Monday's leg press, and this morning a full-body workout done in full.
const records = [
  session(at(5, 18), [['leg-press', 3]]),
  session(at(9, 9), [
    ['back-squat', 3],
    ['romanian-deadlift', 3],
    ['barbell-bench-press', 3],
    ['barbell-row', 3],
    ['overhead-press', 3],
    ['barbell-curl', 3],
    ['cable-triceps-pushdown', 3],
    ['lateral-raise', 3],
    ['ab-wheel-rollout', 3],
  ]),
];
const sitOut: MuscleId[] = [
  'quads',
  'glutes',
  'hamstrings',
  'chest',
  'triceps',
  'upper-back',
  'lats',
  'front-delts',
  'biceps',
  'side-delts',
  'abs',
];
const spec: CatchUpSpec = { kind: 'second', muscles: [], sitOut };
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ') || '(none)';
const succeeded = (result: RecalibrationResult): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
const noteOf = (workout: GeneratedWorkout, constraints: SessionConstraints) =>
  dayNoteOf({ status: 'preview', constraints, workout } as unknown as WorkoutSession, true);

function apply(
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  constraints: SessionConstraints,
) {
  return recalibrate({
    trigger,
    workout,
    completed: emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: null,
    duration: 'default',
    profile,
    location: home,
    loading: { missingPlates: [] },
    history: records,
    constraints,
    reason: 'test',
    timestamp: NOW,
  });
}

/** The second workout down to the farmer carry alone. */
function downToTheCarry() {
  const plan = generateWorkout({
    profile,
    location: home,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  expect(
    allEntries(plan.blocks).map((entry) => entry.exerciseId),
    lifts(plan),
  ).toEqual(['wrist-curl', 'dumbbell-shrug']);
  let constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec };
  expect(noteOf(plan, constraints)?.text).toBe(
    'You trained today, and nothing is behind this week: what you trained sits out.',
  );
  const [wrist, shrug] = allEntries(plan.blocks);
  const noShrug = succeeded(
    apply({ type: 'uncomfortable', entryId: shrug!.id }, plan, constraints),
  );
  constraints = noShrug.constraints;
  const carried = succeeded(
    apply({ type: 'uncomfortable', entryId: wrist!.id }, noShrug.workout, constraints),
  );
  expect(
    allEntries(carried.workout.blocks).map((entry) => entry.exerciseId),
    lifts(carried.workout),
  ).toEqual(['farmer-carry']);
  return carried;
}

describe('a second workout with nothing behind, emptied by the lifter, has nothing more for today', () => {
  it.each([
    [
      '"Uncomfortable"',
      (entryId: string): RecalibrationTrigger => ({ type: 'uncomfortable', entryId }),
    ],
    [
      '"Hurts" (wrist)',
      (entryId: string): RecalibrationTrigger => ({ type: 'pain', entryId, joint: 'wrist' }),
    ],
    ['a skip', (entryId: string): RecalibrationTrigger => ({ type: 'skip', entryId })],
  ])('%s on its last lift, not begun, with nothing to come in', (_, tap) => {
    const carried = downToTheCarry();
    const [carry] = allEntries(carried.workout.blocks);
    const result = apply(tap(carry!.id), carried.workout, carried.constraints);
    // On 89dfb39: "The rebuilt workout came back empty, so nothing was changed." The farmer carry
    // stays, and for "Hurts" the wrist goes unrecorded.
    expect(result.ok ? 'changed' : result.error).toBe('changed');
    if (!result.ok) return;
    expect(allEntries(result.workout.blocks)).toEqual([]);
    expect(result.workout.explanation.summary).toBe('Nothing more for today.');
    expect(noteOf(result.workout, result.constraints)).toEqual({
      text: 'You trained today, and nothing is behind this week: nothing more for today.',
      action: { label: 'Full session', full: true },
    });
  });
});
