import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { CATCH_UP, type CatchUpSpec } from '../../engine/planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  RecalibrationRequest,
  RecalibrationResult,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from './types';
import {
  CATCH_UP_TEMPLATE_IDS,
  allEntries,
  type GeneratedWorkout,
} from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, directSets, profileOf, session, working } from '../../test/clockDays';

/**
 * Maintenance 31 (the fourteenth review of round M): what comes in for a lift in a catch-up, for
 * comfort or pain, stays through every rebuild, a length picked on a plan not begun too: the plan's
 * scope keeps it as it keeps the lifter's pick, and nothing goes to failure off the plan. Synthetic
 * data only.
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const succeeded = (result: RecalibrationResult): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
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
const comfortable = (spec: CatchUpSpec): RecalibrationSuccess => {
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
  const comfort = succeeded(
    recalibrate(request({ type: 'uncomfortable', entryId: shrug!.id }, plan, spec)),
  );
  expect(
    allEntries(comfort.workout.blocks).some((entry) => entry.exerciseId === 'farmer-carry'),
    lifts(comfort.workout),
  ).toBe(true);
  return comfort;
};

describe('what comes in for comfort stays through a length picked, the fourteenth review of round M', () => {
  it('the traps and the chest: "45 min", the catch-up’s own length, leaves the farmer carry in', () => {
    const spec = behind('traps', 'chest');
    const comfort = comfortable(spec);
    const shorter = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 45 }, comfort.workout, spec, {
          constraints: comfort.constraints,
        }),
      ),
    );
    const details = `${shorter.summary.headline} ${shorter.summary.details.join(' ')} ${lifts(shorter.workout)}`;
    // The farmer carry stays, and the traps keep their lift.
    expect(
      allEntries(shorter.workout.blocks).some((entry) => entry.exerciseId === 'farmer-carry'),
      details,
    ).toBe(true);
    expect(directSets(shorter.workout, 'traps'), details).toBeGreaterThan(0);
  });

  it('the traps alone: "30 min" keeps the catch-up, nothing to failure', () => {
    const spec = behind('traps');
    const comfort = comfortable(spec);
    const length = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 30 }, comfort.workout, spec, {
          constraints: comfort.constraints,
        }),
      ),
    );
    const details = `${length.summary.headline} ${lifts(length.workout)}`;
    expect(length.workout.templateId, details).toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
    const sets = allEntries(length.workout.blocks).flatMap((entry) => entry.sets);
    expect(
      sets.some((set) => set.kind === 'drop'),
      details,
    ).toBe(false);
    expect(
      Math.min(
        Infinity,
        ...allEntries(length.workout.blocks)
          .flatMap(working)
          .map((set) => set.targetRir),
      ),
      details,
    ).toBeGreaterThanOrEqual(CATCH_UP.MIN_RIR);
    // The farmer carry stays.
    expect(
      allEntries(length.workout.blocks).some((entry) => entry.exerciseId === 'farmer-carry'),
      details,
    ).toBe(true);
  });

  it('the traps alone: "Hurts" (shoulder) on the shrug, then "15 min": the catch-up keeps the carry', () => {
    const spec = behind('traps');
    const plan = generateWorkout({
      profile: profileOf(),
      location: home,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const shrug = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'dumbbell-shrug')!;
    const hurt = succeeded(
      recalibrate(request({ type: 'pain', entryId: shrug.id, joint: 'shoulder' }, plan, spec)),
    );
    expect(
      allEntries(hurt.workout.blocks).map((entry) => entry.exerciseId),
      lifts(hurt.workout),
    ).toEqual(['farmer-carry']);
    const shorter = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 15 }, hurt.workout, spec, {
          constraints: hurt.constraints,
        }),
      ),
    );
    const details = `${shorter.summary.headline} ${lifts(shorter.workout)}`;
    // On d361edf: "Recalibrated to 15 min: 1 exercise added, 1 exercise replaced." — the push day.
    expect(shorter.workout.templateId, details).toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
    expect(
      allEntries(shorter.workout.blocks).some((entry) => entry.exerciseId === 'farmer-carry'),
      details,
    ).toBe(true);
  });
});
