import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { backOffDropFor } from '../progression/backOffs';
import { sessionFeedback } from './strategy';
import { record, type SetSpec } from '../../test/records';
import { BENCH, profileOf } from '../../test/backOffs';

/**
 * The tenth review of round N. The session's feedback reads every back-off as the drop's reading,
 * where the drop's correction, since the ninth pass, reads only the back-offs lifted at the load the
 * drop gave them (`backOffAt`): the feedback promises a widening the drop never makes.
 *
 * The spec (docs/reports/maintenance-32.md): the ninth pass, "A saved session keeps the load the
 * drop gave its back-offs off the top set as lifted (`backOffAt`), and the drop's correction reads
 * only back-offs lifted at it"; the third review, "the feedback says the drop widens only after
 * back-offs a rep or more harder than asked on average", as the drop's rule reads them (its test:
 * "What the line promises and what the drop does agree"); the fourth, "the feedback still said 'a
 * second session like it widens their drop' after the second" (fixed: "the feedback says when the
 * drop widens"). The follow takes the back-offs "a step up after one clearly easy".
 *
 * What happens: `sessionFeedback` calls `backOffMiss(entry.sets)` without `entry.backOffAt`, so
 * back-offs lifted a step over the drop's load count as a miss of the drop; `backOffDropFor` passes
 * `entry.backOffAt` and reads none of them.
 *
 * Steps: the bench press's top set clearly easy (190 × 6 at 3 in reserve, 4-6 at 1 asked), the
 * follow's step taking the back-offs from 180 (the 5% drop's load, saved as `backOffAt`) to 185,
 * each lifted 5 at 1 in reserve, a rep harder than the 2 asked.
 * 1. After the first such session the line says "the back-offs ran a rep or more harder than asked,
 *    and a second session like it widens their drop"; after a second just like it the drop is still
 *    5%.
 * 2. After the second it says "and a second session like it widens their drop" again (the fourth
 *    review's LOW), the drop still 5%.
 *
 * Passes on 1bbd451 (before the ninth pass, where both read every back-off and the drop widened to
 * 9%): a regression of the ninth pass. Synthetic data only.
 */

/** As the store saves it: the drop's load off the top set as lifted, the back-offs a step over it. */
function easyTop(daysAgo: number): WorkoutRecord {
  const top: SetSpec = [6, 190, 3];
  const backOff: SetSpec = [5, 185, 1];
  const done = record(daysAgo, BENCH, [top, backOff, backOff, backOff], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.role = 'primary-strength';
  entry.backOffDrop = 0.05;
  // 5% under 190 is 180.5: the nearest weight at the gym's 5 lb step is 180.
  entry.backOffAt = 180;
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
    set.targetWeight = at === 0 ? 190 : 185;
  });
  return done;
}

const benchLine = (today: WorkoutRecord, before: WorkoutRecord[]) =>
  sessionFeedback(today, before, profileOf()).find((line) =>
    line.startsWith('Barbell Bench Press'),
  )!;

describe('the feedback on back-offs lifted a step over the drop’s load', () => {
  it('the first session: a second just like it widens the drop where the line says it will', () => {
    const first = easyTop(7);
    const line = benchLine(first, []);
    expect(line).toBeDefined();
    const promised = line.includes('a second session like it widens their drop');
    const widened = backOffDropFor(BENCH, [first, easyTop(3)]) > 0.05;
    // On 25fd689: promised, and the drop stays at 5% after the second session.
    expect({ promised, widened }, line).toEqual({ promised: widened, widened });
  });

  it('the second session running: no "a second session like it" where the drop has not widened', () => {
    const earlier = easyTop(7);
    const today = easyTop(3);
    const drop = backOffDropFor(BENCH, [earlier, today]);
    const line = benchLine(today, [earlier]);
    expect(line).toBeDefined();
    // On 25fd689: "...the back-offs ran a rep or more harder than asked, and a second session like
    // it widens their drop.", the drop 5%.
    expect(line.includes('a second session like it') && drop <= 0.05, line).toBe(false);
  });
});
