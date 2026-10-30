import { describe, expect, it } from 'vitest';
import { record } from '../../test/records';
import { profileOf } from '../../test/backOffs';
import { asAsked, simulate, type Logged } from '../../test/backOffsSim';

/**
 * The sixth review of round N. The progression's own runs over a lift's sessions read the straight
 * days at the back-offs' load in the middle of the history as the lift's own sessions. The top set
 * reads past such days only where they are the newest (`pastBackOffDays`); the runs that move its
 * load (`consecutiveUnder` for the micro-deload and the reset, `consecutiveClean` for the advanced
 * policy) count the day before it too. On the default four-day split the row is the main lift on
 * the pull day and a secondary one on the upper day, so every run of top sets has such a day inside
 * it. The spec: what reads a lift's sessions over weeks reads its top sets alone, past its straight
 * days at the back-offs' load; a top set that misses keeps the existing maintain and deload rules
 * (the research). Synthetic data only.
 */

const ROW = 'barbell-row';
const START = '2026-09-07T12:00:00.000Z';
const seed = {
  ...record(0, ROW, [
    [5, 155, 2],
    [5, 155, 2],
    [5, 155, 2],
  ]),
  id: 'seed',
  startedAt: '2026-09-04T12:00:00.000Z',
  completedAt: '2026-09-04T12:00:00.000Z',
};
// The default four-day split (push, pull, lower, upper), Monday, Tuesday, Thursday and Friday.
const DAYS = [0, 1, 3, 4, 7, 8, 10, 11, 14, 15, 17, 18, 21, 22, 24, 25];
const lines = (seen: ReturnType<typeof simulate>['seen']) =>
  seen
    .map(
      (one) =>
        `day ${one.day} ${one.template}${one.atBackOffs ? ' (marked)' : ''}: ${one.sets[0]} / ${one.evidence.join(' / ')}`,
    )
    .join('\n');

describe('the row’s top set missing its floor every pull day, the upper day lifted as asked', () => {
  it('takes the micro-deload after two top sets under the floor', () => {
    // The top set one rep under its floor at no reserve; every other set as asked.
    const topMissed: Logged = (entry, set) =>
      entry.exerciseId === ROW && set.tier === 'top'
        ? { reps: set.targetReps[0] - 1, rir: 0, weight: set.targetWeight }
        : asAsked(entry, set);
    const { seen } = simulate({
      profile: profileOf('hybrid'),
      history: [seed],
      start: START,
      days: DAYS,
      exerciseId: ROW,
      how: topMissed,
    });
    const tops = seen.filter((one) => one.sets[0]?.startsWith('top'));
    expect(tops.length).toBeGreaterThanOrEqual(4);
    // The second top set missed, the deload rule's two in a row are in; whatever comes after them
    // reads them. On 6f2d5ea: "Missed the floor last time; one session is not a trend, so repeat
    // the load" on every day after, the row's top set at 165 x 4-6 four pull days running, each
    // missed: the upper day's straight sets between them, cleared, end each run of misses at one.
    const after = seen.filter((one) => one.day > tops[1]!.day);
    expect(
      after.some((one) => one.evidence.join(' ').includes('Missed the floor twice in a row')),
      lines(seen),
    ).toBe(true);
  });

  it('an advanced lifter: one clean top set after a grind holds the load once more', () => {
    // The first top set at the floor's reps with no reserve: not clean for the advanced policy
    // (no tolerance). Everything else as asked.
    let first = true;
    const grindOnce: Logged = (entry, set) => {
      if (entry.exerciseId === ROW && set.tier === 'top' && first) {
        first = false;
        return { reps: set.targetReps[0] + 1, rir: 0, weight: set.targetWeight };
      }
      return asAsked(entry, set);
    };
    const { seen } = simulate({
      profile: profileOf('hybrid', { experience: 'advanced' }),
      history: [seed],
      start: START,
      days: DAYS,
      exerciseId: ROW,
      how: grindOnce,
    });
    const tops = seen.filter((one) => one.sets[0]?.startsWith('top'));
    expect(tops.length).toBeGreaterThanOrEqual(3);
    const load = (one: (typeof seen)[number]) => Number(one.sets[0]!.split(' ')[1]!.split('x')[0]);
    // The grind holds the load: the second top set at the first's.
    expect(load(tops[1]!), lines(seen)).toBe(load(tops[0]!));
    // The second top set lifted clean is one clean session: "Advanced policy: load moves after 2
    // clean sessions in a row; 1 banked, hold the load once more." On 6f2d5ea: "2 clean sessions
    // in a row ... add 5 lb", the upper day's straight sets at the back-offs' load between the two
    // top sets counted as a clean session of the top set's.
    expect(load(tops[2]!), lines(seen)).toBe(load(tops[1]!));
  });
});
