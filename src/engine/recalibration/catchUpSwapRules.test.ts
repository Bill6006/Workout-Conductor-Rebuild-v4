import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { rankAlternatives } from '../../engine/alternatives/rankAlternatives';
import { CATCH_UP, type CatchUpSpec } from '../../engine/planning/catchUp';
import {
  contextFor,
  emptyCompleted,
  emptyConstraints,
  recalibrate,
  swapsOffered,
} from '../../engine/recalibration/recalibrate';
import type { CompletedWork, RecalibrationRequest } from '../../engine/recalibration/types';
import {
  allEntries,
  isStopped,
  type GeneratedWorkout,
  type WorkoutEntry,
} from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Maintenance 31, the thirteenth review of round M. "What comes in for a lift ('Uncomfortable',
 * 'Hurts', a swap) works a muscle the lift went in for, none the plan's other lifts have given its
 * sets (the lift's own sets done counted), within what the day's muscles have left; never a one-set
 * stand-in." The twelfth review held "Uncomfortable" and "Hurts" to it (`bestAlternative`), but a
 * swap the lifter picks from the swap sheet goes through `applySubstitution` / `standIn` with only
 * a cap at the room left, floored at one set (`Math.max(1, ...)`). So in a lower-body catch-up at
 * the gym, every lift the sheet offers for the leg curl works the glutes, which the back squat has
 * given their three sets: the swap comes in with one set, the glutes get four for three and the
 * hamstrings one for three. And the back squat begun with one set left, swapped from the sheet,
 * takes a one-set stand-in, which "Uncomfortable" and "Hurts" no longer give. Synthetic data only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const lower: CatchUpSpec = {
  kind: 'catch-up',
  muscles: (['quads', 'glutes', 'hamstrings'] as const).map((muscle) => ({
    muscle,
    sets: 3,
    minRir: 1,
    why: 'behind' as const,
  })),
  sitOut: [],
};
const plan = () =>
  generateWorkout({
    profile: profileOf(),
    location: gym,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: lower },
  });
/** What the swap sheet offers for a lift of the plan (as the Today and workout screens rank it). */
const offered = (workout: GeneratedWorkout, entry: WorkoutEntry) =>
  rankAlternatives({
    current: requireExercise(entry.exerciseId),
    context: contextFor({ profile: profileOf(), location: gym }, emptyConstraints()),
    otherExercises: allEntries(workout.blocks)
      .filter((other) => other.id !== entry.id)
      .map((other) => requireExercise(other.exerciseId)),
    plannedSets: { sets: entry.sets.length, restSeconds: entry.restSeconds },
    limit: 6,
  }).candidates.map((candidate) => candidate.exercise.id);
const request = (
  workout: GeneratedWorkout,
  entry: WorkoutEntry,
  exerciseId: string,
  completed: CompletedWork,
): RecalibrationRequest => ({
  trigger: { type: 'replace', entryId: entry.id, exerciseId },
  workout,
  completed,
  lockedEntryIds: [],
  currentEntryId: completed.sets.length > 0 ? entry.id : null,
  duration: 'default',
  profile: profileOf(),
  location: gym,
  loading: { missingPlates: [] },
  history: records,
  constraints: { ...emptyConstraints(), catchUp: lower },
  reason: 'test',
  timestamp: NOW,
});
const setsDone = (entry: WorkoutEntry, count: number): CompletedWork => ({
  ...emptyCompleted(),
  startedAt: count > 0 ? NOW : null,
  elapsedSeconds: 300 * count,
  sets: working(entry)
    .slice(0, count)
    .map((set, index) => ({
      entryId: entry.id,
      exerciseId: entry.exerciseId,
      setIndex: set.index,
      kind: 'working' as const,
      reps: 8,
      weight: set.targetWeight,
      rir: 2,
      completedAt: at(9, 18, index * 4),
    })),
});
/** Each muscle's working sets from lifts that work it directly: a stopped lift's sets done. */
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
/** The rules broken by a result: a muscle given more than it lacks, a lift with one set to do. */
const broken = (workout: GeneratedWorkout, completed: CompletedWork) => [
  ...lower.muscles
    .filter((item) => given(workout, completed, item.muscle) > item.sets)
    .map((item) => `${item.muscle} ${given(workout, completed, item.muscle)} for ${item.sets}`),
  ...allEntries(workout.blocks)
    .filter((entry) => !isStopped(entry) && working(entry).length < CATCH_UP.MIN_SETS)
    .map((entry) => `${entry.exerciseId} x${working(entry).length}`),
];

describe('a swap in a catch-up keeps to the day’s muscles, the thirteenth review of round M', () => {
  it.each([
    ['not begun', 0],
    ['a set done', 1],
  ])('the leg curl (%s) swapped for the Romanian deadlift the sheet offers', (_, done) => {
    const workout = plan();
    const curl = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'leg-curl');
    expect(curl, lifts(workout)).toBeDefined();
    // The back squat has given the glutes their three sets.
    expect(given(workout, emptyCompleted(), 'glutes'), lifts(workout)).toBe(3);
    // Every lift the sheet offers for the leg curl works the glutes directly.
    const sheet = offered(workout, curl!);
    expect(sheet).toContain('romanian-deadlift');
    expect(sheet.every((id) => requireExercise(id).primaryMuscles.includes('glutes'))).toBe(true);
    const completed = setsDone(curl!, done);
    const result = recalibrate(request(workout, curl!, 'romanian-deadlift', completed));
    // Refused, or kept to the rules. On a9f07f3: "Swapped Leg Curl for Romanian Deadlift.",
    // "romanian-deadlift x1": the glutes four sets for three, the hamstrings one (or two) for three.
    if (result.ok) {
      expect(
        broken(result.workout, completed),
        `${result.summary.headline} ${lifts(result.workout)}`,
      ).toEqual([]);
    }
  });

  it('the back squat, two of its three sets done, swapped for the leg press the sheet offers', () => {
    const workout = plan();
    const squat = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'back-squat');
    expect(squat, lifts(workout)).toBeDefined();
    expect(working(squat!).length, lifts(workout)).toBe(3);
    expect(offered(workout, squat!)).toContain('leg-press');
    const completed = setsDone(squat!, 2);
    const result = recalibrate(request(workout, squat!, 'leg-press', completed));
    // Refused, or kept to the rules (the quads and the glutes have one set left: it waits). On
    // a9f07f3: "back-squat x2 (stopped); leg-press x1".
    if (result.ok) {
      expect(
        broken(result.workout, completed),
        `${result.summary.headline} ${lifts(result.workout)}`,
      ).toEqual([]);
    }
  });
});

describe('the swap sheet in a catch-up offers no swap it turns down, the thirteenth review of round M', () => {
  it('the leg curl’s sheet, the back squat having given the glutes their sets: nothing for them', () => {
    const workout = plan();
    const curl = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'leg-curl')!;
    const ranked = rankAlternatives({
      current: requireExercise(curl.exerciseId),
      context: contextFor({ profile: profileOf(), location: gym }, emptyConstraints()),
      otherExercises: allEntries(workout.blocks)
        .filter((other) => other.id !== curl.id)
        .map((other) => requireExercise(other.exerciseId)),
      plannedSets: { sets: curl.sets.length, restSeconds: curl.restSeconds },
      limit: 6,
    });
    expect(ranked.candidates.map((candidate) => candidate.exercise.id)).toContain(
      'romanian-deadlift',
    );
    const day = {
      constraints: { ...emptyConstraints(), catchUp: lower },
      completed: emptyCompleted(),
      history: records,
      timestamp: NOW,
    };
    const offered = swapsOffered(ranked, day, workout, curl);
    // Every lift the sheet ranks works the glutes: none is offered, and the sheet says why.
    expect(offered.candidates).toEqual([]);
    expect(offered.emptyReason).toMatch(/more than they lack/);
    // On a day of the plan the sheet offers them all.
    expect(swapsOffered(ranked, { ...day, constraints: emptyConstraints() }, workout, curl)).toBe(
      ranked,
    );
  });
});

describe('a swap back to a lift stopped earlier in a catch-up, the thirteenth review of round M', () => {
  it('the back squat, a set done, swapped for the hack squat, a set of it, then back: the squat goes on', () => {
    const workout = plan();
    const squat = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'back-squat')!;
    const first = setsDone(squat, 1);
    const swapped = recalibrate(request(workout, squat, 'hack-squat', first));
    if (!swapped.ok) throw new Error(swapped.error);
    const hack = allEntries(swapped.workout.blocks).find(
      (entry) => entry.exerciseId === 'hack-squat',
    )!;
    expect(working(hack).length, lifts(swapped.workout)).toBe(2);
    // A set of the hack squat: it owes one more.
    const hackSet = setsDone(hack, 1).sets[0]!;
    const completed: CompletedWork = { ...first, sets: [...first.sets, hackSet] };
    const back = recalibrate({
      ...request(swapped.workout, hack, 'back-squat', completed),
      constraints: swapped.constraints,
    });
    // The squat picked up again, never a new lift: one set owed is no one-set stand-in.
    if (!back.ok) throw new Error(back.error);
    const again = allEntries(back.workout.blocks).filter(
      (entry) => entry.exerciseId === 'back-squat' && !isStopped(entry),
    );
    expect(again.length, lifts(back.workout)).toBe(1);
  });
});
