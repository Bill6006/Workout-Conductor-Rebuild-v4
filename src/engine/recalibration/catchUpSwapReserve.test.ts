import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { CATCH_UP, type CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type { RecalibrationRequest } from '../../engine/recalibration/types';
import { allEntries, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, profileOf, session, working } from '../../test/clockDays';

/**
 * Maintenance 31 (the twelfth review of round M): a swap in a catch-up keeps the catch-up's reserve whatever
 * lift comes in (the second review: "a swap ... keeps a catch-up's sets and reserve"; no set to
 * failure, at least 1 in reserve, 2 for a beginner). The hold reads the muscles of the lift that comes
 * in (`heldShift`, `catchUpHold`), so a lift for none of the day's muscles, which the swap sheet
 * offers, takes its own reserve, and "Make it harder" or a check-in after it plans it from its own
 * reserve too. Before: the dumbbell curl in for the hammer curl (the forearms' lift) at 0 in reserve,
 * a set to failure, for a beginner too. Synthetic data only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
/** Dumbbells and nothing else. */
const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];

describe('a swap keeps the catch-up’s reserve, the twelfth review of round M', () => {
  it.each([
    ['an intermediate', 'intermediate' as const, CATCH_UP.MIN_RIR],
    ['a beginner', 'beginner' as const, CATCH_UP.BEGINNER_MIN_RIR],
  ])('%s swaps the hammer curl, for the forearms, for a dumbbell curl', (_, experience, minRir) => {
    const profile = profileOf({ experience });
    const sets = experience === 'beginner' ? CATCH_UP.BEGINNER_SETS : CATCH_UP.SETS;
    const spec: CatchUpSpec = {
      kind: 'catch-up',
      muscles: (['forearms', 'chest'] as const).map((muscle) => ({
        muscle,
        sets,
        minRir,
        why: 'behind' as const,
      })),
      sitOut: [],
    };
    const plan = generateWorkout({
      profile,
      location: home,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const hammer = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'hammer-curl');
    expect(hammer, lifts(plan)).toBeDefined();
    expect(
      Math.min(...working(hammer!).map((set) => set.targetRir)),
      lifts(plan),
    ).toBeGreaterThanOrEqual(minRir);
    const request: RecalibrationRequest = {
      trigger: { type: 'replace', entryId: hammer!.id, exerciseId: 'dumbbell-curl' },
      workout: plan,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile,
      location: home,
      loading: { missingPlates: [] },
      history: records,
      constraints: { ...emptyConstraints(), catchUp: spec },
      reason: 'test',
      timestamp: NOW,
    };
    const result = recalibrate(request);
    if (!result.ok) throw new Error(result.error);
    const curl = allEntries(result.workout.blocks).find(
      (entry) => entry.exerciseId === 'dumbbell-curl',
    );
    expect(curl, lifts(result.workout)).toBeDefined();
    // Before: "dumbbell-curl x2 @RIR 0/0", an intermediate's and a beginner's alike.
    expect(
      Math.min(...working(curl!).map((set) => set.targetRir)),
      lifts(result.workout),
    ).toBeGreaterThanOrEqual(minRir);
    // And "Make it harder" after it takes the curl no lower than the catch-up's reserve, as it
    // holds every lift of the day (the second review).
    const harder = recalibrate({
      ...request,
      trigger: { type: 'intensity', direction: 'harder' },
      workout: result.workout,
      constraints: result.constraints,
    });
    if (!harder.ok) throw new Error(harder.error);
    const after = allEntries(harder.workout.blocks).find(
      (entry) => entry.exerciseId === 'dumbbell-curl',
    );
    expect(
      Math.min(...working(after!).map((set) => set.targetRir)),
      `${harder.summary.headline} ${lifts(harder.workout)}`,
    ).toBeGreaterThanOrEqual(minRir);
  });
});
