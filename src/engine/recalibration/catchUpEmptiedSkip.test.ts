import { describe, expect, it } from 'vitest';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import { allEntries, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Maintenance 31 (the fourteenth review of round M): a catch-up its only lift skipped has nothing
 * more for today through every rebuild: no slot takes a lift again. Synthetic data only.
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [{ muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' }],
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
  location: gym,
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

describe('a catch-up its only lift skipped has nothing more through a rebuild, the fourteenth review of round M', () => {
  it.each([
    ['"Make it harder"', { type: 'intensity', direction: 'harder' } as RecalibrationTrigger],
    ['"Make it easier"', { type: 'intensity', direction: 'easier' } as RecalibrationTrigger],
    ['an end time', { type: 'end-by', time: at(9, 19) } as RecalibrationTrigger],
  ])('the lateral raise skipped, then %s', (_, trigger) => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const only = allEntries(plan.blocks);
    expect(only.length, lifts(plan)).toBe(1);
    const skipped = succeeded(recalibrate(request({ type: 'skip', entryId: only[0]!.id }, plan)));
    expect(allEntries(skipped.workout.blocks)).toEqual([]);
    expect(skipped.workout.explanation.summary).toBe('Nothing more for today.');
    const after = succeeded(recalibrate(request(trigger, skipped.workout, skipped.constraints)));
    // On d361edf the rebuild fills the slot again: "1 exercise added", a side-delt lift.
    expect(
      allEntries(after.workout.blocks).map((entry) => entry.exerciseId),
      `${after.summary.headline} ${lifts(after.workout)}`,
    ).toEqual([]);
    expect(after.workout.explanation.summary).toBe('Nothing more for today.');
  });
});
