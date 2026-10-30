import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../../core/state/session';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import {
  allEntries,
  CATCH_UP_TEMPLATE_IDS,
  type DurationChoice,
  type GeneratedWorkout,
} from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { dayNoteOf } from '../../features/today/dayNote';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Sixteenth review of round M. A catch-up the lifter's changes emptied has nothing more for today
 * through any rebuild around it; only a plan built whole for a changed offer reads the new offer.
 * The fifteenth pass let every rebuild of the whole plan skip the emptied plan's guard in `rebuild`
 * (`scope !== 'full'`), so a plain length picked on a plan not begun (no new offer) builds the
 * catch-up again, and any lift for its muscles the lifter did not set aside comes in.
 *
 * At the gym, a catch-up for the side delts has the lateral raise. The lifter skips it: "Nothing
 * more for today." They then pick a length: on 89dfb39 "1 exercise added", a cable lateral raise,
 * and Today says a catch-up is on again. On 3290cd8 the plan stayed empty, as the fourteenth pass's
 * own test asks for every other rebuild. A swap the lifter made before the skip fares worse: the
 * lift swapped away comes straight back (the hammer curl swapped for the wrist curl, the wrist curl
 * skipped, "45 min": the hammer curl again). Synthetic data only.
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ') || '(none)';
const succeeded = (result: ReturnType<typeof recalibrate>): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
const behind = (...muscles: ('side-delts' | 'forearms')[]): CatchUpSpec => ({
  kind: 'catch-up',
  muscles: muscles.map((muscle) => ({ muscle, sets: 3, minRir: 1, why: 'behind' as const })),
  sitOut: [],
});
const request = (
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  constraints: SessionConstraints,
  duration: DurationChoice = 'default',
): RecalibrationRequest => ({
  trigger,
  workout,
  completed: emptyCompleted(),
  lockedEntryIds: [],
  currentEntryId: null,
  duration,
  profile: profileOf(),
  location: gym,
  loading: { missingPlates: [] },
  history: records,
  constraints,
  reason: 'test',
  timestamp: NOW,
});
const noteOf = (workout: GeneratedWorkout, constraints: SessionConstraints) =>
  dayNoteOf({ status: 'preview', constraints, workout } as unknown as WorkoutSession, false);
const plan = (spec: CatchUpSpec) =>
  generateWorkout({
    profile: profileOf(),
    location: gym,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });

const expectNothingMore = (result: RecalibrationSuccess, steps: string) => {
  const note = noteOf(result.workout, result.constraints);
  const detail = `${steps} -> ${result.summary.headline} ${lifts(result.workout)} | ${JSON.stringify(note)}`;
  expect(result.workout.templateId, detail).toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
  expect(
    allEntries(result.workout.blocks).map((entry) => entry.exerciseId),
    detail,
  ).toEqual([]);
  expect(result.workout.explanation.summary, detail).toBe('Nothing more for today.');
  expect(note?.text, detail).toBe('Not one of your training days: nothing more for today.');
};

describe('a catch-up the lifter emptied stays so when a length is picked (no new offer)', () => {
  it.each([[30], [45], [15]] as [DurationChoice][])(
    'the lateral raise skipped, then "%s min"',
    (choice) => {
      const spec = behind('side-delts');
      const workout = plan(spec);
      const only = allEntries(workout.blocks);
      expect(
        only.map((entry) => entry.exerciseId),
        lifts(workout),
      ).toEqual(['lateral-raise']);
      const skipped = succeeded(
        recalibrate(
          request({ type: 'skip', entryId: only[0]!.id }, workout, {
            ...emptyConstraints(),
            catchUp: spec,
          }),
        ),
      );
      expect(allEntries(skipped.workout.blocks)).toEqual([]);
      const length = succeeded(
        recalibrate(
          request({ type: 'duration', choice }, skipped.workout, skipped.constraints, choice),
        ),
      );
      // On 89dfb39: "Recalibrated to N min: 1 exercise added." cable-lateral-raise x3.
      expectNothingMore(length, `skip lateral-raise, ${choice} min`);
    },
  );

  it('the hammer curl swapped for the wrist curl, the wrist curl skipped, then "45 min"', () => {
    const spec = behind('forearms');
    const workout = plan(spec);
    const curl = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'hammer-curl');
    expect(curl, lifts(workout)).toBeDefined();
    const swapped = succeeded(
      recalibrate(
        request({ type: 'replace', entryId: curl!.id, exerciseId: 'wrist-curl' }, workout, {
          ...emptyConstraints(),
          catchUp: spec,
        }),
      ),
    );
    const wrist = allEntries(swapped.workout.blocks).find(
      (entry) => entry.exerciseId === 'wrist-curl',
    );
    expect(wrist, lifts(swapped.workout)).toBeDefined();
    expect(allEntries(swapped.workout.blocks).length, lifts(swapped.workout)).toBe(1);
    const skipped = succeeded(
      recalibrate(
        request({ type: 'skip', entryId: wrist!.id }, swapped.workout, swapped.constraints),
      ),
    );
    expect(allEntries(skipped.workout.blocks)).toEqual([]);
    const length = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 45 }, skipped.workout, skipped.constraints, 45),
      ),
    );
    // On 89dfb39 the hammer curl the lifter swapped away comes back: "1 exercise added".
    expectNothingMore(length, 'hammer-curl -> wrist-curl, skip wrist-curl, 45 min');
  });
});
