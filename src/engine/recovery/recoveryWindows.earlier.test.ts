import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { againstRested, learnedWindows, readFirstSet } from './recovery';

/**
 * Maintenance 33, the fresh review before shipping: a muscle is still recovering inside ANY earlier
 * window that still runs, not only the newest one. A light session the day after a hard one sets a
 * short window of its own, which ends long before the hard one's; a session after the light one's
 * ends, still inside the hard one's, is neither a rested session for the first-set check
 * (`restedAt`) nor a rested re-exposure for the learned window (`learnedWindows`). Synthetic data
 * only.
 */

const sets = (count: number, reps: number, rir: number): SetSpec[] =>
  Array.from({ length: count }, () => [reps, 200, rir] as SetSpec);

/** A bench press session `hoursAgo` before RECORD_NOW, every set asking 200 lb. */
function bench(hoursAgo: number, spec: SetSpec[]): WorkoutRecord {
  const done = record(hoursAgo / 24, 'barbell-bench-press', spec, [4, 6], 1);
  return {
    ...done,
    id: `bench-${hoursAgo}`,
    entries: done.entries.map((entry) => ({
      ...entry,
      sets: entry.sets.map((set) => ({ ...set, targetWeight: 200 })),
    })),
  };
}

/**
 * The hard day: six sets a rep short of failure, 36 h and 24 h more for the dose, a 60 h window.
 * The light day 12 h later: one set three short, a 24 h window of its own, ended 36 h after the
 * hard day. Then a session `after` hours after the hard day.
 */
const HARD = 160;
const hardDay = () => bench(HARD, sets(6, 5, 1));
const lightDay = () => bench(HARD - 12, sets(1, 5, 3));
const sessionAfterHard = (after: number) => bench(HARD - after, sets(3, 5, 1));

describe('a session inside an earlier window still running is not rested', () => {
  // As the sessions ask it: a first set is read only against sets read the same way.
  const read = readFirstSet({
    reps: 5,
    weight: 200,
    rir: 1,
    targetWeight: 200,
    targetReps: [4, 6],
    targetRir: 1,
  })!;
  // One rested session long before, so the hard day is a rested session too: two in all.
  const before = () => [bench(1000, sets(3, 5, 1)), hardDay()];

  it('baseline: one 70 h after the hard day is rested, the third rested session to read against', () => {
    const history = [...before(), lightDay(), sessionAfterHard(70)];
    expect(againstRested(read, 'barbell-bench-press', history, RECORD_NOW)).not.toBeNull();
  });

  it('baseline: one 40 h after the hard day, with no light day between, is not rested', () => {
    const history = [...before(), sessionAfterHard(40)];
    expect(againstRested(read, 'barbell-bench-press', history, RECORD_NOW)).toBeNull();
  });

  it('one 40 h after the hard day is not rested though the light day’s window has ended', () => {
    // 40 h after the hard day: inside its 60 h, and 28 h after the light day, past its 24 h.
    const history = [...before(), lightDay(), sessionAfterHard(40)];
    expect(
      againstRested(read, 'barbell-bench-press', history, RECORD_NOW),
      'the session inside the hard day’s window was read as rested',
    ).toBeNull();
  });
});

describe('a re-exposure inside an earlier window still running is early', () => {
  // Four rested sessions first, so each later one has three or more rested sessions before it.
  const rested = () => [800, 700, 600, 500].map((hoursAgo) => bench(hoursAgo, sets(3, 5, 1)));

  it('the session after the light day, still inside the hard day’s window, is early', () => {
    const history = [...rested(), hardDay(), lightDay(), sessionAfterHard(40)];
    const chest = learnedWindows(history).get('chest');
    // Rested: the fourth of the first four and the hard day; early: the light day and the last.
    expect(chest?.early, 'the session inside the hard day’s window was read as rested').toBe(2);
    expect(chest?.rested).toBe(2);
  });

  it('baseline: past the hard day’s window too, it is rested', () => {
    const history = [...rested(), hardDay(), lightDay(), sessionAfterHard(70)];
    const chest = learnedWindows(history).get('chest');
    expect(chest?.early).toBe(1);
    expect(chest?.rested).toBe(3);
  });
});
