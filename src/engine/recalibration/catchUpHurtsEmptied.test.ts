import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { WorkoutSession } from '../../core/state/session';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  RecalibrationRequest,
  RecalibrationResult,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import { allEntries, CATCH_UP_TEMPLATE_IDS, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { dayNoteOf } from '../../features/today/dayNote';
import { at, describeWorkout, profileOf, session } from '../../test/clockDays';

/**
 * Fifteenth review of round M. A catch-up the lifter's changes emptied stays so, and one built
 * afresh "with every lift set aside" stays the catch-up (`emptiedByLifter`, the fourteenth pass).
 * But "Hurts" sets the lift aside and records the sore joint, and `emptiedByLifter` builds the plan
 * again without the lifts set aside only: the joint still rules the lift out, the plan comes back
 * empty, and the day is planned as with nothing behind, the split's own session. At home with
 * dumbbells, a catch-up for the hamstrings has the dumbbell Romanian deadlift; "Hurts" on the lower
 * back leaves it out ("Not one of your training days: nothing more for today."). The lifter then
 * sets a coach focus, and the store builds the preview again (`rebuildPreview`: a fresh plan, then
 * today's choices by a length change): the plan is the push day, a drop set to failure among it, and
 * Today says nothing behind can be caught up today, with no full session to take. (Full session then
 * Catch-up instead gives the same push day today, "The catch-up: no changes needed."; it also meets
 * `validateWorkout` reading the full session's constraints, a finding of its own, so it is not
 * asserted here.) The rules: a catch-up left with no lift has nothing more for today, through any
 * rebuild, and Today says so with the full session a tap away. Synthetic data only.
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [{ muscle: 'hamstrings', sets: 3, minRir: 1, why: 'behind' }],
  sitOut: [],
};
const fresh = (focusMuscle: 'chest' | null = null) =>
  generateWorkout({
    profile: profileOf(),
    location: home,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec, focusMuscle },
  });
const request = (
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  constraints: SessionConstraints,
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
  constraints,
  reason: 'test',
  timestamp: NOW,
});
const succeeded = (result: RecalibrationResult) => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
const noteOf = (workout: GeneratedWorkout, constraints: SessionConstraints) =>
  dayNoteOf({ status: 'preview', constraints, workout } as unknown as WorkoutSession, false);

/** The catch-up, its only lift left out by "Hurts" on the lower back. */
function hurt() {
  const plan = fresh();
  expect(describeWorkout(plan)).toEqual(['dumbbell-romanian-deadlift x3 @RIR 1/1/1']);
  const [rdl] = allEntries(plan.blocks);
  const result = succeeded(
    recalibrate(
      request({ type: 'pain', entryId: rdl!.id, joint: 'lower-back' }, plan, {
        ...emptyConstraints(),
        catchUp: spec,
      }),
    ),
  );
  expect(allEntries(result.workout.blocks)).toEqual([]);
  expect(noteOf(result.workout, result.constraints)?.text).toBe(
    'Not one of your training days: nothing more for today.',
  );
  return result;
}

const expectNothingMore = (
  workout: GeneratedWorkout,
  constraints: SessionConstraints,
  steps: string,
) => {
  const note = noteOf(workout, constraints);
  const detail = `${steps} | ${workout.templateId}: ${describeWorkout(workout).join('; ')} | ${JSON.stringify(note)}`;
  expect(workout.templateId, detail).toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
  expect(allEntries(workout.blocks), detail).toEqual([]);
  expect(note?.text, detail).toBe('Not one of your training days: nothing more for today.');
  expect(note, detail).not.toHaveProperty('action');
};

describe('a catch-up emptied by "Hurts" stays so when it is built whole again', () => {
  it('the preview built again for a coach focus, today’s choices kept', () => {
    const emptied = hurt();
    // As the store's `rebuildPreview`: a fresh plan, then a length change with today's choices.
    const today: SessionConstraints = { ...emptied.constraints, focus: 'chest' };
    const again = succeeded(
      recalibrate(request({ type: 'duration', choice: 'default' }, fresh('chest'), today)),
    );
    // On 3290cd8: the push day, a drop set to failure among it.
    expectNothingMore(again.workout, again.constraints, again.summary.headline);
  });
});
