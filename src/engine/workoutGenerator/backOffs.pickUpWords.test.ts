import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record, type SetSpec } from '../../test/records';
import { BENCH, DB_BENCH, bench, entryOf, home, plan, run, topDone } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11 (the third review of round N): a main lift picked up again
 * after its top set keeps its top set's lines in "Why this target", never a straight day's.
 * Synthetic data only.
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

const history = (): WorkoutRecord[] => [
  structured(
    7,
    [5, 185, 1],
    [
      [5, 175, 2],
      [5, 175, 2],
      [5, 175, 2],
    ],
  ),
  structured(
    3,
    [5, 190, 1],
    [
      [5, 180, 2],
      [5, 180, 2],
      [5, 180, 2],
    ],
  ),
];

const straightLine = (lines: readonly string[]) =>
  lines.filter((line) => line.startsWith('Straight sets today'));

describe('a main lift picked up again after its top set: its words, the third review of round N', () => {
  it('the plan says nothing of straight sets on a day on the structure', () => {
    const workout = plan(history());
    expect(bench(workout).sets.find((set) => set.tier === 'top')?.targetWeight).toBe(195);
    expect(straightLine(bench(workout).progression?.evidence ?? [])).toEqual([]);
  });

  it('back at the gym after its top set: back-offs, and no "Straight sets today" line', () => {
    const workout = plan(history());
    const entry = bench(workout);
    const done = topDone(entry, 195);
    const away = run({ type: 'location' }, workout, {
      location: home,
      completed: done,
      currentEntryId: entry.id,
      history: history(),
    });
    const back = run({ type: 'location' }, away.workout, {
      completed: done,
      constraints: away.constraints,
      history: history(),
    });
    const picked = bench(back.workout);
    const owed = picked.sets.filter((set) => set.kind === 'working' && set.tier === 'back-off');
    expect(owed.length).toBeGreaterThan(0);
    expect(straightLine(picked.progression?.evidence ?? [])).toEqual([]);
  });

  it('swapped away and back after its top set: the same', () => {
    const workout = plan(history());
    const entry = bench(workout);
    const done = topDone(entry, 195);
    const away = run({ type: 'replace', entryId: entry.id, exerciseId: DB_BENCH }, workout, {
      completed: done,
      currentEntryId: entry.id,
      history: history(),
    });
    const stand = entryOf(away.workout, DB_BENCH);
    const back = run({ type: 'replace', entryId: stand.id, exerciseId: BENCH }, away.workout, {
      completed: done,
      constraints: away.constraints,
      history: history(),
    });
    const picked = bench(back.workout);
    const owed = picked.sets.filter((set) => set.kind === 'working' && set.tier === 'back-off');
    expect(owed.length).toBeGreaterThan(0);
    expect(straightLine(picked.progression?.evidence ?? [])).toEqual([]);
  });
});
