import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries } from '../workout/types';
import { sessionFeedback } from './strategy';
import { record, type SetSpec } from '../../test/records';
import { plan, profileOf } from '../../test/backOffs';

/**
 * The fifth review of round N, in the session's feedback. A lift main one day and secondary
 * another (the row on the pull and the upper day): its secondary day runs straight at the back-offs'
 * load, saved as such a day (`atBackOffs`), and its next top set reads past it, back to its last top
 * set (the fourth review). The feedback on that main day still grades the top set against the
 * straight day at the back-offs' load: a top set held where it was ("a top set at no reserve holds
 * it") reads "progressed, 150 × 5 became 160 × 5" every time. Synthetic data only.
 */

const ROW = 'barbell-row';

function structured(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, ROW, [top, ...backOffs], [4, 6], 2, { templateId: 'pull-arms' });
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

/** The upper day's row, straight at the back-offs' load, every set as asked. */
function upperDay(daysAgo: number, weight: number): WorkoutRecord {
  const done = record(
    daysAgo,
    ROW,
    [
      [5, weight, 2],
      [5, weight, 2],
      [5, weight, 2],
    ],
    [4, 6],
    2,
    { templateId: 'upper' },
  );
  done.entries[0]!.role = 'secondary-strength';
  done.entries[0]!.atBackOffs = true;
  return done;
}

describe('the feedback on a main day after a straight day at the back-offs’ load', () => {
  it('a top set held where it was is on target, never "progressed" from the back-offs’ load', () => {
    // Last pull day: the top set at 160 x 5 with nothing in reserve, back-offs at 150.
    const pull = structured(
      8,
      [5, 160, 0],
      [
        [5, 150, 2],
        [5, 150, 2],
        [5, 150, 2],
      ],
    );
    const upper = upperDay(5, 150);
    // The next pull day the app builds: the top set held at 160 (no reserve last time).
    const next = plan([pull, upper], undefined, { templateId: 'pull-arms' });
    const row = allEntries(next.blocks).find((entry) => entry.exerciseId === ROW)!;
    const top = row.sets.find((set) => set.tier === 'top')!;
    expect(top.targetWeight).toBe(160);
    // Lifted as asked: 160 x 5 at 1 in reserve, the back-offs at 150 x 5 at 2.
    const today = structured(
      1,
      [5, 160, 1],
      [
        [5, 150, 2],
        [5, 150, 2],
        [5, 150, 2],
      ],
    );
    const line = sessionFeedback(today, [pull, upper], profileOf()).find((text) =>
      text.startsWith('Barbell Row'),
    )!;
    expect(line).toBeDefined();
    // On 7f23a26: "Barbell Row: progressed, 150 × 5 became 160 lb × 5." The top set held.
    expect(line).not.toContain('progressed');
  });
});
