import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { exerciseProgress } from '../scoring/analytics';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from './strategy';
import { record, RECORD_NOW, type SetSpec } from '../../test/records';
import { profileOf } from '../../test/backOffs';

/**
 * The fifth review of round N, the same rule beyond the stalls it found: a lift main one day and
 * secondary another (the row on the pull and the upper day of the default split) runs straight on
 * its secondary day at the back-offs' load, saved as such a day (`atBackOffs`). What reads the
 * lift's sessions over weeks for its progress reads its top sets alone, past those days, as its
 * target does: the fatigue's drift in estimated maxes, the strategy's insights on the lift, and the
 * Progress tab's trend. Each read the upper day's lighter load as a fall. Synthetic data only.
 */

const ROW = 'barbell-row';

function pullDay(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, ROW, [top, ...backOffs], [4, 6], 2, { templateId: 'pull-arms' });
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, index) => {
    set.tier = index === 0 ? 'top' : 'back-off';
    set.targetRir = index === 0 ? 1 : 2;
  });
  return done;
}

function upperDay(daysAgo: number, weight: number, reps = 5): WorkoutRecord {
  const done = record(
    daysAgo,
    ROW,
    [
      [reps, weight, 2],
      [reps, weight, 2],
      [reps, weight, 2],
    ],
    [4, 6],
    2,
    { templateId: 'upper' },
  );
  done.entries[0]!.role = 'secondary-strength';
  done.entries[0]!.atBackOffs = true;
  return done;
}

const backOffsAt = (weight: number, reps = 5): SetSpec[] => [
  [reps, weight, 2],
  [reps, weight, 2],
  [reps, weight, 2],
];

describe('the fatigue’s drift in estimated maxes', () => {
  it('reads no fall from the upper day’s lighter load', () => {
    const history = [pullDay(8, [5, 160, 1], backOffsAt(150)), upperDay(5, 150)];
    const fatigue = interpretFatigue(history, RECORD_NOW);
    // On 7f23a26: -6.3, "Estimated maxes fell 6.3% over the last two sessions."
    expect(fatigue.performanceDrift).toBeNull();
    expect(fatigue.evidence.join(' ')).not.toContain('Estimated maxes fell');
  });
});

describe('the strategy’s insights on the lift', () => {
  it('a top set held at 160, then under its floor two pull days running, is stalling', () => {
    // 160 x 5 with nothing in reserve holds the load; 160 x 3 twice falls under the floor.
    const history = [
      pullDay(19, [5, 160, 0], backOffsAt(150)),
      upperDay(16, 150),
      pullDay(12, [3, 160, 0], backOffsAt(150, 4)),
      upperDay(9, 150),
      pullDay(5, [3, 160, 0], backOffsAt(150, 4)),
      upperDay(2, 150),
    ];
    const insights = analyzeStrategy({
      history,
      profile: profileOf(),
      now: RECORD_NOW,
      fatigue: interpretFatigue(history, RECORD_NOW),
    });
    // On 7f23a26: none, the window read 150, 160, 150, never three sessions at one load.
    expect(insights.map((insight) => insight.headline)).toContain(
      'Barbell Row is stalling at 160 lb',
    );
  });
});

describe('the Progress tab’s trend', () => {
  it('reads the top sets: none moved, no fall', () => {
    const history = [
      pullDay(12, [5, 160, 1], backOffsAt(150)),
      upperDay(9, 150),
      pullDay(5, [5, 160, 1], backOffsAt(150)),
      upperDay(2, 150),
    ];
    const row = exerciseProgress(history).find((item) => item.exerciseId === ROW)!;
    // Every session of the lift is still listed.
    expect(row.sessions).toBe(4);
    // On 7f23a26: -6.3% and the upper day's 175 as the latest estimate.
    expect(row.trendPct).toBe(0);
    expect(row.latestE1rm).toBe(186.7);
  });
});
