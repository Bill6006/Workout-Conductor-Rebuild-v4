import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { CompletedWork, SessionConstraints } from '../recalibration/types';
import { allEntries, CATCH_UP_TEMPLATE_IDS, type GeneratedWorkout } from '../workout/types';
import { generateWorkout, offPlanSpec } from './generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Twentieth review of round M, on sets to failure in a second workout outside the day's catch-up
 * muscles: one with nothing behind (off the plan since the sixteenth pass: "one rule says when the
 * day is off the plan, a second workout with nothing behind included"), and the split's own day
 * standing in for one at a place with no lift for what was missed (the nineteenth pass: "a second
 * workout at such a place is the split's own day, as a catch-up is").
 *
 * The rules: generate.ts (the first review of round M), "A day off the plan: a catch-up built, or any
 * second workout. The lift to push waits for a planned day, and nothing goes to failure", and for
 * drop sets, "A drop set is a set taken to failure ... None in a catch-up or a second workout: a few
 * sets each, none to failure"; the research's defaults (`docs/research/catch-up-and-second-workout.md`):
 * "the app's normal RIR, with no sets to failure", the second workout's muscles behind "dosed as in
 * Item 12". The second pass held the catch-up's lifts to their reserve through "harder" ("'harder'
 * made it four sets with none in reserve").
 *
 * What happens: only lifts for the offer's muscles are held to a reserve (a catch-up's slots,
 * `catchUpHold`). The rest of a second workout takes its role's own reserve, and a finisher's is 0
 * (roles.ts: `rir: foundation ? 2 : style === 'lean-down' ? 1 : 0`): the plan drops the finisher's
 * drop set off the plan, "none to failure", and keeps its working sets at 0 in reserve. "Make it
 * harder" then takes every such lift a set further, to 0 in reserve, as on a day of the plan.
 *
 * Steps (synthetic data only):
 * - A morning squat, overhead press and bench press, nothing behind: the second workout is the pull
 *   day without the trained muscles, "You trained today, and nothing is behind this week: what you
 *   trained sits out.", and it ends with "dumbbell-curl x2 @RIR 0/0", the finisher, to failure.
 * - A morning upper session, nothing behind: the lower day, its accessories at 1 in reserve. Make it
 *   harder: "Rest of the workout made harder: 6 exercises adjusted", the Romanian deadlift, the split
 *   squat, the leg curl, the leg extension and the calf raise four sets each at 0 in reserve.
 * - The side delts behind, at a place with no lift for them: the lower day stands in. Make it
 *   harder: the split squat and the calf raise four sets each at 0 in reserve.
 * A second workout built for the side delts (the lateral raise) keeps its reserve.
 *
 * All three also fail on 0f8d10f (the finisher since the first review of round M; the second
 * workout with nothing behind off the plan since the sixteenth).
 */

const profile = profileOf();
const NOW = at(9, 18);
const [noEquipment] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
  LocationProfile,
];
const travel: LocationProfile = { ...noEquipment, id: 'travel', name: 'Travel' };
const theGym = gym as LocationProfile;
const upperSitOut: CatchUpSpec['sitOut'] = ['chest', 'triceps', 'upper-back', 'lats', 'biceps'];
const upperMorning = [
  session(at(3, 18), [['barbell-row', 3]]),
  session(at(9, 9), [
    ['barbell-bench-press', 3],
    ['barbell-row', 3],
    ['lat-pulldown', 3],
    ['barbell-curl', 3],
  ]),
];

/** The lifts with a working set still to do at less than 1 in reserve. */
const toFailure = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks)
    .filter((entry) => entry.sets.some((set) => set.kind === 'working' && set.targetRir < 1))
    .map((entry) => entry.exerciseId);

function plan(spec: CatchUpSpec, location: LocationProfile, history: WorkoutRecord[]) {
  const workout = generateWorkout({
    profile,
    location,
    history,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  const constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec };
  expect(offPlanSpec(constraints, workout)).not.toBeNull();
  return { workout, constraints };
}

/**
 * The plan made harder, before the start or begun with a lift in front a set short of failure,
 * nothing of it logged: the change holds that lift itself (`settleKept`), as it holds every lift the
 * plan keeps.
 */
function harder(spec: CatchUpSpec, location: LocationProfile, begun = false) {
  const { workout, constraints } = plan(spec, location, upperMorning);
  const inFront = allEntries(workout.blocks).find((entry) =>
    entry.sets.some((each) => each.kind === 'working' && each.targetRir === 1),
  )!;
  const completed: CompletedWork = begun
    ? { ...emptyCompleted(), startedAt: NOW, elapsedSeconds: 300 }
    : emptyCompleted();
  const result = recalibrate({
    trigger: { type: 'intensity', direction: 'harder' },
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: begun ? inFront.id : null,
    duration: 'default',
    profile,
    location,
    loading: { missingPlates: [] },
    history: upperMorning,
    constraints,
    reason: 'test',
    timestamp: NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return {
    before: workout,
    after: result.workout,
    steps: `${describeWorkout(workout).join('; ')} => ${describeWorkout(result.workout).join('; ')}`,
  };
}

describe('a second workout off the plan, outside the day’s catch-up muscles', () => {
  it('plans no set to failure with nothing behind: no finisher at 0 in reserve', () => {
    const { workout } = plan(
      {
        kind: 'second',
        muscles: [],
        sitOut: ['quads', 'glutes', 'front-delts', 'triceps', 'chest'],
      },
      theGym,
      [
        session(at(3, 18), [['barbell-row', 3]]),
        session(at(9, 9), [
          ['back-squat', 3],
          ['overhead-press', 3],
          ['barbell-bench-press', 3],
        ]),
      ],
    );
    expect(workout.templateId).toBe('pull-arms');
    // No drop set off the plan, as the rules say.
    expect(allEntries(workout.blocks).some((entry) => entry.dropSet)).toBe(false);
    // On 0fe4cb9 and 0f8d10f: ['dumbbell-curl'], "dumbbell-curl x2 @RIR 0/0", the finisher.
    expect(toFailure(workout), describeWorkout(workout).join('; ')).toEqual([]);
  });

  it('takes nothing to failure under "Make it harder" with nothing behind', () => {
    const day = harder({ kind: 'second', muscles: [], sitOut: upperSitOut }, theGym);
    // On 0fe4cb9 and 0f8d10f: the Romanian deadlift, the split squat, the leg curl, the leg
    // extension and the calf raise, four sets each at 0 in reserve.
    expect(toFailure(day.after), day.steps).toEqual([]);
  });

  it('takes nothing to failure under "Make it harder" on the split’s own day standing in', () => {
    const day = harder(
      {
        kind: 'second',
        muscles: [{ muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' }],
        sitOut: upperSitOut,
      },
      travel,
    );
    expect(day.before.templateId).not.toBe(CATCH_UP_TEMPLATE_IDS.second);
    // On 0fe4cb9 and 0f8d10f: the split squat and the calf raise at 0 in reserve.
    expect(toFailure(day.after), day.steps).toEqual([]);
  });

  it('takes nothing to failure under "Make it harder" with nothing behind, the workout begun', () => {
    // Begun, the lift in front is kept and the change holds it (`heldIn`), the generator's own hold
    // not reached.
    const day = harder({ kind: 'second', muscles: [], sitOut: upperSitOut }, theGym, true);
    expect(toFailure(day.after), day.steps).toEqual([]);
  });

  it('keeps the reserve of a second workout built for what was missed', () => {
    const day = harder(
      {
        kind: 'second',
        muscles: [{ muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' }],
        sitOut: upperSitOut,
      },
      theGym,
    );
    expect(day.before.templateId).toBe(CATCH_UP_TEMPLATE_IDS.second);
    expect(toFailure(day.after)).toEqual([]);
  });
});
