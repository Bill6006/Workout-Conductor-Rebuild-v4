import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../core/validation/profile';
import { RECORD_NOW, record } from '../../test/records';
import {
  bandFor,
  confidenceFor,
  consistencyScore,
  durationEfficiency,
  estimatedStrength,
  exerciseProgress,
  muscleCoverage,
  painPatterns,
  rankings,
  techniqueUsage,
} from './analytics';

const profile = createDefaultProfile(RECORD_NOW);

describe('analytics', () => {
  it('buckets consistency by calendar week with a streak and an honest average', () => {
    const history = [
      record(0, 'barbell-bench-press', [[5, 185, 2]]),
      record(2, 'cable-fly', [[12, 40, 1]], [10, 15], 1),
      record(9, 'lat-pulldown', [[10, 120, 1]], [8, 12], 1),
      record(16, 'back-squat', [[5, 225, 2]], [4, 6], 2),
    ];
    const score = consistencyScore(history, profile, RECORD_NOW);
    expect(score.value.weeks).toHaveLength(8);
    expect(score.value.planned).toBe(4);
    expect(score.value.thisWeek).toBe(2);
    expect(score.value.streakWeeks).toBeGreaterThanOrEqual(3);
    expect(score.samples).toBe(4);
    expect(score.definition).toContain('Monday to Sunday');
    expect(score.data[score.data.length - 1]).toMatch(/: 2 of 4$/);
    const empty = consistencyScore([], profile, RECORD_NOW);
    expect(empty.confidence).toBe('none');
    expect(empty.value.averagePerWeek).toBeNull();
  });

  it('bands weekly coverage against targets and puts priority muscles first', () => {
    expect(bandFor(5, 10)).toBe('under');
    expect(bandFor(9, 10)).toBe('in');
    expect(bandFor(14, 10)).toBe('over');
    const history = [
      record(1, 'barbell-bench-press', [
        [5, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
      ]),
      record(
        2,
        'ez-bar-curl',
        [
          [10, 60, 1],
          [10, 60, 1],
        ],
        [8, 12],
        1,
      ),
    ];
    const rows = muscleCoverage(history, profile, RECORD_NOW);
    expect(rows[0]?.priority).toBe(true);
    const chest = rows.find((row) => row.muscle === 'chest');
    expect(chest).toMatchObject({ direct: 4, target: 10, band: 'under' });
    const biceps = rows.find((row) => row.muscle === 'biceps');
    expect(biceps?.direct).toBe(2);
    expect(biceps?.priority).toBe(true);
    expect(confidenceFor(6)).toBe('high');
  });

  it('tracks exercise progress, estimated strength, and rankings', () => {
    const history = [
      record(9, 'barbell-bench-press', [[5, 175, 2]]),
      record(6, 'barbell-bench-press', [[5, 180, 2]]),
      record(3, 'barbell-bench-press', [[5, 185, 2]]),
      record(0, 'barbell-bench-press', [[5, 190, 2]]),
      record(2, 'pec-deck', [[12, 100, 1]], [10, 15], 1, {
        entries: [
          {
            exerciseId: 'pec-deck',
            replacedFrom: 'cable-fly',
            plannedSets: 1,
            sets: [{ kind: 'working', reps: 12, weight: 100, rir: 1, completed: true }],
          },
        ],
        skippedExerciseIds: ['lateral-raise'],
      }),
    ];
    const progress = exerciseProgress(history);
    const bench = progress.find((row) => row.exerciseId === 'barbell-bench-press');
    expect(bench).toMatchObject({ sessions: 4, timesReplaced: 0 });
    expect(bench?.best.weight).toBe(190);
    expect(bench?.trendPct).toBeGreaterThan(5);
    expect(progress.find((row) => row.exerciseId === 'cable-fly')?.timesReplaced).toBe(1);
    expect(progress.find((row) => row.exerciseId === 'lateral-raise')?.timesSkipped).toBe(1);

    const strength = estimatedStrength(progress, 'lb');
    expect(strength.value[0]).toMatchObject({
      exerciseId: 'barbell-bench-press',
      weight: 190,
      reps: 5,
    });
    expect(Math.round(strength.value[0]?.e1rm ?? 0)).toBe(222);
    expect(strength.definition).toContain('Epley');

    const ranked = rankings(progress);
    expect(ranked.mostProductive[0]?.exerciseId).toBe('barbell-bench-press');
    expect(ranked.frequentlyReplaced).toEqual([]);
  });

  it('scores duration efficiency, pain patterns, and technique usage with sample counts', () => {
    const history = [
      record(
        0,
        'barbell-bench-press',
        [
          [5, 185, 2],
          [5, 185, 2],
        ],
        [4, 6],
        2,
        {
          elapsedSeconds: 30 * 60,
          plannedMinutes: 45,
          painJoints: ['shoulder'],
          rating: { effort: 'right', pain: true, energyAfter: 3, note: '' },
        },
      ),
      record(3, 'cable-fly', [[12, 40, 1]], [10, 15], 1, {
        elapsedSeconds: 50 * 60,
        plannedMinutes: 45,
        entries: [
          {
            exerciseId: 'cable-fly',
            blockKind: 'superset',
            role: 'isolation',
            sets: [
              { kind: 'working', reps: 12, weight: 40, rir: 1, completed: true },
              { kind: 'drop', reps: 10, weight: 30, rir: 0, completed: true },
            ],
          },
        ],
      }),
    ];
    const efficiency = durationEfficiency(history);
    expect(efficiency.samples).toBe(2);
    expect(efficiency.value.averagePlannedMinutes).toBe(45);
    expect(efficiency.value.averageActualMinutes).toBe(40);
    expect(efficiency.value.averageRatio).toBeCloseTo(0.89, 2);
    expect(efficiency.confidence).toBe('low');

    const pain = painPatterns(history);
    expect(pain.value).toEqual([{ joint: 'shoulder', count: 1 }]);
    expect(pain.explanation).toContain('1 of the last 2 sessions');

    const techniques = techniqueUsage(history);
    expect(techniques.value).toMatchObject({
      supersetSessions: 1,
      dropSets: 1,
      strengthSets: 2,
      hypertrophySets: 1,
    });
    expect(durationEfficiency([]).confidence).toBe('none');
    const tooShort = durationEfficiency([
      record(0, 'barbell-bench-press', [[5, 185, 2]], [4, 6], 2, {
        elapsedSeconds: 20,
        plannedMinutes: 45,
      }),
    ]);
    expect(tooShort.value.setsPer10Min).toBeNull();
    expect(tooShort.explanation).toContain('at least five minutes');
  });
});
