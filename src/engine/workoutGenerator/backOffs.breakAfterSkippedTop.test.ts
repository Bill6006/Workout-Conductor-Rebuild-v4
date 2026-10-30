import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record, type SetSpec } from '../../test/records';
import { bench, plan, profileOf } from '../../test/backOffs';

/**
 * The sixth review of round N. The progression reads a session's top set alone, so a session whose
 * top set was skipped and whose back-offs were done has no point in the lift's history; a break is
 * measured from the newest point (`recommendBaseTarget`'s `daysSince`), and `topSetRead` gives the
 * lift's newest session (`sessionsAt`) only where it passes over a straight day at the back-offs'
 * load. So three weeks after the last top set, the lift trained nine days before on its back-offs
 * alone reads as back from a break: "23 days since the last session", straight sets at 90% of the
 * estimated max. The spec: a break is measured from the lift's newest session; straight sets only
 * where the load is a guess or eased. Synthetic data only.
 */

const BENCH = 'barbell-bench-press';

function structured(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, BENCH, [top, ...backOffs], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, index) => {
    set.tier = index === 0 ? 'top' : 'back-off';
    set.targetRir = index === 0 ? 1 : 2;
  });
  return done;
}

describe('a main day three weeks after its last top set, the lift trained on its back-offs since', () => {
  it('is no return from a break', () => {
    const lastTop = structured(
      23,
      [5, 200, 1],
      [
        [5, 190, 2],
        [5, 190, 2],
        [5, 190, 2],
      ],
    );
    // Nine days ago the top set was skipped (logged as a skip, as the app saves one) and the
    // back-offs done as asked.
    const backOffsOnly = structured(
      9,
      [0, null, null],
      [
        [5, 195, 2],
        [5, 195, 2],
        [5, 195, 2],
      ],
    );
    backOffsOnly.entries[0]!.sets[0]!.completed = false;
    const entry = bench(plan([lastTop, backOffsOnly], profileOf(), { templateId: 'push-arms' }));
    const evidence = (entry.progression?.evidence ?? []).join(' / ');
    expect(entry.role).toBe('primary-strength');
    // On 6f2d5ea: "23 days since the last session: back at 90% of the estimated max ...", four
    // straight sets.
    expect(evidence).not.toMatch(/23 days since the last session/);
    expect(entry.progression?.mode, evidence).not.toBe('return');
  });
});
