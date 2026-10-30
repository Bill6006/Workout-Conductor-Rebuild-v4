import { describe, expect, it } from 'vitest';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { CompletedWork } from './types';
import { allEntries, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Fifteenth review of round M. The fourteenth pass made the swap sheet and "Uncomfortable" say that
 * a lift begun with one set left has nothing come in for it because one set is too few, not that
 * nothing fits; "Hurts" still says nothing fits. In the lower-body catch-up at the gym, two of the
 * back squat's three sets done, "Hurts" on the lower back: the squat stops at its sets done, and the
 * workout says "Back Squat stops at the sets done: nothing safe fits right now." The leg press is
 * safe for the lower back (with one squat set done, "Hurts" on the lower back brings it in); what
 * stops the squat is its one set left. The rules: a lift begun with one set owed has nothing come in
 * for it, and says so. Synthetic data only.
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
const plan = () =>
  generateWorkout({
    profile: profileOf(),
    location: gym,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: lower },
  });
const hurts = (done: number) => {
  const workout = plan();
  const squat = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'back-squat')!;
  expect(working(squat).length, describeWorkout(workout).join('; ')).toBe(3);
  const result = recalibrate({
    trigger: { type: 'pain', entryId: squat.id, joint: 'lower-back' },
    workout,
    completed: setsDone(squat, done),
    lockedEntryIds: [],
    currentEntryId: squat.id,
    duration: 'default',
    profile: profileOf(),
    location: gym,
    loading: { missingPlates: [] },
    history: records,
    constraints: { ...emptyConstraints(), catchUp: lower },
    reason: 'test',
    timestamp: NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
};

describe('"Hurts" on a lift begun with one set left says why nothing comes in', () => {
  it('the back squat, two of three sets done, "Hurts" on the lower back', () => {
    // With one set done, two left, a safe lift does come in for the lower back: the leg press.
    const two = hurts(1);
    expect(describeWorkout(two.workout).join('; ')).toMatch(/leg-press x2/);
    const result = hurts(2);
    const words = [result.summary.headline, ...result.summary.details].join(' | ');
    const detail = `${words} || ${describeWorkout(result.workout).join('; ')}`;
    expect(describeWorkout(result.workout), detail).toContain('back-squat x2 @RIR 2/2');
    // On 3290cd8: "Back Squat stops at the sets done: nothing safe fits right now."
    expect(words, detail).not.toMatch(/nothing safe fits/);
    expect(words, detail).toMatch(/one set/i);
  });
});
