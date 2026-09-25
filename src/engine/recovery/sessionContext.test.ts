import { describe, expect, it } from 'vitest';
import { getExercise, requireExercise } from '../../catalog/exercises/catalog';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record } from '../../test/records';
import {
  LONG_BREAK_MINUTES,
  fatigueSteps,
  overlapWeight,
  precedingWorkInRecord,
  precedingWorkToday,
  stepsOfSessionLine,
  type EarlierWork,
} from './sessionContext';

const bench = requireExercise('barbell-bench-press');
const incline = requireExercise('incline-dumbbell-press');
const squat = requireExercise('back-squat');
const NOW = '2026-09-18T15:00:00.000Z';
const minutesAgo = (minutes: number) => new Date(Date.parse(NOW) - minutes * 60_000).toISOString();
const w = overlapWeight(incline, bench);

describe('overlap between exercises', () => {
  it('is full on shared muscles, half within a group, nothing across groups', () => {
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThanOrEqual(1);
    expect(overlapWeight(bench, bench)).toBe(1);
    expect(overlapWeight(bench, squat)).toBe(0);
  });
});

describe('what came before an exercise today', () => {
  const benchWork = (doneAt: string[], planned = 4, skipped = 0): EarlierWork => ({
    exercise: bench,
    planned,
    doneAt,
    skipped,
  });

  it('counts sets done and sets still to come, weighted by overlap', () => {
    const fresh = precedingWorkToday(incline, [benchWork([])], NOW);
    expect(fresh.sets).toBeCloseTo(4 * w, 5);
    expect(fresh.afterBreak).toBe(false);
    const halfway = precedingWorkToday(incline, [benchWork([minutesAgo(6), minutesAgo(3)])], NOW);
    expect(halfway.sets).toBeCloseTo(4 * w, 5);
    expect(halfway.lastSetAt).toBe(minutesAgo(3));
  });

  it('drops skipped sets, and unrelated work counts nothing', () => {
    const cut = precedingWorkToday(incline, [benchWork([minutesAgo(6), minutesAgo(3)], 4, 2)], NOW);
    expect(cut.sets).toBeCloseTo(2 * w, 5);
    const legs = precedingWorkToday(
      incline,
      [{ exercise: squat, planned: 5, doneAt: [minutesAgo(10)], skipped: 0 }],
      NOW,
    );
    expect(legs.sets).toBe(0);
  });

  it('a long break makes what follows a fresher start: earlier work counts half', () => {
    const stamps = [50, 47, 44, 41].map(minutesAgo);
    const after = precedingWorkToday(incline, [benchWork(stamps)], NOW);
    expect(after.afterBreak).toBe(true);
    expect(after.sets).toBeCloseTo(4 * w * 0.5, 5);
    const soon = precedingWorkToday(
      incline,
      [benchWork(stamps)],
      minutesAgo(41 - LONG_BREAK_MINUTES + 1),
    );
    expect(soon.afterBreak).toBe(false);
    expect(soon.sets).toBeCloseTo(4 * w, 5);
  });
});

describe('the same measure on the day a target came from', () => {
  function day(gapMinutes: number): WorkoutRecord {
    const base = record(3, 'barbell-bench-press', [
      [6, 185, 2],
      [6, 185, 2],
      [6, 185, 2],
      [6, 185, 2],
    ]);
    const start = Date.parse(base.startedAt);
    const benchEntry = base.entries[0];
    if (!benchEntry) throw new Error('bench entry');
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
        {
          exerciseId: 'incline-dumbbell-press',
          plannedSets: 3,
          sets: [
            {
              kind: 'working' as const,
              reps: 8,
              weight: 60,
              rir: 2,
              completed: true,
              setIndex: 0,
              loggedAt: new Date(start + (9 + gapMinutes) * 60_000).toISOString(),
            },
          ],
        },
      ],
    };
  }

  it('counts the completed working sets of the entries before it', () => {
    expect(precedingWorkInRecord(day(5), 'incline-dumbbell-press', getExercise)).toBeCloseTo(
      4 * w,
      5,
    );
    expect(precedingWorkInRecord(day(5), 'barbell-bench-press', getExercise)).toBe(0);
    expect(precedingWorkInRecord(day(5), 'back-squat', getExercise)).toBeNull();
  });

  it('halves the work before a long break in that session too', () => {
    expect(precedingWorkInRecord(day(45), 'incline-dumbbell-press', getExercise)).toBeCloseTo(
      2 * w,
      5,
    );
  });
});

describe('what the difference is worth', () => {
  it('three more sets is a step down, six is two, three fewer is a step up only on a clean day', () => {
    expect(fatigueSteps(4, 4, true).steps).toBe(0);
    expect(fatigueSteps(6, 4, true).steps).toBe(0);
    expect(fatigueSteps(7, 4, false)).toMatchObject({ steps: -1 });
    expect(fatigueSteps(7, 4, false).line).toMatch(/about 7 sets .* against 4 .*: down a step/);
    expect(fatigueSteps(10, 4, false).steps).toBe(-2);
    expect(fatigueSteps(0, 4, true)).toMatchObject({ steps: 1 });
    expect(fatigueSteps(0, 4, true).line).toMatch(/fresher, so up a step/);
    expect(fatigueSteps(0, 4, false).steps).toBe(0);
    expect(fatigueSteps(0, 4, false).line).toBeNull();
  });

  it('each line reads back as the steps it took, for a plan saved before they were recorded', () => {
    for (const [today, reference, clean] of [
      [10, 4, false],
      [7, 4, false],
      [0, 4, true],
    ] as const) {
      const { steps, line } = fatigueSteps(today, reference, clean);
      expect(stepsOfSessionLine(line as string)).toBe(steps);
    }
    expect(stepsOfSessionLine('From your last sessions: down a step.')).toBe(0);
  });
});
