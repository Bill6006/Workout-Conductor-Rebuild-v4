import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  CompletedWork,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import { allEntries, isStopped, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import {
  at,
  describeWorkout,
  gym as gymOrNone,
  profileOf,
  session,
  working,
} from '../../test/clockDays';

/**
 * Fifteenth review of round M. A lift stopped earlier, swapped back to, picks up the sets the lift in
 * its place still owed, within what its muscles have left beside the plan's other lifts, its own
 * sets done counted, as what stands in keeps to it. A catch-up for the front delts and the triceps,
 * the triceps lacking four: a set of the shoulder press, then the Arnold press, then "Make it
 * easier" gives the triceps a lift of their own for two of their three sets left. Swapped back, the
 * press takes one set, not the Arnold press's two. Synthetic data only.
 */

const gym = gymOrNone as LocationProfile;
const NOW = at(9, 18);
const profile = profileOf();
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const succeeded = (result: ReturnType<typeof recalibrate>): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
/** A muscle's working sets from lifts that work it directly: a stopped lift's sets done. */
const given = (workout: GeneratedWorkout, completed: CompletedWork, muscle: string) =>
  allEntries(workout.blocks)
    .filter((entry) => requireExercise(entry.exerciseId).primaryMuscles.includes(muscle as never))
    .reduce(
      (sum, entry) =>
        sum +
        working(entry).filter(
          (set) =>
            !isStopped(entry) ||
            completed.sets.some((done) => done.entryId === entry.id && done.setIndex === set.index),
        ).length,
      0,
    );

const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [
    { muscle: 'front-delts', sets: 3, minRir: 1, why: 'behind' },
    { muscle: 'triceps', sets: 4, minRir: 1, why: 'behind' },
  ],
  sitOut: [],
};
const records = [session(at(3, 18), [['barbell-row', 3]])];

describe('a swap back picks up no more than its muscles have left', () => {
  it('the triceps lacking four, one set left beside the pushdowns: the press takes one set back', () => {
    let workout = generateWorkout({
      profile,
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    let constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec };
    const press = allEntries(workout.blocks)[0]!;
    expect(press.exerciseId, lifts(workout)).toBe('dumbbell-shoulder-press');
    const first = working(press)[0]!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 300,
      currentEntryId: press.id,
      sets: [
        {
          entryId: press.id,
          exerciseId: press.exerciseId,
          setIndex: first.index,
          kind: 'working',
          reps: 8,
          weight: first.targetWeight,
          rir: 2,
          completedAt: at(9, 18, 5),
        },
      ],
    };
    const run = (trigger: RecalibrationTrigger) => {
      const result = succeeded(
        recalibrate({
          trigger,
          workout,
          completed,
          lockedEntryIds: [],
          currentEntryId: completed.currentEntryId,
          duration: 'default',
          profile,
          location: gym,
          loading: { missingPlates: [] },
          history: records,
          constraints,
          reason: 'test',
          timestamp: at(9, 18, 10),
        }),
      );
      workout = result.workout;
      constraints = result.constraints;
      return result;
    };
    run({ type: 'replace', entryId: press.id, exerciseId: 'arnold-press' });
    // "Make it easier": the triceps take a lift of their own for two of their three sets left.
    run({ type: 'intensity', direction: 'easier' });
    const before = lifts(workout);
    expect(given(workout, completed, 'triceps'), before).toBe(3);
    const arnold = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'arnold-press')!;
    expect(working(arnold).length, before).toBe(2);
    const back = run({
      type: 'replace',
      entryId: arnold.id,
      exerciseId: 'dumbbell-shoulder-press',
    });
    const detail = `${before} -> ${back.summary.headline} ${lifts(back.workout)}`;
    // One set left for the triceps: the press picks up one set, never the Arnold press's two.
    expect(given(back.workout, completed, 'triceps'), detail).toBe(4);
    const again = allEntries(back.workout.blocks).find(
      (entry) => entry.exerciseId === 'dumbbell-shoulder-press' && !isStopped(entry),
    );
    expect(again && working(again).length, detail).toBe(2);
  });
});
