import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import {
  createDefaultProfile,
  type UserProfile,
  type Weekday,
} from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import {
  PUSH_LIFT,
  activePush,
  canPush,
  daysToNextSession,
  parsePushLine,
  pushCap,
  pushDay,
  pushLine,
  pushTargetText,
  pushWeek,
  pushableLifts,
  sessionDaysAhead,
} from './pushLift';

/**
 * Maintenance 27, the owner's item 44: a lift to push. Its week (sessions, sets, the extra), the
 * spacing and caps the research doc sets, and the lines the plan says.
 */

const HOUR = 3_600_000;
const bench = requireExercise('barbell-bench-press');
const base = createDefaultProfile(RECORD_NOW);
const pushing: UserProfile = {
  ...base,
  pushLift: { exerciseId: bench.id, target: 225, units: 'lb', since: '2026-08-01T12:00:00.000Z' },
};
const at = (hoursAgo: number) => new Date(Date.parse(RECORD_NOW) - hoursAgo * HOUR).toISOString();

/** A session `hoursAgo` with `sets` working sets of a lift, marked as the push had it. */
function session(
  hoursAgo: number,
  sets: number,
  options: { exerciseId?: string; extra?: boolean; rir?: number; others?: string[] } = {},
): WorkoutRecord {
  const when = at(hoursAgo);
  const working = (count: number, rir: number) =>
    Array.from({ length: count }, (_, index) => ({
      kind: 'working' as const,
      reps: 5,
      weight: 185,
      rir,
      completed: true,
      setIndex: index,
      targetReps: [4, 6] as [number, number],
      targetRir: 2,
    }));
  return {
    id: `w-${hoursAgo}-${options.exerciseId ?? bench.id}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: 'push-arms',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId: options.exerciseId ?? bench.id,
        ...(options.extra ? { push: 'extra' as const } : {}),
        sets: working(sets, options.rir ?? 2),
      },
      ...(options.others ?? []).map((exerciseId) => ({ exerciseId, sets: working(3, 2) })),
    ],
  };
}

describe('the lifts a push can be on', () => {
  it('are main multi-joint lifts with a heavy range and a load the app records', () => {
    expect(canPush(bench)).toBe(true);
    expect(canPush(requireExercise('back-squat'))).toBe(true);
    expect(canPush(requireExercise('lat-pulldown'))).toBe(true);
    // An isolation lift, a lift with no load the app records, a band lift.
    expect(canPush(requireExercise('cable-curl'))).toBe(false);
    expect(canPush(requireExercise('pull-up'))).toBe(false);
    expect(canPush(requireExercise('band-row'))).toBe(false);
    // No heavy range.
    expect(canPush(requireExercise('goblet-squat'))).toBe(false);
    expect(pushableLifts().every(canPush)).toBe(true);
    expect(pushableLifts().map((lift) => lift.name)).toEqual(
      [...pushableLifts().map((lift) => lift.name)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('is none for a lift it cannot be on, or one unknown', () => {
    expect(activePush(pushing)?.exercise.id).toBe(bench.id);
    expect(activePush(base)).toBeNull();
    expect(activePush({ pushLift: { ...pushing.pushLift!, exerciseId: 'cable-curl' } })).toBeNull();
    expect(activePush({ pushLift: { ...pushing.pushLift!, exerciseId: 'no-such' } })).toBeNull();
  });
});

describe("the lift's week", () => {
  it('counts its sessions and sets in seven days, half for a lift of its family', () => {
    const week = pushWeek(
      [
        session(24 * 8, 4),
        session(24 * 6, 4),
        session(24 * 3, 3),
        session(24 * 2, 3, { exerciseId: 'dumbbell-bench-press' }),
      ],
      bench,
      RECORD_NOW,
    );
    expect(week.exact).toBe(2);
    expect(week.fractional).toBe(2.5);
    expect(week.sets).toBe(7);
    expect(week.daysSince).toBe(3);
    expect(week.last?.sets).toBe(3);
  });

  it('counts extras in seven days and in the calendar week apart', () => {
    // RECORD_NOW is a Thursday: an extra on Monday is this week's; one the Friday before is not.
    const week = pushWeek(
      [session(24 * 6, 3, { extra: true }), session(24 * 3, 3, { extra: true })],
      bench,
      RECORD_NOW,
    );
    expect(week.extras).toBe(2);
    expect(week.extrasThisWeek).toBe(1);
  });

  it("reads the plan's own sessions a week over fourteen days, extras aside", () => {
    const week = pushWeek(
      [
        session(24 * 13, 4),
        session(24 * 10, 4),
        session(24 * 6, 4),
        session(24 * 4, 2, { extra: true }),
        session(24 * 2, 4),
      ],
      bench,
      RECORD_NOW,
    );
    expect(week.ownPerWeek).toBe(2);
  });
});

describe('the push today', () => {
  it('pauses in a deload week, and without a push', () => {
    expect(pushDay({ profile: pushing, history: [], now: RECORD_NOW, deload: true })).toBeNull();
    expect(pushDay({ profile: base, history: [], now: RECORD_NOW, deload: false })).toBeNull();
  });

  it('adds the extra two days after the last session, three sets while the week is light', () => {
    const day = pushDay({
      profile: pushing,
      history: [session(48, 4)],
      now: RECORD_NOW,
      deload: false,
    });
    expect(day?.extraSets).toBe(PUSH_LIFT.EXTRA_SETS);
    expect(day?.natural).toBe(true);
    expect(
      pushDay({ profile: pushing, history: [session(24, 4)], now: RECORD_NOW, deload: false })
        ?.noExtra,
    ).toBe('its last session was yesterday, and it takes 2 days between sessions');
  });

  it('counts the days on the calendar, whatever the hours (the review)', () => {
    // Tuesday evening, then Thursday's plan made in the morning: two days, under 48 hours.
    const tuesday = new Date(2026, 8, 8, 19, 30).toISOString();
    const thursday = new Date(2026, 8, 10, 7, 0).toISOString();
    const last = { ...session(48, 4), startedAt: tuesday, completedAt: tuesday };
    const day = pushDay({ profile: pushing, history: [last], now: thursday, deload: false });
    expect(day?.week.daysSince).toBe(2);
    expect(day?.extraSets).toBe(PUSH_LIFT.EXTRA_SETS);
    // A workout finished after midnight counts on the day it began.
    const late = {
      ...session(48, 4),
      startedAt: new Date(2026, 8, 7, 23, 30).toISOString(),
      completedAt: new Date(2026, 8, 8, 0, 40).toISOString(),
    };
    const after = pushDay({ profile: pushing, history: [late], now: thursday, deload: false });
    expect(after?.week.daysSince).toBe(3);
  });

  it('waits three days after five sets or a set to failure', () => {
    for (const last of [session(48, 5), session(48, 3, { rir: 0 })]) {
      const day = pushDay({ profile: pushing, history: [last], now: RECORD_NOW, deload: false });
      expect(day?.extraSets).toBeNull();
      expect(day?.noExtra).toBe(
        'its last session was 2 days ago, and it takes 3 days between sessions',
      );
    }
    expect(
      pushDay({ profile: pushing, history: [session(72, 5)], now: RECORD_NOW, deload: false })
        ?.extraSets,
    ).not.toBeNull();
  });

  it('takes two sets once the week holds six, and two under Lean-down', () => {
    const six = [session(24 * 5, 3), session(24 * 3, 3)];
    expect(
      pushDay({ profile: pushing, history: six, now: RECORD_NOW, deload: false })?.extraSets,
    ).toBe(2);
    const lean: UserProfile = { ...pushing, programStyle: 'lean-down' };
    expect(
      pushDay({ profile: lean, history: [session(72, 3)], now: RECORD_NOW, deload: false })
        ?.extraSets,
    ).toBe(2);
  });

  it('adds one extra a calendar week, and none past three sessions in seven days', () => {
    expect(
      pushDay({
        profile: pushing,
        history: [session(24 * 3, 3, { extra: true })],
        now: RECORD_NOW,
        deload: false,
      })?.noExtra,
    ).toBe('this week already had its extra session');
    const three = [session(24 * 6, 2), session(24 * 4, 2), session(24 * 2, 2)];
    const day = pushDay({ profile: pushing, history: three, now: RECORD_NOW, deload: false });
    expect(day?.extraSets).toBeNull();
    // Its own place gives way too: the week has its three.
    expect(day?.natural).toBe(false);
  });

  it('adds none to a lift the plan already trains about three times a week', () => {
    const often = [
      session(24 * 13, 3),
      session(24 * 11, 3),
      session(24 * 9, 3),
      session(24 * 6, 3),
      session(24 * 4, 3),
    ];
    expect(
      pushDay({ profile: pushing, history: often, now: RECORD_NOW, deload: false })?.noExtra,
    ).toBe('the plan already gives it about 3 sessions a week');
  });

  it('keeps to two sessions a week from age 60', () => {
    const older: UserProfile = { ...pushing, age: 64 };
    const two = [session(24 * 5, 3), session(24 * 3, 3)];
    const day = pushDay({ profile: older, history: two, now: RECORD_NOW, deload: false });
    expect(day?.extraSets).toBeNull();
    expect(day?.natural).toBe(false);
    expect(
      pushDay({ profile: pushing, history: two, now: RECORD_NOW, deload: false })?.natural,
    ).toBe(true);
  });

  it('gives its own place up the day after its last session', () => {
    expect(
      pushDay({ profile: pushing, history: [session(24, 3)], now: RECORD_NOW, deload: false })
        ?.natural,
    ).toBe(false);
    expect(
      pushDay({ profile: pushing, history: [session(48, 3)], now: RECORD_NOW, deload: false })
        ?.natural,
    ).toBe(true);
  });

  it('caps each session at three sets in a week with the extra, two under Lean-down', () => {
    const withExtra = [session(24 * 3, 3, { extra: true })];
    expect(
      pushDay({ profile: pushing, history: withExtra, now: RECORD_NOW, deload: false })
        ?.naturalSets,
    ).toBe(3);
    const lean: UserProfile = { ...pushing, programStyle: 'lean-down' };
    expect(
      pushDay({ profile: lean, history: withExtra, now: RECORD_NOW, deload: false })?.naturalSets,
    ).toBe(2);
    // Without the extra in its week the plan's own sets stand, up to ten a week.
    const plain = pushDay({
      profile: pushing,
      history: [session(24 * 5, 4)],
      now: RECORD_NOW,
      deload: false,
    });
    expect(plain?.naturalSets).toBe(PUSH_LIFT.MAX_WEEK_SETS - 4);
  });
});

describe('the next session', () => {
  it('is the next of a fixed week, or the week shared out evenly', () => {
    // A Thursday: Mon, Tue, Thu, Fri trains Friday next.
    expect(daysToNextSession(base, RECORD_NOW)).toBe(1);
    const mwf: UserProfile = {
      ...base,
      schedule: { ...base.schedule, weeklyFrequency: 3, availableDays: ['mon', 'wed', 'fri'] },
    };
    expect(daysToNextSession(mwf, RECORD_NOW)).toBe(1);
    const open: UserProfile = {
      ...base,
      schedule: {
        ...base.schedule,
        weeklyFrequency: 3,
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      },
    };
    expect(daysToNextSession(open, RECORD_NOW)).toBeCloseTo(7 / 3, 6);
  });

  it('counts calendar days on the device, a clock change between them counting no day', () => {
    // Saturday, Sunday and Wednesday, from every day of a year at half past midnight and half past
    // eleven at night, against the calendar itself (the re-check of item 44: steps of 24 hours
    // skipped a Sunday, or landed on the same one, where the clocks change).
    const weekend: UserProfile = {
      ...base,
      schedule: { ...base.schedule, weeklyFrequency: 3, availableDays: ['sat', 'sun', 'wed'] },
    };
    const names: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    for (let day = 0; day < 366; day += 1) {
      for (const hour of [0, 23]) {
        const now = new Date(2026, 0, 1 + day, hour, 30).toISOString();
        const expected = [1, 2, 3, 4, 5, 6].filter((ahead) =>
          weekend.schedule.availableDays.includes(
            names[new Date(2026, 0, 1 + day + ahead).getDay()] as Weekday,
          ),
        );
        expect(sessionDaysAhead(weekend, now), now).toEqual(expected);
        expect(daysToNextSession(weekend, now), now).toBe(expected[0]);
      }
    }
  });
});

describe('the lines the plan says', () => {
  it('read back, leading or moved', () => {
    for (const extra of [true, false]) {
      for (const leads of [true, false]) {
        for (const heavy of extra ? [true, false] : [true]) {
          const line = pushLine('Barbell Bench Press', '225 lb', extra, leads, heavy);
          expect(parsePushLine(line)).toEqual({
            name: 'Barbell Bench Press',
            target: '225 lb',
            extra,
            heavy,
          });
        }
      }
    }
    // Under Light weights the extra is not heavy (the review of item 44).
    expect(pushLine('Barbell Bench Press', '225 lb', true, true, false)).toBe(
      "Barbell Bench Press leads: the week's extra session of the lift you are pushing to 225 lb, short of failure (Pelland et al. 2026).",
    );
    expect(parsePushLine('Barbell Bench Press leads as the primary strength lift.')).toBeNull();
  });

  it("say the target in the lifter's units", () => {
    expect(pushTargetText(pushing.pushLift!, 'lb')).toBe('225 lb');
    expect(pushTargetText(pushing.pushLift!, 'kg')).toBe('102 kg');
  });
});

describe("the extra's cap on its muscles", () => {
  // Triceps, a primary muscle of the bench press: 18 sets in the last seven days.
  const heavyWeek = [
    session(24 * 2, 6, { exerciseId: 'cable-triceps-pushdown' }),
    session(24 * 4, 6, { exerciseId: 'skull-crusher' }),
    session(24 * 6, 6, { exerciseId: 'cable-triceps-pushdown' }),
  ];
  const planned = (pushdown: number) => [
    { id: 'e1', exerciseId: 'lat-pulldown', workingSets: 3, trimmable: false },
    { id: 'e5', exerciseId: 'cable-triceps-pushdown', workingSets: pushdown, trimmable: true },
  ];

  it('takes sets off an isolation lift for the muscle first, down to one', () => {
    const cap = pushCap({
      lift: bench,
      extraId: 'x',
      extraSets: 3,
      planned: planned(3),
      history: heavyWeek,
      now: RECORD_NOW,
    });
    // 18 + 3 + 3 = 24: four over, never more than the extra's three: two off the pushdown, one
    // off the extra.
    expect(cap.trims.get('e5')).toBe(2);
    expect(cap.trims.get('x')).toBe(1);
    expect(cap.over).toEqual([]);
  });

  it('names a muscle it would still take over twenty, and leaves one under alone', () => {
    const over = pushCap({
      lift: bench,
      extraId: 'x',
      extraSets: 3,
      planned: planned(1),
      history: [...heavyWeek, session(24, 6, { exerciseId: 'skull-crusher' })],
      now: RECORD_NOW,
    });
    expect(over.over).toEqual(['triceps']);
    const light = pushCap({
      lift: bench,
      extraId: 'x',
      extraSets: 3,
      planned: planned(3),
      history: [],
      now: RECORD_NOW,
    });
    expect(light.trims.size).toBe(0);
    expect(light.over).toEqual([]);
  });
});
