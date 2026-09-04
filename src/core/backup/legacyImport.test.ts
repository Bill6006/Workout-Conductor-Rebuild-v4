import { describe, expect, it } from 'vitest';
import { WorkoutRecordSchema } from '../validation/workoutRecord';
import {
  legacyRecordId,
  normalizeName,
  parseLegacyExport,
  planLegacyImport,
  type LegacySession,
} from './legacyImport';

const resolve = (nameOrId: string): string | null => {
  const known: Record<string, string> = {
    'barbell-bench-press': 'barbell-bench-press',
    'barbell bench press': 'barbell-bench-press',
    'bench press barbell': 'barbell-bench-press',
    'dumbbell row': 'dumbbell-row',
  };
  return known[nameOrId] ?? known[normalizeName(nameOrId)] ?? null;
};

const SAMPLE = {
  exportedBy: 'some older app',
  units: 'kg',
  history: [
    {
      date: '2026-05-01T18:00:00Z',
      name: 'Push A',
      unit: 'kg',
      exercises: [
        {
          exercise: 'Barbell Bench-Press',
          sets: [
            { weight: 40, reps: 8, type: 'warmup' },
            { weight: 80, reps: 5, rir: 2 },
            { weight: '80', reps: '5', reserve: 1 },
          ],
        },
        { name: 'Mystery Machine', sets: [{ weight: 10, reps: 10 }] },
        { name: 'Dumbbell Row', sets: [] },
      ],
    },
    {
      timestamp: 1748800000000,
      entries: [{ exerciseId: 'dumbbell-row', logs: [{ load: 30, reps: 12 }] }],
    },
    { date: 'not a date', exercises: [] },
    { date: '2026-05-03T18:00:00Z', exercises: [{ name: 'Nothing known', sets: [{ reps: 5 }] }] },
  ],
};

describe('parseLegacyExport', () => {
  it('reads sessions, exercises, and sets from a forgiving shape', () => {
    const result = parseLegacyExport(JSON.stringify(SAMPLE), resolve);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shape).toBe('history list');
    expect(result.sessions).toHaveLength(3);
    const first = result.sessions[0]!;
    expect(first.title).toBe('Push A');
    expect(first.unit).toBe('kg');
    expect(first.exercises.map((exercise) => exercise.exerciseId)).toEqual([
      'barbell-bench-press',
      null,
      'dumbbell-row',
    ]);
    expect(first.exercises[0]!.sets).toEqual([
      { weight: 40, reps: 8, rir: null, warmup: true },
      { weight: 80, reps: 5, rir: 2, warmup: false },
      { weight: 80, reps: 5, rir: 1, warmup: false },
    ]);
    expect(result.sessions[1]!.startedAt).toBe('2025-06-01T17:46:40.000Z');
    expect(result.sessions[1]!.exercises[0]!.exerciseId).toBe('dumbbell-row');
  });

  it('accepts a bare array and rejects the wrong files with plain messages', () => {
    const bare = parseLegacyExport(
      JSON.stringify([{ startedAt: '2026-01-01T10:00:00Z', items: [] }]),
      resolve,
    );
    expect(bare.ok).toBe(true);
    if (bare.ok) expect(bare.shape).toBe('array of sessions');
    expect(parseLegacyExport('nope', resolve)).toEqual({
      ok: false,
      error: 'This file is not valid JSON.',
    });
    const current = parseLegacyExport(
      JSON.stringify({ format: 'workout-conductor-backup', schemaVersion: 2 }),
      resolve,
    );
    expect(current.ok).toBe(false);
    if (!current.ok) expect(current.error).toMatch(/Import Full Backup JSON/);
    const empty = parseLegacyExport(JSON.stringify({ hello: 'world' }), resolve);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toMatch(/No workout list/);
    const noDates = parseLegacyExport(JSON.stringify({ workouts: [{ exercises: [] }] }), resolve);
    expect(noDates.ok).toBe(false);
    if (!noDates.ok) expect(noDates.error).toMatch(/readable date/);
  });
});

describe('planLegacyImport', () => {
  it('builds valid workout records, converts units, skips unknown exercises, and stays idempotent', () => {
    const parsed = parseLegacyExport(JSON.stringify(SAMPLE), resolve);
    if (!parsed.ok) throw new Error(parsed.error);
    const plan = planLegacyImport(parsed.sessions, {
      units: 'lb',
      importedAt: '2026-09-04T12:00:00.000Z',
      existingIds: new Set(),
    });
    expect(plan.sessionCount).toBe(3);
    expect(plan.records).toHaveLength(2);
    expect(plan.emptySessions).toBe(1);
    expect(plan.setCount).toBe(4);
    expect(plan.matchedExercises).toEqual(['barbell-bench-press', 'dumbbell-row']);
    expect(plan.skippedExercises).toEqual([
      { name: 'Mystery Machine', sets: 1 },
      { name: 'Nothing known', sets: 1 },
    ]);
    expect(plan.firstDate).toBe('2025-06-01T17:46:40.000Z');
    expect(plan.lastDate).toBe('2026-05-01T18:00:00.000Z');

    const bench = plan.records.find((record) => record.title === 'Push A')!;
    expect(WorkoutRecordSchema.safeParse(bench).success).toBe(true);
    expect(bench.entries[0]!.sets.map((set) => set.weight)).toEqual([88, 176.5, 176.5]);
    expect(bench.entries[0]!.sets[0]!.kind).toBe('warmup');
    expect(bench.entries).toHaveLength(1);
    expect((bench as { source?: string }).source).toBe('legacy-import');

    const again = planLegacyImport(parsed.sessions, {
      units: 'lb',
      importedAt: '2026-09-05T12:00:00.000Z',
      existingIds: new Set(plan.records.map((record) => record.id)),
    });
    expect(again.records).toHaveLength(0);
    expect(again.alreadyImported).toBe(2);
  });

  it('keeps weights as they are when the units already match, and ids are stable', () => {
    const session: LegacySession = {
      index: 4,
      startedAt: '2026-02-02T08:00:00.000Z',
      completedAt: null,
      title: null,
      unit: 'lb',
      exercises: [
        {
          name: 'Dumbbell Row',
          exerciseId: 'dumbbell-row',
          sets: [{ weight: 50, reps: 10, rir: null, warmup: false }],
        },
      ],
    };
    expect(legacyRecordId(session)).toBe('legacy-20260202080000-4');
    const plan = planLegacyImport([session], {
      units: 'lb',
      importedAt: '2026-09-04T12:00:00.000Z',
      existingIds: new Set(),
    });
    expect(plan.records[0]!.entries[0]!.sets[0]!.weight).toBe(50);
    expect(plan.records[0]!.completedAt).toBe('2026-02-02T08:00:00.000Z');
  });
});
