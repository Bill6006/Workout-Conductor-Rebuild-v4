import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type { RecalibrationTrigger } from '../../engine/recalibration/types';
import { allEntries, isStopped } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, profileOf, session } from '../../test/clockDays';

/**
 * Maintenance 31, the thirteenth review of round M. "A lift begun with nothing to come in stops at
 * its sets done; one not begun is left out." A catch-up is often a single lift (the calves' calf
 * raise at home), and "Uncomfortable" on it, with nothing to come in, is refused with the engine's
 * own check, "The rebuilt workout came back empty, so nothing was changed.": the lift the lifter
 * finds uncomfortable stays, the only way out the full session; "Hurts" is refused the same way,
 * and the joint the lifter reported goes unrecorded. (A second workout with nothing to give already
 * has an empty plan of its own, "Nothing more for today.") Synthetic data only.
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
/** A home with nothing: the standing calf raise is the only calf lift. */
const [bare] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
  LocationProfile,
];
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [{ muscle: 'calves', sets: 3, minRir: 1, why: 'behind' }],
  sitOut: [],
};

describe('"Uncomfortable" or "Hurts" on a one-lift catch-up, the thirteenth review of round M', () => {
  it.each([
    [
      '"Uncomfortable"',
      (entryId: string): RecalibrationTrigger => ({ type: 'uncomfortable', entryId }),
    ],
    [
      '"Hurts" (ankle)',
      (entryId: string): RecalibrationTrigger => ({ type: 'pain', entryId, joint: 'ankle' }),
    ],
  ])(
    'the calves behind, at a bare home: %s on the calf raise not begun leaves it out',
    (_, tap) => {
      const plan = generateWorkout({
        profile: profileOf(),
        location: bare,
        history: records,
        now: NOW,
        duration: 'default',
        constraints: { catchUp: spec },
      });
      const calf = allEntries(plan.blocks).find(
        (entry) => entry.exerciseId === 'standing-calf-raise',
      );
      expect(allEntries(plan.blocks).length, describeWorkout(plan).join('; ')).toBe(1);
      expect(calf).toBeDefined();
      const result = recalibrate({
        trigger: tap(calf!.id),
        workout: plan,
        completed: emptyCompleted(),
        lockedEntryIds: [],
        currentEntryId: null,
        duration: 'default',
        profile: profileOf(),
        location: bare,
        loading: { missingPlates: [] },
        history: records,
        constraints: { ...emptyConstraints(), catchUp: spec },
        reason: 'test',
        timestamp: NOW,
      });
      // On a9f07f3: "The rebuilt workout came back empty, so nothing was changed." (for "Hurts", the
      // ankle then goes unrecorded too: the session's constraints are not changed).
      expect(result.ok ? 'changed' : result.error).toBe('changed');
      if (!result.ok) return;
      expect(
        allEntries(result.workout.blocks).some(
          (entry) => entry.exerciseId === 'standing-calf-raise' && !isStopped(entry),
        ),
      ).toBe(false);
    },
  );
});
