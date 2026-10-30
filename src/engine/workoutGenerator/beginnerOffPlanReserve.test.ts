import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { UserProfile } from '../../core/validation/profile';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { SessionConstraints } from '../recalibration/types';
import { allEntries, CATCH_UP_TEMPLATE_IDS, type GeneratedWorkout } from '../workout/types';
import { generateWorkout, offPlanSpec } from './generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Twenty-first review of round M, on the twentieth pass's floor for a day off the plan ("No set of
 * a day off the plan goes to failure: a lift for none of the day's muscles keeps a rep in reserve,
 * through 'harder' too": `offPlanRir` in the generator, `heldIn`'s "with none, a set short of
 * failure" in the engine, both `CATCH_UP.MIN_RIR`).
 *
 * The rules: item 12, "No set to failure: at least 1 rep in reserve, 2 for a beginner"; the
 * research (`docs/research/catch-up-and-second-workout.md`, the recommended defaults), "Effort: the
 * app's normal RIR, with no sets to failure. Novices stay at 2 to 3 RIR", and for item 32, "Dose
 * them as in Item 12"; `CATCH_UP.BEGINNER_MIN_RIR`, "No set to failure in a catch-up; a beginner
 * stays two or three short of it".
 *
 * What happens: a beginner's catch-up, and a beginner's second workout built for what was missed,
 * hold every lift at 2 in reserve through "Make it harder" (the muscles' own reserve, and for a
 * lift for none of them the least any asks). The floor the twentieth pass added for a day off the
 * plan with no muscles to read is the same for every lifter, one rep, so a beginner's second
 * workout with nothing behind, and the split's own day standing in for a beginner's second workout
 * at a place with no lift for what was missed, go to 1 in reserve: the same offer gives 2 at the
 * gym and 1 at Travel.
 *
 * Steps (synthetic data only), a beginner on Auto (Foundation), a morning upper session:
 * - Nothing behind: the second workout is the lower day without the upper body, at 2 or 3 in
 *   reserve. Make it harder: the Romanian deadlift, the split squat, the leg curl, the leg
 *   extension and the calf raise at 1 in reserve.
 * - The side delts behind, at Travel (no equipment): the lower day stands in, at 2 in reserve. Make
 *   it harder: the split squat and the calf raise at 1 in reserve.
 * At the gym the same offer is "lateral-raise x2 @RIR 2/2", and stays so made harder.
 *
 * Both also fail on 0fe4cb9 (there "harder" had no floor off the plan at all).
 */

const NOW = at(9, 18);
const beginner: UserProfile = { ...profileOf({ experience: 'beginner' }), programStyle: 'auto' };
const [noEquipment] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
  LocationProfile,
];
const travel: LocationProfile = { ...noEquipment, id: 'travel', name: 'Travel' };
const history = [
  session(at(3, 18), [['barbell-row', 3]]),
  session(at(9, 9), [
    ['barbell-bench-press', 3],
    ['barbell-row', 3],
    ['lat-pulldown', 3],
    ['barbell-curl', 3],
  ]),
];
const sitOut: CatchUpSpec['sitOut'] = ['chest', 'triceps', 'upper-back', 'lats', 'biceps'];
const sideDelts: CatchUpSpec = {
  kind: 'second',
  // A beginner's dose (`catchUpSpec`): two sets, two in reserve.
  muscles: [{ muscle: 'side-delts', sets: 2, minRir: 2, why: 'behind' }],
  sitOut,
};

/** The lifts with a working set at less than 2 in reserve. */
const underTwo = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks)
    .filter((entry) => entry.sets.some((set) => set.kind === 'working' && set.targetRir < 2))
    .map((entry) => entry.exerciseId);

/**
 * The beginner's plan for the day, and the same plan made harder: before the start, or begun with
 * a lift in front and nothing logged, which the change holds itself (`settleKept`).
 */
function harder(spec: CatchUpSpec, location: LocationProfile, begun = false) {
  const before = generateWorkout({
    profile: beginner,
    location,
    history,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  const constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec };
  expect(offPlanSpec(constraints, before)).not.toBeNull();
  // The lift in front is one at the floor, which "harder" would take under it.
  const inFront = allEntries(before.blocks).find((entry) =>
    entry.sets.some((set) => set.kind === 'working' && set.targetRir === 2),
  )!;
  const result = recalibrate({
    trigger: { type: 'intensity', direction: 'harder' },
    workout: before,
    completed: begun
      ? { ...emptyCompleted(), startedAt: NOW, elapsedSeconds: 300 }
      : emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: begun ? inFront.id : null,
    duration: 'default',
    profile: beginner,
    location,
    loading: { missingPlates: [] },
    history,
    constraints,
    reason: 'test',
    timestamp: NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return {
    before,
    after: result.workout,
    steps: `${describeWorkout(before).join('; ')} => ${describeWorkout(result.workout).join('; ')}`,
  };
}

describe('a beginner’s day off the plan made harder', () => {
  it('a second workout with nothing behind keeps 2 in reserve', () => {
    const day = harder({ kind: 'second', muscles: [], sitOut }, gym as LocationProfile);
    expect(underTwo(day.before), day.steps).toEqual([]);
    // On 333f1d4: the Romanian deadlift, the split squat, the leg curl, the leg extension and the
    // calf raise at 1 in reserve.
    expect(underTwo(day.after), day.steps).toEqual([]);
  });

  it('a second workout with nothing behind, begun, keeps 2 in reserve', () => {
    const day = harder({ kind: 'second', muscles: [], sitOut }, gym as LocationProfile, true);
    expect(underTwo(day.after), day.steps).toEqual([]);
  });

  it('the split’s own day standing in for a second workout keeps 2 in reserve', () => {
    const day = harder(sideDelts, travel);
    expect(day.before.templateId).not.toBe(CATCH_UP_TEMPLATE_IDS.second);
    expect(underTwo(day.before), day.steps).toEqual([]);
    // On 333f1d4: the split squat and the calf raise at 1 in reserve.
    expect(underTwo(day.after), day.steps).toEqual([]);
  });

  // A plan made again for a day already made harder (a rebuild carries the day's setting) lays
  // each lift out under the same floor.
  it('a plan made again for the day made harder keeps 2 in reserve', () => {
    const spec: CatchUpSpec = { kind: 'second', muscles: [], sitOut };
    const plan = generateWorkout({
      profile: beginner,
      location: gym as LocationProfile,
      history,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec, adjust: { sets: 0, rir: -1, restFactor: 1 } },
    });
    expect(offPlanSpec({ ...emptyConstraints(), catchUp: spec }, plan)).not.toBeNull();
    expect(underTwo(plan), describeWorkout(plan).join('; ')).toEqual([]);
  });

  it('as the same offer does at the gym', () => {
    const day = harder(sideDelts, gym as LocationProfile);
    expect(day.before.templateId).toBe(CATCH_UP_TEMPLATE_IDS.second);
    expect(describeWorkout(day.after)).toEqual(['lateral-raise x2 @RIR 2/2']);
  });
});
