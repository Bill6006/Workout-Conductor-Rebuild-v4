import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../../engine/workout/types';
import { record, type SetSpec } from '../../test/records';
import { plan, shape } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11 (the third review of round N): a strength lift that is the
 * main lift one day and a secondary one another (the row on the pull and the upper day, the bench
 * press on the upper and the full-body day) runs straight on its secondary day at the back-offs'
 * load its last session on the structure gives, never the top set's. Synthetic data only.
 */

function structured(
  exerciseId: string,
  templateId: string,
  daysAgo: number,
  top: SetSpec,
  backOffs: SetSpec[],
  drop = 0.05,
): WorkoutRecord {
  const done = record(daysAgo, exerciseId, [top, ...backOffs], [4, 6], 2, { templateId });
  const entry = done.entries[0]!;
  entry.backOffDrop = drop;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}

const backOffsAt = (weight: number): SetSpec[] => [
  [5, weight, 2],
  [5, weight, 2],
  [5, weight, 2],
];

const liftIn = (workout: GeneratedWorkout, exerciseId: string): WorkoutEntry =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === exerciseId)!;

describe('a strength lift straight on a day it is secondary, after a session on the structure, the third review of round N', () => {
  it('the row on the upper day after the pull day: none over the back-offs’ load, no "little in reserve"', () => {
    const history = [
      structured('barbell-row', 'pull-arms', 7, [5, 185, 1], backOffsAt(175)),
      structured('barbell-row', 'pull-arms', 3, [5, 190, 1], backOffsAt(180)),
    ];
    // The pull day: its main lift, a top set at 195 and back-offs at 185.
    const pull = liftIn(plan(history, undefined, { templateId: 'pull-arms' }), 'barbell-row');
    expect(shape(pull)).toEqual([
      [195, 1, 'top'],
      [185, 2, 'back-off'],
      [185, 2, 'back-off'],
      [185, 2, 'back-off'],
    ]);
    // The upper day: the row as its secondary strength lift, straight at 2 in reserve.
    const row = liftIn(plan(history, undefined, { templateId: 'upper' }), 'barbell-row');
    expect(row.role).toBe('secondary-strength');
    const sets = shape(row);
    expect(sets.every((set) => set[2] === 'straight' && set[1] === 2)).toBe(true);
    // A straight set at 2 in reserve after it takes the back-offs' load, never the top set's...
    expect(Math.max(...sets.map((set) => set[0] as number))).toBeLessThanOrEqual(185);
    // ...and the top set, lifted as asked, is no session "with little in reserve".
    expect(row.progression?.evidence.join(' ')).not.toContain('little in reserve');
  });

  it('the bench press on the full-body day after the upper day: the same', () => {
    const history = [
      structured('barbell-bench-press', 'upper', 7, [5, 185, 1], backOffsAt(175)),
      structured('barbell-bench-press', 'upper', 3, [5, 190, 1], backOffsAt(180)),
    ];
    const bench = liftIn(
      plan(history, undefined, { templateId: 'full-body' }),
      'barbell-bench-press',
    );
    expect(bench.role).toBe('secondary-strength');
    const sets = shape(bench);
    expect(sets.every((set) => set[2] === 'straight' && set[1] === 2)).toBe(true);
    expect(Math.max(...sets.map((set) => set[0] as number))).toBeLessThanOrEqual(185);
    expect(bench.progression?.evidence.join(' ')).not.toContain('little in reserve');
  });
});
