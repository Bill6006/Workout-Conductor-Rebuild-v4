import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record, type SetSpec } from '../../test/records';
import { BENCH, bench, plan, shape } from '../../test/backOffs';

/**
 * The ninth review of round N. The drop's self-correction reads back-offs lifted at another load
 * than the drop's as if they were at it: two sessions of back-offs lighter than the drop gives,
 * rated easier than asked, narrow the drop to nothing, and the next plan asks every back-off at the
 * top set's own load.
 *
 * The spec (docs/reports/maintenance-32.md, docs/research/top-set-back-offs.md): "When the back-offs
 * miss their reserve by a rep or more on average two sessions running at the drop in force, the
 * same way, it moves 4% for each rep missed: harder widens it, easier narrows it" (Helms et al.
 * 2018's 2% per half a rep of RPE, a load correction for a rating missed at that load); "a weight
 * the back-offs took by hand after it is theirs" (`withDropsToday`); the follow takes the back-offs
 * "a step up after one clearly easy and down after a grind". The research's self-correction asks
 * whether the drop's load was too heavy or too light; a back-off lifted at another load says how
 * that load felt.
 *
 * What happens: `backOffMiss` reads every back-off's reserve against its target, never the load it
 * was lifted at against the drop's (`backOffLoad(top, drop)`), and `backOffDropFor` moves the drop
 * on it.
 *
 * 1. The follow's own step: two sessions whose top set ground out (200 × 4 at 0 in reserve, so the
 *    top set holds), the back-offs stepped down to 185 after each (the drop's load is 190), rated
 *    3 or 4 in reserve, as a step lighter feels: the drop narrows to 1% or to nothing, and the next
 *    plan, after two grinding top sets, asks the back-offs at 195, or at 200, the top set's own
 *    load, at 2 in reserve after a top set at 1.
 * 2. A weight set by hand: two sessions whose back-offs the lifter set 15% lighter by hand (170 for
 *    a 200 top set), rated 4 in reserve: the drop goes to nothing, every back-off at 205 after a
 *    205 top set. Set to the top set's own load by hand and rated 1, the drop widens to 9%.
 *
 * Also fails on 412666e (before the eighth pass). Synthetic data only.
 */

function structured(daysAgo: number, top: SetSpec, backOff: SetSpec): WorkoutRecord {
  const done = record(daysAgo, BENCH, [top, backOff, backOff, backOff], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  // As the store saves it: the load the drop gave the back-offs off the top set as lifted, at the
  // gym's 5 lb step.
  entry.backOffAt = Math.round(((top[1] ?? 0) * (1 - 0.05)) / 5) * 5;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
    // The load each set was asked at: the back-offs' as the follow or the hand left it.
    set.targetWeight = set.weight;
  });
  return done;
}

describe('the drop after back-offs lifted at another load than the drop’s', () => {
  it('stepped down after two grinding top sets and rated a rep easier: the drop stays', () => {
    // A step under the drop's load (185 for 190, 2.5% more) and a rep more in reserve: at the
    // drop's own load they would have been at about their reserve.
    const history = [
      structured(7, [4, 200, 0], [5, 185, 3]),
      structured(3, [4, 200, 0], [5, 185, 3]),
    ];
    const entry = bench(plan(history));
    const sets = shape(entry);
    expect(sets[0]).toEqual([200, 1, 'top']);
    // On 34dc615 and 412666e: 0.01, the back-offs at 195 after two grinding top sets (rated 4 in
    // reserve instead: 0, the back-offs at 200, the top set's own load).
    expect(entry.backOffDrop).toBe(0.05);
    expect(sets.slice(1).map((set) => set[0])).toEqual([190, 190, 190]);
  });

  it('set lighter by hand and rated easier: no back-off at the top set’s own load', () => {
    const history = [
      structured(7, [5, 195, 1], [5, 165, 4]),
      structured(3, [5, 200, 1], [5, 170, 4]),
    ];
    const entry = bench(plan(history));
    const sets = shape(entry);
    expect(sets[0]).toEqual([205, 1, 'top']);
    // On 34dc615 and 412666e: drop 0, [205, 205, 205] at 2 in reserve after a top set of 205 at 1.
    expect(entry.backOffDrop).toBeGreaterThan(0);
    expect(Math.max(...sets.slice(1).map((set) => set[0] as number))).toBeLessThan(205);
  });

  it('set to the top set’s load by hand and rated a rep harder: the drop stays', () => {
    const history = [
      structured(7, [5, 195, 1], [5, 195, 1]),
      structured(3, [5, 200, 1], [5, 200, 1]),
    ];
    const entry = bench(plan(history));
    // Back-offs at the top set's own load were a rep harder than asked: at the 5% drop in force they
    // would have been at about their reserve. On 34dc615 and 412666e: 0.09, back-offs 185.
    expect(entry.backOffDrop).toBe(0.05);
  });
});
