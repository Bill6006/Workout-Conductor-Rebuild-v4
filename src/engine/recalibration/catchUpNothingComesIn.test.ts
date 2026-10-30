import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationTrigger,
} from '../../engine/recalibration/types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import {
  at,
  describeWorkout,
  directSets,
  gym,
  profileOf,
  session,
  working,
} from '../../test/clockDays';

/**
 * Maintenance 31 (the twelfth review of round M): "Uncomfortable" or "Hurts" on a lift begun, with nothing that
 * can come in for it, ends the lift at its logged sets, as it leaves out a lift not begun. Before: the
 * engine removed the lift, logged sets and all, and refused its own result ("Logged sets for Leg Curl
 * would have been lost, so nothing was changed."), so the lift stayed. The eleventh review's rule
 * (what comes in works no muscle the plan's other lifts have given its sets) makes it happen at the
 * gym: once the back squat has given the glutes their sets, every hinge works them, and nothing comes
 * in for the leg curl. Before the round, at a place with no alternative (a standing calf raise at a
 * bare home). Synthetic data only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const records = [session(at(3, 18), [['barbell-row', 3]])];
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
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
/** One working set of the entry done, five minutes in. */
const oneSetOf = (entry: WorkoutEntry, now: string): CompletedWork => {
  const set = working(entry)[0]!;
  return {
    ...emptyCompleted(),
    startedAt: now,
    elapsedSeconds: 300,
    sets: [
      {
        entryId: entry.id,
        exerciseId: entry.exerciseId,
        setIndex: set.index,
        kind: 'working',
        reps: 10,
        weight: set.targetWeight,
        rir: 2,
        completedAt: now,
      },
    ],
  };
};
const request = (
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  options: Partial<RecalibrationRequest>,
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
  constraints: emptyConstraints(),
  reason: 'test',
  timestamp: at(9, 18),
  ...options,
});
/** The entry's working sets still to do. */
const toDo = (workout: GeneratedWorkout, entry: WorkoutEntry, completed: CompletedWork) => {
  const now = allEntries(workout.blocks).find((candidate) => candidate.id === entry.id);
  return (now ? working(now) : []).filter(
    (set) =>
      !completed.sets.some((done) => done.entryId === entry.id && done.setIndex === set.index),
  ).length;
};

describe('nothing to come in for a lift begun ends it at its logged sets, the twelfth review of round M', () => {
  it.each([
    [
      '"Uncomfortable"',
      (entryId: string): RecalibrationTrigger => ({ type: 'uncomfortable', entryId }),
    ],
    [
      '"Hurts" (knee)',
      (entryId: string): RecalibrationTrigger => ({ type: 'pain', entryId, joint: 'knee' }),
    ],
  ])('a lower-body catch-up at the gym: a set of the leg curl, then %s', (_, tap) => {
    const NOW = at(9, 18);
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: lower },
    });
    const curl = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'leg-curl');
    expect(curl, lifts(plan)).toBeDefined();
    expect(directSets(plan, 'glutes'), lifts(plan)).toBe(3);
    const completed = oneSetOf(curl!, NOW);
    const result = recalibrate(
      request(tap(curl!.id), plan, {
        completed,
        currentEntryId: curl!.id,
        constraints: { ...emptyConstraints(), catchUp: lower },
      }),
    );
    // Before: "Logged sets for Leg Curl would have been lost, so nothing was changed." (and before the
    // eleventh review, the dumbbell Romanian deadlift came in: the glutes five sets for three).
    expect(result.ok ? 'changed' : result.error).toBe('changed');
    if (!result.ok) return;
    expect(toDo(result.workout, curl!, completed), lifts(result.workout)).toBe(0);
    expect(directSets(result.workout, 'glutes'), lifts(result.workout)).toBeLessThanOrEqual(3);
  });

  it('before the round: a set of the standing calf raise at a bare home, then "Uncomfortable"', () => {
    const NOW = at(10, 18);
    const [bare] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
      LocationProfile,
    ];
    const plan = generateWorkout({
      profile: profileOf(),
      location: bare,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'lower' },
    });
    const calf = allEntries(plan.blocks).find(
      (entry) => entry.exerciseId === 'standing-calf-raise',
    );
    expect(calf, lifts(plan)).toBeDefined();
    const completed = oneSetOf(calf!, NOW);
    const result = recalibrate(
      request({ type: 'uncomfortable', entryId: calf!.id }, plan, {
        completed,
        currentEntryId: calf!.id,
        location: bare,
        timestamp: NOW,
      }),
    );
    // Before: "Logged sets for Standing Calf Raise would have been lost, so nothing was changed."
    expect(result.ok ? 'changed' : result.error).toBe('changed');
    if (!result.ok) return;
    expect(toDo(result.workout, calf!, completed), lifts(result.workout)).toBe(0);
  });
});
