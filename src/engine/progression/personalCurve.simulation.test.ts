import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { PERSONAL_CURVE, curveLoad, liftCurve, ruleLoad, type LiftCurve } from './personalCurve';

/**
 * The simulation behind item 41's activation threshold (Maintenance 27, the owner's condition:
 * "Research and validate the activation threshold rather than using an arbitrary number").
 * Skipped in the ordinary suite; run it with `SIMULATE=1 npx vitest run <this file>`.
 *
 * Simulated lifters, each with a true constant `k` (30 ± 6: Nuzzo et al., 2024, net of test
 * error), a max that drifts up 0 to 1.5% a week (trained lifters in study blocks), reps to failure
 * that vary by 0.7 to 1.1 reps when retested (Mitter et al., 2022), and a last-set loss the app
 * cannot know: a check is always a lift's last set, after its working sets, so its reps run short
 * by a fraction of 0 to 20% (the size is unsettled; the scenarios span it). Each takes item 43's
 * checks on one lift on a schedule, and the app's own `liftCurve` reads them. Every target the curve
 * would change is scored against the lifter's own right weight (fresh, true curve), beside what the
 * population rule gives: the curve may act only where it is rarely worse and better on average.
 */

const DAY_MS = 86_400_000;
const NOW = '2026-10-10T12:00:00.000Z';

/** A seeded generator (mulberry32), so a run is the same every time. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random: () => number): number {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

interface Lifter {
  k: number;
  gainPerWeek: number;
  repNoise: number;
  lastSetLoss: number;
}

function lifter(random: () => number, lossMax: number): Lifter {
  return {
    k: Math.min(56, Math.max(14, 30 + 6 * normal(random))),
    gainPerWeek: 0.015 * random(),
    repNoise: 0.7 + 0.4 * random(),
    lastSetLoss: lossMax * random(),
  };
}

/** A schedule: the day (before now) and the reps to failure the program's load aims at. */
type Schedule = { daysAgo: number; aim: number }[];

/** The checks one lifter takes: a load the program sets for the aim, and the reps they get. */
function readings(person: Lifter, schedule: Schedule, random: () => number): WorkoutRecord[] {
  const max0 = 100;
  return schedule.map(({ daysAgo, aim }, index) => {
    const max = max0 * (1 + person.gainPerWeek) ** (-daysAgo / 7);
    const weight = Math.max(5, Math.round(max / (1 + aim / person.k) / 2.5) * 2.5);
    const fresh = person.k * (max / weight - 1);
    const reps = Math.max(
      1,
      Math.round(fresh * (1 - person.lastSetLoss) + person.repNoise * normal(random)),
    );
    const when = new Date(Date.parse(NOW) - daysAgo * DAY_MS).toISOString();
    return {
      id: `w-${index}`,
      startedAt: when,
      completedAt: when,
      locationId: 'gym',
      templateId: 'pull-arms',
      endedEarly: false,
      rating: null,
      skippedExerciseIds: [],
      painJoints: [],
      readiness: null,
      prs: [],
      entries: [
        {
          exerciseId: 'cable-curl',
          plannedSets: 1,
          sets: [
            {
              kind: 'working' as const,
              reps: Math.max(1, reps - 2),
              weight,
              rir: 1,
              completed: true,
              setIndex: 0,
              loggedAt: when,
              reserveCheck: { total: reps },
            },
          ],
        },
      ],
    };
  });
}

interface Scored {
  curve: LiftCurve;
  /** Relative errors of the curve's target and the population's, against the right weight. */
  errors: { curve: number; rule: number }[];
}

/** The targets a curve would change: across its span both ways, scored against the truth. */
function score(person: Lifter, curve: LiftCurve): { curve: number; rule: number }[] {
  if (!curve.span) return [];
  const [low, high] = curve.span;
  const pairs: [number, number][] = [
    [low + 1, high - 1],
    [high - 1, low + 1],
    [low + 1, Math.round((low + high) / 2)],
  ];
  const out: { curve: number; rule: number }[] = [];
  for (const [from, to] of pairs) {
    if (from === to || from < 1 || to < 1) continue;
    const weight = 100;
    // A last set at failure: its reps are its reps to failure. One logged with reserve is the same
    // comparison: the app's rule reads it at its logged reps, and the curve moves that load by its
    // shape in reps to failure, so the margin the rule keeps is the same in all three (the review
    // of item 41).
    const rule = ruleLoad(weight, from, to, PERSONAL_CURVE.POPULATION_K);
    const mine = curveLoad({ ...curve, active: true }, rule, { reps: from, rir: 0 }, to);
    if (mine === null) continue;
    // The right weight on the lifter's true, fresh curve, read to the rule's own reach.
    const right = ruleLoad(weight, from, to, person.k);
    out.push({ curve: Math.abs(mine - right) / right, rule: Math.abs(rule - right) / right });
  }
  return out;
}

function run(lossMax: number, schedule: Schedule, people = 2000, seed = 41): Scored[] {
  const random = seeded(seed);
  const scored: Scored[] = [];
  for (let index = 0; index < people; index += 1) {
    const person = lifter(random, lossMax);
    const curve = liftCurve(readings(person, schedule, random), 'cable-curl', NOW);
    scored.push({ curve, errors: score(person, curve) });
  }
  return scored;
}

/**
 * Among lifters whose curve passes a gate (the app's own, or one this sure): how many, worse how
 * often, and the average errors.
 */
function summary(scored: Scored[], threshold: number | 'app') {
  const active = scored.filter((item) =>
    threshold === 'app' ? item.curve.active : item.curve.pairs > 0 && item.curve.sd <= threshold,
  );
  const errors = active.flatMap((item) => item.errors);
  const worse = errors.filter((error) => error.curve > error.rule + 0.01).length;
  const mean = (values: number[]) =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    active: active.length,
    targets: errors.length,
    worseShare: errors.length === 0 ? 0 : worse / errors.length,
    curveError: mean(errors.map((error) => error.curve)),
    ruleError: mean(errors.map((error) => error.rule)),
  };
}

/**
 * The app's own schedule (item 43): weekly while learning, five checks, then one every four weeks,
 * so at most six readings on a lift in the twelve-week window; here alternating two rep ranges, as
 * an undulating plan would, the only way a lift's checks pair.
 */
const app = (low: number, high: number): Schedule =>
  [77, 70, 63, 56, 49, 21].map((daysAgo, index) => ({
    daysAgo,
    aim: index % 2 === 0 ? low : high,
  }));

/** The scenarios the threshold must hold in. */
const SCENARIOS: [string, Schedule][] = [];

/** What the threshold must give in every scenario: rarely worse, better on average. */
const MOST_WORSE = 0.1;

const weekly = (weeks: number, low: number, high: number): Schedule =>
  Array.from({ length: weeks }, (_, index) => ({
    daysAgo: 7 * (weeks - 1 - index),
    aim: index % 2 === 0 ? low : high,
  }));

SCENARIOS.push(
  ["the app's schedule, 8 and 16 reps", app(8, 16)],
  ["the app's schedule, 6 and 12 reps", app(6, 12)],
  ["the app's schedule, 10 and 16 reps", app(10, 16)],
  ['4 checks, weekly, 8 and 16 reps', weekly(4, 8, 16)],
  ['6 checks, weekly, 8 and 16 reps', weekly(6, 8, 16)],
  ['8 checks, weekly, 8 and 16 reps', weekly(8, 8, 16)],
  ['8 checks, weekly, 6 and 12 reps', weekly(8, 6, 12)],
  ['8 checks, weekly, 10 and 16 reps', weekly(8, 10, 16)],
  ['12 checks, weekly, 8 and 16 reps', weekly(12, 8, 16)],
);

describe.skipIf(!process.env.SIMULATE)('item 41: the activation threshold, by simulation', () => {
  it('holds at the gate the app uses in every scenario: rarely worse, better on average', () => {
    for (const lossMax of [0, 0.1, 0.2]) {
      for (const [name, schedule] of SCENARIOS) {
        const s = summary(run(lossMax, schedule), 'app');
        console.log(
          `APP | loss<=${lossMax.toFixed(1)} | ${name.padEnd(34)} | active ${String(s.active).padStart(4)} of 2000 | worse ${(100 * s.worseShare).toFixed(1).padStart(5)}% | curve ${(100 * s.curveError).toFixed(2)}% rule ${(100 * s.ruleError).toFixed(2)}%`,
        );
        if (s.targets === 0) continue;
        expect(s.worseShare, `${name}, loss up to ${lossMax}`).toBeLessThanOrEqual(MOST_WORSE);
        expect(s.curveError, `${name}, loss up to ${lossMax}`).toBeLessThan(s.ruleError);
      }
    }
  }, 600_000);

  it('prints what a gate on a confident difference would do', () => {
    // Active when the curve sits z of its spreads above 30, or z below what the largest last-set
    // loss simulated (20%) could make of 30: a difference the loss cannot explain.
    const lines: string[] = [];
    for (const z of [1.5, 2, 2.5, 3]) {
      for (const lossMax of [0, 0.1, 0.2]) {
        for (const [name, schedule] of SCENARIOS) {
          const scored = run(lossMax, schedule);
          const gate = (curve: LiftCurve) =>
            curve.pairs > 0 &&
            ((curve.k - PERSONAL_CURVE.POPULATION_K) / curve.sd >= z ||
              (PERSONAL_CURVE.POPULATION_K * 0.8 - curve.k) / curve.sd >= z);
          const active = scored.filter((item) => gate(item.curve));
          const errors = active.flatMap((item) => item.errors);
          const worse = errors.filter((error) => error.curve > error.rule + 0.01).length;
          const mean = (values: number[]) =>
            values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
          lines.push(
            `z=${z} | loss<=${lossMax.toFixed(1)} | ${name.padEnd(34)} | active ${String(active.length).padStart(4)} | worse ${(errors.length === 0 ? 0 : (100 * worse) / errors.length).toFixed(1).padStart(5)}% | curve ${(100 * mean(errors.map((e) => e.curve))).toFixed(2)}% rule ${(100 * mean(errors.map((e) => e.rule))).toFixed(2)}%`,
          );
        }
      }
    }
    console.log(lines.join('\n'));
  }, 900_000);

  it('prints what each threshold would do, for each last-set loss and schedule', () => {
    const thresholds = [1.5, 2, 2.5, 3, 3.5, 4, 5, 6];
    const lines: string[] = [];
    for (const lossMax of [0, 0.1, 0.2]) {
      for (const [name, schedule] of SCENARIOS) {
        const scored = run(lossMax, schedule);
        for (const threshold of thresholds) {
          const s = summary(scored, threshold);
          lines.push(
            `loss<=${lossMax.toFixed(1)} | ${name.padEnd(34)} | sd<=${threshold.toFixed(1)} | active ${String(s.active).padStart(4)} | worse ${(100 * s.worseShare).toFixed(1).padStart(5)}% | curve ${(100 * s.curveError).toFixed(2)}% rule ${(100 * s.ruleError).toFixed(2)}%`,
          );
        }
      }
    }
    console.log(lines.join('\n'));
    expect(lines.length).toBeGreaterThan(0);
  }, 600_000);

  it('never learns a curve from checks in one rep range', () => {
    const oneRange: Schedule = Array.from({ length: 12 }, (_, index) => ({
      daysAgo: 7 * (11 - index),
      aim: 12 + (index % 3),
    }));
    const scored = run(0.1, oneRange, 500);
    expect(scored.filter((item) => item.curve.active)).toHaveLength(0);
  }, 600_000);
});
