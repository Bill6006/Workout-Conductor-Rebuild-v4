import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { rankAlternatives } from '../../engine/alternatives/rankAlternatives';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import {
  contextFor,
  emptyCompleted,
  emptyConstraints,
  recalibrate,
  swapsOffered,
} from './recalibrate';
import type { RecalibrationRequest } from './types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, directSets, gym, profileOf, session } from '../../test/clockDays';

/**
 * Maintenance 31 (the fourteenth review of round M): the lifter's swap in a catch-up or a second
 * workout, and the swap sheet, bring in no lift for a muscle that rests today or sits out, as what
 * comes in for comfort or pain does. Synthetic data only.
 */

// Leg extensions yesterday evening (the quads rest today) and a row last Thursday; Wednesday the
// 9th, 6 pm, a day the default profile does not tick.
const records = [
  session(at(3, 18), [['barbell-row', 3]]),
  session(at(8, 18), [['leg-extension', 3]]),
];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [{ muscle: 'glutes', sets: 3, minRir: 1, why: 'behind' }],
  sitOut: [],
};
const constraints = { ...emptyConstraints(), catchUp: spec };

describe('the lifter’s swap in a catch-up brings in no lift for a muscle that rests, the fourteenth review of round M', () => {
  it('the dumbbell Romanian deadlift for the glutes, the quads trained yesterday', () => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    // The plan itself gives the quads nothing.
    expect(directSets(plan, 'quads'), lifts(plan)).toBe(0);
    const entry = allEntries(plan.blocks).find(
      (candidate) => candidate.exerciseId === 'dumbbell-romanian-deadlift',
    ) as WorkoutEntry;
    expect(entry, lifts(plan)).toBeDefined();
    // The swap sheet, as Today ranks it and filters it.
    const sheet = swapsOffered(
      rankAlternatives({
        current: requireExercise(entry.exerciseId),
        context: contextFor({ profile: profileOf(), location: gym }, constraints),
        otherExercises: allEntries(plan.blocks)
          .filter((other) => other.id !== entry.id)
          .map((other) => requireExercise(other.exerciseId)),
        plannedSets: { sets: entry.sets.length, restSeconds: entry.restSeconds },
        limit: 6,
      }),
      { constraints, completed: emptyCompleted(), history: records, timestamp: NOW },
      plan,
      entry,
    );
    const offered = sheet.candidates.map((candidate) => candidate.exercise);
    const forQuads = offered.filter((exercise) => exercise.primaryMuscles.includes('quads'));
    // The sheet offers no lift that works the quads directly. On d361edf: the trap-bar deadlift.
    expect(
      forQuads.map((exercise) => exercise.id),
      offered.map((exercise) => exercise.id).join(', '),
    ).toEqual([]);
  });

  it('swapped in from the sheet anyway, the quads take sets the day leaves them none of', () => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const entry = allEntries(plan.blocks).find(
      (candidate) => candidate.exerciseId === 'dumbbell-romanian-deadlift',
    ) as WorkoutEntry;
    const request: RecalibrationRequest = {
      trigger: { type: 'replace', entryId: entry.id, exerciseId: 'trap-bar-deadlift' },
      workout: plan,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: profileOf(),
      location: gym,
      loading: { missingPlates: [] },
      history: records,
      constraints,
      reason: 'test',
      timestamp: NOW,
    };
    const result = recalibrate(request);
    // Refused with the reason, or the quads given nothing. On d361edf: "Swapped Dumbbell Romanian
    // Deadlift for Trap Bar Deadlift.", the quads three direct sets the day after they were trained.
    if (result.ok) {
      expect(
        directSets(result.workout, 'quads'),
        `${result.summary.headline} ${lifts(result.workout)}`,
      ).toBe(0);
    }
  });

  it('a second workout: the triceps sit out, the sheet offers the overhead press for the Arnold press', () => {
    // An overhead press this morning: the triceps sit out tonight, the front delts take what is left.
    const today = [...records, session(at(9, 9), [['overhead-press', 3]])];
    const second: CatchUpSpec = {
      kind: 'second',
      muscles: [{ muscle: 'front-delts', sets: 2, minRir: 3, why: 'remainder' }],
      sitOut: ['triceps'],
    };
    const day = { ...emptyConstraints(), catchUp: second };
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: today,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: second },
    });
    expect(directSets(plan, 'triceps'), lifts(plan)).toBe(0);
    const entry = allEntries(plan.blocks).find(
      (candidate) => candidate.exerciseId === 'arnold-press',
    ) as WorkoutEntry;
    expect(entry, lifts(plan)).toBeDefined();
    const sheet = swapsOffered(
      rankAlternatives({
        current: requireExercise(entry.exerciseId),
        context: contextFor({ profile: profileOf(), location: gym }, day),
        otherExercises: allEntries(plan.blocks)
          .filter((other) => other.id !== entry.id)
          .map((other) => requireExercise(other.exerciseId)),
        plannedSets: { sets: entry.sets.length, restSeconds: entry.restSeconds },
        limit: 6,
      }),
      { constraints: day, completed: emptyCompleted(), history: today, timestamp: NOW },
      plan,
      entry,
    );
    const offered = sheet.candidates.map((candidate) => candidate.exercise);
    const result = recalibrate({
      trigger: { type: 'replace', entryId: entry.id, exerciseId: 'overhead-press' },
      workout: plan,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: profileOf(),
      location: gym,
      loading: { missingPlates: [] },
      history: today,
      constraints: day,
      reason: 'test',
      timestamp: NOW,
    });
    const details = `sheet: ${offered.map((exercise) => exercise.id).join(', ')} | ${result.ok ? `${result.summary.headline} ${lifts(result.workout)}` : result.error}`;
    // On d361edf the sheet offers it, and "Swapped Arnold Press for Overhead Press." gives the
    // triceps, trained this morning, two more direct sets.
    expect(
      offered.filter((exercise) => exercise.primaryMuscles.includes('triceps')).map((e) => e.id),
      details,
    ).toEqual([]);
    if (result.ok) expect(directSets(result.workout, 'triceps'), details).toBe(0);
  });
});
