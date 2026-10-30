import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { WorkoutSession } from '../../core/state/session';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { RecalibrationResult, RecalibrationTrigger, SessionConstraints } from './types';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { dayNoteOf } from '../../features/today/dayNote';
import { at, describeWorkout, profileOf, session } from '../../test/clockDays';

/**
 * Fifteenth review of round M. A catch-up or a second workout the lifter emptied has nothing more
 * for today, the full session a tap away; the fourteenth pass made one planned afresh with every
 * lift set aside stay the catch-up (`emptiedByLifter`). But `validateWorkout` reads the request's
 * constraints, the full session's (`fullSession` still true), so the way back from the full session
 * is refused as an empty workout. At a bare home the calves' only lift is the standing calf raise:
 * the lifter skips it ("Not one of your training days: nothing more for today."), taps Full session
 * to look, then Catch-up instead: "The rebuilt workout came back empty, so nothing was changed." The
 * full session stays, and Today goes on offering "Catch-up instead", which can never go through.
 * Likewise "Go easy instead" on a second workout. Synthetic data only.
 */

const [bare] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
  LocationProfile,
];
const NOW = at(9, 18);
const calves = (kind: CatchUpSpec['kind']): CatchUpSpec => ({
  kind,
  muscles: [{ muscle: 'calves', sets: 3, minRir: 1, why: 'behind' }],
  sitOut: kind === 'second' ? ['chest', 'triceps'] : [],
});

function emptiedThenBack(spec: CatchUpSpec, records: WorkoutRecord[]) {
  let workout: GeneratedWorkout = generateWorkout({
    profile: profileOf(),
    location: bare,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  let constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec };
  const steps: string[] = [describeWorkout(workout).join('; ')];
  const run = (trigger: RecalibrationTrigger): RecalibrationResult => {
    const result = recalibrate({
      trigger,
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: profileOf(),
      location: bare,
      loading: { missingPlates: [] },
      history: records,
      constraints,
      reason: 'test',
      timestamp: NOW,
    });
    steps.push(
      result.ok
        ? `${trigger.type}: ${result.summary.headline} ${describeWorkout(result.workout).join('; ')}`
        : `${trigger.type} refused: ${result.error}`,
    );
    if (result.ok) {
      workout = result.workout;
      constraints = result.constraints;
    }
    return result;
  };
  expect(describeWorkout(workout)).toEqual(['standing-calf-raise x3 @RIR 1/1/1']);
  const [raise] = allEntries(workout.blocks);
  expect(run({ type: 'skip', entryId: raise!.id }).ok, steps.join(' | ')).toBe(true);
  expect(allEntries(workout.blocks), steps.join(' | ')).toEqual([]);
  expect(run({ type: 'session-kind', full: true, kind: spec.kind }).ok, steps.join(' | ')).toBe(
    true,
  );
  const back = run({ type: 'session-kind', full: false, kind: spec.kind });
  return { back, steps, workout, constraints };
}

describe('back from the full session to a catch-up or second workout the lifter emptied', () => {
  it('a catch-up for the calves at a bare home: the standing calf raise skipped, Full session, Catch-up instead', () => {
    const { back, steps, workout, constraints } = emptiedThenBack(calves('catch-up'), [
      session(at(3, 18), [['barbell-row', 3]]),
    ]);
    // On 3290cd8: "The rebuilt workout came back empty, so nothing was changed."
    expect(back.ok ? 'taken' : back.error, steps.join(' | ')).toBe('taken');
    expect(allEntries(workout.blocks), steps.join(' | ')).toEqual([]);
    const note = dayNoteOf(
      { status: 'preview', constraints, workout } as unknown as WorkoutSession,
      false,
    );
    expect(note?.text).toBe('Not one of your training days: nothing more for today.');
    expect(note?.action?.full).toBe(true);
  });

  it('a second workout, the calves missed, at a bare home: the calf raise skipped, Full session, Go easy instead', () => {
    const { back, steps } = emptiedThenBack(calves('second'), [
      session(at(3, 18), [['barbell-row', 3]]),
      session(at(9, 9), [['diamond-push-up', 3]]),
    ]);
    // On 3290cd8: "The rebuilt workout came back empty, so nothing was changed."
    expect(back.ok ? 'taken' : back.error, steps.join(' | ')).toBe('taken');
  });
});
