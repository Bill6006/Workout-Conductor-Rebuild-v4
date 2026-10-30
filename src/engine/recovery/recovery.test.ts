import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { getExercise } from '../../catalog/exercises/catalog';
import { plan } from '../../test/backOffs';
import { allEntries } from '../workout/types';
import { RECOVERY, hoursSince, recoveryWindows, tooSoonToday } from './recovery';

/**
 * Maintenance 33 (docs/research/recovery-time-course.md): a muscle's window from its last hard work
 * as a prime mover, keyed to how close its sets went to failure and to the body region, lengthened
 * by a large dose, a lift new to the lifter, long-length work and a short night. Light work starts
 * no window. Synthetic data only.
 */

const sets = (count: number, reps: number, rir: number, weight = 135): SetSpec[] =>
  Array.from({ length: count }, () => [reps, weight, rir] as SetSpec);

const windowOf = (history: WorkoutRecord[], muscle: Parameters<typeof hoursOf>[1]) =>
  recoveryWindows(history).get(muscle);
function hoursOf(history: WorkoutRecord[], muscle: 'chest' | 'quads' | 'hamstrings' | 'calves') {
  return recoveryWindows(history).get(muscle)?.hours;
}

describe('the window from the hardest sets, by region', () => {
  it('sets three or more short of failure: a day, upper or lower', () => {
    expect(hoursOf([record(1, 'barbell-bench-press', sets(3, 8, 3))], 'chest')).toBe(24);
    expect(hoursOf([record(1, 'back-squat', sets(3, 8, 3))], 'quads')).toBe(24);
  });

  it('one or two short: a day and a half upper, two days for lower-body compound work', () => {
    expect(hoursOf([record(1, 'barbell-bench-press', sets(3, 6, 2))], 'chest')).toBe(36);
    expect(hoursOf([record(1, 'back-squat', sets(3, 6, 1))], 'quads')).toBe(48);
  });

  it('to failure: two days upper, three for lower-body compound work', () => {
    expect(hoursOf([record(1, 'barbell-bench-press', sets(3, 6, 0))], 'chest')).toBe(48);
    expect(hoursOf([record(1, 'back-squat', sets(3, 6, 0))], 'quads')).toBe(72);
  });

  it('a long set near failure counts as to failure', () => {
    expect(hoursOf([record(1, 'barbell-bench-press', sets(3, 12, 1))], 'chest')).toBe(48);
  });

  it('lower-body isolation and the calves take the upper-body values', () => {
    expect(hoursOf([record(1, 'leg-curl', sets(3, 10, 1))], 'hamstrings')).toBe(36);
    expect(hoursOf([record(1, 'standing-calf-raise', sets(3, 12, 0))], 'calves')).toBe(48);
  });

  it('light work starts no window', () => {
    expect(windowOf([record(1, 'barbell-bench-press', sets(3, 8, 4))], 'chest')).toBeUndefined();
  });

  it('the newest hard work sets it', () => {
    // A lift long known: no new lift's day more.
    const history = [
      record(60, 'barbell-bench-press', sets(3, 6, 2)),
      record(3, 'barbell-bench-press', sets(3, 6, 0)),
      record(1, 'barbell-bench-press', sets(3, 8, 3)),
    ];
    const window = windowOf(history, 'chest')!;
    expect(window.hours).toBe(24);
    expect(hoursSince(window, RECORD_NOW)).toBe(24);
  });

  it('reads a log grown in place again: what it read is kept only while the log is the same', () => {
    const history = [
      record(60, 'barbell-bench-press', sets(3, 6, 2)),
      record(3, 'barbell-bench-press', sets(3, 6, 2)),
    ];
    expect(hoursOf(history, 'chest')).toBe(36);
    history.push(record(1, 'barbell-bench-press', sets(3, 6, 0)));
    expect(hoursOf(history, 'chest')).toBe(48);
  });
});

describe('what lengthens it', () => {
  it('six or more hard sets: a day more, never past the cap', () => {
    expect(hoursOf([record(1, 'barbell-bench-press', sets(6, 6, 2))], 'chest')).toBe(60);
    expect(hoursOf([record(1, 'barbell-bench-press', sets(6, 6, 0))], 'chest')).toBe(72);
    expect(hoursOf([record(1, 'back-squat', sets(6, 6, 0))], 'quads')).toBe(96);
  });

  it('a synergist’s sets count at half toward the dose, and start no window of their own', () => {
    // Four squat sets for the quads, and the hamstrings among the squat's synergists: no window
    // for them from the squat alone.
    const squat = record(1, 'back-squat', sets(4, 6, 2));
    expect(hoursOf([squat], 'hamstrings')).toBeUndefined();
    // Four leg curls the same day: 4 + 4 x 0.5 = 6 hard sets for the hamstrings.
    const curls = record(1, 'leg-curl', sets(4, 10, 2));
    const day: WorkoutRecord = { ...squat, entries: [...squat.entries, ...curls.entries] };
    expect(hoursOf([day], 'hamstrings')).toBe(36 + RECOVERY.BIG_DOSE_HOURS);
    // Three leg curls: 3 + 4 x 0.5 = 5, short of a big dose, where the squat's four counted whole
    // would make seven.
    const fewer = record(1, 'leg-curl', sets(3, 10, 2));
    const lighter: WorkoutRecord = { ...squat, entries: [...squat.entries, ...fewer.entries] };
    expect(hoursOf([lighter], 'hamstrings')).toBe(36);
  });

  it('a lift new to the lifter, in its first three weeks: a day more', () => {
    // A month of the log before: the app knows the lifter.
    const known = record(40, 'back-squat', sets(3, 6, 2));
    const first = record(10, 'barbell-bench-press', sets(3, 6, 2));
    const second = { ...record(1, 'barbell-bench-press', sets(3, 6, 2)), id: 'second' };
    expect(hoursOf([known, first], 'chest')).toBe(36 + RECOVERY.NEW_LIFT_HOURS);
    expect(hoursOf([known, first, second], 'chest')).toBe(36 + RECOVERY.NEW_LIFT_HOURS);
    // Long known: no more.
    const old = { ...record(60, 'barbell-bench-press', sets(3, 6, 2)), id: 'old' };
    expect(hoursOf([old, first, second], 'chest')).toBe(36);
  });

  it('a lifter new to the app is not read as new to every lift', () => {
    expect(hoursOf([record(1, 'barbell-bench-press', sets(3, 6, 2))], 'chest')).toBe(36);
    const first = record(10, 'barbell-bench-press', sets(3, 6, 2));
    const second = { ...record(1, 'barbell-bench-press', sets(3, 6, 2)), id: 'second' };
    expect(hoursOf([first, second], 'chest')).toBe(36);
  });

  it('back after six months: a day more', () => {
    const long = record(200, 'barbell-bench-press', sets(3, 6, 2));
    const back = record(1, 'barbell-bench-press', sets(3, 6, 2));
    expect(hoursOf([long, back], 'chest')).toBe(36 + RECOVERY.NEW_LIFT_HOURS);
  });

  it('long-length work: half a day more', () => {
    expect(hoursOf([record(1, 'romanian-deadlift', sets(3, 8, 2))], 'hamstrings')).toBe(
      48 + RECOVERY.LONG_LENGTH_HOURS,
    );
  });

  it('a short night: half a day more on every window', () => {
    const history = [record(1, 'barbell-bench-press', sets(3, 6, 2))];
    expect(recoveryWindows(history, { readiness: { sleep: 2 } }).get('chest')?.hours).toBe(48);
    expect(recoveryWindows(history, { readiness: { sleep: 3 } }).get('chest')?.hours).toBe(36);
  });
});

describe('too soon: hard work for a muscle well inside its window', () => {
  // A long-known bench press, then a session to failure the evening before.
  const known = record(60, 'barbell-bench-press', sets(3, 6, 2));
  const pushDay = (history: WorkoutRecord[]) =>
    plan(history, undefined, { templateId: 'push-arms' });

  it('the chest to failure 16 hours before a push day: too soon, the chest’s lifts named', () => {
    const history = [known, record(16 / 24, 'barbell-bench-press', sets(3, 6, 0))];
    const workout = pushDay(history);
    const found = tooSoonToday(workout, recoveryWindows(history), RECORD_NOW);
    const chest = found.find((item) => item.muscle === 'chest');
    expect(chest).toMatchObject({ muscle: 'chest', hours: 16, window: 48 });
    const named = allEntries(workout.blocks)
      .filter((entry) => getExercise(entry.exerciseId)?.primaryMuscles.includes('chest'))
      .map((entry) => entry.id);
    expect(chest?.entryIds).toEqual(named);
  });

  it('past three quarters of the window: not flagged', () => {
    const history = [known, record(40 / 24, 'barbell-bench-press', sets(3, 6, 0))];
    const found = tooSoonToday(pushDay(history), recoveryWindows(history), RECORD_NOW);
    expect(found.map((item) => item.muscle)).not.toContain('chest');
  });

  it('light work is never flagged', () => {
    const history = [known, record(16 / 24, 'barbell-bench-press', sets(3, 6, 0))];
    const workout = pushDay(history);
    for (const entry of allEntries(workout.blocks)) {
      for (const set of entry.sets) if (set.kind === 'working') set.targetRir = 3;
    }
    expect(tooSoonToday(workout, recoveryWindows(history), RECORD_NOW)).toEqual([]);
  });

  it('two sets two short of failure are not hard work: hard is a set to failure or three such', () => {
    const history = [known, record(16 / 24, 'barbell-bench-press', sets(3, 6, 0))];
    const workout = pushDay(history);
    // The first lift for the chest down to two working sets at two in reserve, the rest light.
    let first = true;
    for (const entry of allEntries(workout.blocks)) {
      if (!getExercise(entry.exerciseId)?.primaryMuscles.includes('chest')) continue;
      const working = entry.sets.filter((set) => set.kind === 'working');
      entry.sets = first
        ? working.slice(0, 2).map((set) => ({ ...set, targetRir: 2 }))
        : working.map((set) => ({ ...set, targetRir: 3 }));
      first = false;
    }
    const found = tooSoonToday(workout, recoveryWindows(history), RECORD_NOW);
    expect(found.map((item) => item.muscle)).not.toContain('chest');
  });
});
