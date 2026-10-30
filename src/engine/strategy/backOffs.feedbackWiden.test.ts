import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { backOffDropFor } from '../../engine/progression/backOffs';
import { sessionFeedback } from './strategy';
import { record, type SetSpec } from '../../test/records';
import { BENCH, profileOf } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11, in the session's feedback (the fourth review of round N):
 * after the second session running with back-offs a rep or more harder than asked, the line says
 * the drop widens, not that a second session like it would. Synthetic data only.
 */

function structured(
  daysAgo: number,
  top: SetSpec,
  backOffs: SetSpec[],
  drop = 0.05,
): WorkoutRecord {
  const done = record(daysAgo, BENCH, [top, ...backOffs], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = drop;
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

/** The top set on target; every back-off at its reps, at `rir` in reserve (2 asked). */
const session = (daysAgo: number, rir: number) =>
  structured(
    daysAgo,
    [5, 190, 1],
    [
      [5, 180, rir],
      [5, 180, rir],
      [5, 180, rir],
    ],
  );

const benchLine = (today: WorkoutRecord, before: WorkoutRecord[]) =>
  sessionFeedback(today, before, profileOf()).find((line) =>
    line.startsWith('Barbell Bench Press'),
  )!;

describe('the feedback on back-offs a rep harder than asked, the fourth review of round N', () => {
  it('the second session running: the drop has widened, and the line says so, not "a second session like it"', () => {
    const earlier = session(7, 1);
    const today = session(3, 1);
    // Two sessions running at 5%, both a rep harder: the next session's drop is 9%.
    expect(backOffDropFor(BENCH, [earlier, today])).toBe(0.09);
    const line = benchLine(today, [earlier]);
    expect(line).toBeDefined();
    // Fails on 5894333: "...and a second session like it widens their drop".
    expect(line).not.toContain('a second session like it');
  });
});
