import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../core/validation/profile';
import { record } from '../../test/records';
import { BENCH, profileOf } from '../../test/backOffs';
import { simulate } from '../../test/backOffsSim';
import { coachingPolicy } from '../coach/experience';
import { detectStalls } from '../strategy/plateau';

/**
 * The eighth review of round N. A deload week reads as leaving the structure for a lift that is
 * the main lift one day and a secondary one another, trained twice in the week.
 *
 * The spec (docs/reports/maintenance-32.md): a deload week runs a main lift straight at its
 * back-offs' load (by judgement), saved as a day at the back-offs' load (`atBackOffs`), and a lift's
 * top set reads past such days back to its last session of its own; the known limit says only a
 * lift trained three or more times in one deload week reads its last deload session as its own
 * after it.
 *
 * What happens on abb5566: `pastBackOffDays` counts every session of the lift since its last top
 * set, the secondary day before the deload week among them, so a lift trained only twice in the
 * deload week passes `BACK_OFF.STRAIGHT_RUN` (2) and reads its whole history as its own.
 *
 * 1. The default profile (Hybrid, four days: push, pull, lower, upper): the row is the main lift on
 *    the pull day and secondary on the upper day. Its top set goes 160, 165 on the pull days, each
 *    lifted as asked, the upper day after each at the back-offs' load; the deload week (week 3) runs
 *    it on the pull and the upper day, straight at the back-offs' load 10% lighter (145). The first
 *    pull day after it asks a top set of 150 ("Last: 145 lb × 5, 5 @ RIR 3", the deload's upper day
 *    read as the row's own), 15 lb under the 165 it lifted before the deload and 20 under the step
 *    from it (the back-offs 145 for 160); the bench press, main on both of its days on the same
 *    split, steps up from its last top set after the same deload week (205, then 210). The row's
 *    top set is back at 170 four weeks after that.
 * 2. Three days (full body, upper, lower): the bench press is the main lift on the upper day and
 *    secondary on the full-body day. After the deload week, the full-body day reads past the deload
 *    (195, the back-offs' load off 205), and the upper day after it reads that straight day as its
 *    own: the top set held at 200 (its last before the deload), "Last: 195 lb × 5, 5, 5 @ RIR 2",
 *    a straight day at the back-offs' load named as the session the top set is read from.
 *
 * 3. The coach reads the row's fall as a stall: from the third pull day after the deload, every set
 *    of every session lifted as asked, `detectStalls` finds the row "stalled-at-effort" ("Best
 *    estimated max 192.5 lb then, 186.7 lb now (Sep 15 to Oct 13)") and a route opens (shift the rep
 *    range, a variation, a deload, a set more) for a fall the plan made.
 *
 * The same cause as strengthFiveDays.test.ts: past two sessions since the last top set, the
 * straight days at the back-offs' load are read as the lift's own, at its own reserve.
 *
 * Also fails on 5dc61a7 and e6ed7ed (the sixth pass: three straight days at the back-offs' load
 * running). Synthetic data only.
 */

const ROW = 'barbell-row';
const start = '2026-09-07T12:00:00.000Z';
const begin = Date.parse(start);
const DAY = 86_400_000;

const seedOf = (exerciseId: string, weight: number) => ({
  ...record(0, exerciseId, [
    [5, weight, 2],
    [5, weight, 2],
    [5, weight, 2],
  ]),
  id: `seed-${exerciseId}`,
  startedAt: '2026-09-04T12:00:00.000Z',
  completedAt: '2026-09-04T12:00:00.000Z',
});

/** The deload week, Monday to Monday of week 2 (days 14 to 20). */
const deload = {
  startsAt: new Date(begin + 14 * DAY - 3_600_000).toISOString(),
  endsAt: new Date(begin + 21 * DAY - 3_600_000).toISOString(),
};

const load = (sets: string[]) => Number(sets[0]!.split(' ')[1]!.split('x')[0]);

describe('a lift main one day and secondary another, after a deload week', () => {
  it('the row (default four days): its first top set after the deload steps from the last one', () => {
    const days: number[] = [];
    for (let week = 0; week < 5; week += 1) {
      days.push(week * 7, week * 7 + 1, week * 7 + 3, week * 7 + 4);
    }
    const week: Record<number, string> = { 0: 'push-arms', 1: 'pull-arms', 3: 'lower', 4: 'upper' };
    const { seen } = simulate({
      profile: profileOf('hybrid'),
      history: [seedOf(ROW, 155)],
      start,
      days,
      exerciseId: ROW,
      constraintsFor: (day) => ({
        templateId: week[day % 7]!,
        ...(day >= 14 && day < 21 ? { deload } : {}),
      }),
    });
    const lines = seen
      .map(
        (one) =>
          `day ${one.day} ${one.template}${one.atBackOffs ? ' (marked)' : ''}: ${one.sets.join(' | ')} / ${one.evidence.join(' / ')}`,
      )
      .join('\n');
    const pulls = seen.filter((one) => one.template === 'pull-arms');
    const before = pulls.filter((one) => one.day < 14);
    const after = pulls.filter((one) => one.day >= 21);
    expect(before.length, lines).toBeGreaterThanOrEqual(2);
    expect(after.length, lines).toBeGreaterThanOrEqual(1);
    // Twice in the deload week, each at the back-offs' load, marked.
    expect(
      seen.filter((one) => one.day >= 14 && one.day < 21).map((one) => one.atBackOffs),
      lines,
    ).toEqual([true, true]);
    const lastTop = load(before.at(-1)!.sets);
    // On abb5566: 150 after 165 ("Last: 145 lb × 5, 5 @ RIR 3 (Sep 25)").
    expect(after[0]!.sets[0]!.startsWith('top '), lines).toBe(true);
    expect(load(after[0]!.sets), lines).toBeGreaterThan(lastTop);
  });

  it('the bench press (three days): the upper day after the deload never reads the full-body day', () => {
    const schedule = createDefaultProfile('2026-09-01T12:00:00.000Z').schedule;
    const three = profileOf('hybrid', {
      schedule: { ...schedule, availableDays: ['mon', 'wed', 'fri'], weeklyFrequency: 3 },
    });
    const days: number[] = [];
    for (let week = 0; week < 5; week += 1) days.push(week * 7, week * 7 + 2, week * 7 + 4);
    const week: Record<number, string> = { 0: 'full-body', 2: 'upper', 4: 'lower' };
    const { seen } = simulate({
      profile: three,
      history: [seedOf(BENCH, 185)],
      start,
      days,
      exerciseId: BENCH,
      constraintsFor: (day) => ({
        templateId: week[day % 7]!,
        ...(day >= 14 && day < 21 ? { deload } : {}),
      }),
    });
    const lines = seen
      .map(
        (one) =>
          `day ${one.day} ${one.template}${one.atBackOffs ? ' (marked)' : ''}: ${one.sets.join(' | ')} / ${one.evidence.join(' / ')}`,
      )
      .join('\n');
    const uppers = seen.filter((one) => one.template === 'upper');
    const before = uppers.filter((one) => one.day < 14);
    const after = uppers.filter((one) => one.day >= 21);
    expect(after.length, lines).toBeGreaterThanOrEqual(1);
    const lastTop = load(before.at(-1)!.sets);
    // On abb5566: 200 after 200, "Last: 195 lb × 5, 5, 5 @ RIR 2 (Sep 28)", the full-body day.
    expect(load(after[0]!.sets), lines).toBeGreaterThan(lastTop);
    expect(after[0]!.evidence[0], lines).toMatch(/^Last: \d+ lb × \d+ @ RIR 1 /);
  });
});

describe('the coach after the row’s deload week, every set lifted as asked', () => {
  it('finds no stall', () => {
    const days: number[] = [];
    for (let week = 0; week < 7; week += 1) {
      days.push(week * 7, week * 7 + 1, week * 7 + 3, week * 7 + 4);
    }
    const week: Record<number, string> = { 0: 'push-arms', 1: 'pull-arms', 3: 'lower', 4: 'upper' };
    const { history } = simulate({
      profile: profileOf('hybrid'),
      history: [seedOf(ROW, 155)],
      start,
      days,
      exerciseId: ROW,
      constraintsFor: (day) => ({
        templateId: week[day % 7]!,
        ...(day >= 14 && day < 21 ? { deload } : {}),
      }),
    });
    const policy = coachingPolicy('intermediate');
    const stalled = history.flatMap((record, at) =>
      detectStalls(history.slice(0, at + 1), profileOf('hybrid'), policy)
        .filter((stall) => stall.exerciseId === ROW)
        .map((stall) => `${record.completedAt}: ${stall.why.join(' ')}`),
    );
    // On abb5566: "stalled-at-effort" from Oct 13, "Best estimated max 192.5 lb then, 186.7 lb now".
    expect(stalled).toEqual([]);
  });
});
