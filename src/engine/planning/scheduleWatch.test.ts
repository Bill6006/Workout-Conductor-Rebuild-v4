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
import { fallThreshold, nextScheduleMove, scheduleWatch, sessionError } from './scheduleWatch';

/**
 * Maintenance 36, the schedule watch: the weeks after a change of the days against the weeks before,
 * each lift's first sets read against what they asked; two lifts or more clearly under, and still
 * under after easier days, make a finding, and anything less is silence. Every time is a clock time
 * on this device, so the days between sessions are the same in any zone. Synthetic data only.
 */

describe('the schedule watch', () => {
  it('finds two lifts clearly under the weeks before, still under after easier days', () => {
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
    expect(scheduleWatch(MOVE, MOVED, [...swinging, ...after], WATCH_NOW)).toBeNull();
  });

  it('reads the literature’s 4% below ten sessions, and never less', () => {
    const steady = liftReads(weeksBefore(USUAL)).get(SQUAT)!;
    expect(sessionError(steady)).toBe(0.04);
    expect(sessionError(steady.slice(0, 9))).toBe(0.04);
  });

  it('says nothing for a dip that clears after easier days', () => {
    // Under on the days in a row, back to the usual after each weekend: a hard week passing.
    expect(
      scheduleWatch(MOVE, MOVED, [...weeksBefore(USUAL), ...weeksAfter(USUAL, DOWN)], WATCH_NOW),
    ).toBeNull();
  });

  it('reads each set against what it asked: the plan’s lighter ask, lifted as asked, is no fall', () => {
    const asked: Lifts = { [SQUAT]: [5, 225, 2, 225], [BENCH]: [5, 185, 2, 185] };
    const lighter: Lifts = { [SQUAT]: [5, 210, 2, 210], [BENCH]: [5, 172.5, 2, 172.5] };
    expect(
      scheduleWatch(MOVE, MOVED, [...weeksBefore(asked), ...weeksAfter(lighter)], WATCH_NOW),
    ).toBeNull();
  });

  it('waits four weeks after the change, and stops after eight', () => {
    const history = [...weeksBefore(USUAL), ...weeksAfter(DOWN)];
    expect(scheduleWatch(MOVE, MOVED, history, at(10, 4, 20))).toBeNull();
    // Eight weeks after 08:00 on 7 September is 08:00 on 2 November.
    expect(scheduleWatch(MOVE, MOVED, history, at(11, 1, 12))).not.toBeNull();
    expect(scheduleWatch(MOVE, MOVED, history, at(11, 3, 12))).toBeNull();
  });

  it('says nothing for a change it leaves alone, or once the schedule is another', () => {
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
});

describe('the record a schedule change keeps', () => {
  const A = { weeklyFrequency: 3, availableDays: MWF };
  const B = { weeklyFrequency: 5, availableDays: MON_TO_FRI };
  const C = { weeklyFrequency: 4, availableDays: ['mon', 'tue', 'thu', 'fri'] as Weekday[] };

  it('keeps when it was made and the schedules before and after', () => {
    expect(nextScheduleMove(null, A, B, MOVE.at, false)).toEqual({
      id: SCHEDULE_MOVE_ID,
      at: MOVE.at,
      from: A,
      to: B,
      watched: true,
    });
  });

  it('takes a change within the week as the same change, and one undone as none', () => {
    const first = nextScheduleMove(null, A, B, MOVE.at, false);
    const again = nextScheduleMove(first, B, C, at(9, 13, 8), false);
    expect(again).toMatchObject({ at: MOVE.at, from: A, to: C, watched: true });
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
    expect(nextScheduleMove(first, B, A, at(10, 5, 12), true)).toEqual({
      id: SCHEDULE_MOVE_ID,
      at: at(10, 5, 12),
      from: B,
      to: A,
      watched: false,
    });
  });
});
