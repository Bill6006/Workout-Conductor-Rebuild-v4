import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../core/validation/profile';
import type { Readiness } from '../recalibration/types';
import { record } from '../../test/records';
import { profileOf } from '../../test/backOffs';
import { simulate } from '../../test/backOffsSim';

/**
 * The eighth review of round N. A lift trained three times a week with one main day is read as
 * having left the structure the first time its main day runs straight, and from then on its top set
 * steps from its own straight days at the back-offs' load: it falls, then never progresses again.
 *
 * Strength focus on five days (Monday to Friday) runs the split full body, lower, upper, push, pull
 * (`splitFor`). The row is the main lift on the pull day (Friday), and also trained at the same 4-6
 * range on the full-body day (primary hypertrophy) and the upper day (secondary strength): both run
 * it straight at its back-offs' load, saved as such days (`atBackOffs`). That is two sessions since
 * its last top set every Friday, the most `pastBackOffDays` reads through (`BACK_OFF.STRAIGHT_RUN`).
 *
 * The spec: when fatigue is high the main lift runs straight at that mode's load (the research,
 * docs/research/top-set-back-offs.md); a lift's top set reads past its straight days at the
 * back-offs' load back to its last session of its own, and only a lift that has left the structure
 * ("a style or a split changed", docs/reports/maintenance-32.md and its known limits) reads its
 * straight sessions as its own. Nothing here changed: same style, same split, every set lifted as
 * asked (the reps one past the floor, at the reserve and load asked).
 *
 * Steps: the row seeded at 155; eight weeks of the five-day split; every other Friday a check-in
 * with low energy, so the day's fatigue is high and the pull day runs the row straight at its
 * back-offs' load (marked), as the research has it. The full-body day after it counts three
 * sessions since the last top set, reads the whole history, and takes that Friday's straight sets
 * (150) as the row's own; the upper day holds them; the next pull day's top set steps from them:
 * 155 after 160, then 150, then 150 for good (the back-offs 145), every two weeks the same cycle.
 * Before round N (532aba6) the same eight weeks of pull days, straight sets, went 160, 160, 165,
 * 165, 170, 170, 175, 175 (the tired Fridays holding the load), 185 by week 12. On abb5566 the top
 * sets go 160, 155, 150, 150, the tired Fridays at 150, 145, 145, 145; twelve weeks give a top set
 * of 150 four times running, ten pounds under where it began.
 *
 * Also fails on 5dc61a7 (the sixth pass: three straight days at the back-offs' load running) and on
 * e6ed7ed. Synthetic data only.
 *
 * As fixed (the eighth pass): the five days are Monday, Tuesday, Thursday, Friday and Sunday, so the
 * pre-Maintenance-33 fatigue score's days in a row leave the untired pull days to their top sets.
 * Five days running, every Friday read high there, a separate matter Maintenance 33's fatigue model
 * owns (an estimated max planned lighter later in a session read as a fall; days in a row scored).
 */

const ROW = 'barbell-row';
const start = '2026-09-07T12:00:00.000Z';
const tired: Readiness = {
  energy: 2,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};

describe('the row under Strength focus on five days, a tired Friday every other week', () => {
  it('its top set never falls, and climbs, every set lifted as asked', () => {
    const schedule = createDefaultProfile('2026-09-01T12:00:00.000Z').schedule;
    const five = profileOf('strength-focus', {
      schedule: {
        ...schedule,
        availableDays: ['mon', 'tue', 'thu', 'fri', 'sun'],
        weeklyFrequency: 5,
      },
    });
    const week: Record<number, string> = {
      0: 'full-body',
      1: 'lower',
      3: 'upper',
      4: 'push-arms',
      6: 'pull-arms',
    };
    const days: number[] = [];
    for (let at = 0; at < 8; at += 1) for (const day of [0, 1, 3, 4, 6]) days.push(at * 7 + day);
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
      profile: five,
      history: [seed],
      start,
      days,
      exerciseId: ROW,
      constraintsFor: (day) => ({
        templateId: week[day % 7]!,
        ...(day % 7 === 6 && Math.floor(day / 7) % 2 === 1 ? { readiness: tired } : {}),
      }),
    });
    const lines = seen
      .map(
        (one) =>
          `day ${one.day} ${one.template}${one.atBackOffs ? ' (marked)' : ''}: ${one.sets[0]} / ${one.evidence.slice(0, 2).join(' / ')}`,
      )
      .join('\n');
    const load = (set: string) => Number(set.split(' ')[1]!.split('x')[0]);
    const tops = seen
      .filter((one) => one.sets[0]!.startsWith('top '))
      .map((one) => load(one.sets[0]!));
    expect(tops.length, lines).toBeGreaterThanOrEqual(4);
    // The tired Fridays run straight at the back-offs' load, as the research has it.
    expect(
      seen
        .filter((one) => one.template === 'pull-arms' && Math.floor(one.day / 7) % 2 === 1)
        .every((one) => one.atBackOffs === true),
      lines,
    ).toBe(true);
    // On abb5566: 160, 155, 150, 150.
    for (let at = 1; at < tops.length; at += 1) {
      expect(tops[at], lines).toBeGreaterThanOrEqual(tops[at - 1]!);
    }
    expect(tops.at(-1)!, lines).toBeGreaterThan(tops[0]!);
  });
});
