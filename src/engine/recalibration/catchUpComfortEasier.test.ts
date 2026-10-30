import { describe, expect, it } from 'vitest';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  RecalibrationRequest,
  RecalibrationResult,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from './types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Maintenance 31 (the fourteenth review of round M): the day's settings ("Make it easier", a
 * check-in) reach what came in for comfort in a catch-up, as they reach the lifter's own pick.
 * Synthetic data only.
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const succeeded = (result: RecalibrationResult): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: (['chest', 'biceps', 'quads'] as const).map((muscle) => ({
    muscle,
    sets: 3,
    minRir: 1,
    why: 'behind' as const,
  })),
  sitOut: [],
};
const request = (
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  options: Partial<RecalibrationRequest> = {},
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
  constraints: { ...emptyConstraints(), catchUp: spec },
  reason: 'test',
  timestamp: NOW,
  ...options,
});
const byId = (workout: GeneratedWorkout, id: string) =>
  allEntries(workout.blocks).find((entry) => entry.id === id) as WorkoutEntry;
const dose = (entry: WorkoutEntry) =>
  `${entry.exerciseId} x${working(entry).length} @RIR ${Math.min(...working(entry).map((set) => set.targetRir))}`;
/** Eased: a set fewer, or a rep more in reserve, as every other lift not begun takes it. */
const eased = (before: WorkoutEntry, after: WorkoutEntry) =>
  working(after).length < working(before).length ||
  Math.min(...working(after).map((set) => set.targetRir)) >
    Math.min(...working(before).map((set) => set.targetRir));
const plan = () =>
  generateWorkout({
    profile: profileOf(),
    location: gym,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
const comfortable = () => {
  const workout = plan();
  const curl = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'ez-bar-curl');
  expect(curl, lifts(workout)).toBeDefined();
  const comfort = succeeded(
    recalibrate(request({ type: 'uncomfortable', entryId: curl!.id }, workout)),
  );
  const standIn = byId(comfort.workout, curl!.id);
  expect(standIn.exerciseId, lifts(comfort.workout)).not.toBe('ez-bar-curl');
  return { comfort, id: curl!.id };
};
/**
 * The same lift asked of the plan as a swap the lifter makes: the swap sheet's own swap to it,
 * which is locked on the entry and so settled to the new setting.
 */
const swapped = (exerciseId: string, id: string) =>
  succeeded(recalibrate(request({ type: 'replace', entryId: id, exerciseId }, plan())));

describe('"Make it easier" eases what came in for comfort, the fourteenth review of round M', () => {
  it('the curl in for the EZ-bar curl, nothing begun', () => {
    const { comfort, id } = comfortable();
    const easier = succeeded(
      recalibrate(
        request({ type: 'intensity', direction: 'easier' }, comfort.workout, {
          constraints: comfort.constraints,
        }),
      ),
    );
    // The same curl swapped in by the lifter, then "Make it easier": as a fresh plan holds it.
    const own = swapped(byId(comfort.workout, id).exerciseId, id);
    const ownEasier = succeeded(
      recalibrate(
        request({ type: 'intensity', direction: 'easier' }, own.workout, {
          constraints: own.constraints,
        }),
      ),
    );
    const details = `${lifts(comfort.workout)} -> ${easier.summary.headline} ${lifts(easier.workout)} | the lifter's swap: ${lifts(own.workout)} -> ${lifts(ownEasier.workout)}`;
    // On d361edf the curl that came in for comfort keeps the dose it had ("barbell-curl x3 @RIR 1"),
    // while the lifts beside it are eased, and the same curl swapped in by the lifter goes to
    // "barbell-curl x2 @RIR 2".
    expect(eased(byId(own.workout, id), byId(ownEasier.workout, id)), details).toBe(true);
    expect(eased(byId(comfort.workout, id), byId(easier.workout, id)), details).toBe(true);
  });

  it('the curl in for the EZ-bar curl, then a head cold', () => {
    // Since Maintenance 33 a head cold is the check-in's own change to the plan: every set 2 or
    // more short of failure.
    const { comfort, id } = comfortable();
    const low = succeeded(
      recalibrate(
        request(
          {
            type: 'readiness',
            readiness: {
              energy: 3,
              soreness: 2,
              sleep: 3,
              motivation: 3,
              jointDiscomfort: [],
              timePressure: false,
              illness: 'head',
            },
          },
          comfort.workout,
          { constraints: comfort.constraints },
        ),
      ),
    );
    const details = `${lifts(comfort.workout)} -> ${low.summary.headline} ${lifts(low.workout)} | ${dose(byId(low.workout, id))}`;
    // On d361edf: "barbell-curl x3 @RIR 1" before and after, the bench press and the squat eased.
    expect(eased(byId(comfort.workout, id), byId(low.workout, id)), details).toBe(true);
  });
});
