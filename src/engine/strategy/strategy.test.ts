import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record } from '../../test/records';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy, sessionFeedback } from './strategy';

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);

function analyze(history: WorkoutRecord[]) {
  return analyzeStrategy({ history, profile, now: NOW, fatigue: interpretFatigue(history, NOW) });
}

describe('multi-session strategy', () => {
  it('never diagnoses from one session', () => {
    expect(
      analyze([
        record(1, 'barbell-bench-press', [
          [3, 185, 0],
          [3, 185, 0],
        ]),
      ]),
    ).toEqual([]);
  });

  it('spots a load plateau when the top of the range is hit at the same load three times', () => {
    const history = [
      record(2, 'barbell-bench-press', [
        [6, 185, 2],
        [6, 185, 2],
        [6, 185, 1],
      ]),
      record(5, 'barbell-bench-press', [
        [6, 185, 2],
        [6, 185, 2],
        [6, 185, 2],
      ]),
      record(8, 'barbell-bench-press', [
        [6, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
      ]),
    ];
    const insight = analyze(history).find((item) => item.kind === 'load');
    expect(insight).toMatchObject({
      recommendation: 'add-weight',
      exerciseId: 'barbell-bench-press',
      sessions: 3,
      confidence: 'high',
    });
    expect(insight?.why[0]).toContain('185 lb');
  });

  it('recommends a micro-deload when the floor is missed twice at the same load', () => {
    const history = [
      record(2, 'barbell-bench-press', [
        [3, 185, 0],
        [3, 185, 0],
      ]),
      record(5, 'barbell-bench-press', [
        [3, 185, 0],
        [3, 185, 0],
      ]),
      record(8, 'barbell-bench-press', [
        [5, 185, 2],
        [5, 185, 2],
      ]),
    ];
    expect(analyze(history).find((item) => item.kind === 'load')).toMatchObject({
      recommendation: 'micro-deload',
      severity: 3,
    });
  });

  it('recommends more rest when later sets fade in two of three sessions', () => {
    const history = [
      record(
        2,
        'cable-fly',
        [
          [14, 40, 1],
          [12, 40, 0],
          [11, 40, 0],
        ],
        [10, 15],
        1,
      ),
      record(
        5,
        'cable-fly',
        [
          [14, 40, 1],
          [13, 40, 1],
          [11, 40, 0],
        ],
        [10, 15],
        1,
      ),
      record(
        8,
        'cable-fly',
        [
          [14, 40, 1],
          [14, 40, 1],
          [13, 40, 1],
        ],
        [10, 15],
        1,
      ),
    ];
    expect(analyze(history).find((item) => item.kind === 'rep')).toMatchObject({
      recommendation: 'increase-rest',
      exerciseId: 'cable-fly',
    });
  });

  it('flags an exercise that keeps getting swapped or skipped', () => {
    const swapped = (daysAgo: number) =>
      record(daysAgo, 'pec-deck', [[12, 100, 1]], [10, 15], 1, {
        entries: [
          {
            exerciseId: 'pec-deck',
            replacedFrom: 'cable-fly',
            plannedSets: 1,
            sets: [
              {
                kind: 'working',
                reps: 12,
                weight: 100,
                rir: 1,
                completed: true,
                setIndex: 0,
                targetReps: [10, 15],
                targetRir: 1,
              },
            ],
          },
        ],
      });
    const history = [swapped(2), swapped(5), record(8, 'cable-fly', [[12, 40, 1]], [10, 15], 1)];
    const insight = analyze(history).find((item) => item.kind === 'fit');
    expect(insight).toMatchObject({ recommendation: 'open-alternatives', exerciseId: 'cable-fly' });
    expect(insight?.why[0]).toBe('2 of its last 3 appearances were replaced or skipped.');
  });

  it('flags a priority muscle under half its weekly target two weeks running', () => {
    const history = [
      record(1, 'barbell-bench-press', [
        [5, 185, 2],
        [5, 185, 2],
      ]),
      record(4, 'back-squat', [
        [5, 225, 2],
        [5, 225, 2],
      ]),
      record(9, 'barbell-bench-press', [
        [5, 185, 2],
        [5, 185, 2],
      ]),
      record(12, 'back-squat', [
        [5, 225, 2],
        [5, 225, 2],
      ]),
    ];
    const coverage = analyze(history).filter((item) => item.kind === 'coverage');
    expect(coverage.map((item) => item.muscle)).toContain('biceps');
    expect(coverage[0]?.why[0]).toMatch(/of \d+ sets this week/);
  });

  it('flags recovery after three days in a row', () => {
    const history = [
      record(0, 'barbell-bench-press', [[5, 185, 2]]),
      record(1, 'cable-fly', [[12, 40, 1]], [10, 15], 1),
      record(2, 'lat-pulldown', [[10, 120, 1]], [8, 12], 1),
    ];
    expect(analyze(history).find((item) => item.kind === 'recovery')).toMatchObject({
      recommendation: 'hold',
      headline: 'Recovery is behind',
    });
  });

  it('grades a saved session exercise by exercise', () => {
    const previous = record(5, 'barbell-bench-press', [
      [5, 185, 2],
      [5, 185, 2],
    ]);
    const today = record(
      0,
      'barbell-bench-press',
      [
        [5, 190, 2],
        [5, 190, 2],
      ],
      [4, 6],
      2,
      {
        id: 'today',
        rating: { effort: 'too-easy', pain: false, energyAfter: 4, note: '' },
      },
    );
    const lines = sessionFeedback(today, [previous, today], profile);
    expect(lines[0]).toBe('1 progressed, 0 on target, 0 short.');
    expect(lines[1]).toBe('Barbell Bench Press: progressed, 185 × 5 became 190 lb × 5.');
    expect(lines[lines.length - 1]).toMatch(/^Rated too easy/);
    const short = record(0, 'cable-fly', [[8, 40, 0]], [10, 15], 1, { id: 'short' });
    short.entries[0]!.plannedSets = 3;
    expect(sessionFeedback(short, [short], profile)[1]).toMatch(
      /^Cable Fly: short, 1 of 3 sets with reps under the floor/,
    );
  });
});
