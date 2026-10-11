import { describe, expect, it } from 'vitest';
import { backupFileName, historyFileName } from '../backup/backup';
import { parseLegacyExport, planLegacyImport } from '../backup/legacyImport';
import { recordDay } from '../cloud/model';
import { readSessionOrKeep, withDeviceDayKey, writeSession } from '../state/session';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile, type Weekday } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import {
  DELOAD_WEEK_ID,
  formatWindow,
  inDeloadWindow,
  windowIsPast,
} from '../../engine/planning/deload';
import { dateCheck } from '../../engine/planning/pushPace';
import { planWeek } from '../../engine/planning/weeklyPlan';
import type { Readiness } from '../../engine/recalibration/types';
import { interpretFatigue } from '../../engine/recovery/fatigue';
import { consistencyScore } from '../../engine/scoring/analytics';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { fromUtcMidnight, localDayKey } from './localDate';

/**
 * Maintenance 28, the owner's item 1: the device's date everywhere the app works out what day it
 * is. Every case sits late in the evening, where the UTC day has already turned west of UTC: today's
 * plan and its choices, the week's rows, a run of training days, the week a workout counts in, and
 * the day the cloud copy records.
 */

/** An instant on the device's own clock: September 2026, `day` of the month. */
const local = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute).toISOString();

function session(at: string, id: string): WorkoutRecord {
  return {
    id,
    startedAt: at,
    completedAt: new Date(Date.parse(at) + 3_600_000).toISOString(),
    locationId: 'gym',
    templateId: 'full-body',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId: 'back-squat',
        sets: [{ kind: 'working', reps: 5, weight: 185, rir: 2, completed: true }],
      },
    ],
  };
}

const base = createDefaultProfile(TEST_NOW);
function onDays(days: Weekday[]): UserProfile {
  return {
    ...base,
    schedule: { ...base.schedule, weeklyFrequency: days.length, availableDays: days },
  };
}
const [, gym] = createDefaultLocations({ gymAccess: true }, TEST_NOW);
const low: Readiness = {
  energy: 2,
  soreness: 3,
  sleep: 2,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};

describe("the device's date (Maintenance 28, item 1)", () => {
  it("keeps the day's choices through a late evening", async () => {
    // Thursday 19:00 on the device, a 30-minute choice; then 23:30 the same Thursday.
    let clock = local(10, 19);
    const { store } = createTestStore({ now: () => clock });
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(clock),
      createDefaultLocations({ gymAccess: true }, clock),
    );
    await store.setDurationChoice(30);
    await store.recalibrate({ type: 'readiness', readiness: low });
    clock = local(10, 23, 30);
    store.refreshSession();
    const kept = store.getSnapshot().session!;
    expect(kept.duration).toBe(30);
    expect(kept.baseKey.startsWith(`${localDayKey(clock)}|`)).toBe(true);
    // A change the same evening is a change to today's plan: the check-in stays.
    await store.setDurationChoice(45);
    const changed = store.getSnapshot().session!;
    expect(changed.duration).toBe(45);
    expect(changed.constraints.readiness).toEqual(low);
    // A setting that builds the plan again keeps the day's choices too.
    await store.saveProfile({ ...store.getSnapshot().profile!, reserveCheck: true });
    const rebuilt = store.getSnapshot().session!;
    expect(rebuilt.duration).toBe(45);
    expect(rebuilt.constraints.readiness).toEqual(low);
  });

  it("names today by the device's weekday, and a workout begun today as today's", () => {
    // Thursday 23:30: the week starts with Thursday, today.
    const now = local(10, 23, 30);
    const week = planWeek(onDays(['mon', 'thu', 'sat']), gym, [], now);
    expect(week[0]).toMatchObject({ weekday: 'thu', today: true, label: 'Today' });
    // A workout begun at 19:00 the same Thursday: today is done, the week starts on Saturday.
    const done = planWeek(onDays(['mon', 'thu', 'sat']), gym, [session(local(10, 19), 'w-1')], now);
    expect(done[0]).toMatchObject({ weekday: 'sat', today: false });
  });

  it("counts a run of training days by the device's days", () => {
    // Monday 22:00, Tuesday 08:00, Wednesday 22:00, Thursday 08:00: four days running.
    const history = [
      session(local(7, 22), 'w-1'),
      session(local(8, 8), 'w-2'),
      session(local(9, 22), 'w-3'),
      session(local(10, 8), 'w-4'),
    ];
    const fatigue = interpretFatigue(history, local(10, 12));
    expect(fatigue.evidence).toContain('4 training days in a row.');
  });

  it('counts a Sunday evening workout in its own week', () => {
    // Sunday Sep 13 at 21:00, read on Monday Sep 14 at 10:00: last week's, not this one's.
    const score = consistencyScore([session(local(13, 21), 'w-1')], onDays(['sun']), local(14, 10));
    expect(score.value.thisWeek).toBe(0);
    expect(score.value.weeks.at(-2)?.sessions).toBe(1);
  });

  it('steps the week in calendar days across a clock change', () => {
    // Saturday 7 March 2026 at 23:30, the night the clocks go forward in much of North America.
    const now = new Date(2026, 2, 7, 23, 30).toISOString();
    const week = planWeek(onDays(['sat', 'sun', 'wed']), gym, [], now);
    expect(week.map((one) => one.weekday)).toEqual(['sat', 'sun', 'wed']);
  });

  it('counts a workout begun before midnight on the day it began', () => {
    // Begun at 23:30 each of Monday to Wednesday, finished after midnight; Thursday at 08:00.
    const history = [
      session(local(7, 23, 30), 'w-1'),
      session(local(8, 23, 30), 'w-2'),
      session(local(9, 23, 30), 'w-3'),
      session(local(10, 8), 'w-4'),
    ];
    expect(interpretFatigue(history, local(10, 12)).evidence).toContain(
      '4 training days in a row.',
    );
    // Begun on Sunday at 23:30, finished on Monday: last week's.
    const score = consistencyScore(
      [session(local(13, 23, 30), 'w-5')],
      onDays(['sun']),
      local(14, 10),
    );
    expect(score.value.thisWeek).toBe(0);
  });

  it("dates a saved workout by the device's day", async () => {
    const clock = local(10, 21);
    const { store } = createTestStore({ now: () => clock });
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(clock),
      createDefaultLocations({ gymAccess: true }, clock),
    );
    const saved = await store.saveCurrentWorkout('Evening');
    store.loadSavedWorkout(saved.id);
    expect(store.getSnapshot().session?.lastSummary?.details[0]).toMatch(/^Saved 2026-09-10\./);
  });

  it('records the day a workout began on the device in the cloud copy', () => {
    const record = session(local(10, 21), 'w-1') as unknown as Record<string, unknown>;
    expect(recordDay('workouts', record)).toBe('2026-09-10');
  });
});

/** A deload window kept from before Maintenance 28: midnight UTC to midnight UTC. */
const OLD_WINDOW = { startsAt: '2026-09-11T00:00:00.000Z', endsAt: '2026-09-18T00:00:00.000Z' };

/**
 * An hour of 10 September 2026 at which the device's day and the UTC day differ (evening west of
 * UTC, morning east of it), or null where they never do.
 */
function splitHour(): number | null {
  for (let hour = 0; hour < 24; hour += 1) {
    const at = local(10, hour, 30);
    if (localDayKey(at) !== at.slice(0, 10)) return hour;
  }
  return null;
}

describe("the device's date, the review's cases (Maintenance 28, item 1)", () => {
  it('runs and names a deload window kept from before on the same calendar days', () => {
    expect(formatWindow(OLD_WINDOW)).toBe('Fri, Sep 11 to Thu, Sep 17');
    expect(inDeloadWindow(OLD_WINDOW, local(10, 21))).toBe(false);
    expect(inDeloadWindow(OLD_WINDOW, local(11, 0, 30))).toBe(true);
    expect(inDeloadWindow(OLD_WINDOW, local(17, 23, 30))).toBe(true);
    expect(inDeloadWindow(OLD_WINDOW, local(18, 0, 30))).toBe(false);
    expect(windowIsPast(OLD_WINDOW, local(17, 23, 30))).toBe(false);
    expect(windowIsPast(OLD_WINDOW, local(18, 0, 30))).toBe(true);
    // A window planned on the device is left as it is.
    const own = new Date(2026, 8, 11).toISOString();
    expect(fromUtcMidnight(own)).toBe(own);
    expect(fromUtcMidnight('2026-09-11T00:00:00.000Z')).toBe(own);
  });

  it('names a deload window planned on a device in another zone by its own days', () => {
    // Planned five hours east of UTC: from its midnight, which is 19:00 UTC the evening before.
    const planned = {
      startsAt: '2026-09-10T19:00:00.000Z',
      endsAt: '2026-09-17T19:00:00.000Z',
    };
    expect(formatWindow(planned)).toBe('Fri, Sep 11 to Thu, Sep 17');
  });

  it('reads a deload window kept from before on the device as it loads', async () => {
    const clock = local(9, 12);
    const { store } = createTestStore({ now: () => clock });
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(clock),
      createDefaultLocations({ gymAccess: true }, clock),
    );
    const db = await store.getDatabase();
    await db.put('meta', { id: DELOAD_WEEK_ID, ...OLD_WINDOW, plannedAt: clock, reasons: [] });
    await store.hydrate();
    expect(store.getSnapshot().deloadWeek).toMatchObject({
      startsAt: new Date(2026, 8, 11).toISOString(),
      endsAt: new Date(2026, 8, 18).toISOString(),
    });
  });

  it('averages from the week the first workout began in', () => {
    // The first workout ever began on Sunday at 23:30 and ended after midnight; read on Wednesday.
    const score = consistencyScore(
      [session(local(13, 23, 30), 'w-1')],
      onDays(['sun']),
      local(16, 10),
    );
    expect(score.value.averagePerWeek).toBe(0.5);
    expect(score.explanation).toContain('over 2 weeks since your first');
  });

  it('keeps a push date ahead all through its day', () => {
    // The date field keeps the day as its noon; at 15:00 that day it has not passed.
    const by = new Date(2026, 8, 10, 12).toISOString();
    const check = (now: string) =>
      dateCheck({ state: { kind: 'none' }, target: 200, by, now, current: 180, newLifter: false });
    expect(check(local(10, 15))).not.toBeNull();
    expect(check(local(10, 23, 30))).not.toBeNull();
    expect(check(local(11, 0, 30))).toBeNull();
  });

  it("names an export by the device's date and time", () => {
    expect(backupFileName(local(10, 21, 30))).toBe('workout-conductor-backup-20260910-2130.json');
    expect(historyFileName(local(10, 21, 30))).toBe('workout-conductor-history-20260910-2130.json');
  });

  it('reads a date alone in an old export as that day, and imports it once', () => {
    const parsed = parseLegacyExport(
      JSON.stringify([
        {
          date: '2026-05-01',
          exercises: [{ name: 'back-squat', sets: [{ weight: 100, reps: 5 }] }],
        },
      ]),
      (name) => (name === 'back-squat' ? 'back-squat' : null),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    const [one] = parsed.sessions;
    expect(localDayKey(one!.startedAt)).toBe('2026-05-01');
    // Its id is the one it had when the date read as midnight UTC: imported once, never twice.
    const plan = planLegacyImport(parsed.sessions, {
      units: 'lb',
      importedAt: TEST_NOW,
      existingIds: new Set(['legacy-20260501000000-0']),
    });
    expect(plan.alreadyImported).toBe(1);
  });

  it("names an evening preview kept by the build before by the device's day", () => {
    const hour = splitHour();
    const made = local(10, hour ?? 21, 30);
    const preview = {
      status: 'preview' as const,
      createdAt: made,
      // The build before named the day in UTC.
      baseKey: `${made.slice(0, 10)}|profile|place|3`,
    };
    const read = withDeviceDayKey(preview as never) as unknown as typeof preview;
    expect(read.baseKey).toBe(`${localDayKey(made)}|profile|place|3`);
    // A key this build wrote is never touched, nor a workout under way.
    const own = { ...preview, baseKey: `${localDayKey(made)}|profile|place|3` };
    expect(withDeviceDayKey(own as never)).toBe(own);
    // Nor a key naming neither day: a preview kept from an earlier day stays one.
    const earlier = { ...preview, baseKey: '2026-09-08|profile|place|3' };
    expect(withDeviceDayKey(earlier as never)).toBe(earlier);
    const active = { ...preview, status: 'active' as const };
    expect(withDeviceDayKey(active as never)).toBe(active);
  });

  it('keeps the evening choice of a preview kept by the build before, and not into the morning', async () => {
    // Where the device's day and the UTC day part, the hour they part at; elsewhere, an evening.
    const hour = splitHour() ?? 21;
    let clock = local(10, hour);
    const first = createTestStore({ now: () => clock });
    await first.store.hydrate();
    await first.store.completeOnboarding(
      createDefaultProfile(local(9, 12)),
      createDefaultLocations({ gymAccess: true }, local(9, 12)),
    );
    await first.store.setDurationChoice(30);
    // The same preview as the build before kept it, its day in UTC.
    const kept = readSessionOrKeep(first.storage, clock).session!;
    const bar = kept.baseKey.indexOf('|');
    writeSession(
      { ...kept, baseKey: `${kept.createdAt.slice(0, 10)}${kept.baseKey.slice(bar)}` },
      first.storage,
    );
    const reopen = async () => {
      const again = createTestStore({
        now: () => clock,
        factory: first.factory,
        storage: first.storage,
      });
      await again.store.hydrate();
      return again.store.getSnapshot().session!;
    };
    clock = local(10, hour, 30);
    expect((await reopen()).duration).toBe(30);
    // The next morning: a fresh plan.
    clock = local(11, 8);
    expect((await reopen()).duration).toBe('default');
  });
});
