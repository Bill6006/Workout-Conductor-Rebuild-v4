import { describe, expect, it } from 'vitest';
import type { MuscleId } from '../../catalog/muscles/muscles';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { CompletedWork, RecalibrationTrigger } from './types';
import { allEntries, isStopped, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Sixteenth review of round M. What comes in for a lift in a catch-up or a second workout is
 * "never a one-set lift (... a lift begun with one set owed has nothing come in for it, and says
 * so)". A second workout with nothing behind this week is still a second workout (the generator
 * plans it off the plan: no lift to push, no drop set, two sets at least under an end time), but
 * `bestAlternative`, `oneSetOwed` and the stand-in's room read only a day whose offer has muscles.
 *
 * This morning a lat pulldown and barbell curls; nothing is behind: the second workout at the gym is
 * the push day without the biceps' curl. Two of the cable fly's three sets done, "Uncomfortable" on
 * it: "Cable Fly replaced by Pec Deck for comfort.", a pec deck of one set. In a catch-up, or a second
 * workout with muscles behind, a lift so begun stops at its sets done: "one set left is too few for
 * another lift to take over." Synthetic data only.
 */

const NOW = at(9, 18);
const profile = profileOf();
const records = [
  session(at(3, 18), [['leg-press', 3]]),
  session(at(9, 9), [
    ['lat-pulldown', 3],
    ['barbell-curl', 3],
  ]),
];
const sitOut: MuscleId[] = ['lats', 'upper-back', 'biceps'];
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');

describe('a second workout with nothing behind brings in no one-set lift', () => {
  it('the cable fly, two of three sets done, "Uncomfortable"', () => {
    const spec: CatchUpSpec = { kind: 'second', muscles: [], sitOut };
    const workout = generateWorkout({
      profile,
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const fly = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'cable-fly');
    expect(fly, lifts(workout)).toBeDefined();
    const sets = working(fly!);
    expect(sets.length, lifts(workout)).toBe(3);
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 600,
      currentEntryId: fly!.id,
      sets: sets.slice(0, 2).map((set, index) => ({
        entryId: fly!.id,
        exerciseId: fly!.exerciseId,
        setIndex: set.index,
        kind: 'working' as const,
        reps: 10,
        weight: set.targetWeight,
        rir: 2,
        completedAt: at(9, 18, 3 + index * 3),
      })),
    };
    const trigger: RecalibrationTrigger = { type: 'uncomfortable', entryId: fly!.id };
    const result = recalibrate({
      trigger,
      workout,
      completed,
      lockedEntryIds: [],
      currentEntryId: fly!.id,
      duration: 'default',
      profile,
      location: gym,
      loading: { missingPlates: [] },
      history: records,
      constraints: { ...emptyConstraints(), catchUp: spec },
      reason: 'test',
      timestamp: at(9, 18, 12),
    });
    if (!result.ok) throw new Error(result.error);
    const detail = `${result.summary.headline} ${lifts(result.workout)}`;
    // On 89dfb39: "Cable Fly replaced by Pec Deck for comfort." pec-deck x1.
    const oneSet = allEntries(result.workout.blocks).filter(
      (entry) => !isStopped(entry) && working(entry).length < 2,
    );
    expect(
      oneSet.map((entry) => entry.exerciseId),
      detail,
    ).toEqual([]);
    expect(result.summary.headline, detail).toBe(
      'Cable Fly stops at the sets done: one set left is too few for another lift to take over.',
    );
  });
});
