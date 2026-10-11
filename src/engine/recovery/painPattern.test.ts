import { describe, expect, it } from 'vitest';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import { PAIN_PATTERN, attributedPain, painPatterns } from './painPattern';

/**
 * Maintenance 27, the owner's item 45: a joint that keeps hurting with one exercise and not with its
 * alternative, counted from what the lifter logged.
 */

const DAY = 86_400_000;
const BENCH = 'barbell-bench-press';
const DB_BENCH = 'dumbbell-bench-press';

interface Day {
  daysAgo: number;
  done: string[];
  /** In-session reports: [exercise, joint]. */
  reports?: [string, Joint][];
  rating?: Joint;
  checkIn?: Joint[];
  /** Older records: joints with no exercise saved. */
  painJoints?: Joint[];
  replaced?: [string, string];
}

function workout(day: Day): WorkoutRecord {
  const when = new Date(Date.parse(RECORD_NOW) - day.daysAgo * DAY).toISOString();
  return {
    id: `w-${day.daysAgo}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: 'push-arms',
    endedEarly: false,
    rating: day.rating
      ? { effort: 'right', pain: true, joint: day.rating, energyAfter: 3, note: '' }
      : null,
    skippedExerciseIds: [],
    // As the app saves it: a check-in's joints are among the workout's pain joints too.
    painJoints: [
      ...(day.painJoints ?? []),
      ...(day.reports ?? []).map(([, joint]) => joint),
      ...(day.checkIn ?? []),
    ],
    ...(day.reports
      ? { painReports: day.reports.map(([exerciseId, joint]) => ({ exerciseId, joint })) }
      : {}),
    readiness: day.checkIn
      ? {
          energy: 3,
          soreness: 3,
          sleep: 3,
          motivation: 3,
          jointDiscomfort: day.checkIn,
          timePressure: false,
        }
      : null,
    prs: [],
    entries: day.done.map((exerciseId) => ({
      exerciseId,
      ...(day.replaced && day.replaced[1] === exerciseId ? { replacedFrom: day.replaced[0] } : {}),
      sets: [{ kind: 'working' as const, reps: 8, weight: 100, rir: 2, completed: true }],
    })),
  };
}

const patterns = (days: Day[]) => painPatterns({ history: days.map(workout), now: RECORD_NOW });

/** Shoulder pain with bench three weeks running, none in two dumbbell bench sessions. */
const classic: Day[] = [
  { daysAgo: 21, done: [BENCH], reports: [[BENCH, 'shoulder']] },
  { daysAgo: 17, done: [DB_BENCH] },
  { daysAgo: 14, done: [BENCH], reports: [[BENCH, 'shoulder']] },
  { daysAgo: 10, done: [DB_BENCH] },
  { daysAgo: 7, done: [BENCH], reports: [[BENCH, 'shoulder']] },
];

describe('the reports put on an exercise', () => {
  it('are those made on it, and a rating only where one exercise done loaded the joint', () => {
    const direct = attributedPain(
      workout({ daysAgo: 1, done: [BENCH], reports: [[BENCH, 'shoulder']] }),
    );
    expect([...(direct.get('shoulder') ?? [])]).toEqual([BENCH]);
    // One exercise done loads the shoulder: the rating's shoulder is its.
    const single = attributedPain(
      workout({ daysAgo: 1, done: [BENCH, 'leg-extension'], rating: 'shoulder' }),
    );
    expect([...(single.get('shoulder') ?? [])]).toEqual([BENCH]);
    // Two do: it is neither's.
    const two = attributedPain(
      workout({ daysAgo: 1, done: [BENCH, 'overhead-press'], rating: 'shoulder' }),
    );
    expect(two.get('shoulder')).toBeUndefined();
  });

  it('never include a check-in, which can be soreness from the session before', () => {
    const before = attributedPain(workout({ daysAgo: 1, done: [BENCH], checkIn: ['shoulder'] }));
    expect(before.get('shoulder')).toBeUndefined();
  });

  it("never include an earlier check-in's joint once a later check-in dropped it", () => {
    // From item 45 on every record saves its reports: a pain joint beyond them is a check-in's,
    // here one the lifter took back by updating the check-in (the re-check of item 45).
    const updated = attributedPain(
      workout({ daysAgo: 1, done: [BENCH], painJoints: ['shoulder'], reports: [] }),
    );
    expect(updated.get('shoulder')).toBeUndefined();
    const rated = attributedPain(
      workout({
        daysAgo: 1,
        done: [BENCH],
        painJoints: ['shoulder'],
        reports: [],
        rating: 'shoulder',
      }),
    );
    expect(rated.get('shoulder')).toBeUndefined();
    // A record from before item 45 saved no reports: its pain joints are its reports.
    const older = attributedPain(workout({ daysAgo: 1, done: [BENCH], painJoints: ['shoulder'] }));
    expect([...(older.get('shoulder') ?? [])]).toEqual([BENCH]);
  });
});

describe('a pattern', () => {
  it('is a joint reported with an exercise over weeks, not with its alternative', () => {
    expect(patterns(classic)).toEqual([
      {
        exerciseId: BENCH,
        joint: 'shoulder',
        sessions: 3,
        reportDates: [21, 14, 7].map((days) =>
          new Date(Date.parse(RECORD_NOW) - days * DAY).toISOString(),
        ),
        alternativeId: DB_BENCH,
        cleanDates: [17, 10].map((days) =>
          new Date(Date.parse(RECORD_NOW) - days * DAY).toISOString(),
        ),
      },
    ]);
  });

  it('needs two reports at least a week apart', () => {
    const close = classic.map((day) =>
      day.daysAgo === 21 ? { ...day, daysAgo: 9, reports: [] } : day,
    );
    // 14 and 7 days ago: a week apart, still a pattern; one report alone is not.
    expect(patterns(close)).toHaveLength(1);
    const once = classic.filter((day) => day.daysAgo !== 21 && day.daysAgo !== 14);
    expect(patterns(once)).toEqual([]);
    const sameWeek = [
      { daysAgo: 12, done: [BENCH], reports: [[BENCH, 'shoulder']] as [string, Joint][] },
      { daysAgo: 11, done: [DB_BENCH] },
      { daysAgo: 9, done: [DB_BENCH] },
      { daysAgo: 7, done: [BENCH], reports: [[BENCH, 'shoulder']] as [string, Joint][] },
    ];
    expect(patterns(sameWeek)).toEqual([]);
    expect(PAIN_PATTERN.MIN_SPAN_DAYS).toBe(7);
  });

  it('counts a week apart by the calendar, not to the minute', () => {
    // Monday 22:10, then the next Monday at 21:50: seven days on the calendar.
    const at = (day: number, hour: number, minute: number) =>
      new Date(2026, 7, day, hour, minute).toISOString();
    const record = (when: string, exerciseId: string, hurt: boolean): WorkoutRecord => ({
      ...workout({
        daysAgo: 0,
        done: [exerciseId],
        ...(hurt ? { reports: [[exerciseId, 'shoulder']] as [string, Joint][] } : {}),
      }),
      id: `w-${when}`,
      startedAt: when,
      completedAt: when,
    });
    const history = [
      record(at(31, 22, 10), BENCH, true),
      record(at(32 + 0, 18, 0), DB_BENCH, false),
      record(at(34, 18, 0), DB_BENCH, false),
      record(at(38, 21, 50), BENCH, true),
    ];
    const found = painPatterns({ history, now: new Date(2026, 8, 9, 12).toISOString() });
    expect(found.map((pattern) => pattern.exerciseId)).toEqual([BENCH]);
  });

  it('counts the day a workout began, and the break in elapsed time as the engine does', () => {
    const local = (month: number, day: number, hour: number, minute = 0) =>
      new Date(2026, month, day, hour, minute).toISOString();
    const session = (
      start: string,
      end: string,
      exerciseId: string,
      hurt: boolean,
    ): WorkoutRecord => ({
      ...workout({
        daysAgo: 0,
        done: [exerciseId],
        ...(hurt ? { reports: [[exerciseId, 'shoulder']] as [string, Joint][] } : {}),
      }),
      id: `w-${start}`,
      startedAt: start,
      completedAt: end,
    });
    // Begun Monday 23:20, saved Tuesday 00:35; the next Monday 18:00: a week apart as begun.
    const midnight = [
      session(local(7, 31, 23, 20), local(8, 1, 0, 35), BENCH, true),
      session(local(8, 2, 18), local(8, 2, 19), DB_BENCH, false),
      session(local(8, 4, 18), local(8, 4, 19), DB_BENCH, false),
      session(local(8, 7, 18), local(8, 7, 19), BENCH, true),
    ];
    expect(
      painPatterns({ history: midnight, now: local(8, 8, 12) }).map((one) => one.exerciseId),
    ).toEqual([BENCH]);
    // Monday 20:00, then three Mondays on at 08:00: 20.5 days, no break by the engine's rule.
    const nearly = [
      session(local(7, 10, 20), local(7, 10, 21), BENCH, true),
      session(local(7, 13, 18), local(7, 13, 19), DB_BENCH, false),
      session(local(7, 20, 18), local(7, 20, 19), DB_BENCH, false),
      session(local(7, 31, 8), local(7, 31, 9), BENCH, true),
    ];
    expect(painPatterns({ history: nearly, now: local(8, 1, 12) })).toHaveLength(1);
  });

  it('starts afresh when the lift comes back from three weeks away, as after a four-week swap', () => {
    // Reports 38, 35 and 31 days ago, then four weeks on the dumbbell bench.
    const before: Day[] = [
      { daysAgo: 38, done: [BENCH], reports: [[BENCH, 'shoulder']] },
      { daysAgo: 35, done: [BENCH], reports: [[BENCH, 'shoulder']] },
      { daysAgo: 31, done: [BENCH], reports: [[BENCH, 'shoulder']] },
      { daysAgo: 24, done: [DB_BENCH] },
      { daysAgo: 17, done: [DB_BENCH] },
      { daysAgo: 10, done: [DB_BENCH] },
      { daysAgo: 3, done: [DB_BENCH] },
    ];
    expect(patterns(before)).toEqual([]);
    // Back on the bench: two new reports a week apart make it a pattern again.
    const again: Day[] = [
      ...before,
      { daysAgo: 9, done: [BENCH], reports: [[BENCH, 'shoulder']] },
      { daysAgo: 2, done: [BENCH], reports: [[BENCH, 'shoulder']] },
    ];
    expect(patterns(again).map((pattern) => pattern.reportDates.length)).toEqual([2]);
  });

  it('counts pain reported on the alternative before a set of it was done', () => {
    // The dumbbell bench hurt at its first set and was swapped away: no clean alternative.
    const hurtToo: Day[] = [
      ...classic,
      { daysAgo: 4, done: [], reports: [[DB_BENCH, 'shoulder']] },
    ];
    expect(patterns(hurtToo)).toEqual([]);
  });

  it('needs reports in at least half the sessions with it, the latest included', () => {
    const lastClean = [...classic, { daysAgo: 3, done: [BENCH] }];
    expect(patterns(lastClean)).toEqual([]);
    const mostlyClean = [
      ...classic,
      { daysAgo: 25, done: [BENCH] },
      { daysAgo: 24, done: [BENCH] },
      { daysAgo: 23, done: [BENCH] },
      { daysAgo: 22, done: [BENCH] },
    ];
    expect(patterns(mostlyClean)).toEqual([]);
  });

  it('needs two clean sessions with the alternative, and none with a report', () => {
    const oneClean = classic.filter((day) => day.daysAgo !== 17);
    expect(patterns(oneClean)).toEqual([]);
    const hurtToo = classic.map((day) =>
      day.daysAgo === 10 ? { ...day, checkIn: ['shoulder' as Joint] } : day,
    );
    expect(patterns(hurtToo)).toEqual([]);
  });

  it('takes an exercise swapped in for it as its alternative', () => {
    const swapped: Day[] = [
      { daysAgo: 21, done: [BENCH], reports: [[BENCH, 'shoulder']] },
      { daysAgo: 17, done: ['machine-chest-press'], replaced: [BENCH, 'machine-chest-press'] },
      { daysAgo: 14, done: [BENCH], reports: [[BENCH, 'shoulder']] },
      { daysAgo: 10, done: ['machine-chest-press'], replaced: [BENCH, 'machine-chest-press'] },
      { daysAgo: 7, done: [BENCH], reports: [[BENCH, 'shoulder']] },
    ];
    expect(patterns(swapped)[0]?.alternativeId).toBe('machine-chest-press');
  });

  it('reads older reports saved without their exercise, and ratings, where one exercise loaded it', () => {
    const older: Day[] = classic.map((day) =>
      day.reports ? { daysAgo: day.daysAgo, done: day.done, painJoints: ['shoulder'] } : day,
    );
    expect(patterns(older)[0]?.exerciseId).toBe(BENCH);
    const rated: Day[] = classic.map((day) =>
      day.reports ? { daysAgo: day.daysAgo, done: day.done, rating: 'shoulder' as Joint } : day,
    );
    expect(patterns(rated)[0]?.exerciseId).toBe(BENCH);
  });

  it('looks back six weeks, and from a reset', () => {
    const old = classic.map((day) => ({ ...day, daysAgo: day.daysAgo + 30 }));
    expect(patterns(old)).toEqual([]);
    const reset = painPatterns({
      history: classic.map(workout),
      now: RECORD_NOW,
      since: new Date(Date.parse(RECORD_NOW) - 15 * DAY).toISOString(),
    });
    expect(reset).toEqual([]);
  });

  it('is left alone while a lasting swap of the exercise runs, and needs the alternative to fit', () => {
    const until = new Date(Date.parse(RECORD_NOW) + 14 * DAY).toISOString();
    expect(
      painPatterns({
        history: classic.map(workout),
        now: RECORD_NOW,
        swaps: [{ from: BENCH, to: DB_BENCH, until, setAt: RECORD_NOW }],
      }),
    ).toEqual([]);
    expect(
      painPatterns({
        history: classic.map(workout),
        now: RECORD_NOW,
        fits: (exercise) => exercise.id !== DB_BENCH,
      }),
    ).toEqual([]);
  });
});
