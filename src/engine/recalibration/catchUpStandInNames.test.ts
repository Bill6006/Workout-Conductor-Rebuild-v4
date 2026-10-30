import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationResult,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from '../../engine/recalibration/types';
import {
  allEntries,
  isStopped,
  type GeneratedWorkout,
  type WorkoutEntry,
} from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Maintenance 31, names in a catch-up (the eleventh review of round M): a stand-in made in the
 * workout (a swap, "Uncomfortable", "Hurts") takes a name past every name the plan's slots can
 * take, and a rebuild that plans the same lift in its place keeps it, so the list of changes names
 * only what changed. Synthetic data only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const named = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks)
    .map((entry) => `${entry.id}:${entry.exerciseId}${isStopped(entry) ? ' (stopped)' : ''}`)
    .join(', ');
const behind = (...muscles: ('quads' | 'glutes' | 'chest' | 'biceps')[]): CatchUpSpec => ({
  kind: 'catch-up',
  muscles: muscles.map((muscle) => ({ muscle, sets: 3, minRir: 1, why: 'behind' as const })),
  sitOut: [],
});
const succeeded = (result: RecalibrationResult): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
/** A barbell, a rack and a bench: the back squat, swapped for weeks for the front squat, is out. */
const [rack] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['barbell', 'squat-rack', 'flat-bench'] },
  at(1),
) as [LocationProfile];
const frontForBack = [{ from: 'back-squat', to: 'front-squat', setAt: at(1), until: at(30) }];

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
  location: gym,
  loading: { missingPlates: [] },
  history: records,
  constraints: { ...emptyConstraints(), catchUp: spec },
  reason: 'test',
  timestamp: NOW,
  ...options,
});

/** One working set of the entry done, five minutes in. */
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

describe('a stand-in the recalibrator made keeps its name in a catch-up, the eleventh review of round M', () => {
  it.each([
    [
      '"Uncomfortable"',
      (entryId: string): RecalibrationTrigger => ({ type: 'uncomfortable', entryId }),
    ],
    [
      '"Hurts"',
      (entryId: string): RecalibrationTrigger => ({ type: 'pain', entryId, joint: 'elbow' }),
    ],
  ])('a bench press begun, then %s, then "45 min": nothing left out or added', (_, tapped) => {
    // The squat rack taken, the lifter does a set of the bench press first, the catch-up's second
    // lift; the back squat, still to do, stays the lift in front of the lifter.
    const spec = behind('quads', 'glutes', 'chest');
    const atGym = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const [squat, bench] = allEntries(atGym.blocks);
    expect([squat?.exerciseId, bench?.exerciseId], lifts(atGym)).toEqual([
      'back-squat',
      'barbell-bench-press',
    ]);
    const completed = oneSetOf(bench!);
    const swapped = succeeded(
      recalibrate(
        request(tapped(bench!.id), atGym, spec, { completed, currentEntryId: bench!.id }),
      ),
    );
    const stand = allEntries(swapped.workout.blocks).find(
      (entry) => !isStopped(entry) && entry.slot === bench!.slot,
    );
    expect(stand, named(swapped.workout)).toBeDefined();
    const shorter = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 45 }, swapped.workout, spec, {
          completed,
          currentEntryId: squat!.id,
          constraints: swapped.constraints,
        }),
      ),
    );
    // The rebuild puts the same lift in the slot for the sets still to come...
    const after = allEntries(shorter.workout.blocks).find(
      (entry) => !isStopped(entry) && entry.slot === bench!.slot,
    );
    expect(after?.exerciseId, named(shorter.workout)).toBe(stand!.exerciseId);
    // ... under the same name. Before: another, and "Recalibrated to 45 min with 5 min done: 1
    // exercise removed, 1 exercise added." ("Added Dumbbell Bench Press. | Left out Dumbbell Bench
    // Press.").
    expect(after?.id, named(shorter.workout)).toBe(stand!.id);
    expect(
      shorter.changes.filter((change) => change.kind !== 'adjusted').map((change) => change.detail),
      `${shorter.summary.headline} ${named(swapped.workout)} -> ${named(shorter.workout)}`,
    ).toEqual([]);
  });

  it('a curl begun, swapped by the lifter, then the rack: the glutes’ new lift reads as added', () => {
    // At the gym the leg press for the quads and the glutes, and the EZ-bar curl. One set of the curl
    // done, the lifter swaps it for the cable curl: the stand-in is named e3. At the rack the cable
    // curl cannot go on and the barbell curl carries the curl's sets; the front squat, in for the back
    // squat for weeks, works the quads alone, and the glutes take a slot of their own.
    const spec = behind('quads', 'glutes', 'biceps');
    const atGym = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec, swaps: frontForBack },
    });
    const curl = allEntries(atGym.blocks).find((entry) => entry.exerciseId === 'ez-bar-curl');
    expect(curl, lifts(atGym)).toBeDefined();
    const completed = oneSetOf(curl!);
    const swapped = succeeded(
      recalibrate(
        request({ type: 'replace', entryId: curl!.id, exerciseId: 'cable-curl' }, atGym, spec, {
          completed,
          swaps: frontForBack,
        }),
      ),
    );
    const cable = allEntries(swapped.workout.blocks).find(
      (entry) => entry.exerciseId === 'cable-curl',
    );
    expect(cable, named(swapped.workout)).toBeDefined();
    const moved = succeeded(
      recalibrate(
        request({ type: 'location' }, swapped.workout, spec, {
          completed,
          location: rack,
          swaps: frontForBack,
          constraints: swapped.constraints,
        }),
      ),
    );
    const hinge = allEntries(moved.workout.blocks).find(
      (entry) => entry.exerciseId === 'romanian-deadlift',
    );
    const barbell = allEntries(moved.workout.blocks).find(
      (entry) => entry.exerciseId === 'barbell-curl',
    );
    expect([hinge, barbell].every(Boolean), named(moved.workout)).toBe(true);
    const details = moved.changes.map((change) => change.detail).join(' | ');
    // Before: "Replaced Cable Curl with Romanian Deadlift." and "Added Barbell Curl.", the
    // glutes' lift taking the dropped stand-in's name.
    expect(
      moved.changes.find((change) => change.entryId === hinge!.id),
      details,
    ).toMatchObject({
      kind: 'added',
    });
    expect(
      moved.changes.find((change) => change.entryId === barbell!.id),
      details,
    ).toMatchObject({
      kind: 'replaced',
      previousExerciseId: 'cable-curl',
    });
  });
});
