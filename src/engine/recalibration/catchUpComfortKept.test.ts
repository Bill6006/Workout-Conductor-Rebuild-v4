import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { CATCH_UP, type CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type {
  RecalibrationRequest,
  RecalibrationResult,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from '../../engine/recalibration/types';
import {
  CATCH_UP_TEMPLATE_IDS,
  allEntries,
  type GeneratedWorkout,
} from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, directSets, profileOf, session, working } from '../../test/clockDays';

/**
 * Maintenance 31, the thirteenth review of round M. "Uncomfortable" on the dumbbell shrug, the
 * traps' lift in a catch-up at a home with dumbbells, brings in the farmer carry, which works the
 * traps directly (a muscle the lift went in for, with room: as the rules ask). Not begun, it is not
 * kept through a rebuild, and the generator's slot for the traps cannot pick it again: a catch-up's
 * slot looks only at movements whose lifts lead with the muscle (`slotsFor`), and the farmer carry
 * leads with the forearms. So the next rebuild, here "Make it harder", finds no lift for the traps:
 * with the chest beside them it leaves the farmer carry out ("1 exercise removed"); as the
 * catch-up's only lift, the catch-up comes back empty and is planned "as with nothing behind", the
 * split's whole push day, sets to failure and a drop set among it ("4 exercises added, 1 exercise
 * replaced, 1 superset added"). Synthetic data only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const succeeded = (result: RecalibrationResult): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
/** Dumbbells and nothing else. */
const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const behind = (...muscles: ('traps' | 'chest')[]): CatchUpSpec => ({
  kind: 'catch-up',
  muscles: muscles.map((muscle) => ({ muscle, sets: 3, minRir: 1, why: 'behind' as const })),
  sitOut: [],
});
const request = (
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  spec: CatchUpSpec,
  options: Partial<RecalibrationRequest> = {},
): RecalibrationRequest => ({
  trigger,
  workout,
  completed: emptyCompleted(),
  lockedEntryIds: [],
  currentEntryId: null,
  duration: 'default',
  profile: profileOf(),
  location: home,
  loading: { missingPlates: [] },
  history: records,
  constraints: { ...emptyConstraints(), catchUp: spec },
  reason: 'test',
  timestamp: NOW,
  ...options,
});
/**
 * The plan, then "Uncomfortable" on its dumbbell shrug. On a9f07f3: "Dumbbell Shrug replaced by
 * Farmer Carry for comfort." (null if a fix refuses the change, which leaves nothing to rebuild).
 */
const comfortable = (spec: CatchUpSpec): RecalibrationSuccess | null => {
  const plan = generateWorkout({
    profile: profileOf(),
    location: home,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  const shrug = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'dumbbell-shrug');
  expect(shrug, lifts(plan)).toBeDefined();
  const comfort = recalibrate(request({ type: 'uncomfortable', entryId: shrug!.id }, plan, spec));
  return comfort.ok ? comfort : null;
};

describe('what comes in for comfort stays through the next rebuild, the thirteenth review of round M', () => {
  it('the traps and the chest: "Make it harder" leaves nothing out', () => {
    const spec = behind('traps', 'chest');
    const comfort = comfortable(spec);
    if (!comfort) return;
    const harder = succeeded(
      recalibrate(
        request({ type: 'intensity', direction: 'harder' }, comfort.workout, spec, {
          constraints: comfort.constraints,
        }),
      ),
    );
    // On a9f07f3: "Rest of the workout made harder: 1 exercise removed, 1 exercise adjusted."
    // ("Left out Farmer Carry."), the traps with no lift.
    expect(
      harder.changes.filter((change) => change.kind === 'removed').map((change) => change.detail),
      `${harder.summary.headline} ${lifts(harder.workout)}`,
    ).toEqual([]);
    expect(directSets(harder.workout, 'traps'), lifts(harder.workout)).toBeGreaterThan(0);
  });

  it('the traps alone: "Make it harder" keeps the catch-up, with no set to failure', () => {
    const spec = behind('traps');
    const comfort = comfortable(spec);
    if (!comfort) return;
    const harder = succeeded(
      recalibrate(
        request({ type: 'intensity', direction: 'harder' }, comfort.workout, spec, {
          constraints: comfort.constraints,
        }),
      ),
    );
    const details = `${harder.summary.headline} ${lifts(harder.workout)}`;
    // On a9f07f3: "Rest of the workout made harder: 4 exercises added, 1 exercise replaced, 1
    // superset added." — the push day: "push-up x5 @RIR 1; dumbbell-shoulder-press x4 @RIR 0;
    // dumbbell-curl x4 @RIR 0 + drop @RIR 0; overhead-triceps-extension x4 @RIR 0; lateral-raise x4
    // @RIR 0".
    expect(harder.workout.templateId, details).toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
    const sets = allEntries(harder.workout.blocks).flatMap((entry) => entry.sets);
    expect(
      sets.some((set) => set.kind === 'drop'),
      details,
    ).toBe(false);
    expect(
      Math.min(
        ...allEntries(harder.workout.blocks)
          .flatMap(working)
          .map((set) => set.targetRir),
      ),
      details,
    ).toBeGreaterThanOrEqual(CATCH_UP.MIN_RIR);
  });
});
