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
 * Sixteenth review of round M. A catch-up left with no lift by the lifter's changes (lifts set
 * aside, joints reported) has nothing more for today through any rebuild around it. The fifteenth
 * pass made `emptiedByLifter` build the plan again with today's reported joints set aside too, but
 * it still returns false at once when no lift was set aside (`excludeExerciseIds` empty). A joint
 * reported in the check-in sets no lift aside: it only records the joint (`painJoints`).
 *
 * At home with dumbbells, a catch-up for the hamstrings has the dumbbell Romanian deadlift. The
 * lifter checks in with lower-back discomfort: the deadlift is ruled out, "Not one of your training
 * days: nothing more for today." They then set a coach focus, and the store builds the preview
 * again (`rebuildPreview`: a fresh plan, then today's choices, the check-in among them, by a length
 * change). The catch-up comes back empty, `emptiedByLifter` says the lifter did not empty it, and
 * the day is planned as with nothing behind: the split's push day, a drop set to failure among it,
 * and Today says nothing behind can be caught up today, with no full session to take. So too the
 * way back from the full session, "Catch-up instead" ("The catch-up: no changes needed.", the push
 * day). The same steps with "Hurts" on the lower back in place of the check-in stay the empty
 * catch-up (the fifteenth pass's own tests). Synthetic data only.
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

/** The catch-up, its only lift ruled out by a check-in with lower-back discomfort. */
function checkedIn() {
  const plan = fresh();
  expect(describeWorkout(plan)).toEqual(['dumbbell-romanian-deadlift x3 @RIR 1/1/1']);
  const result = succeeded(
    recalibrate(
      request(
        {
          type: 'readiness',
          readiness: {
            energy: 4,
            soreness: 2,
            sleep: 4,
            motivation: 4,
            jointDiscomfort: ['lower-back'],
            timePressure: false,
          },
        },
        plan,
        { ...emptyConstraints(), catchUp: spec },
      ),
    ),
  );
  expect(allEntries(result.workout.blocks)).toEqual([]);
  expect(result.constraints.avoidExerciseIds).toEqual([]);
  expect(noteOf(result.workout, result.constraints)?.text).toBe(
    'Not one of your training days: nothing more for today.',
  );
  return result;
}

describe('a catch-up emptied by a joint reported in the check-in stays so when built whole again', () => {
  it('the preview built again for a coach focus, today’s check-in kept', () => {
    const emptied = checkedIn();
    // As the store's `rebuildPreview`: a fresh plan, then a length change with today's choices.
    const today: SessionConstraints = { ...emptied.constraints, focus: 'chest' };
    const again = succeeded(
      recalibrate(request({ type: 'duration', choice: 'default' }, fresh('chest'), today)),
    );
    const note = noteOf(again.workout, again.constraints);
    const detail = `${again.summary.headline} | ${again.workout.templateId}: ${describeWorkout(again.workout).join('; ')} | ${JSON.stringify(note)}`;
    // On 89dfb39: the push day, "dumbbell-curl x2 @RIR 1/1 + drop @RIR 0" among it.
    expect(again.workout.templateId, detail).toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
    expect(allEntries(again.workout.blocks), detail).toEqual([]);
    expect(note?.text, detail).toBe('Not one of your training days: nothing more for today.');
    expect(note, detail).not.toHaveProperty('action');
  });

  it('the full session taken, then "Catch-up instead": the way back is the catch-up again', () => {
    const emptied = checkedIn();
    const full = succeeded(
      recalibrate(
        request(
          { type: 'session-kind', full: true, kind: 'catch-up' },
          emptied.workout,
          emptied.constraints,
        ),
      ),
    );
    expect(full.constraints.fullSession).toBe(true);
    const back = succeeded(
      recalibrate(
        request(
          { type: 'session-kind', full: false, kind: 'catch-up' },
          full.workout,
          full.constraints,
        ),
      ),
    );
    const note = noteOf(back.workout, back.constraints);
    const detail = `${back.summary.headline} | ${back.workout.templateId}: ${describeWorkout(back.workout).join('; ')} | ${JSON.stringify(note)}`;
    // On 89dfb39: "The catch-up: no changes needed." The push day stays, a drop set to failure
    // among it, and Today says nothing behind can be caught up, with no full session to take.
    expect(back.workout.templateId, detail).toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
    expect(allEntries(back.workout.blocks), detail).toEqual([]);
    expect(note?.text, detail).toBe('Not one of your training days: nothing more for today.');
  });
});
