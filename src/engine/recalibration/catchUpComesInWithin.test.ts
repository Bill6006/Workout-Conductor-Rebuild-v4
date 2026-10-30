import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type { RecalibrationTrigger } from '../../engine/recalibration/types';
import { allEntries, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, directSets, profileOf, session } from '../../test/clockDays';

/**
 * Maintenance 31 (the twelfth review of round M): what comes in for a lift in a catch-up or a second workout
 * takes no more sets than the day's muscles it works have left, as the plan's own pick would (the
 * fewest left of any muscle it works directly). It kept the sets of the lift it replaced: the
 * Romanian deadlift in for the back squat, the glutes' three sets, gave the hamstrings three for two
 * (in a second workout, three for the two left of this morning's leg curls); the rear-delt fly in
 * for the dumbbell row, the upper back's three, gave the rear delts three for two. Synthetic data
 * only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const lastWeek = [session(at(3, 18), [['barbell-row', 3]])];
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const place = (equipment: string[]) =>
  createDefaultLocations(
    { gymAccess: false, homeEquipment: equipment as never },
    at(1),
  )[0] as LocationProfile;
const short = (three: 'glutes' | 'upper-back', two: 'hamstrings' | 'rear-delts'): CatchUpSpec => ({
  kind: 'catch-up',
  muscles: [
    { muscle: three, sets: 3, minRir: 1, why: 'behind' },
    // Two sets short of its week: two today.
    { muscle: two, sets: 2, minRir: 1, why: 'behind' },
  ],
  sitOut: [],
});
/** Thursday the 10th, 6 pm: leg curls this morning, two sets left of the hamstrings' dose. */
const second: CatchUpSpec = {
  kind: 'second',
  muscles: [
    { muscle: 'glutes', sets: 3, minRir: 1, why: 'behind' },
    { muscle: 'hamstrings', sets: 2, minRir: 3, why: 'remainder' },
  ],
  sitOut: [],
};
const thisMorning = [...lastWeek, session(at(10, 8), [['leg-curl', 2]])];

describe('what comes in for a lift keeps to its muscles’ sets, the twelfth review of round M', () => {
  it.each([
    [
      '"Hurts" (knee) on the back squat, for the glutes: the Romanian deadlift, hamstrings two',
      short('glutes', 'hamstrings'),
      place(['barbell', 'squat-rack']),
      'back-squat',
      (entryId: string): RecalibrationTrigger => ({ type: 'pain', entryId, joint: 'knee' }),
      lastWeek,
      at(9, 18),
    ],
    [
      '"Uncomfortable" on the dumbbell row, for the upper back: the rear-delt fly, rear delts two',
      short('upper-back', 'rear-delts'),
      place(['dumbbells']),
      'dumbbell-row',
      (entryId: string): RecalibrationTrigger => ({ type: 'uncomfortable', entryId }),
      lastWeek,
      at(9, 18),
    ],
    [
      'a second workout, "Hurts" (knee) on the back squat: the hamstrings, trained this morning, two left',
      second,
      place(['barbell', 'squat-rack']),
      'back-squat',
      (entryId: string): RecalibrationTrigger => ({ type: 'pain', entryId, joint: 'knee' }),
      thisMorning,
      at(10, 18),
    ],
  ] as [
    string,
    CatchUpSpec,
    LocationProfile,
    string,
    (id: string) => RecalibrationTrigger,
    WorkoutRecord[],
    string,
  ][])('%s', (_, spec, location, tappedId, tap, history, now) => {
    const plan = generateWorkout({
      profile: profileOf(),
      location,
      history,
      now,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const tapped = allEntries(plan.blocks).find((entry) => entry.exerciseId === tappedId);
    expect(tapped, lifts(plan)).toBeDefined();
    for (const item of spec.muscles) {
      expect(directSets(plan, item.muscle), `${item.muscle}: ${lifts(plan)}`).toBeLessThanOrEqual(
        item.sets,
      );
    }
    const result = recalibrate({
      trigger: tap(tapped!.id),
      workout: plan,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: profileOf(),
      location,
      loading: { missingPlates: [] },
      history,
      constraints: { ...emptyConstraints(), catchUp: spec },
      reason: 'test',
      timestamp: now,
    });
    if (!result.ok) throw new Error(result.error);
    // Before: "romanian-deadlift x3" (hamstrings 3 for 2), "rear-delt-fly x3" (rear delts 3 for 2).
    for (const item of spec.muscles) {
      expect(
        directSets(result.workout, item.muscle),
        `${item.muscle}: ${result.summary.headline} ${lifts(result.workout)}`,
      ).toBeLessThanOrEqual(item.sets);
    }
  });

  it('a lift begun, a ramp done: what comes in after it keeps to its muscles’ sets too', () => {
    const spec = short('glutes', 'hamstrings');
    const location = place(['barbell', 'squat-rack']);
    const plan = generateWorkout({
      profile: profileOf(),
      location,
      history: lastWeek,
      now: at(9, 18),
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const squat = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'back-squat');
    const ramp = squat?.sets.find((set) => set.kind === 'warmup');
    expect(ramp, lifts(plan)).toBeDefined();
    const result = recalibrate({
      trigger: { type: 'pain', entryId: squat!.id, joint: 'knee' },
      workout: plan,
      completed: {
        ...emptyCompleted(),
        startedAt: at(9, 18),
        elapsedSeconds: 120,
        sets: [
          {
            entryId: squat!.id,
            exerciseId: squat!.exerciseId,
            setIndex: ramp!.index,
            kind: 'warmup',
            reps: 5,
            weight: ramp!.targetWeight,
            rir: null,
            completedAt: at(9, 18),
          },
        ],
      },
      lockedEntryIds: [],
      currentEntryId: squat!.id,
      duration: 'default',
      profile: profileOf(),
      location,
      loading: { missingPlates: [] },
      history: lastWeek,
      constraints: { ...emptyConstraints(), catchUp: spec },
      reason: 'test',
      timestamp: at(9, 18),
    });
    if (!result.ok) throw new Error(result.error);
    for (const item of spec.muscles) {
      expect(
        directSets(result.workout, item.muscle),
        `${item.muscle}: ${result.summary.headline} ${lifts(result.workout)}`,
      ).toBeLessThanOrEqual(item.sets);
    }
  });
});
