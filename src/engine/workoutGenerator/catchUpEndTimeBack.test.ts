import { describe, expect, it } from 'vitest';
import { CATCH_UP, type CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import { allEntries, isStopped, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from './generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Maintenance 31 (the fourteenth review of round M): an end time keeps every lift of a catch-up at
 * two working sets, a lift brought back on its own after one is left out too. Synthetic data only.
 */

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

describe('an end time brings back no lift at one set in a catch-up, the fourteenth review of round M', () => {
  const plan = generateWorkout({
    profile: profileOf(),
    location: gym,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  it.each(Array.from({ length: 33 }, (_, index) => index + 8))(
    'to end in %i minutes',
    (minutes) => {
      const result = recalibrate({
        trigger: { type: 'end-by', time: at(9, 18, minutes) },
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
      expect(
        allEntries(result.workout.blocks)
          .filter((entry) => !isStopped(entry) && working(entry).length < CATCH_UP.MIN_SETS)
          .map((entry) => `${entry.exerciseId} x${working(entry).length}`),
        `${result.summary.headline} ${result.workout.explanation.fittingSteps.join(' ')} ${lifts(result.workout)}`,
      ).toEqual([]);
    },
  );
});
