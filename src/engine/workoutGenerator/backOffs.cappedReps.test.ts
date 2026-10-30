import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record, type SetSpec } from '../../test/records';
import { BENCH, DB_BENCH, entryOf, home, plan } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11 (the fourth review of round N): straight sets at the
 * back-offs' load where the top set cannot be loaded as asked take the back-offs' reps, and none of
 * the place's line on the top set. Synthetic data only.
 */

function structured(
  daysAgo: number,
  top: SetSpec,
  backOffs: SetSpec[],
  drop = 0.05,
): WorkoutRecord {
  const done = record(daysAgo, DB_BENCH, [top, ...backOffs], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = drop;
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

/** Home, its dumbbells from 5 to `cap` lb a hand. */
const homeUpTo = (cap: number) => ({
  ...home,
  loading: { dumbbells: { kind: 'dumbbells' as const, ranges: [{ from: 5, to: cap, step: 5 }] } },
});

const history = () => [
  structured(7, [5, 95, 1], backOffsAt(90)),
  structured(3, [5, 100, 1], backOffsAt(95)),
];

/** Each working set: its load, its reps and reserve, and what it stands in for. */
const working = (cap: number) =>
  entryOf(plan(history(), undefined, {}, homeUpTo(cap)), DB_BENCH)
    .sets.filter((set) => set.kind === 'working')
    .map((set) => ({
      weight: set.targetWeight,
      reps: set.targetReps,
      rir: set.targetRir,
      asked: set.asked,
    }));

describe('straight sets at the back-offs’ load where the top set cannot be loaded as asked, the fourth review of round N', () => {
  it('the control: with heavier dumbbells there, the back-offs are 100 x 4-6 at 2 in reserve', () => {
    // 5% under the 105 asked: 99.75, 100 to the nearest weight (the fifth review of round N).
    expect(working(150).slice(1)).toEqual(
      [1, 2, 3].map(() => ({ weight: 100, reps: [4, 6], rir: 2, asked: undefined })),
    );
  });

  it('dumbbells only to 100: 100 lb, which the place makes, asks the back-offs’ reps, not the capped top set’s pushed ones', () => {
    const sets = working(100);
    expect(sets.every((set) => set.weight === 100 && set.rir === 2)).toBe(true);
    // Fails on 5894333: 95 lb x 6-8 on every set, two reps more than the back-offs ask at 95,
    // with nothing saying what they stand in for.
    expect(sets.map((set) => set.reps)).toEqual(sets.map(() => [4, 6]));
  });

  it('dumbbells only to 100: no line says the load is held at the heaviest weight, at 100 lb', () => {
    const entry = entryOf(plan(history(), undefined, {}, homeUpTo(100)), DB_BENCH);
    // Fails on 5894333: "Held at the heaviest weight here (100 lb): the reps go up instead."
    expect(entry.progression?.evidence.join(' ')).not.toContain('Held at the heaviest weight here');
  });

  it('those sets lifted at the back-offs’ reps (100 x 5 at 2) are no miss: the next session does not hold the load for them', () => {
    const entry = entryOf(plan(history(), undefined, {}, homeUpTo(100)), DB_BENCH);
    // Today's session as the app saves it: every working set at 100 x 5, 2 in reserve, its targets
    // as the plan set them.
    const today = record(0, DB_BENCH, [], [4, 6], 2);
    today.id = 'w-today';
    today.entries[0]!.sets = entry.sets
      .filter((set) => set.kind === 'working')
      .map((set, at) => ({
        kind: 'working' as const,
        reps: 5,
        weight: set.targetWeight,
        rir: 2,
        completed: true,
        setIndex: at,
        targetReps: set.targetReps,
        targetWeight: set.targetWeight,
        targetRir: set.targetRir,
      }));
    today.entries[0]!.plannedSets = today.entries[0]!.sets.length;
    today.startedAt = today.completedAt = '2026-09-09T12:00:00.000Z';
    const next = entryOf(plan([...history(), today], undefined, {}, homeUpTo(150)), DB_BENCH);
    // Fails on 5894333: "Missed the floor last time; one session is not a trend, so repeat the
    // load." and a top set of 95 (the sets were asked 6-8 at 95).
    expect(next.progression?.evidence.join(' ')).not.toContain('Missed the floor');
  });

  it('a plate missing today (no 2.5s): the bench press’s straight sets at 185 keep the back-offs’ reps and say nothing of 185 for 190', () => {
    const bench = (daysAgo: number, top: SetSpec, backOffs: SetSpec[]) => {
      const done = record(daysAgo, BENCH, [top, ...backOffs], [4, 6], 2);
      done.entries[0]!.backOffDrop = 0.05;
      done.entries[0]!.sets.forEach((set, at) => {
        set.tier = at === 0 ? 'top' : 'back-off';
        set.targetRir = at === 0 ? 1 : 2;
      });
      return done;
    };
    const lifted = [
      bench(
        7,
        [5, 180, 1],
        [
          [5, 170, 2],
          [5, 170, 2],
          [5, 170, 2],
        ],
      ),
      bench(
        3,
        [5, 185, 1],
        [
          [5, 175, 2],
          [5, 175, 2],
          [5, 175, 2],
        ],
      ),
    ];
    // Every plate there: a top set of 190 x 4-6 and back-offs of 180 x 4-6.
    const full = entryOf(plan(lifted), BENCH).sets.filter((set) => set.kind === 'working');
    expect(full.map((set) => [set.targetWeight, set.targetReps])).toEqual([
      [190, [4, 6]],
      [180, [4, 6]],
      [180, [4, 6]],
      [180, [4, 6]],
    ]);
    // No 2.5s today: 190 cannot be loaded, so straight sets at its back-offs' load, 180.5: 185, the
    // nearest the plates make (180 cannot be made; the fifth review of round N).
    const entry = entryOf(
      plan(lifted, undefined, { sessionLoading: { missingPlates: [2.5] } }),
      BENCH,
    );
    const sets = entry.sets.filter((set) => set.kind === 'working');
    expect(sets.every((set) => set.targetWeight === 185 && set.tier === undefined)).toBe(true);
    // Fails on 5894333: 175 x 5-7, the top set's "one extra rep" for 185 in place of 190, and the
    // line "No 2.5s today: 185 instead of 190, one extra rep." over sets at 175.
    // The back-offs' reps, as back-offs fitted to the weights here take them; or, pushed, saying
    // what they stand in for, so the next session reads them by it.
    expect(
      sets.every(
        (set) =>
          (set.targetReps[0] === 4 && set.targetReps[1] === 6) ||
          (set.asked !== undefined && set.asked.weight > (set.targetWeight ?? 0)),
      ),
    ).toBe(true);
    expect(entry.progression?.evidence.join(' ')).not.toContain('185 instead of 190');
  });
});
