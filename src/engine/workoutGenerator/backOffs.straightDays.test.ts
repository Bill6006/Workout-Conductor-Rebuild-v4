import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { emptyConstraints } from '../../engine/recalibration/recalibrate';
import { record, type SetSpec } from '../../test/records';
import { BENCH, DB_BENCH, bench, plan, run, shape, trained } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11 (the second review of round N): a day that runs a main lift
 * straight after sessions on top set plus back-offs (fatigue high, a catch-up, the lift to push)
 * takes its back-offs' load, the drop off the load its top set would carry, at the day's reserve:
 * the top set's load at a straight set's reserve asks more than its reps allow. Synthetic data
 * only.
 */

/** A session on the structure: a top set, then back-offs, `daysAgo`, at a drop. */
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

/** Two sessions on the structure, and rows five days running: with a low check-in, fatigue high. */
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
  ...[5, 4, 3, 2, 1].map((daysAgo) =>
    record(daysAgo + 0.5, 'barbell-row', [
      [8, 135, 2],
      [8, 135, 2],
    ]),
  ),
];

describe('a main lift on straight sets after sessions on top set plus back-offs, the second review of round N', () => {
  it('a low check-in eases the lift: no set heavier than the back-offs it had', () => {
    const before = plan(history());
    expect(shape(bench(before))).toEqual([
      [195, 1, 'top'],
      [185, 2, 'back-off'],
      [185, 2, 'back-off'],
      [185, 2, 'back-off'],
    ]);
    const readiness = {
      energy: 1,
      soreness: 4,
      sleep: 1,
      motivation: 2,
      jointDiscomfort: [],
      timePressure: false,
    };
    const after = run({ type: 'readiness', readiness }, before, { history: history() });
    const sets = shape(bench(after.workout));
    // Straight sets, as fatigue high asks...
    expect(sets.every((set) => set[2] === 'straight')).toBe(true);
    // ...and eased: none heavier than the back-offs were before the check-in.
    expect(Math.max(...sets.map((set) => set[0] as number))).toBeLessThanOrEqual(185);
  });

  it('a catch-up holds every set to its reserve: none heavier than a plain day’s back-offs', () => {
    const plain = shape(bench(plan(history())));
    expect(plain.slice(1).map((set) => set[0])).toEqual([185, 185, 185]);
    const catchUp = {
      kind: 'catch-up' as const,
      muscles: [{ muscle: 'chest' as const, sets: 3, minRir: 1, why: 'behind' as const }],
      sitOut: [],
    };
    const sets = shape(bench(plan(history(), undefined, { catchUp })));
    expect(sets.every((set) => set[2] === 'straight')).toBe(true);
    expect(Math.max(...sets.map((set) => set[0] as number))).toBeLessThanOrEqual(185);
  });

  it('a lift whose last session ran straight keeps its own target on a straight day', () => {
    // Two straight sessions at 185: a plain day's top set steps up to 190, and a catch-up's straight
    // sets take the same step, never the back-offs' load (there were no back-offs).
    const plainTop = shape(bench(plan(trained())))[0];
    expect(plainTop).toEqual([190, 1, 'top']);
    const catchUp = {
      kind: 'catch-up' as const,
      muscles: [{ muscle: 'chest' as const, sets: 3, minRir: 1, why: 'behind' as const }],
      sitOut: [],
    };
    const sets = shape(bench(plan(trained(), undefined, { catchUp })));
    expect(sets.map((set) => [set[0], set[2]])).toEqual(sets.map(() => [190, 'straight']));
  });

  it('a return after three weeks away keeps its own eased load, straight, at the day’s reserve', () => {
    // An eased load runs straight on its own read: never the drop off the top set's eased load.
    const away = [
      structured(
        28,
        [5, 185, 1],
        [
          [5, 175, 2],
          [5, 175, 2],
          [5, 175, 2],
        ],
      ),
      structured(
        25,
        [5, 190, 1],
        [
          [5, 180, 2],
          [5, 180, 2],
          [5, 180, 2],
        ],
      ),
    ];
    const entry = bench(plan(away));
    expect(entry.progression?.mode).toBe('return');
    // 90% of the estimated max, at 6 reps and 2 in reserve.
    expect(shape(entry)).toEqual([
      [160, 2, 'straight'],
      [160, 2, 'straight'],
      [160, 2, 'straight'],
      [160, 2, 'straight'],
    ]);
  });

  describe('a change to the plan on such a day keeps the back-offs’ load', () => {
    /** The plan after a low check-in: fatigue high, the bench press straight. */
    function spent() {
      const readiness = {
        energy: 1,
        soreness: 4,
        sleep: 1,
        motivation: 2,
        jointDiscomfort: [],
        timePressure: false,
      };
      return run({ type: 'readiness', readiness }, plan(history()), { history: history() });
    }
    const eased = (sets: ReturnType<typeof shape>) => {
      expect(sets.every((set) => set[2] === 'straight')).toBe(true);
      // The back-offs' load itself: 5% under the 195 the top set would carry (the fourth review of
      // round N: a target read from no history passed "no heavier than").
      expect(sets.map((set) => set[0])).toEqual(sets.map(() => 185));
    };

    /** A catch-up for the chest, the bench press straight in it: the structure off for the day. */
    const catchUp = {
      kind: 'catch-up' as const,
      muscles: [{ muscle: 'chest' as const, sets: 3, minRir: 1, why: 'behind' as const }],
      sitOut: [],
    };
    const catchUpDay = () => {
      const workout = plan(history(), undefined, { catchUp });
      return { workout, constraints: { ...emptyConstraints(), catchUp } };
    };

    it('a refit on a catch-up', () => {
      const day = catchUpDay();
      eased(shape(bench(day.workout)));
      const refit = run({ type: 'loading' }, day.workout, {
        history: history(),
        constraints: day.constraints,
      });
      eased(shape(bench(refit.workout)));
    });

    it('a swap away and back on a catch-up', () => {
      const day = catchUpDay();
      const away = run(
        { type: 'replace', entryId: bench(day.workout).id, exerciseId: DB_BENCH },
        day.workout,
        { history: history(), constraints: day.constraints },
      );
      const swapped = away.workout.blocks
        .flatMap((block) => block.entries)
        .find((entry) => entry.exerciseId === DB_BENCH)!;
      const back = run({ type: 'replace', entryId: swapped.id, exerciseId: BENCH }, away.workout, {
        history: history(),
        constraints: away.constraints,
      });
      eased(shape(bench(back.workout)));
    });

    it('a max entered', () => {
      const day = spent();
      const entered = run({ type: 'max', exerciseId: BENCH }, day.workout, {
        history: history(),
        constraints: day.constraints,
      });
      // As the day had it: the back-offs' load at the low check-in's reserve.
      expect(shape(bench(entered.workout))).toEqual(shape(bench(day.workout)));
      expect(shape(bench(day.workout)).every((set) => set[2] === 'straight')).toBe(true);
      expect(Math.max(...shape(bench(day.workout)).map((set) => set[0] as number))).toBeLessThan(
        190,
      );
    });
  });
});
