import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { rankAlternatives } from '../../engine/alternatives/rankAlternatives';
import { CATCH_UP, type CatchUpSpec } from '../../engine/planning/catchUp';
import {
  contextFor,
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
import { allEntries, isStopped, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Maintenance 31, the thirteenth review of round M. A lift for none of the catch-up's muscles,
 * swapped in by the lifter, is held at the least reserve any of the day's muscles asks (the twelfth
 * review's `heldIn`). Begun, stopped at a place that cannot do it, and picked up again back at the
 * gym, it comes back at its own reserve, a set to failure: the generator's `reopened` holds a lift
 * only to the muscles of the catch-up it works directly (`budget`), and this one works none of
 * them. Synthetic data only.
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
const specAt = (minRir: number): CatchUpSpec => ({
  kind: 'catch-up',
  muscles: (['forearms', 'chest'] as const).map((muscle) => ({
    muscle,
    sets: 3,
    minRir,
    why: 'behind' as const,
  })),
  sitOut: [],
});
/** A home with nothing: no cable, no dumbbells. */
const [bare] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
  LocationProfile,
];
const request = (
  spec: CatchUpSpec,
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

/**
 * The hammer curl swapped for a cable curl, a set, home and back to the gym: the curl still to come
 * at the reserve the day's muscles ask.
 */
function pickedUpAgain(minRir: number) {
  const spec = specAt(minRir);
  // The gym's catch-up: the bench press for the chest, the hammer curl for the forearms.
  const plan = generateWorkout({
    profile: profileOf(),
    location: gym,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  const hammer = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'hammer-curl');
  expect(hammer, lifts(plan)).toBeDefined();
  // The swap sheet offers the cable curl (biceps, none of the day's muscles).
  const offered = rankAlternatives({
    current: requireExercise('hammer-curl'),
    context: contextFor({ profile: profileOf(), location: gym }, emptyConstraints()),
    otherExercises: allEntries(plan.blocks)
      .filter((entry) => entry.id !== hammer!.id)
      .map((entry) => requireExercise(entry.exerciseId)),
    limit: 6,
  }).candidates.map((candidate) => candidate.exercise.id);
  expect(offered).toContain('cable-curl');
  const swap = recalibrate(
    request(spec, { type: 'replace', entryId: hammer!.id, exerciseId: 'cable-curl' }, plan),
  );
  // (Were the swap refused, nothing would be picked up again.)
  if (!swap.ok) return;
  const swapped = swap;
  const curl = allEntries(swapped.workout.blocks).find(
    (entry) => entry.exerciseId === 'cable-curl',
  )!;
  // Held at the catch-up's reserve, as the twelfth review made it.
  expect(
    Math.min(...working(curl).map((set) => set.targetRir)),
    lifts(swapped.workout),
  ).toBeGreaterThanOrEqual(minRir);
  // A set of it, then home, where it cannot go on: it stops at the set done.
  const first = working(curl)[0]!;
  const completed: CompletedWork = {
    ...emptyCompleted(),
    startedAt: NOW,
    elapsedSeconds: 300,
    sets: [
      {
        entryId: curl.id,
        exerciseId: curl.exerciseId,
        setIndex: first.index,
        kind: 'working',
        reps: 10,
        weight: first.targetWeight,
        rir: 2,
        completedAt: NOW,
      },
    ],
  };
  const away = succeeded(
    recalibrate(
      request(spec, { type: 'location' }, swapped.workout, {
        completed,
        location: bare,
        constraints: swapped.constraints,
      }),
    ),
  );
  expect(
    allEntries(away.workout.blocks).find((entry) => entry.id === curl.id),
    lifts(away.workout),
  ).toSatisfy((entry: unknown) => entry !== undefined && isStopped(entry as never));
  // Back at the gym, the curl picks up again for its sets still to come...
  const back = succeeded(
    recalibrate(
      request(spec, { type: 'location' }, away.workout, {
        completed: { ...completed, elapsedSeconds: 900 },
        constraints: away.constraints,
      }),
    ),
  );
  const again = allEntries(back.workout.blocks).find((entry) => entry.id === curl.id);
  expect(again && !isStopped(again), lifts(back.workout)).toBe(true);
  const toCome = working(again!).filter((set) => set.index !== first.index);
  expect(toCome.length, lifts(back.workout)).toBeGreaterThan(0);
  // ... at the catch-up's reserve, as before it stopped. On a9f07f3: "cable-curl x2 @RIR 1/0",
  // the set still to come to failure.
  expect(
    Math.min(...toCome.map((set) => set.targetRir)),
    `${back.summary.headline} ${lifts(back.workout)}`,
  ).toBeGreaterThanOrEqual(minRir);
}

describe('a lift for none of the catch-up’s muscles keeps the catch-up’s reserve when picked up again, the thirteenth review of round M', () => {
  it('the hammer curl swapped for a cable curl, a set, home and back to the gym: no set to failure', () => {
    pickedUpAgain(CATCH_UP.MIN_RIR);
  });

  it('a beginner’s catch-up: picked up again at two in reserve, as its muscles ask', () => {
    // The twentieth review of round M: a day off the plan holds every lift a set short of failure,
    // so only a catch-up that asks more shows the least reserve its muscles ask.
    pickedUpAgain(CATCH_UP.BEGINNER_MIN_RIR);
  });
});
