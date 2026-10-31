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
import type { CompletedWork } from './types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Maintenance 31 (the fourteenth review of round M): a lift with one set left in a catch-up has
 * nothing come in for it, and the swap sheet and "Uncomfortable" say so, not that nothing fits.
 * Synthetic data only.
 */

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
const constraints = { ...emptyConstraints(), catchUp: lower };
const setsDone = (entry: WorkoutEntry, count: number): CompletedWork => ({
  ...emptyCompleted(),
  startedAt: NOW,
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

describe('the swap sheet gives the refusal’s own reason, the fourteenth review of round M', () => {
  it('the back squat, two of its three sets done: the sheet names its one set left', () => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: lower },
    });
    const squat = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'back-squat')!;
    expect(squat, lifts(plan)).toBeDefined();
    expect(working(squat).length).toBe(3);
    const completed = setsDone(squat, 2);
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
    // What the engine says when one of them is tried: the lift's one set left.
    const tried = recalibrate({
      trigger: { type: 'replace', entryId: squat.id, exerciseId: 'leg-press' },
      workout: plan,
      completed,
      lockedEntryIds: [],
      currentEntryId: squat.id,
      duration: 'default',
      profile: profileOf(),
      location: gym,
      loading: { missingPlates: [] },
      history: records,
      constraints,
      reason: 'test',
      timestamp: NOW,
    });
    expect(tried.ok).toBe(false);
    expect(tried.ok ? '' : tried.error).toMatch(/one set left/);
    expect(sheet.candidates).toEqual([]);
    // On d361edf: "Every alternative would give the catch-up’s muscles more than they lack today."
    expect(sheet.emptyReason).not.toMatch(/more than they lack/);
    expect(sheet.emptyReason).toMatch(/one set/i);
  });

  it('the leg curl, its one alternative refused for the glutes: the sheet gives that reason', () => {
    // The back squat gives the glutes their sets, so the Romanian deadlift for the leg curl would
    // give them more than they lack. The one alternative ranked, the sheet says why it is refused,
    // not the line for alternatives refused for reasons of their own.
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: lower },
    });
    const curl = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'leg-curl')!;
    expect(curl, lifts(plan)).toBeDefined();
    const ranked = rankAlternatives({
      current: requireExercise(curl.exerciseId),
      context: contextFor({ profile: profileOf(), location: gym }, constraints),
      otherExercises: allEntries(plan.blocks)
        .filter((other) => other.id !== curl.id)
        .map((other) => requireExercise(other.exerciseId)),
      plannedSets: { sets: curl.sets.length, restSeconds: curl.restSeconds },
      limit: 1,
    });
    expect(ranked.candidates.map((candidate) => candidate.exercise.id)).toEqual([
      'dumbbell-romanian-deadlift',
    ]);
    const sheet = swapsOffered(
      ranked,
      { constraints, completed: emptyCompleted(), history: records, timestamp: NOW },
      plan,
      curl,
    );
    expect(sheet.candidates).toEqual([]);
    expect(sheet.emptyReason).toBe(
      'Dumbbell Romanian Deadlift would give the glutes more than they lack today.',
    );
  });

  it('the back squat, two of its three sets done, "Uncomfortable": the headline names its one set left', () => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: lower },
    });
    const squat = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'back-squat')!;
    const completed = setsDone(squat, 2);
    const result = recalibrate({
      trigger: { type: 'uncomfortable', entryId: squat.id },
      workout: plan,
      completed,
      lockedEntryIds: [],
      currentEntryId: squat.id,
      duration: 'default',
      profile: profileOf(),
      location: gym,
      loading: { missingPlates: [] },
      history: records,
      constraints,
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    // On d361edf: "Back Squat stops at the sets done: no comfortable alternative fits Gym." — the
    // gym has comfortable squats aplenty (the leg press, the hack squat); what stops it is the one
    // set it owes.
    expect(result.summary.headline).not.toMatch(/no comfortable alternative fits/);
  });
});
