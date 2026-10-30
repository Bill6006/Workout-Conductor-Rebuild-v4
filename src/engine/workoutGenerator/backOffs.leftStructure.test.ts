import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../core/validation/profile';
import { record } from '../../test/records';
import { BENCH, profileOf } from '../../test/backOffs';
import { simulate } from '../../test/backOffsSim';

/**
 * The seventh review of round N. Hybrid turned Undulating: the bench press's heavy day (4-6) after
 * the change runs straight at its back-offs' load, read off its last top set, and is saved as a day
 * at the back-offs' load (`atBackOffs`). Since the sixth review, `pastBackOffDays` passes over such
 * days wherever they fall unless the newest run of them passes two; on Undulating the moderate and
 * light days between two heavy days are straight sessions of the lift's own, so the newest run is
 * never more than one, and every heavy day passes over every earlier heavy day and reads the same
 * last top set again: 195 x 4-6 on all four heavy days over five weeks, however each was lifted,
 * every "Last" line the top set of weeks before (until that set is six weeks old). The spec: past two such days running the lift has left
 * the structure and its straight sessions are its own; the report's known limit says a lift that
 * leaves the structure holds the back-offs' load for its first three sessions after the change and
 * reads its own straight sessions from the fourth. On 8c1a1bf the second heavy day read the first
 * (200 after 195). The same on a split changed from four days a week to three (the default Hybrid
 * profile): the row, main on the pull day, is secondary on the new upper day (straight at its
 * back-offs' load, saved as such a day) and on the full-body day at another range (its own straight
 * sessions), so every upper day reads the last pull-day top set: 165 x 4-6 on six upper days running,
 * however lifted, then, once that top set is six weeks older than the newest session, an estimate
 * read off the full-body day, past every upper day: 130, 35 lb under the day before. Synthetic data
 * only.
 */

describe('the bench press’s heavy days after Hybrid turns Undulating, each lifted as asked', () => {
  it('step up from the heavy day before, never the same old top set every time', () => {
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
    // The default four-day split, Monday, Tuesday, Thursday and Friday, for eight weeks: two weeks of
    // Hybrid (top set plus back-offs), then Undulating.
    const days: number[] = [];
    for (let week = 0; week < 8; week += 1) {
      days.push(week * 7, week * 7 + 1, week * 7 + 3, week * 7 + 4);
    }
    const { seen } = simulate({
      profile: profileOf('hybrid'),
      profileFor: (day) => profileOf(day < 14 ? 'hybrid' : 'undulating'),
      history: [seed],
      start: '2026-09-07T12:00:00.000Z',
      days,
      exerciseId: BENCH,
    });
    const lines = seen
      .map(
        (one) =>
          `day ${one.day} ${one.template}${one.atBackOffs ? ' (marked)' : ''}: ${one.sets[0]} / ${one.evidence.join(' / ')}`,
      )
      .join('\n');
    const load = (one: (typeof seen)[number]) => Number(one.sets[0]!.split(' ')[1]!.split('x')[0]);
    const heavy = seen.filter((one) => one.day >= 14 && one.sets[0]!.includes('x4-6@'));
    expect(heavy.length, lines).toBeGreaterThanOrEqual(3);
    // The first heavy day after the change at the back-offs' load (the fifth review's fix).
    expect(heavy[0]!.atBackOffs, lines).toBe(true);
    // Each heavy day after it, the one before lifted as asked at its reserve, steps up from it. On
    // e6ed7ed: 195, 195, 195, 195, every one reading "Last: 200 lb × 5 @ RIR 1 (Sep 18)".
    for (let at = 1; at < heavy.length; at += 1) {
      expect(load(heavy[at]!), lines).toBeGreaterThan(load(heavy[at - 1]!));
    }
  });
});

describe('the row’s upper days after a split changed from four days a week to three', () => {
  it('step up from the upper day before, each lifted as asked: never held, never a fall', () => {
    const ROW = 'barbell-row';
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
    const schedule = createDefaultProfile('2026-09-01T12:00:00.000Z').schedule;
    const four = profileOf('hybrid', {
      schedule: { ...schedule, availableDays: ['mon', 'tue', 'thu', 'fri'], weeklyFrequency: 4 },
    });
    const three = profileOf('hybrid', {
      schedule: { ...schedule, availableDays: ['mon', 'wed', 'fri'], weeklyFrequency: 3 },
    });
    // Two weeks at four days (push, pull, lower, upper), then seven at three (full body, upper, lower).
    const days: number[] = [];
    for (let week = 0; week < 2; week += 1) {
      days.push(week * 7, week * 7 + 1, week * 7 + 3, week * 7 + 4);
    }
    for (let week = 2; week < 9; week += 1) days.push(week * 7, week * 7 + 2, week * 7 + 4);
    const { seen } = simulate({
      profile: four,
      profileFor: (day) => (day < 14 ? four : three),
      history: [seed],
      start: '2026-09-07T12:00:00.000Z',
      days,
      exerciseId: ROW,
    });
    const lines = seen
      .map(
        (one) =>
          `day ${one.day} ${one.template}${one.atBackOffs ? ' (marked)' : ''}: ${one.sets[0]} / ${one.evidence.join(' / ')}`,
      )
      .join('\n');
    const load = (one: (typeof seen)[number]) => Number(one.sets[0]!.split(' ')[1]!.split('x')[0]);
    const upper = seen.filter((one) => one.day >= 14 && one.template === 'upper');
    expect(upper.length, lines).toBeGreaterThanOrEqual(6);
    // On e6ed7ed: 165 on six upper days running ("Last: 170 lb × 5 @ RIR 1 (Sep 17)" each time),
    // then 130.
    for (let at = 1; at < upper.length; at += 1) {
      expect(load(upper[at]!), lines).toBeGreaterThan(load(upper[at - 1]!));
    }
  });
});
