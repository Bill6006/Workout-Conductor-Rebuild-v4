import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../core/validation/profile';
import { maxFromSet } from '../progression/maxes';
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
  sessionMax,
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

  it('reads a set as the max sheet does, every rep to thirty, and gives every weighed lift its max (Maintenance 25)', () => {
    const lifts = [
      'barbell-bench-press',
      'incline-dumbbell-press',
      'dumbbell-bench-press',
      'overhead-press',
      'barbell-row',
      'lat-pulldown',
      'dumbbell-curl',
      'back-squat',
    ];
    const history = lifts.map((exerciseId, index) =>
      record(index + 1, exerciseId, [[25, 20 + index * 5, 1]], [20, 25], 1),
    );
    const progress = exerciseProgress(history);
    const strength = estimatedStrength(progress, 'lb');
    // Eight lifts, eight estimates: none left out for being lighter than the six heaviest.
    expect(strength.value).toHaveLength(lifts.length);
    for (const row of progress) {
      const [set] = row.points[0]?.sets ?? [];
      // The max sheet's reading of the same set: 20 × 25 gives about 37 lb, not 28.
      expect(row.best.e1rm).toBe(maxFromSet(set?.weight as number, set?.reps as number));
    }
    expect(progress.find((row) => row.exerciseId === 'barbell-bench-press')?.best.e1rm).toBeCloseTo(
      36.7,
      1,
    );
  });

  it('reads each session of a lift as its row does, and counts every session (Maintenance 25)', () => {
    const history = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19].map((daysAgo, index) =>
      record(daysAgo, 'dumbbell-bench-press', [[15 + (index % 3) * 5, 20, 1]], [15, 25], 1),
    );
    // A session with two weights among the newest: its heaviest set and its own reps (the third
    // review), not the heaviest weight with another set's reps.
    history.push(
      record(4, 'dumbbell-bench-press', [
        [5, 100, 2],
        [15, 60, 2],
      ]),
    );
    // The heaviest session of all is the oldest, past the newest eight.
    history.push(record(40, 'dumbbell-bench-press', [[6, 110, 2]]));
    const [row] = exerciseProgress(history);
    // Twelve sessions logged: all of them counted, all of them listed, and the best read from all.
    expect(row?.sessions).toBe(12);
    expect(row?.points).toHaveLength(12);
    for (const point of row?.points ?? []) {
      const best = Math.max(...point.sets.map((set) => maxFromSet(set.weight as number, set.reps)));
      expect(sessionMax(point, 'dumbbell-bench-press')).toBe(best);
    }
    const twoWeights = row?.points.find((point) => point.sets.length === 2);
    expect(sessionMax(twoWeights!, 'dumbbell-bench-press')).toBeCloseTo(116.7, 1);
    expect(row?.best).toMatchObject({ weight: 110, reps: 6, e1rm: maxFromSet(110, 6) });
    // The trend still reads the newest four: 20 lb × 15 now against 20 lb × 25 four sessions back.
    expect(row?.trendPct).toBe(
      Math.round(((maxFromSet(20, 15) - maxFromSet(20, 25)) / maxFromSet(20, 25)) * 1000) / 10,
    );
  });

  it('reads no max for a hold or a lift with no load reference, and names a set as lifted (the third review)', () => {
    const history = [
      // Weight added to a pull-up is not a max of the pull-up.
      record(1, 'pull-up', [
        [12, 5, 2],
        [5, 10, 1],
      ]),
      record(3, 'pull-up', [[6, 10, 2]]),
      // A loaded hold: the most load times seconds is 50 lb for 40 s, a set that was lifted.
      record(2, 'farmer-carry', [
        [40, 50, null],
        [30, 60, null],
      ]),
    ];
    const rows = exerciseProgress(history);
    const pullUp = rows.find((row) => row.exerciseId === 'pull-up')!;
    expect(pullUp.best).toMatchObject({ weight: 5, reps: 12, e1rm: null });
    expect(pullUp.latestE1rm).toBeNull();
    expect(pullUp.trendPct).toBeNull();
    for (const point of pullUp.points) expect(sessionMax(point, 'pull-up')).toBeNull();
    const carry = rows.find((row) => row.exerciseId === 'farmer-carry')!;
    expect(carry.best).toMatchObject({ weight: 50, reps: 40, e1rm: null });
    expect(estimatedStrength(rows, 'lb').value).toEqual([]);
  });

  it('names the same best set with no max however the sets fall into sessions (the fourth review)', () => {
    const bestOf = (exerciseId: string, history: ReturnType<typeof record>[]) =>
      exerciseProgress(history).find((row) => row.exerciseId === exerciseId)!.best;
    // A pull-up: 20 lb for 6 in the older session, beside 12 at bodyweight; 8 at bodyweight since.
    expect(
      bestOf('pull-up', [
        record(3, 'pull-up', [
          [12, null, 1],
          [6, 20, 1],
        ]),
        record(1, 'pull-up', [[8, null, 1]]),
      ]),
    ).toMatchObject({ weight: 20, reps: 6, e1rm: null });
    // Two loads in two sessions: the same set as in one session.
    const apart = bestOf('pull-up', [
      record(3, 'pull-up', [[6, 10, 1]]),
      record(1, 'pull-up', [[3, 25, 1]]),
    ]);
    const together = bestOf('pull-up', [
      record(1, 'pull-up', [
        [6, 10, 1],
        [3, 25, 1],
      ]),
    ]);
    expect(apart).toMatchObject({ weight: together.weight, reps: together.reps });
    expect(
      bestOf('band-row', [
        record(3, 'band-row', [[15, null, 1]]),
        record(1, 'band-row', [[12, 10, 1]]),
      ]),
    ).toMatchObject({ weight: 10, reps: 12 });
    // Holds: the most load times seconds.
    expect(
      bestOf('farmer-carry', [
        record(3, 'farmer-carry', [[30, 100, null]]),
        record(1, 'farmer-carry', [[45, 20, null]]),
      ]),
    ).toMatchObject({ weight: 100, reps: 30 });
    expect(
      bestOf('plank', [
        record(3, 'plank', [[60, null, null]]),
        record(1, 'plank', [[45, 25, null]]),
      ]),
    ).toMatchObject({ weight: 25, reps: 45 });
  });

  it('gives the estimates the typical lift’s confidence, not the least-done lift’s (the third review)', () => {
    const often = [1, 3, 5, 7, 9, 11, 13, 15].map((daysAgo) =>
      record(daysAgo, 'barbell-bench-press', [[5, 185, 2]]),
    );
    const alsoOften = [2, 4, 6, 8, 10, 12, 14, 16].map((daysAgo) =>
      record(daysAgo, 'back-squat', [[5, 225, 2]]),
    );
    const once = [record(17, 'overhead-press', [[5, 95, 2]])];
    const strength = estimatedStrength(exerciseProgress([...often, ...alsoOften, ...once]), 'lb');
    expect(strength.value.map((item) => item.sessions).sort((a, b) => a - b)).toEqual([1, 8, 8]);
    expect(strength.confidence).toBe('high');
    // Two lifts, one done once: the lower of the two.
    const two = estimatedStrength(exerciseProgress([...often, ...once]), 'lb');
    expect(two.confidence).toBe('low');
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
