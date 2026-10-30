import { describe, expect, it } from 'vitest';
import { CATCH_UP, type CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import { allEntries, isStopped, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Maintenance 31, the thirteenth review of round M. "No lift takes fewer than two working sets (at
 * least two sets an exercise, ACSM 2026): a muscle with one set left waits for the week's own
 * sessions." An end time set on a catch-up fits it with the end time's own floor of one working set
 * a lift (`trimmable`, `hardCap ? 1 : 2`), so the catch-up's lifts come out at a single set each
 * where leaving one out would keep the rest at two. Synthetic data only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: (['chest', 'biceps', 'quads'] as const).map((muscle) => ({
    muscle,
    sets: 3,
    minRir: 1,
    why: 'behind' as const,
  })),
  sitOut: [],
};

describe('an end time keeps a catch-up’s lifts at two working sets, the thirteenth review of round M', () => {
  it('the gym’s catch-up for the chest, the biceps and the quads, to end in 15 minutes', () => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    expect(allEntries(plan.blocks).length, lifts(plan)).toBe(3);
    const result = recalibrate({
      trigger: { type: 'end-by', time: at(9, 18, 15) },
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
    });
    if (!result.ok) throw new Error(result.error);
    // On a9f07f3: "Ends by 6:15 PM: 5 sets trimmed." — "barbell-bench-press x2; back-squat x1;
    // ez-bar-curl x1".
    expect(
      allEntries(result.workout.blocks)
        .filter((entry) => !isStopped(entry) && working(entry).length < CATCH_UP.MIN_SETS)
        .map((entry) => `${entry.exerciseId} x${working(entry).length}`),
      `${result.summary.headline} ${lifts(result.workout)}`,
    ).toEqual([]);
  });
});
