import { describe, expect, it } from 'vitest';
import { createSession } from '../../core/state/session';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type {
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from '../../engine/recalibration/types';
import {
  CATCH_UP_TEMPLATE_IDS,
  allEntries,
  type GeneratedWorkout,
} from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, profileOf, session } from '../../test/clockDays';
import { dayNoteOf } from './dayNote';

/**
 * Maintenance 31 (the thirteenth review of round M): a catch-up the lifter's changes empty, its only
 * lift left out for comfort, is a plan of its own with nothing more for today, as a second workout
 * with nothing to give is. Today says so, the full session a tap away, and the next rebuild keeps
 * the catch-up empty rather than planning the split's own day. Synthetic data only.
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
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

describe('a catch-up its only lift left, the thirteenth review of round M', () => {
  const emptied = () => {
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
    return succeeded(recalibrate(request({ type: 'uncomfortable', entryId: calf.id }, plan)));
  };

  it('"Uncomfortable" on its only lift: nothing more for today, and Today says so', () => {
    const result = emptied();
    expect(allEntries(result.workout.blocks)).toEqual([]);
    expect(result.workout.templateId).toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
    expect(result.workout.explanation.summary).toBe('Nothing more for today.');
    const today = createSession('key', result.workout, NOW);
    expect(
      dayNoteOf({ ...today, constraints: { ...today.constraints, catchUp: spec } }, false),
    ).toEqual({
      text: 'Not one of your training days: nothing more for today.',
      action: { label: 'Full session', full: true },
    });
  });

  it('"Make it harder" after it keeps the catch-up, empty, never the split’s own day', () => {
    const result = emptied();
    const harder = succeeded(
      recalibrate(
        request({ type: 'intensity', direction: 'harder' }, result.workout, result.constraints),
      ),
    );
    expect(allEntries(harder.workout.blocks)).toEqual([]);
    expect(harder.workout.templateId).toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
    expect(harder.workout.title).toBe('Catch-up');
    expect(harder.workout.explanation.summary).toBe('Nothing more for today.');
  });
});
