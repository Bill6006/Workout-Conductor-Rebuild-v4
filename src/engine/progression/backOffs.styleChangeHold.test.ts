import { describe, expect, it } from 'vitest';
import { record } from '../../test/records';
import { profileOf } from '../../test/backOffs';
import { asAsked, simulate } from '../../test/backOffsSim';

/**
 * The ninth review of round N. After a style change, a lift with secondary days holds the same old
 * back-offs' load for five sessions over two and a half weeks, however they are lifted, where the
 * known limit the eighth pass wrote says three.
 *
 * The spec (docs/reports/maintenance-32.md, known limits): "A lift that leaves the structure (a
 * style or a split changed) reads its last top set through two sessions with none of its main days
 * after it, or two of its main days run straight: its first three such sessions after the change
 * hold the back-offs' load, and the next reads its own straight sessions." The fifth review's HIGH,
 * which that limit bounds: a main lift straight several sessions running read the same old top set
 * each time, "190 × 4-6 for five sessions over two weeks however it was lifted".
 *
 * What happens: the eighth pass's `pastBackOffDays` takes a lift out only past two of its main days
 * run straight (or three sessions with none), and its days as a secondary lift between them never
 * count. On the default split (Hybrid, four days: push, pull, lower, upper) the row is the main
 * lift on the pull day and secondary on the upper day, so after the change every upper day between
 * the pull days holds too.
 *
 * Steps: the row seeded at 155; two weeks on the default split (top sets 160 and 165, the upper
 * days at their back-offs' load); then the lifter switches to Hypertrophy focus (the structure off,
 * the row still 4-6 at 2 in reserve on both days) and lifts every straight set of it clearly easy,
 * 6 reps at 4 in reserve. The pull and upper days of the next two and a half weeks (Sep 22 to Oct 6,
 * five sessions) are each asked 160 × 4-6, marked, every one read off "Last: 165 lb × 5 @ RIR 1
 * (Sep 15)"; the sixth reads its own sessions and steps up. On 412666e (before the eighth pass) two
 * sessions after the change hold, and the third reads its own.
 *
 * Passes on 412666e. Synthetic data only.
 */

const ROW = 'barbell-row';
const START = '2026-09-07T12:00:00.000Z';
const CHANGE = 14;

describe('the row after Hybrid turned Hypertrophy focus on the default split', () => {
  it('holds the old back-offs’ load for three sessions at most, then reads its own', () => {
    const days: number[] = [];
    for (let week = 0; week < 6; week += 1) {
      days.push(week * 7, week * 7 + 1, week * 7 + 3, week * 7 + 4);
    }
    const week: Record<number, string> = { 0: 'push-arms', 1: 'pull-arms', 3: 'lower', 4: 'upper' };
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
    const { seen } = simulate({
      profile: profileOf('hybrid'),
      profileFor: (day) => profileOf(day >= CHANGE ? 'hypertrophy-focus' : 'hybrid'),
      history: [seed],
      start: START,
      days,
      exerciseId: ROW,
      constraintsFor: (day) => ({ templateId: week[day % 7]! }),
      // Its straight sets clearly easy: the top of the range at 4 in reserve.
      how: (entry, set) =>
        entry.exerciseId === ROW && set.kind === 'working' && set.tier === undefined
          ? { reps: set.targetReps[1], rir: 4, weight: set.targetWeight }
          : asAsked(entry, set),
    });
    const lines = seen
      .map(
        (one) =>
          `day ${one.day} ${one.template}${one.atBackOffs ? ' (marked)' : ''}: ${one.sets[0]} / ${one.evidence[0]}`,
      )
      .join('\n');
    const after = seen.filter((one) => one.day >= CHANGE);
    expect(after.length, lines).toBeGreaterThanOrEqual(8);
    expect(
      after.every((one) => one.sets[0]!.startsWith('straight ')),
      lines,
    ).toBe(true);
    const held = after.filter((one) => one.atBackOffs === true);
    // On 34dc615: five (days 15, 18, 22, 25 and 29, each "straight 160x4-6@2"). On 412666e: two.
    expect(held.length, lines).toBeLessThanOrEqual(3);
  });
});
