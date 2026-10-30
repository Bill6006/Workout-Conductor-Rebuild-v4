import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { backOffDropFor } from '../../engine/progression/backOffs';
import { sessionFeedback } from './strategy';
import { record, type SetSpec } from '../../test/records';
import { BENCH, profileOf } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11, in the session's feedback (the third review of round N): it
 * says the drop widens only after back-offs a rep or more harder than asked on average, as the
 * drop's rule reads them. Synthetic data only.
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

/** The top set on target; one back-off a rep under its floor at its reserve, two on target. */
const oneShort = (daysAgo: number) =>
  structured(
    daysAgo,
    [5, 190, 1],
    [
      [3, 180, 2],
      [5, 180, 2],
      [5, 180, 2],
    ],
  );

describe('the session feedback on back-offs under their reps, the third review of round N', () => {
  it('says the drop widens only where two sessions like it widen it', () => {
    const earlier = oneShort(7);
    const today = oneShort(3);
    const lines = sessionFeedback(today, [earlier], profileOf());
    const benchLine = lines.find((line) => line.startsWith('Barbell Bench Press'))!;
    expect(benchLine).toBeDefined();
    // Two sessions just like it: the drop the next session takes.
    const drop = backOffDropFor(BENCH, [earlier, today]);
    const promised = benchLine.includes('widens their drop');
    // What the line promises and what the drop does agree.
    expect({ promised, widened: drop > 0.05 }).toEqual({
      promised: drop > 0.05,
      widened: drop > 0.05,
    });
  });
});
