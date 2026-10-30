import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { rankAlternatives } from '../alternatives/rankAlternatives';
import type { CatchUpSpec } from '../planning/catchUp';
import {
  contextFor,
  emptyCompleted,
  emptyConstraints,
  recalibrate,
  swapsOffered,
} from './recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import {
  allEntries,
  isStopped,
  stoppedBefore,
  type GeneratedWorkout,
  type WorkoutEntry,
} from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import {
  at,
  describeWorkout,
  gym as gymOrNone,
  profileOf,
  session,
  working,
} from '../../test/clockDays';

/**
 * Fifteenth review of round M. A swap back to a lift stopped earlier is let through whatever the
 * plan has given its muscles since: `catchUpRefusal` returns null for it before any check, and the
 * swap sheet offers it. The dumbbell shoulder press serves the front delts and the triceps, and the
 * triceps' own slot stays quiet. A set of it, then the lifter swaps it for the Arnold press (front
 * delts only): the triceps have two sets left, and the next rebuild ("Make it harder") gives them a
 * lift of their own for those two. The Arnold press's sheet then offers the shoulder press back, and
 * the swap picks it up for the Arnold press's two sets: the triceps get five working sets for three.
 * In a catch-up that is more than they lack; in a second workout, with the triceps trained this
 * morning, more than what is left of today's session. The rules: no muscle gets more than it lacks;
 * the lifter's swap that would break that is refused with its reason, and the sheet never offers it.
 * Synthetic data only.
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const gym = gymOrNone as LocationProfile;
const NOW = at(9, 18);
const profile = profileOf();
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const succeeded = (result: ReturnType<typeof recalibrate>): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
/** A muscle's working sets from lifts that work it directly: a stopped lift's sets done. */
const given = (workout: GeneratedWorkout, completed: CompletedWork, muscle: string) =>
  allEntries(workout.blocks)
    .filter((entry) => requireExercise(entry.exerciseId).primaryMuscles.includes(muscle as never))
    .reduce(
      (sum, entry) =>
        sum +
        working(entry).filter(
          (set) =>
            !isStopped(entry) ||
            completed.sets.some((done) => done.entryId === entry.id && done.setIndex === set.index),
        ).length,
      0,
    );

const catchUp: CatchUpSpec = {
  kind: 'catch-up',
  muscles: (['front-delts', 'triceps'] as const).map((muscle) => ({
    muscle,
    sets: 3,
    minRir: 1,
    why: 'behind' as const,
  })),
  sitOut: [],
};
/** A bench press and pushdowns this morning: the chest sits out, the triceps take what is left. */
const second: CatchUpSpec = {
  kind: 'second',
  muscles: [
    { muscle: 'front-delts', sets: 3, minRir: 1, why: 'behind' },
    { muscle: 'triceps', sets: 3, minRir: 3, why: 'remainder' },
  ],
  sitOut: ['chest'],
};
const row = session(at(3, 18), [['barbell-row', 3]]);
const morning = session(at(9, 9), [
  ['barbell-bench-press', 3],
  ['cable-triceps-pushdown', 3],
]);

function swappedBack(spec: CatchUpSpec, records: WorkoutRecord[], location: LocationProfile) {
  let workout = generateWorkout({
    profile,
    location,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  let constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec };
  const press = allEntries(workout.blocks)[0]!;
  expect(press.exerciseId, lifts(workout)).toBe('dumbbell-shoulder-press');
  expect(given(workout, emptyCompleted(), 'triceps'), lifts(workout)).toBe(3);
  // One set of the shoulder press.
  const first = working(press)[0]!;
  const completed: CompletedWork = {
    ...emptyCompleted(),
    startedAt: NOW,
    elapsedSeconds: 300,
    currentEntryId: press.id,
    sets: [
      {
        entryId: press.id,
        exerciseId: press.exerciseId,
        setIndex: first.index,
        kind: 'working',
        reps: 8,
        weight: first.targetWeight,
        rir: 2,
        completedAt: at(9, 18, 5),
      },
    ],
  };
  const request = (trigger: RecalibrationTrigger): RecalibrationRequest => ({
    trigger,
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: 'default',
    profile,
    location,
    loading: { missingPlates: [] },
    history: records,
    constraints,
    reason: 'test',
    timestamp: at(9, 18, 10),
  });
  const sheet = (entry: WorkoutEntry) =>
    swapsOffered(
      rankAlternatives({
        current: requireExercise(entry.exerciseId),
        context: contextFor({ profile, location }, constraints),
        // As the screens rank it: the lift a stand-in took over from is offered back.
        otherExercises: allEntries(workout.blocks)
          .filter(
            (other) =>
              other.id !== entry.id && !stoppedBefore(workout.blocks, entry).includes(other),
          )
          .map((other) => requireExercise(other.exerciseId)),
        plannedSets: { sets: entry.sets.length, restSeconds: entry.restSeconds },
        limit: 6,
      }),
      { constraints, completed, history: records, timestamp: at(9, 18, 10) },
      workout,
      entry,
    ).candidates.map((candidate) => candidate.exercise.id);

  // The lifter swaps it for the Arnold press, which the sheet offers.
  expect(sheet(press)).toContain('arnold-press');
  const swapped = succeeded(
    recalibrate(request({ type: 'replace', entryId: press.id, exerciseId: 'arnold-press' })),
  );
  workout = swapped.workout;
  constraints = swapped.constraints;
  // "Make it harder": the triceps, two sets left, take a lift of their own for them.
  const harder = succeeded(recalibrate(request({ type: 'intensity', direction: 'harder' })));
  workout = harder.workout;
  constraints = harder.constraints;
  expect(given(workout, completed, 'triceps'), lifts(workout)).toBe(3);
  const arnold = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'arnold-press')!;
  expect(arnold, lifts(workout)).toBeDefined();
  // The Arnold press's sheet offers the shoulder press back.
  const offered = sheet(arnold);
  const back = recalibrate(
    request({ type: 'replace', entryId: arnold.id, exerciseId: 'dumbbell-shoulder-press' }),
  );
  return { back, offered, completed, before: lifts(workout) };
}

describe('a swap back to a lift stopped earlier keeps to what its muscles lack', () => {
  it.each([
    ['a catch-up for the front delts and the triceps, at the gym', catchUp, [row], gym],
    ['a second workout, the triceps trained this morning, at home', second, [row, morning], home],
  ] as const)('%s', (_, spec, records, location) => {
    const { back, offered, completed, before } = swappedBack(spec, [...records], location);
    const detail = back.ok
      ? `${before} -> ${back.summary.headline} ${lifts(back.workout)}`
      : `refused: ${back.error}; offered: ${offered.join(', ')}`;
    // The triceps have no set left beside their own lift: the swap back is refused with its reason,
    // and the sheet does not offer it. On 3290cd8 it is offered and taken: "Swapped Arnold Press for
    // Dumbbell Shoulder Press.", the shoulder press x3 beside the triceps' own lift x2: five for
    // three. (Taken with nothing to pick up, the Arnold press would go for nothing.)
    expect(back.ok, detail).toBe(false);
    expect(back.ok ? '' : back.error, detail).toMatch(/more than they lack/);
    expect(offered, detail).not.toContain('dumbbell-shoulder-press');
    expect(given(back.workout, completed, 'triceps'), detail).toBeLessThanOrEqual(3);
  });
});
