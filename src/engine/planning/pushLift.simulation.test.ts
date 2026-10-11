import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import {
  createDefaultProfile,
  type UserProfile,
  type Weekday,
} from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries } from '../workout/types';
import { TEMPLATES, generateWorkout } from '../workoutGenerator/generate';
import { addLocalDays, localDaysBetween, localWeekKey } from '../../core/time/localDate';

/**
 * Item 44's week, by simulation (Maintenance 27): the plan run session by session on a fixed
 * schedule for ten weeks, each session logged as planned, with and without a lift to push, on
 * eight schedules and five lifts. The rules hold in every run (the ordinary suite runs that); the
 * tables print with `SIMULATE=1 npx vitest run <this file>`. Its numbers are the research doc's,
 * written out, so a changed constant fails here (the re-check of item 44), and its days are the
 * device's, so it holds in any time zone.
 */

const DAY_MS = 86_400_000;
const START = new Date(2026, 7, 3, 17).toISOString(); // a Monday at 17:00 on the device
const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const [, gym] = createDefaultLocations({ gymAccess: true }, START);

function logged(workout: ReturnType<typeof generateWorkout>, when: string): WorkoutRecord {
  return {
    id: `sim-${when}`,
    startedAt: when,
    // An hour's workout: the rules read the day it began, not when it ended (the review).
    completedAt: new Date(Date.parse(when) + 60 * 60_000).toISOString(),
    locationId: workout.locationId,
    templateId: workout.templateId,
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: allEntries(workout.blocks).map((entry) => ({
      exerciseId: entry.exerciseId,
      entryId: entry.id,
      role: entry.role,
      plannedSets: entry.sets.filter((set) => set.kind === 'working').length,
      ...(entry.push ? { push: entry.push } : {}),
      sets: entry.sets
        .filter((set) => set.kind !== 'warmup')
        .map((set, index) => ({
          kind: set.kind,
          reps: set.targetReps[1],
          weight: set.targetWeight ?? 50,
          rir: set.targetRir,
          completed: true,
          setIndex: index,
          targetReps: [set.targetReps[0], set.targetReps[1]] as [number, number],
          targetRir: set.targetRir,
          loggedAt: when,
        })),
    })),
  };
}

interface Scenario {
  name: string;
  days: Weekday[];
  profile: (base: UserProfile) => UserProfile;
}

/** The scenario's lifter, with the push when given. */
function profileOf(scenario: Scenario, push: UserProfile['pushLift'] | undefined): UserProfile {
  const base = createDefaultProfile(START);
  return scenario.profile({
    ...base,
    schedule: {
      ...base.schedule,
      weeklyFrequency: scenario.days.length,
      availableDays: scenario.days,
    },
    ...(push ? { pushLift: push } : {}),
  });
}

function simulate(scenario: Scenario, push: UserProfile['pushLift'] | undefined, weeks = 10) {
  const profile = profileOf(scenario, push);
  const history: WorkoutRecord[] = [];
  for (let day = 0; day < weeks * 7; day += 1) {
    const when = addLocalDays(START, day);
    const weekday = WEEKDAYS[day % 7] as Weekday;
    if (!scenario.days.includes(weekday)) continue;
    const workout = generateWorkout({
      profile,
      location: gym,
      history,
      now: when,
      duration: 'default',
    });
    history.push(logged(workout, when));
  }
  return history;
}

/** One lift's weeks: exposures, sets, gaps, and its primary muscles' direct sets. */
function measure(history: WorkoutRecord[], liftId: string, fromWeek = 3) {
  const lift = requireExercise(liftId);
  const from = Date.parse(START) + fromWeek * 7 * DAY_MS;
  const kept = history.filter((record) => Date.parse(record.startedAt) >= from);
  const weeks = (Date.parse(history.at(-1)!.startedAt) - from) / (7 * DAY_MS) + 1 / 7;
  const exposures = kept.filter((record) => record.entries.some((e) => e.exerciseId === liftId));
  const family = kept.filter((record) =>
    record.entries.some(
      (e) =>
        e.exerciseId !== liftId &&
        requireExercise(e.exerciseId).progressionFamily === lift.progressionFamily,
    ),
  );
  const sets = exposures.reduce(
    (sum, record) =>
      sum +
      record.entries
        .filter((e) => e.exerciseId === liftId)
        .reduce((inner, e) => inner + e.sets.filter((s) => s.kind === 'working').length, 0),
    0,
  );
  const times = exposures.map((record) => Date.parse(record.startedAt));
  const gaps = times.slice(1).map((time, index) => (time - (times[index] as number)) / DAY_MS);
  const muscleSets = (muscle: string) =>
    kept.reduce(
      (sum, record) =>
        sum +
        record.entries.reduce((inner, e) => {
          const exercise = requireExercise(e.exerciseId);
          const working = e.sets.filter((s) => s.kind === 'working').length;
          return (
            inner +
            (exercise.primaryMuscles.includes(muscle as never) ? working : 0) +
            (exercise.secondaryMuscles.includes(muscle as never) ? working * 0.5 : 0)
          );
        }, 0),
      0,
    );
  const firstCount = exposures.filter((record) => record.entries[0]?.exerciseId === liftId).length;
  return {
    perWeek: exposures.length / weeks,
    familyPerWeek: family.length / weeks,
    setsPerWeek: sets / weeks,
    minGap: gaps.length ? Math.min(...gaps) : null,
    under2: gaps.filter((gap) => gap < 2).length,
    led: exposures.length ? firstCount / exposures.length : 0,
    muscles: Object.fromEntries(
      lift.primaryMuscles.map((muscle) => [
        muscle,
        Math.round((muscleSets(muscle) / weeks) * 10) / 10,
      ]),
    ),
    total:
      kept.reduce(
        (sum, record) =>
          sum +
          record.entries.reduce(
            (inner, e) => inner + e.sets.filter((s) => s.kind === 'working').length,
            0,
          ),
        0,
      ) / weeks,
  };
}

const SCENARIOS: Scenario[] = [
  { name: '3 days MWF, build muscle', days: ['mon', 'wed', 'fri'], profile: (p) => p },
  {
    name: '3 days MWF, strength',
    days: ['mon', 'wed', 'fri'],
    profile: (p) => ({ ...p, goals: { ...p.goals, primary: 'strength' } }),
  },
  { name: '4 days M T Th F, build muscle', days: ['mon', 'tue', 'thu', 'fri'], profile: (p) => p },
  {
    name: '4 days M T Th F, strength',
    days: ['mon', 'tue', 'thu', 'fri'],
    profile: (p) => ({ ...p, goals: { ...p.goals, primary: 'strength' } }),
  },
  { name: '4 days M W F Sa, build muscle', days: ['mon', 'wed', 'fri', 'sat'], profile: (p) => p },
  { name: '2 days M Th, build muscle', days: ['mon', 'thu'], profile: (p) => p },
  {
    name: '5 days M-F, build muscle',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    profile: (p) => p,
  },
  {
    name: '6 days M-Sa, strength',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    profile: (p) => ({ ...p, goals: { ...p.goals, primary: 'strength' } }),
  },
];

const LIFTS = ['barbell-bench-press', 'back-squat', 'deadlift', 'overhead-press', 'barbell-row'];

/** The pushed lift's sessions in a run: when, its sets, whether it led, and its mark. */
function sessionsOf(history: WorkoutRecord[], liftId: string) {
  return history
    .filter((record) => record.entries.some((entry) => entry.exerciseId === liftId))
    .map((record) => {
      const entries = record.entries.filter((entry) => entry.exerciseId === liftId);
      const sets = entries.flatMap((entry) => entry.sets.filter((set) => set.kind === 'working'));
      return {
        at: Date.parse(record.startedAt),
        iso: record.startedAt,
        week: localWeekKey(record.startedAt),
        sets: sets.length,
        rirs: sets.map((set) => set.rir ?? 0),
        led: record.entries[0]?.exerciseId === liftId,
        extra: entries.some((entry) => entry.push === 'extra'),
      };
    });
}

describe('item 44: the week with a lift to push, by simulation', () => {
  it('holds the push rules on every schedule, and never gives the lift fewer sessions', () => {
    for (const scenario of SCENARIOS) {
      const plain = simulate(scenario, undefined);
      for (const liftId of LIFTS) {
        const pushed = simulate(scenario, {
          exerciseId: liftId,
          target: 300,
          units: 'lb',
          since: START,
        });
        const sessions = sessionsOf(pushed, liftId);
        const where = `${scenario.name}, ${liftId}`;
        expect(sessions.length, where).toBeGreaterThan(0);
        sessions.forEach((session, index) => {
          const week = sessions.filter(
            (other) => other.at <= session.at && localDaysBetween(other.iso, session.iso) < 7,
          );
          // Never more than three sessions, or ten sets, in any seven days.
          expect(week.length, where).toBeLessThanOrEqual(3);
          expect(
            week.reduce((sum, other) => sum + other.sets, 0),
            where,
          ).toBeLessThanOrEqual(10);
          // First in every session it is in, and never to failure.
          expect(session.led, where).toBe(true);
          expect(Math.min(...session.rirs), where).toBeGreaterThanOrEqual(1);
          const previous = sessions[index - 1];
          if (!previous) return;
          const days = localDaysBetween(previous.iso, session.iso);
          expect(days, where).toBeGreaterThanOrEqual(2);
          if (session.extra) {
            // Two days apart, three after five sets or more.
            expect(days, where).toBeGreaterThanOrEqual(previous.sets >= 5 ? 3 : 2);
          }
        });
        // An extra session never comes the day before a session with the lift's own place: the
        // look-ahead waits for that session instead.
        const lift = requireExercise(liftId);
        for (const record of pushed) {
          const extra = record.entries.some(
            (entry) => entry.exerciseId === liftId && entry.push === 'extra',
          );
          if (!extra) continue;
          const next = pushed.find((other) => other.startedAt > record.startedAt);
          if (!next || localDaysBetween(record.startedAt, next.startedAt) >= 2) continue;
          const template = TEMPLATES.find((candidate) => candidate.id === next.templateId);
          expect(
            template?.slots.some((slot) => slot.pattern === lift.movementPattern),
            `${where}: the day after an extra on ${record.startedAt}`,
          ).toBe(false);
        }
        // An extra never takes one of the lift's muscles over twenty sets in any seven days it
        // is in, the days before as logged and the days after as planned, nor further over than
        // the day's plan without it (the review).
        const muscleSets = (
          entries: readonly { exerciseId: string; sets: readonly { kind: string }[] }[],
          muscle: string,
        ) =>
          entries.reduce((sum, entry) => {
            const exercise = requireExercise(entry.exerciseId);
            const sets = entry.sets.filter((set) => set.kind !== 'warmup').length;
            if (exercise.primaryMuscles.includes(muscle as never)) return sum + sets;
            return exercise.secondaryMuscles.includes(muscle as never) ? sum + sets * 0.5 : sum;
          }, 0);
        const pushProfile = profileOf(scenario, {
          exerciseId: liftId,
          target: 300,
          units: 'lb',
          since: START,
        });
        pushed.forEach((record, index) => {
          if (
            !record.entries.some((entry) => entry.exerciseId === liftId && entry.push === 'extra')
          ) {
            return;
          }
          // The same day planned without the extra, from the same log.
          const without = allEntries(
            generateWorkout({
              profile: pushProfile,
              location: gym,
              history: pushed.slice(0, index),
              now: record.startedAt,
              duration: 'default',
              constraints: { pushProbe: true },
            }).blocks,
          );
          for (let after = 0; after < 7; after += 1) {
            const end = addLocalDays(record.startedAt, after);
            const seven = pushed.filter((other) => {
              const back = localDaysBetween(other.startedAt, end);
              return back >= 0 && back <= 6;
            });
            for (const muscle of lift.primaryMuscles) {
              const total = seven.reduce(
                (sum, other) => sum + muscleSets(other.entries, muscle),
                0,
              );
              const plain =
                total - muscleSets(record.entries, muscle) + muscleSets(without, muscle);
              expect(
                total,
                `${where}: ${muscle} in the seven days to ${end} (${plain} without the extra)`,
              ).toBeLessThanOrEqual(Math.max(20, plain) + 1e-9);
            }
          }
        });
        // One extra session a calendar week at most; on three days a week, where the plan gives
        // the lift two sessions at most, the extra comes in most weeks (a push that never adds one
        // passed every rule above: the re-check of item 44).
        const extras = sessions.filter((session) => session.extra).map((session) => session.week);
        expect(new Set(extras).size, where).toBe(extras.length);
        if (scenario.days.length === 3) expect(extras.length, where).toBeGreaterThanOrEqual(8);
        // Never fewer sessions of the lift than the plan gave it without the push, but where the
        // plan had it four times in seven days: the push keeps to three (a 6-day plan's squat).
        expect(measure(pushed, liftId).perWeek, where).toBeGreaterThanOrEqual(
          measure(plain, liftId).perWeek - 0.15,
        );
      }
    }
  }, 600_000);
});

describe.skipIf(!process.env.SIMULATE)(
  'item 44: the week with a lift to push, by simulation (tables)',
  () => {
    it('prints each lift without and with the push', () => {
      const lines: string[] = [];
      for (const scenario of SCENARIOS) {
        const plain = simulate(scenario, undefined);
        for (const liftId of LIFTS) {
          const before = measure(plain, liftId);
          const pushed = simulate(scenario, {
            exerciseId: liftId,
            target: 300,
            units: 'lb',
            since: START,
          });
          const after = measure(pushed, liftId);
          const fmt = (m: ReturnType<typeof measure>) =>
            `${m.perWeek.toFixed(2)}/wk (+${m.familyPerWeek.toFixed(2)} fam) ${m.setsPerWeek.toFixed(1)} sets, gap>=${m.minGap?.toFixed(0) ?? '-'}d, <2d ${m.under2}, led ${(m.led * 100).toFixed(0)}%, ${JSON.stringify(m.muscles)}, all ${m.total.toFixed(0)}`;
          lines.push(`${scenario.name.padEnd(32)} | ${liftId.padEnd(20)} | BEFORE ${fmt(before)}`);
          lines.push(`${''.padEnd(32)} | ${''.padEnd(20)} | PUSHED ${fmt(after)}`);
        }
      }
      console.log(lines.join('\n'));
      expect(lines.length).toBeGreaterThan(0);
    }, 900_000);
  },
);
