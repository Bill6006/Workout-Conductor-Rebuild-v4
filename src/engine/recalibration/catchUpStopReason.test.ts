import { describe, expect, it } from 'vitest';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { CompletedWork } from './types';
import { allEntries, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Fifteenth review of round M. The fourteenth pass gave "Uncomfortable" a headline of its own for a
 * lift begun with one set left (`oneSetOwed`), but reads the lift after `stopAtLogged` has closed it
 * at its sets done: every set it still has is done, so every lift begun reads as "one set left".
 * In the lower-body catch-up at the gym the back squat gives the glutes their three sets, so nothing
 * can come in for the leg curl (every hinge works the glutes). A set of the leg curl, two still to
 * do, then "Uncomfortable": the lift stops at its set done, and the headline says one set left is
 * too few for another lift to take over. Two sets were left; what stopped it is that no comfortable
 * alternative fits. The rules: a refused change gives its own reason; a lift begun with nothing to
 * come in stops at its sets done. Synthetic data only.
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lower: CatchUpSpec = {
  kind: 'catch-up',
  muscles: (['quads', 'glutes', 'hamstrings'] as const).map((muscle) => ({
    muscle,
    sets: 3,
    minRir: 1,
    why: 'behind' as const,
  })),
  sitOut: [],
};
const setsDone = (entry: WorkoutEntry, count: number): CompletedWork => ({
  ...emptyCompleted(),
  startedAt: NOW,
  elapsedSeconds: 300 * count,
  sets: working(entry)
    .slice(0, count)
    .map((set, index) => ({
      entryId: entry.id,
      exerciseId: entry.exerciseId,
      setIndex: set.index,
      kind: 'working' as const,
      reps: 8,
      weight: set.targetWeight,
      rir: 2,
      completedAt: at(9, 18, index * 4),
    })),
});

describe('"Uncomfortable" on a lift begun says why it stops', () => {
  it('the leg curl, one of its three sets done: two left, and no comfortable alternative fits', () => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: lower },
    });
    const curl = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'leg-curl')!;
    expect(curl, describeWorkout(plan).join('; ')).toBeDefined();
    expect(working(curl).length).toBe(3);
    const completed = setsDone(curl, 1);
    const result = recalibrate({
      trigger: { type: 'uncomfortable', entryId: curl.id },
      workout: plan,
      completed,
      lockedEntryIds: [],
      currentEntryId: curl.id,
      duration: 'default',
      profile: profileOf(),
      location: gym,
      loading: { missingPlates: [] },
      history: records,
      constraints: { ...emptyConstraints(), catchUp: lower },
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    const detail = `${result.summary.headline} | ${describeWorkout(result.workout).join('; ')}`;
    // It stops at its one set done: nothing came in for it.
    expect(describeWorkout(result.workout), detail).toContain('leg-curl x1 @RIR 1');
    // On 3290cd8: "Leg Curl stops at the sets done: one set left is too few for another lift to
    // take over." It had two sets left.
    expect(result.summary.headline, detail).not.toMatch(/one set left/);
    expect(result.summary.headline, detail).toMatch(/no comfortable alternative fits/);
  });
});
