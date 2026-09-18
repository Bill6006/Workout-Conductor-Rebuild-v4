import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { overlapWeight } from '../recovery/sessionContext';
import { recommendNextTarget, type NextTargetInput } from './progression';
import { prescribe } from './roles';

const bench = requireExercise('barbell-bench-press');
const incline = requireExercise('incline-dumbbell-press');
const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
const w = overlapWeight(incline, bench);

/** Bench sets on the reference day: enough overlap for a whole step either way. */
const BENCH_SETS = 8;

/** A day where eight clean bench sets came before three incline sets at 60 per hand. */
function referenceDay(): WorkoutRecord {
  const base = record(
    3,
    'barbell-bench-press',
    Array.from({ length: BENCH_SETS }, () => [6, 185, 2] as [number, number, number]),
  );
  const benchEntry = base.entries[0];
  if (!benchEntry) throw new Error('bench entry');
  const start = Date.parse(base.startedAt);
  const inclineSets = [0, 1, 2].map((index) => ({
    kind: 'working' as const,
    reps: 10,
    weight: 60,
    rir: 2,
    completed: true,
    setIndex: index,
    targetReps: [8, 12] as [number, number],
    targetRir: 2,
    loggedAt: new Date(start + (15 + index * 3) * 60_000).toISOString(),
  }));
  return {
    ...base,
    entries: [
      {
        ...benchEntry,
        sets: benchEntry.sets.map((set, index) => ({
          ...set,
          loggedAt: new Date(start + index * 3 * 60_000).toISOString(),
        })),
      },
      { exerciseId: 'incline-dumbbell-press', plannedSets: 3, sets: inclineSets },
    ],
  };
}

function target(precedingSets: number | null) {
  const input: NextTargetInput = {
    exercise: incline,
    role: 'secondary-hypertrophy',
    prescription: prescribe(incline, 'secondary-hypertrophy', profile),
    history: [referenceDay()],
    profile,
    now: RECORD_NOW,
  };
  return recommendNextTarget(
    precedingSets === null ? input : { ...input, session: { precedingSets } },
  );
}

describe('session fatigue against the reference day', () => {
  it('changes nothing on a day in the usual order, so nothing drifts', () => {
    const plain = target(null);
    const usual = target(BENCH_SETS * w);
    expect(usual.weight).toBe(plain.weight);
    expect(usual.evidence).toEqual(plain.evidence);
    expect(usual.from).toBe(60);
    expect(usual.reference).toMatchObject({ exerciseId: 'incline-dumbbell-press', clean: true });
  });

  it('comes down a step after more overlapping work than the reference day, two after much more', () => {
    const plain = target(null);
    if (plain.weight === null) throw new Error('expected a weight');
    const heavier = target(BENCH_SETS * w + 3);
    expect(heavier.weight).toBe(plain.weight - plain.increment);
    expect(heavier.evidence.at(-1)).toMatch(/on the day the target was set: down a step\.$/);
    const muchHeavier = target(BENCH_SETS * w + 6);
    expect(muchHeavier.weight).toBe(plain.weight - 2 * plain.increment);
  });

  it('goes up a step when today is fresher than a clean reference day', () => {
    const plain = target(null);
    if (plain.weight === null) throw new Error('expected a weight');
    const fresher = target(0);
    expect(fresher.weight).toBe(plain.weight + plain.increment);
    expect(fresher.evidence.at(-1)).toMatch(/fresher, so up a step\.$/);
  });
});
