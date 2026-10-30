import { describe, expect, it } from 'vitest';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, profileOf, session } from '../../test/clockDays';

/**
 * Round M, after its sixteenth review: what comes in for comfort in a catch-up or a second workout
 * is the lifter's pick, locked in its place (the fifteenth review), and kept through every rebuild
 * as the lifter's pick is, because it came in for another (`keptAsPicked`, the thirteenth and
 * fourteenth reviews). Pinned and unpinned, it is no longer locked; it came in for another all the
 * same, and stays through a length picked. Synthetic data only.
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const NOW = at(9, 18);
const profile = profileOf();
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const succeeded = (result: ReturnType<typeof recalibrate>): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};

function dayOf(records: ReturnType<typeof session>[], spec: CatchUpSpec) {
  const request = (
    trigger: RecalibrationTrigger,
    workout: GeneratedWorkout,
    constraints: SessionConstraints,
  ): RecalibrationRequest => ({
    trigger,
    workout,
    completed: emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: null,
    duration: trigger.type === 'duration' ? trigger.choice : 'default',
    profile,
    location: home,
    loading: { missingPlates: [] },
    history: records,
    constraints,
    reason: 'test',
    timestamp: NOW,
  });
  const plan = generateWorkout({
    profile,
    location: home,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  return { plan, request };
}

/** What comes in for comfort for `from`, pinned and unpinned, then 45 minutes. */
function unpinnedThenShorter(
  records: ReturnType<typeof session>[],
  spec: CatchUpSpec,
  from: string,
  comfortId: string,
) {
  const { plan, request } = dayOf(records, spec);
  const lift = allEntries(plan.blocks).find((entry) => entry.exerciseId === from);
  expect(lift, lifts(plan)).toBeDefined();
  const comfort = succeeded(
    recalibrate(
      request({ type: 'uncomfortable', entryId: lift!.id }, plan, {
        ...emptyConstraints(),
        catchUp: spec,
      }),
    ),
  );
  const came = allEntries(comfort.workout.blocks).find((entry) => entry.exerciseId === comfortId);
  expect(came?.locked, lifts(comfort.workout)).toBe(true);
  const pinned = succeeded(
    recalibrate(
      request(
        { type: 'pin', entryId: came!.id, pinned: true },
        comfort.workout,
        comfort.constraints,
      ),
    ),
  );
  const unpinned = succeeded(
    recalibrate(
      request(
        { type: 'pin', entryId: came!.id, pinned: false },
        pinned.workout,
        pinned.constraints,
      ),
    ),
  );
  const loose = allEntries(unpinned.workout.blocks).find((entry) => entry.id === came!.id);
  expect(loose?.locked).toBe(false);
  expect(loose?.replacedFrom).toBe(from);
  return succeeded(
    recalibrate(request({ type: 'duration', choice: 45 }, unpinned.workout, unpinned.constraints)),
  );
}

describe('what came in for comfort, pinned and unpinned, stays through a length picked', () => {
  it('in a catch-up for the traps: the farmer carry in for the dumbbell shrug', () => {
    const spec: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [{ muscle: 'traps', sets: 3, minRir: 1, why: 'behind' }],
      sitOut: [],
    };
    const after = unpinnedThenShorter(
      [session(at(3, 18), [['barbell-row', 3]])],
      spec,
      'dumbbell-shrug',
      'farmer-carry',
    );
    expect(
      allEntries(after.workout.blocks).map((entry) => entry.exerciseId),
      `${after.summary.headline} ${lifts(after.workout)}`,
    ).toContain('farmer-carry');
  });

  it('in a second workout with nothing behind: the farmer carry in for the wrist curl', () => {
    const sitOut: MuscleId[] = ['lats', 'upper-back', 'biceps'];
    const spec: CatchUpSpec = { kind: 'second', muscles: [], sitOut };
    const after = unpinnedThenShorter(
      [
        session(at(3, 18), [['leg-press', 3]]),
        session(at(9, 9), [
          ['lat-pulldown', 3],
          ['barbell-curl', 3],
        ]),
      ],
      spec,
      'wrist-curl',
      'farmer-carry',
    );
    expect(
      allEntries(after.workout.blocks).map((entry) => entry.exerciseId),
      `${after.summary.headline} ${lifts(after.workout)}`,
    ).toContain('farmer-carry');
  });
});
