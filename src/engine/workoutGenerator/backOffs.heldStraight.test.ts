import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record, type SetSpec } from '../../test/records';
import { BENCH, DB_BENCH, home, profileOf } from '../../test/backOffs';
import { simulate } from '../../test/backOffsSim';

/**
 * The fifth review of round N. A day that runs a main lift straight after a session on top set plus
 * back-offs takes the back-offs' load and is saved as such a day (`atBackOffs`). On a day the lift
 * is main (`backOffsSuit`), `mainLiftTarget` reads the top set through `pastBackOffDays`, which
 * passes over every such day since the lift's last session of its own, with no cap (the cap of two,
 * `BACK_OFF.STRAIGHT_RUN`, is only in `ranOnTopSet`, read on a day the lift is not main). So a main
 * lift straight several sessions running reads the same old top set each time: the same back-offs'
 * load, marked again, however it was lifted, until that top set is three weeks old (a "return").
 * The spec: a straight day reads the top set through two such days running at most; past them the
 * lift's straight sessions are its own. Seen with the lift to push (straight on every day the push
 * runs, "its own target" by the round's default) and with a top set the place cannot load as asked
 * (home dumbbells to 100 lb). Synthetic data only.
 */

const START = '2026-09-07T12:00:00.000Z';
const seed = {
  ...record(0, BENCH, [
    [5, 185, 2],
    [5, 185, 2],
    [5, 185, 2],
  ]),
  id: 'seed',
  startedAt: '2026-09-04T12:00:00.000Z',
  completedAt: '2026-09-04T12:00:00.000Z',
};
const plain = profileOf('hybrid');
const pushed = profileOf('hybrid', {
  pushLift: { exerciseId: BENCH, target: 250, units: 'lb', since: '2026-09-20T00:00:00.000Z' },
});
// The default four-day split (push, pull, lower, upper), Monday, Tuesday, Thursday and Friday.
const DAYS = [0, 1, 3, 4, 7, 8, 10, 11, 14, 15, 17, 18, 21, 22, 24, 25, 28, 29];

describe('the lift to push after sessions on the structure, every set lifted as asked', () => {
  it('moves up once it has run straight at the back-offs’ load two sessions running', () => {
    const { seen } = simulate({
      profile: plain,
      // Two weeks on the structure, then the lifter sets a push on the bench press.
      profileFor: (day) => (day >= 14 ? pushed : plain),
      history: [seed],
      start: START,
      days: DAYS,
      exerciseId: BENCH,
    });
    const tops = seen.filter((one) => one.sets[0]?.startsWith('top'));
    expect(tops.length).toBeGreaterThanOrEqual(2);
    const push = seen.filter((one) => one.day >= 14);
    expect(push.length).toBeGreaterThanOrEqual(4);
    expect(push.every((one) => one.push === 'natural')).toBe(true);
    const load = (at: number) => Number(push[at]!.sets[0]!.split(' ')[1]!.split('x')[0]);
    const lines = push.map(
      (one) => `day ${one.day}: ${one.sets[0]}${one.atBackOffs ? ' (marked)' : ''}`,
    );
    // The first push session: the back-offs' load (the spec), saved as such a day.
    expect(push[0]!.atBackOffs).toBe(true);
    // The fourth comes after three straight days at the back-offs' load: its own straight session,
    // read from the last one, a step up after each lifted as asked. On 7f23a26: 190 lb on all
    // five push sessions over two weeks, each marked, the top set read through four such days.
    expect(push[3]!.atBackOffs, lines.join('\n')).toBeFalsy();
    expect(load(3), lines.join('\n')).toBeGreaterThan(load(0));
  });
});

describe('a main lift whose top set the place cannot load as asked, session after session', () => {
  function structured(when: string, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
    const done = {
      ...record(0, DB_BENCH, [top, ...backOffs], [4, 6], 2),
      id: `top-${when}`,
      startedAt: when,
      completedAt: when,
    };
    const entry = done.entries[0]!;
    entry.backOffDrop = 0.05;
    entry.role = 'primary-strength';
    entry.sets.forEach((set, index) => {
      set.tier = index === 0 ? 'top' : 'back-off';
      set.targetRir = index === 0 ? 1 : 2;
    });
    return done;
  }

  it('home dumbbells to 100 lb: its straight sessions are its own past two at the back-offs’ load', () => {
    const homeTo100 = {
      ...home,
      loading: {
        dumbbells: { kind: 'dumbbells' as const, ranges: [{ from: 5, to: 100, step: 5 }] },
      },
    };
    const history = [
      structured(
        '2026-09-01T12:00:00.000Z',
        [5, 95, 1],
        [
          [5, 90, 2],
          [5, 90, 2],
          [5, 90, 2],
        ],
      ),
      structured(
        '2026-09-04T12:00:00.000Z',
        [5, 100, 1],
        [
          [5, 95, 2],
          [5, 95, 2],
          [5, 95, 2],
        ],
      ),
    ];
    const { seen } = simulate({
      profile: profileOf('hybrid'),
      history,
      start: START,
      days: [0, 3, 7, 10, 14],
      exerciseId: DB_BENCH,
      location: homeTo100,
      constraintsFor: () => ({ templateId: 'push-arms' }),
    });
    expect(seen).toHaveLength(5);
    const lines = seen.map(
      (one) => `day ${one.day}: ${one.sets[0]}${one.atBackOffs ? ' (marked)' : ''}`,
    );
    // The first: the back-offs' load the asked top set (105) gives, saved as such a day (the spec):
    // 99.75 lb, rounded to the nearest weight here (the research's rounding, the fifth review).
    expect(seen[0]!.sets[0]).toBe('straight 100x4-6@2');
    expect(seen[0]!.atBackOffs).toBe(true);
    // The fourth comes after three such days: its own straight session, not the same old read.
    // On 7f23a26: 95 x 4-6 at 2, marked, five sessions running ("Last: 100 lb x 5 @ RIR 1").
    expect(seen[3]!.atBackOffs, lines.join('\n')).toBeFalsy();
  });
});
