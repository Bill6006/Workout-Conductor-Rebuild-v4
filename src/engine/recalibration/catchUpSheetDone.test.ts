import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { rankAlternatives } from '../alternatives/rankAlternatives';
import type { CatchUpSpec } from '../planning/catchUp';
import {
  contextFor,
  emptyCompleted,
  emptyConstraints,
  recalibrate,
  swapsOffered,
} from './recalibrate';
import type { CompletedWork } from './types';
import { allEntries, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Fifteenth review of round M. The swap sheet gives the refusal's own reason when it offers nothing
 * (the fourteenth pass), and `catchUpRefusal` calls any lift begun with fewer than two sets owed one
 * with "one set left", a lift with every set done among them. In the lower-body catch-up at the gym,
 * the back squat's three sets done, its sheet (the workout screen opens it on a finished lift too)
 * says "Back Squat has one set left, too few for another lift to take over." It has none left: the
 * engine itself says "Back Squat is done: nothing is left to swap." The rules: the sheet says why it
 * offers none. Synthetic data only.
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
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
const constraints = { ...emptyConstraints(), catchUp: lower };
const allDone = (entry: WorkoutEntry): CompletedWork => ({
  ...emptyCompleted(),
  startedAt: NOW,
  elapsedSeconds: 900,
  sets: working(entry).map((set, index) => ({
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

describe('the swap sheet on a finished lift in a catch-up says it is done', () => {
  it('the back squat, all three sets done', () => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: lower },
    });
    const squat = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'back-squat')!;
    expect(working(squat).length, describeWorkout(plan).join('; ')).toBe(3);
    const completed = allDone(squat);
    const sheet = swapsOffered(
      rankAlternatives({
        current: requireExercise(squat.exerciseId),
        context: contextFor({ profile: profileOf(), location: gym }, constraints),
        otherExercises: allEntries(plan.blocks)
          .filter((other) => other.id !== squat.id)
          .map((other) => requireExercise(other.exerciseId)),
        plannedSets: { sets: squat.sets.length, restSeconds: squat.restSeconds },
        limit: 6,
      }),
      { constraints, completed, history: records, timestamp: NOW },
      plan,
      squat,
    );
    const tried = recalibrate({
      trigger: { type: 'replace', entryId: squat.id, exerciseId: 'leg-press' },
      workout: plan,
      completed,
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
    });
    expect(tried.ok ? '' : tried.error).toBe('Back Squat is done: nothing is left to swap.');
    expect(sheet.candidates).toEqual([]);
    // On 3290cd8: "Back Squat has one set left, too few for another lift to take over."
    expect(sheet.emptyReason).not.toMatch(/one set left/);
  });
});
