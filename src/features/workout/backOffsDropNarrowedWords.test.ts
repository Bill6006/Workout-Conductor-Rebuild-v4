import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { backOffDropFor } from '../../engine/progression/backOffs';
import { backOffNote, effortGuidance } from './effort';
import { record, type SetSpec } from '../../test/records';
import { BENCH, bench, plan } from '../../test/backOffs';

/**
 * Round N (item 11), the fresh review before shipping, on the combined code.
 *
 * The drop's correction (docs/reports/maintenance-32.md, "Delivered"): back-offs that miss their
 * reserve by a rep or more on average two sessions running move the drop 4% a rep, "harder widens
 * it, easier narrows it, within 0 to 20%". Back-offs logged two reps easier than asked, two sessions
 * running, narrow it from 5% to 0: the back-offs then stand at the top set's own load (allowed).
 *
 * The defect (LOW, words): the workout still tells the lifter they are lighter. "Why this target"
 * says "0% lighter", and each back-off's effort line says "back-off: lighter than the top set",
 * over a back-off at the top set's load.
 *
 * Synthetic data only.
 */

function structured(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, BENCH, [top, ...backOffs], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
    set.targetWeight = at === 0 ? top[1] : backOffs[0]![1];
  });
  // The load the drop gave the back-offs off the top set as lifted.
  entry.backOffAt = backOffs[0]![1] as number;
  return done;
}

/** Two sessions: the top set as asked, the back-offs two reps easier than asked. */
const easyBackOffs = (): WorkoutRecord[] => [
  structured(
    7,
    [5, 190, 1],
    [
      [5, 180, 4],
      [5, 180, 4],
      [5, 180, 4],
    ],
  ),
  structured(
    3,
    [5, 195, 1],
    [
      [5, 185, 4],
      [5, 185, 4],
      [5, 185, 4],
    ],
  ),
];

describe('a drop the back-offs narrowed to nothing, in words', () => {
  it('never calls back-offs at the top set’s load lighter', () => {
    const history = easyBackOffs();
    // Baseline: the drop's correction as approved, 5% less 2 reps × 4%, held at 0.
    expect(backOffDropFor(BENCH, history)).toBe(0);
    const entry = bench(plan(history));
    const top = entry.sets.find((set) => set.tier === 'top')!;
    const backOff = entry.sets.find((set) => set.tier === 'back-off')!;
    // The back-offs at the top set's load (200), as the 0% drop gives them.
    expect([top.targetWeight, backOff.targetWeight]).toEqual([200, 200]);
    const note = backOffNote(entry, 'lb') ?? '';
    const guidance = effortGuidance(
      'working',
      backOff.targetRir,
      'primary-strength',
      false,
      false,
      'back-off',
    ).why;
    // On the combined code: "...3 back-offs at 200 lb, 0% lighter at 2 in reserve..." and
    // "back-off: lighter than the top set, stop 2 clean reps short".
    expect(note).toContain("3 back-offs at 200 lb, the top set's load, at 2 in reserve");
    expect({ note: note.includes('0% lighter'), guidance }).toEqual({
      note: false,
      guidance: expect.not.stringContaining('lighter than the top set'),
    });
  });
});
