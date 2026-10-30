import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { rankAlternatives } from '../alternatives/rankAlternatives';
import type { CatchUpSpec } from '../planning/catchUp';
import {
  contextFor,
  emptyCompleted,
  emptyConstraints,
  recalibrate,
  swapsOffered,
} from './recalibrate';
import type { RecalibrationRequest } from './types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, directSets, gym, profileOf, session } from '../../test/clockDays';

/**
 * Sixteenth review of round M. In a catch-up or a second workout no muscle that rests today or sits
 * out gets a lift, and "the lifter's own swap that would break these is refused with its reason,
 * and the swap sheet never offers one it would refuse" (the fourteenth review: a trap-bar deadlift
 * gave the quads trained yesterday three sets). A second workout with nothing behind this week is
 * still a second workout: the usual plan without what was trained today, "never a second full dose
 * for a muscle trained today", its sitting-out muscles kept out of the plan, the lift to push and
 * the coach alike (`offPlanDay.test.ts`), and out of "Uncomfortable" and "Hurts" (`bestAlternative`
 * reads `restingInPlan`). But `catchUpRefusal`, which the swap and the sheet read, returns null at
 * once for an offer with no muscles, before its check of the muscles that rest.
 *
 * This morning a lat pulldown and barbell curls, done in full; nothing is behind: the second
 * workout at the gym is the push day without the biceps' curl (the wrist curl in its place), the
 * lats, the upper back and the biceps sitting out. The wrist curl's sheet offers the reverse curl
 * and the hammer curl, both for the biceps, and "Swapped Wrist Curl for Reverse Curl." gives the
 * biceps three more sets the same day; the cable fly's sheet offers the dumbbell pullover, for the
 * lats. "Uncomfortable" on the same lifts brings in none of them. Synthetic data only.
 */

const NOW = at(9, 18);
const profile = profileOf();
const records = [
  session(at(3, 18), [['leg-press', 3]]),
  session(at(9, 9), [
    ['lat-pulldown', 3],
    ['barbell-curl', 3],
  ]),
];
const sitOut: MuscleId[] = ['lats', 'upper-back', 'biceps'];
const spec: CatchUpSpec = { kind: 'second', muscles: [], sitOut };
const constraints = { ...emptyConstraints(), catchUp: spec };
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const plan = () =>
  generateWorkout({
    profile,
    location: gym,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
const request = (
  trigger: RecalibrationRequest['trigger'],
  workout: GeneratedWorkout,
): RecalibrationRequest => ({
  trigger,
  workout,
  completed: emptyCompleted(),
  lockedEntryIds: [],
  currentEntryId: null,
  duration: 'default',
  profile,
  location: gym,
  loading: { missingPlates: [] },
  history: records,
  constraints,
  reason: 'test',
  timestamp: NOW,
});
/** The sheet as the Today and workout screens build it. */
const sheetOf = (workout: GeneratedWorkout, entry: WorkoutEntry) =>
  swapsOffered(
    rankAlternatives({
      current: requireExercise(entry.exerciseId),
      context: contextFor({ profile, location: gym }, constraints),
      otherExercises: allEntries(workout.blocks)
        .filter((other) => other.id !== entry.id)
        .map((other) => requireExercise(other.exerciseId)),
      plannedSets: { sets: entry.sets.length, restSeconds: entry.restSeconds },
      limit: 6,
    }),
    { constraints, completed: emptyCompleted(), history: records, timestamp: NOW },
    workout,
    entry,
  );
const sittingOut = (id: string) =>
  requireExercise(id).primaryMuscles.filter((muscle) => sitOut.includes(muscle));

describe('a second workout with nothing behind: the swap keeps off what sits out', () => {
  it.each([
    ['wrist-curl', 'reverse-curl', 'biceps'],
    ['cable-fly', 'dumbbell-pullover', 'lats'],
  ] as const)('the %s swapped for the %s', (from, to, muscle) => {
    const workout = plan();
    expect(workout.explanation.reasons.join(' ')).toContain('trained today, sit out.');
    expect(directSets(workout, muscle), lifts(workout)).toBe(0);
    const entry = allEntries(workout.blocks).find((each) => each.exerciseId === from);
    expect(entry, lifts(workout)).toBeDefined();
    // "Uncomfortable" keeps off the muscles that sit out.
    const comfort = recalibrate(request({ type: 'uncomfortable', entryId: entry!.id }, workout));
    if (!comfort.ok) throw new Error(comfort.error);
    expect(directSets(comfort.workout, muscle), lifts(comfort.workout)).toBe(0);
    // The sheet offers none that works one.
    const offered = sheetOf(workout, entry!).candidates.map((candidate) => candidate.exercise.id);
    // On 89dfb39 the wrist curl's sheet offers the reverse curl and the hammer curl, the cable fly's
    // the dumbbell pullover.
    expect(
      offered.filter((id) => sittingOut(id).length > 0),
      offered.join(', '),
    ).toEqual([]);
    // And the swap itself is refused, the muscle given no sets.
    const swap = recalibrate(
      request({ type: 'replace', entryId: entry!.id, exerciseId: to }, workout),
    );
    const detail = swap.ok ? `${swap.summary.headline} ${lifts(swap.workout)}` : swap.error;
    // On 89dfb39: "Swapped Wrist Curl for Reverse Curl." reverse-curl x3 @RIR 1/1/1, the biceps three
    // sets the day they were trained.
    expect(swap.ok, detail).toBe(false);
    expect(swap.ok ? 0 : directSets(swap.workout, muscle), detail).toBe(0);
  });
});
