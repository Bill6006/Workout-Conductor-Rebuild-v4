import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record } from '../../test/records';
import type { DurationChoice } from '../workout/types';
import { expectedLength } from './expectedLengths';

/**
 * Maintenance 34, the forecast at real lengths: each weekday's expected length from the lifter's own
 * sessions on it over the last four weeks. Every time here is a clock time on the device, so the
 * file runs as written in any zone (scripts/test-zones.mjs runs it in New York and fourteen hours
 * east of UTC too). Thursday, September 10, 2026 at noon is now: 7, 14, 21 and 28 days before are
 * Thursdays, 6 days before a Friday. Synthetic data only.
 */

/** A clock time on this device, as an instant: days before September 10, 2026. */
const at = (daysAgo: number, hour = 12) => new Date(2026, 8, 10 - daysAgo, hour).toISOString();
const NOW = at(0);
const DEFAULT = 60;

function session(daysAgo: number, durationChoice?: DurationChoice, hours = 0): WorkoutRecord {
  const base = record(0, 'barbell-bench-press', [[8, 100, 2]]);
  const startedAt = at(daysAgo, 12 + hours);
  return {
    ...base,
    id: `w-${daysAgo}-${hours}`,
    startedAt,
    completedAt: startedAt,
    ...(durationChoice !== undefined ? { durationChoice } : {}),
  };
}

const thursday = (history: WorkoutRecord[]) => expectedLength(history, 'thu', NOW, DEFAULT);

describe('a weekday’s expected length', () => {
  it('is the Default with no session on that weekday', () => {
    expect(thursday([])).toBe('default');
    // A Friday's 30 minutes say nothing of Thursdays.
    expect(thursday([session(6, 30)])).toBe('default');
    expect(expectedLength([session(6, 30)], 'fri', NOW, DEFAULT)).toBe(30);
  });

  it('is the one session’s, or the latest of two', () => {
    expect(thursday([session(7, 45)])).toBe(45);
    expect(thursday([session(14, 45), session(7, 30)])).toBe(30);
  });

  it('is the median of the latest three: a change of length shows from its second week', () => {
    const longer = [session(28, 30), session(21, 30), session(14, 30), session(7, 'default')];
    // One longer Thursday: the forecast holds at 30.
    expect(thursday(longer)).toBe(30);
    // The second: it moves.
    expect(thursday([...longer.slice(1), session(0, 'default', -4)])).toBe('default');
  });

  it('reads only the last four weeks', () => {
    expect(thursday([session(35, 15)])).toBe('default');
    expect(thursday([session(28, 15)])).toBe(15);
  });

  it('counts a day once, by its first session trained', () => {
    // A second workout later that day is the day's extra, not its length.
    expect(thursday([session(7, 'default'), session(7, 15, 3)])).toBe('default');
    // A workout with no set done is no session trained.
    const nothing = { ...session(7, 15, -2), entries: [] };
    expect(thursday([nothing, session(7, 45)])).toBe(45);
  });

  it('reads a session from before lengths were kept as the Default', () => {
    expect(thursday([session(21, 30), session(14, 30), session(7)])).toBe(30);
    expect(thursday([session(21, 30), session(14), session(7)])).toBe('default');
  });

  it('orders the Default by the lifter’s own minutes', () => {
    // A Default of 30 sits below 45.
    const history = [session(21, 45), session(14, 'default'), session(7, 15)];
    expect(expectedLength(history, 'thu', NOW, 30)).toBe('default');
    expect(expectedLength(history, 'thu', NOW, 60)).toBe(45);
  });
});
