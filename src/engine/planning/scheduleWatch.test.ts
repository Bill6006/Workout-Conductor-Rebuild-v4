import { describe, expect, it } from 'vitest';
import type { Weekday } from '../../core/validation/profile';
import { SCHEDULE_MOVE_ID } from '../../core/validation/scheduleMove';
import {
  BENCH,
  DOWN,
  MOVE,
  MOVED,
  MON_TO_FRI,
  MWF,
  ROW,
  SQUAT,
  USUAL,
  WATCH_NOW,
  at,
  session,
  weeksAfter,
  weeksBefore,
  type Lifts,
} from '../../test/scheduleWatch';
import { liftReads } from '../recovery/recovery';
import {
  fallAgainst,
  fallThreshold,
  nextScheduleMove,
  scheduleWatch,
  sessionError,
} from './scheduleWatch';

/**
 * Maintenance 36, the schedule watch: the four weeks after a change of the days against the weeks
 * before, on the compound lifts' first sets; the lifts together clearly under, two or more each,
 * and still under in their first sets after easier days once those four weeks are over, make a
 * finding, and anything less is silence. Every time is a clock time on this device, so the days
 * between sessions are the same in any zone. Synthetic data only.
 */

const OHP = 'overhead-press';
const CURL = 'ez-bar-curl';

describe('the schedule watch', () => {
  it('finds two lifts clearly under the four weeks before, still under after easier days', () => {
    const finding = scheduleWatch(
      MOVE,
      MOVED,
      [...weeksBefore(USUAL), ...weeksAfter(DOWN)],
      WATCH_NOW,
    );
    expect(finding).not.toBeNull();
    expect(finding!.from).toEqual({ weeklyFrequency: 3, availableDays: MWF });
    expect(finding!.lifts.map((lift) => lift.exerciseId).sort()).toEqual([BENCH, SQUAT].sort());
    for (const lift of finding!.lifts) {
      expect(lift.fall).toBeCloseTo(1 - 210 / 225, 2);
      // The four weeks after against the four before: their sets, not the fifth week's.
      expect(lift.before).toBe(12);
      expect(lift.after).toBe(20);
    }
  });

  it('says nothing for one lift under alone', () => {
    const squatDown = { ...USUAL, [SQUAT]: DOWN[SQUAT]! };
    expect(
      scheduleWatch(MOVE, MOVED, [...weeksBefore(USUAL), ...weeksAfter(squatDown)], WATCH_NOW),
    ).toBeNull();
  });

  it('says nothing for a fall the noise could make', () => {
    // 2% under, both lifts: under the noise for 12 sessions against 20.
    const slight: Lifts = { [SQUAT]: [5, 220.5, 2], [BENCH]: [5, 181.3, 2] };
    expect(fallThreshold(20, 12)).toBeGreaterThan(0.02);
    expect(
      scheduleWatch(MOVE, MOVED, [...weeksBefore(USUAL), ...weeksAfter(slight)], WATCH_NOW),
    ).toBeNull();
  });

  it('reads the lifts together: two under while the rest rise is no finding', () => {
    const before = { ...USUAL, [ROW]: [5, 155, 2], [OHP]: [5, 115, 2] } as Lifts;
    const twoDown = { ...DOWN, [ROW]: [5, 155, 2], [OHP]: [5, 115, 2] } as Lifts;
    const restUp = { ...DOWN, [ROW]: [5, 166, 2], [OHP]: [5, 123, 2] } as Lifts;
    expect(
      scheduleWatch(MOVE, MOVED, [...weeksBefore(before), ...weeksAfter(twoDown)], WATCH_NOW),
    ).not.toBeNull();
    expect(
      scheduleWatch(MOVE, MOVED, [...weeksBefore(before), ...weeksAfter(restUp)], WATCH_NOW),
    ).toBeNull();
  });

  it('takes two lifts or more each clearly under: one deep fall beside two slight ones is none', () => {
    const before = { ...USUAL, [ROW]: [5, 155, 2] } as Lifts;
    // The squat 10% under, the bench and the row 1.5%: together under, but one alone clearly.
    const after = { [SQUAT]: [5, 202.5, 2], [BENCH]: [5, 182.2, 2], [ROW]: [5, 152.7, 2] } as Lifts;
    expect(
      scheduleWatch(MOVE, MOVED, [...weeksBefore(before), ...weeksAfter(after)], WATCH_NOW),
    ).toBeNull();
  });

  it('waits for two lifts with a set after easier days once the four weeks are over', () => {
    // After the four weeks only the squat is trained.
    const after = weeksAfter(DOWN).map((record) =>
      Date.parse(record.startedAt) > Date.parse(at(10, 5, 9))
        ? session(record.startedAt, { [SQUAT]: DOWN[SQUAT]! })
        : record,
    );
    expect(scheduleWatch(MOVE, MOVED, [...weeksBefore(USUAL), ...after], WATCH_NOW)).toBeNull();
  });

  it('waits for a set after easier days: one the day after a session is none', () => {
    // A Sunday session before the fifth week: its Monday comes the day after hard sets.
    const history = [...weeksBefore(USUAL), ...weeksAfter(DOWN), session(at(10, 4, 18), DOWN)];
    expect(scheduleWatch(MOVE, MOVED, history, WATCH_NOW)).toBeNull();
  });

  it('counts only the sets that pair: one saved with an ask is read beside one without none', () => {
    const asked: Lifts = { [SQUAT]: [5, 225, 2, 225], [BENCH]: [5, 185, 2, 185] };
    const withAsk = liftReads([session(at(8, 10), asked)]).get(SQUAT)![0]!.read;
    const noAsk = liftReads([session(at(8, 12), USUAL)]).get(SQUAT)![0]!.read;
    expect(fallAgainst([withAsk, noAsk], [withAsk])).toEqual({ fall: 0, after: 1, before: 1 });
    // Three sets with an ask in the four weeks after: too few that pair to read.
    const askedDown: Lifts = { [SQUAT]: [5, 210, 2, 210], [BENCH]: [5, 172.5, 2, 172.5] };
    const after = (paired: number) =>
      weeksAfter(DOWN).map((record, index) =>
        index < paired || index >= 20 ? session(record.startedAt, askedDown) : record,
      );
    expect(scheduleWatch(MOVE, MOVED, [...weeksBefore(asked), ...after(3)], WATCH_NOW)).toBeNull();
    expect(
      scheduleWatch(MOVE, MOVED, [...weeksBefore(asked), ...after(4)], WATCH_NOW),
    ).not.toBeNull();
  });

  it('reads compound lifts only: a curl under beside one lift is no finding', () => {
    const before = { [SQUAT]: [5, 225, 2], [CURL]: [8, 70, 2] } as Lifts;
    const after = { [SQUAT]: [5, 210, 2], [CURL]: [8, 65, 2] } as Lifts;
    expect(
      scheduleWatch(MOVE, MOVED, [...weeksBefore(before), ...weeksAfter(after)], WATCH_NOW),
    ).toBeNull();
  });

  it('says nothing for a dip that clears after easier days', () => {
    // Under on the days in a row, back to the usual after each weekend and after the four weeks.
    expect(
      scheduleWatch(MOVE, MOVED, [...weeksBefore(USUAL), ...weeksAfter(USUAL, DOWN)], WATCH_NOW),
    ).toBeNull();
  });

  it('says nothing for a fall in the first weeks that is over by the end of them', () => {
    // 15% under for two weeks, then 2% over: the four weeks read under, the sets after them over.
    const deep: Lifts = { [SQUAT]: [5, 191, 2], [BENCH]: [5, 157, 2] };
    const over: Lifts = { [SQUAT]: [5, 229.5, 2], [BENCH]: [5, 188.7, 2] };
    const after = weeksAfter(deep).map((record) =>
      Date.parse(record.startedAt) >= Date.parse(at(9, 21, 0))
        ? session(record.startedAt, over)
        : record,
    );
    expect(scheduleWatch(MOVE, MOVED, [...weeksBefore(USUAL), ...after], WATCH_NOW)).toBeNull();
  });

  it('reads sets the plan asked another reserve of against what each asked', () => {
    // A lighter load at a reserve more, lifted as asked: no fall.
    const asked: Lifts = { [SQUAT]: [5, 225, 2, 225], [BENCH]: [5, 185, 2, 185] };
    const lighter: Lifts = {
      [SQUAT]: [5, 202.5, 3, 202.5, 3],
      [BENCH]: [5, 166.5, 3, 166.5, 3],
    };
    expect(
      scheduleWatch(MOVE, MOVED, [...weeksBefore(asked), ...weeksAfter(lighter)], WATCH_NOW),
    ).toBeNull();
  });

  it('reads a load the plan lowered at the same range and reserve as lifted: the fall it is', () => {
    // The plan took the loads down after missed sets, and the lifter lifts what it asks.
    const asked: Lifts = { [SQUAT]: [5, 225, 2, 225], [BENCH]: [5, 185, 2, 185] };
    const lowered: Lifts = { [SQUAT]: [5, 210, 2, 210], [BENCH]: [5, 172.5, 2, 172.5] };
    expect(
      scheduleWatch(MOVE, MOVED, [...weeksBefore(asked), ...weeksAfter(lowered)], WATCH_NOW),
    ).not.toBeNull();
  });

  it('waits for the four weeks and a set after easier days, and stops after eight', () => {
    const history = [...weeksBefore(USUAL), ...weeksAfter(DOWN)];
    expect(scheduleWatch(MOVE, MOVED, history, at(10, 4, 20))).toBeNull();
    // The four weeks are over at 08:00 on 5 October; the first set after them is that evening.
    expect(scheduleWatch(MOVE, MOVED, history, at(10, 5, 12))).toBeNull();
    expect(scheduleWatch(MOVE, MOVED, history, at(10, 5, 20))).not.toBeNull();
    // Eight weeks after 08:00 on 7 September is 08:00 on 2 November.
    expect(scheduleWatch(MOVE, MOVED, history, at(11, 1, 12))).not.toBeNull();
    expect(scheduleWatch(MOVE, MOVED, history, at(11, 3, 12))).toBeNull();
  });

  it('says nothing for a change it leaves alone, once the schedule is another, or set again since', () => {
    const history = [...weeksBefore(USUAL), ...weeksAfter(DOWN)];
    expect(scheduleWatch(null, MOVED, history, WATCH_NOW)).toBeNull();
    expect(scheduleWatch({ ...MOVE, watched: false }, MOVED, history, WATCH_NOW)).toBeNull();
    expect(
      scheduleWatch(
        MOVE,
        { weeklyFrequency: 4, availableDays: MON_TO_FRI.slice(0, 4) },
        history,
        WATCH_NOW,
      ),
    ).toBeNull();
    // The same schedule, set again since the change without a record of its own.
    expect(scheduleWatch(MOVE, { ...MOVED, since: at(9, 20, 9) }, history, WATCH_NOW)).toBeNull();
    expect(
      scheduleWatch(
        { ...MOVE, since: at(9, 7, 8) },
        { ...MOVED, since: at(9, 7, 8) },
        history,
        WATCH_NOW,
      ),
    ).not.toBeNull();
  });

  it('reads a lift only with four sessions or more on each side, the weeks before running to eight', () => {
    // Two sessions in the four weeks before the change: too few.
    const sparse = [at(8, 24), at(9, 2)].map((when) => session(when, USUAL));
    expect(scheduleWatch(MOVE, MOVED, [...sparse, ...weeksAfter(DOWN)], WATCH_NOW)).toBeNull();
    // Two more in the four weeks before those: eight weeks hold four.
    const earlier = [at(7, 27), at(8, 3)].map((when) => session(when, USUAL));
    expect(
      scheduleWatch(MOVE, MOVED, [...earlier, ...sparse, ...weeksAfter(DOWN)], WATCH_NOW),
    ).not.toBeNull();
  });

  it('leaves out a lift with a break longer than strength holds around the change', () => {
    // The weeks before end 23 days before the first session after the change.
    const early = [10, 12, 14, 15].map((day) => session(at(8, day), USUAL));
    expect(scheduleWatch(MOVE, MOVED, [...early, ...weeksAfter(DOWN)], WATCH_NOW)).toBeNull();
  });

  it('leaves out the days the body was off: a fall on sick days alone is none', () => {
    const sick = {
      readiness: {
        energy: 2,
        soreness: 2,
        sleep: 3,
        motivation: 2,
        jointDiscomfort: [],
        timePressure: false,
        illness: 'head' as const,
      },
    };
    const records = weeksAfter(DOWN).map((record) => session(record.startedAt, DOWN, sick));
    expect(scheduleWatch(MOVE, MOVED, [...weeksBefore(USUAL), ...records], WATCH_NOW)).toBeNull();
  });

  it('reads a noisier lifter by their own spread: the same fall inside it is none', () => {
    // The weeks before swing about 10% from one session to the next, around the same level.
    const days = [10, 12, 14, 17, 19, 21, 24, 26, 28, 31].map((day) => at(8, day));
    const high: Lifts = { [SQUAT]: [5, 240, 2], [BENCH]: [5, 197, 2] };
    const low: Lifts = { [SQUAT]: [5, 200, 2], [BENCH]: [5, 164, 2] };
    const swinging = [...days, at(9, 2), at(9, 4)].map((when, index) =>
      session(when, index % 2 === 0 ? high : low),
    );
    const after = weeksAfter({ [SQUAT]: [5, 205, 2], [BENCH]: [5, 168, 2] });
    const reads = liftReads(swinging).get(SQUAT)!;
    expect(sessionError(reads)).toBeGreaterThan(0.09);
    // Fewer than ten: the literature's 4%, however they swing.
    expect(sessionError(reads.slice(0, 9))).toBe(0.04);
    expect(scheduleWatch(MOVE, MOVED, [...swinging, ...after], WATCH_NOW)).toBeNull();
  });

  it('reads the literature’s 4% below ten sessions, and never less', () => {
    const steady = liftReads(weeksBefore(USUAL)).get(SQUAT)!;
    expect(sessionError(steady)).toBe(0.04);
    expect(sessionError(steady.slice(0, 9))).toBe(0.04);
  });

  it('reads the spread around the lift’s trend: steady progress is no noise', () => {
    // Up about 2% a session, every session: a trend, not a spread.
    const days = [10, 12, 14, 17, 19, 21, 24, 26, 28, 31].map((day) => at(8, day));
    const rising = [...days, at(9, 2), at(9, 4)].map((when, index) =>
      session(when, { [SQUAT]: [5, Math.round(200 * 1.02 ** index * 10) / 10, 2] }),
    );
    expect(sessionError(liftReads(rising).get(SQUAT)!)).toBe(0.04);
  });

  it('counts easier days from the day a session began', () => {
    // Friday's session ran past midnight; Monday's sets are still three days on.
    const late = session(at(10, 2, 23), USUAL);
    const history = [
      session(at(9, 30, 18), USUAL),
      { ...late, completedAt: new Date(Date.parse(late.startedAt) + 90 * 60_000).toISOString() },
      session(at(10, 5, 18), USUAL),
    ];
    expect(liftReads(history).get(SQUAT)!.at(-1)!.easierDays).toBe(3);
  });
});

describe('the record a schedule change keeps', () => {
  const A = { weeklyFrequency: 3, availableDays: MWF };
  const B = { weeklyFrequency: 5, availableDays: MON_TO_FRI };
  const C = { weeklyFrequency: 4, availableDays: ['mon', 'tue', 'thu', 'fri'] as Weekday[] };

  it('keeps when it was made, the schedules before and after, and when that one was set', () => {
    expect(nextScheduleMove(null, A, { ...B, since: MOVE.at }, MOVE.at, false)).toEqual({
      id: SCHEDULE_MOVE_ID,
      at: MOVE.at,
      from: A,
      to: B,
      since: MOVE.at,
      watched: true,
    });
    expect(nextScheduleMove(null, A, B, MOVE.at, false).since).toBeNull();
  });

  it('takes a change within the week as the same change, and one undone as none', () => {
    const first = nextScheduleMove(null, A, B, MOVE.at, false);
    const again = nextScheduleMove(first, B, { ...C, since: at(9, 13, 8) }, at(9, 13, 8), false);
    expect(again).toMatchObject({
      at: MOVE.at,
      from: A,
      to: C,
      since: at(9, 13, 8),
      watched: true,
    });
    expect(nextScheduleMove(first, B, A, at(9, 13, 8), false)).toMatchObject({ watched: false });
    // A week on, a new change.
    expect(nextScheduleMove(first, B, C, at(9, 14, 9), false)).toMatchObject({
      at: at(9, 14, 9),
      from: B,
      to: C,
      watched: true,
    });
  });

  it('never watches the card’s own way back', () => {
    const first = nextScheduleMove(null, A, B, MOVE.at, false);
    const back = nextScheduleMove(first, B, A, at(10, 5, 12), true);
    expect(back).toEqual({
      id: SCHEDULE_MOVE_ID,
      at: at(10, 5, 12),
      from: B,
      to: A,
      since: null,
      watched: false,
    });
    // A change days after the way back is a change of its own, from the schedule gone back to.
    expect(nextScheduleMove(back, A, C, at(10, 8, 12), false)).toEqual({
      id: SCHEDULE_MOVE_ID,
      at: at(10, 8, 12),
      from: A,
      to: C,
      since: null,
      watched: true,
    });
  });
});
