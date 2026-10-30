import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { CATCH_UP, type CatchUpSpec } from '../../engine/planning/catchUp';
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
import {
  allEntries,
  isStopped,
  type GeneratedWorkout,
  type WorkoutEntry,
} from '../../engine/workout/types';
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
 * Maintenance 31, the thirteenth review of round M. No lift in a catch-up takes fewer than two
 * working sets (ACSM 2026, CATCH_UP.MIN_SETS): "never a one-set stand-in". The twelfth review
 * stopped the one-set stand-in only where the muscle itself has one set left (its sets done
 * counted). Where the lift owes one set but its muscle has two or more left, a stand-in still comes
 * in for the one set owed: the squat the quads (three short) and the glutes (two short) share takes
 * the glutes' two sets; one done, the hack squat or the leg extension comes in for the quads with
 * one working set ("Uncomfortable", "Hurts"), and so does the front squat the generator plans where
 * the squat cannot go on (a change of place). The next rebuild keeps it. Synthetic data only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
/** The quads three sets short, the glutes two (CatchUpSpec gives a muscle what it is short). */
const spec = (third: 'chest' | 'hamstrings'): CatchUpSpec => ({
  kind: 'catch-up',
  muscles: [
    { muscle: 'quads', sets: 3, minRir: 1, why: 'behind' },
    { muscle: 'glutes', sets: 2, minRir: 1, why: 'behind' },
    { muscle: third, sets: 3, minRir: 1, why: 'behind' },
  ],
  sitOut: [],
});
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
  timestamp: NOW,
  ...options,
});
const oneSetOf = (entry: WorkoutEntry): CompletedWork => {
  const set = working(entry)[0]!;
  return {
    ...emptyCompleted(),
    startedAt: NOW,
    elapsedSeconds: 300,
    sets: [
      {
        entryId: entry.id,
        exerciseId: entry.exerciseId,
        setIndex: set.index,
        kind: 'working',
        reps: 8,
        weight: set.targetWeight,
        rir: 2,
        completedAt: NOW,
      },
    ],
  };
};
/** Every lift still to do with fewer than two working sets. */
const oneSetLifts = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks)
    .filter((entry) => !isStopped(entry) && working(entry).length < CATCH_UP.MIN_SETS)
    .map((entry) => `${entry.exerciseId} x${working(entry).length}`);

describe('no one-set stand-in where the lift owes one set, the thirteenth review of round M', () => {
  it.each([
    [
      '"Uncomfortable"',
      (entryId: string): RecalibrationTrigger => ({ type: 'uncomfortable', entryId }),
    ],
    [
      '"Hurts" (knee)',
      (entryId: string): RecalibrationTrigger => ({ type: 'pain', entryId, joint: 'knee' }),
    ],
  ])('at the gym, the back squat for the quads and the glutes, a set done, then %s', (_, tap) => {
    const day = spec('chest');
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: day },
    });
    const squat = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'back-squat');
    expect(squat, lifts(plan)).toBeDefined();
    // The squat takes the glutes' two sets.
    expect(working(squat!).length, lifts(plan)).toBe(2);
    const completed = oneSetOf(squat!);
    const result = recalibrate(
      request(tap(squat!.id), plan, {
        completed,
        currentEntryId: squat!.id,
        constraints: { ...emptyConstraints(), catchUp: day },
      }),
    );
    if (!result.ok) throw new Error(result.error);
    // On a9f07f3: "back-squat x1 (stopped); hack-squat x1" ("Uncomfortable"), "leg-extension x1"
    // ("Hurts").
    expect(
      oneSetLifts(result.workout),
      `${result.summary.headline} ${lifts(result.workout)}`,
    ).toEqual([]);
    expect(directSets(result.workout, 'quads'), lifts(result.workout)).toBeLessThanOrEqual(3);
    // Nor after the next rebuild, a length picked.
    const shorter = recalibrate(
      request({ type: 'duration', choice: 30 }, result.workout, {
        completed,
        constraints: result.constraints,
      }),
    );
    if (!shorter.ok) throw new Error(shorter.error);
    expect(oneSetLifts(shorter.workout), lifts(shorter.workout)).toEqual([]);
  });

  it('at home, the goblet squat for the quads and the glutes, a set done, then a place with a rack', () => {
    const day = spec('hamstrings');
    const [dumbbells] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['dumbbells'] },
      at(1),
    ) as [LocationProfile];
    const [rack] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['barbell', 'squat-rack'] },
      at(1),
    ) as [LocationProfile];
    const plan = generateWorkout({
      profile: profileOf(),
      location: dumbbells,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: day },
    });
    const squat = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'goblet-squat');
    expect(squat, lifts(plan)).toBeDefined();
    expect(working(squat!).length, lifts(plan)).toBe(2);
    const completed = oneSetOf(squat!);
    const result = recalibrate(
      request({ type: 'location' }, plan, {
        completed,
        location: rack,
        constraints: { ...emptyConstraints(), catchUp: day },
      }),
    );
    if (!result.ok) throw new Error(result.error);
    // On a9f07f3: "goblet-squat x1 (stopped); front-squat x1".
    expect(
      oneSetLifts(result.workout),
      `${result.summary.headline} ${lifts(result.workout)}`,
    ).toEqual([]);
  });
});

describe('the lifter’s swap of a lift with one set owed, the thirteenth review of round M', () => {
  it('the back squat for the quads and the glutes, a set done, swapped for the leg extension: refused', () => {
    const day = spec('chest');
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: day },
    });
    const squat = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'back-squat')!;
    expect(working(squat).length, lifts(plan)).toBe(2);
    const completed = oneSetOf(squat);
    // The quads have two sets left beside the set done: only the one set owed stands in the way.
    const result = recalibrate(
      request({ type: 'replace', entryId: squat.id, exerciseId: 'leg-extension' }, plan, {
        completed,
        currentEntryId: squat.id,
        constraints: { ...emptyConstraints(), catchUp: day },
      }),
    );
    expect(result.ok ? lifts(result.workout) : result.error).toBe(
      'Back Squat has one set left, too few for another lift to take over, so nothing was changed.',
    );
  });
});
