import { describe, expect, it } from 'vitest';
import { createSession } from '../../core/state/session';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import {
  CATCH_UP_TEMPLATE_IDS,
  allEntries,
  type GeneratedWorkout,
} from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { dayNoteOf } from '../../features/today/dayNote';
import { at, describeWorkout, profileOf, session } from '../../test/clockDays';

/**
 * Maintenance 31 (the fourteenth review of round M): a catch-up the lifter emptied stays so through
 * a length picked, never the split's own day, and Today says nothing more for today. Synthetic data
 * only.
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
/** A home with nothing: the standing calf raise is the only calf lift. */
const [bare] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
  LocationProfile,
];
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [{ muscle: 'calves', sets: 3, minRir: 1, why: 'behind' }],
  sitOut: [],
};
const request = (
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec },
): RecalibrationRequest => ({
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
const succeeded = (result: ReturnType<typeof recalibrate>): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};

describe('a catch-up emptied stays empty through a length picked, the fourteenth review of round M', () => {
  it('"Uncomfortable" on its only lift, then "30 min": nothing more for today, never the split’s day', () => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: bare,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const calf = allEntries(plan.blocks)[0]!;
    expect(calf.exerciseId).toBe('standing-calf-raise');
    const emptied = succeeded(
      recalibrate(request({ type: 'uncomfortable', entryId: calf.id }, plan)),
    );
    expect(allEntries(emptied.workout.blocks)).toEqual([]);
    const shorter = succeeded(
      recalibrate(request({ type: 'duration', choice: 30 }, emptied.workout, emptied.constraints)),
    );
    const today = createSession('key', shorter.workout, NOW);
    const note = dayNoteOf(
      { ...today, constraints: { ...today.constraints, catchUp: spec } },
      false,
    );
    const details = `${shorter.summary.headline} ${lifts(shorter.workout)} | Today: ${note?.text}`;
    // On d361edf: "Recalibrated to 30 min: 1 exercise added. push-up x4 @RIR 2/2/2/2", the split's
    // push day, a muscle not behind given four sets, and Today: "Not one of your training days, and
    // nothing behind this week can be caught up today."
    expect(shorter.workout.templateId, details).toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
    expect(allEntries(shorter.workout.blocks).length, details).toBe(0);
    expect(note?.text, details).toBe('Not one of your training days: nothing more for today.');
  });
});

describe('a catch-up the lifter set aside every lift of, planned afresh, the fourteenth review of round M', () => {
  it('stays the catch-up, nothing more for today, never the split’s own day', () => {
    // As a plan made again from today's choices makes it: the calf raise set aside for comfort.
    const plan = generateWorkout({
      profile: profileOf(),
      location: bare,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec, excludeExerciseIds: ['standing-calf-raise'] },
    });
    expect(plan.templateId, describeWorkout(plan).join('; ')).toBe(
      CATCH_UP_TEMPLATE_IDS['catch-up'],
    );
    expect(allEntries(plan.blocks)).toEqual([]);
    expect(plan.explanation.summary).toBe('Nothing more for today.');
  });
});

describe('a catch-up whose kept pick fits no lift at the next place, the fourteenth review of round M', () => {
  it('the farmer carry swapped in for the shrug, then a bare home: nothing more for today', () => {
    const traps: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [{ muscle: 'traps', sets: 3, minRir: 1, why: 'behind' }],
      sitOut: [],
    };
    const [dumbbells] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['dumbbells'] },
      at(1),
    ) as [LocationProfile];
    const constraints = { ...emptyConstraints(), catchUp: traps };
    const plan = generateWorkout({
      profile: profileOf(),
      location: dumbbells,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: traps },
    });
    const shrug = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'dumbbell-shrug')!;
    expect(shrug, describeWorkout(plan).join('; ')).toBeDefined();
    const base = {
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default' as const,
      profile: profileOf(),
      loading: { missingPlates: [] },
      history: records,
      reason: 'test',
      timestamp: NOW,
    };
    const swapped = recalibrate({
      ...base,
      trigger: { type: 'replace', entryId: shrug.id, exerciseId: 'farmer-carry' },
      workout: plan,
      location: dumbbells,
      constraints,
    });
    if (!swapped.ok) throw new Error(swapped.error);
    // The lifter's pick goes with them; at a home with nothing, no lift for the traps fits.
    const moved = recalibrate({
      ...base,
      trigger: { type: 'location' },
      workout: swapped.workout,
      location: bare,
      constraints: swapped.constraints,
    });
    if (!moved.ok) throw new Error(moved.error);
    expect(moved.workout.templateId, describeWorkout(moved.workout).join('; ')).toBe(
      CATCH_UP_TEMPLATE_IDS['catch-up'],
    );
    expect(allEntries(moved.workout.blocks)).toEqual([]);
  });
});
