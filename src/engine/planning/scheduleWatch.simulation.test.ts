import { describe, expect, it } from 'vitest';
import type { Weekday } from '../../core/validation/profile';
import { SCHEDULE_MOVE_ID, type ScheduleMove } from '../../core/validation/scheduleMove';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { session, type Lift, type Lifts } from '../../test/scheduleWatch';
import { scheduleWatch } from './scheduleWatch';

/**
 * Maintenance 36, the schedule watch in simulation (the review of Maintenance 36): seeded lifters,
 * each first set drawn with the research's noise (4% a session), eight weeks before a change of
 * days and eight after, the watch read once a day from the fourth week after the change to the
 * eighth, as the coach reads it before each workout. With no real change it must almost never speak
 * ("clearly worse than normal week-to-week noise"); with a lasting fall it must nearly always.
 * Synthetic data only.
 */

/** A seeded generator (mulberry32), so each run draws the same lifters. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard normal draw (Box-Muller). */
function normal(random: () => number): number {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

const USUAL: Record<string, number> = {
  'barbell-bench-press': 185,
  'barbell-row': 155,
  'overhead-press': 115,
  'lat-pulldown': 140,
  'dumbbell-curl': 35,
  'cable-triceps-pushdown': 60,
  'back-squat': 225,
  'romanian-deadlift': 205,
  'leg-press': 400,
  'leg-curl': 110,
  'standing-calf-raise': 180,
  'leg-extension': 130,
};
const UPPER = Object.keys(USUAL).slice(0, 6);
const LOWER = Object.keys(USUAL).slice(6);

/** Days of the week (0 Monday) and the lifts trained on each. */
type Week = [offset: number, lifts: string[]][];
const UPPER_LOWER: { before: Week; after: Week } = {
  before: [
    [0, UPPER],
    [1, LOWER],
    [3, UPPER],
    [4, LOWER],
  ],
  after: [
    [1, UPPER],
    [2, LOWER],
    [4, UPPER],
    [5, LOWER],
  ],
};
const FULL = [...UPPER.slice(0, 4), ...LOWER.slice(0, 4)];
const FULL_BODY: { before: Week; after: Week } = {
  before: [
    [0, FULL],
    [2, FULL],
    [4, FULL],
  ],
  after: [
    [1, FULL],
    [3, FULL],
    [5, FULL],
  ],
};
/** Each lift once a week, as a four-day rotation trains it. */
const ROTATION_A = [...UPPER.slice(0, 3), ...LOWER.slice(0, 3)];
const ROTATION_B = [...UPPER.slice(3), ...LOWER.slice(3)];
const ONCE_A_WEEK: { before: Week; after: Week } = {
  before: [
    [0, ROTATION_A],
    [3, ROTATION_B],
  ],
  after: [
    [1, ROTATION_A],
    [4, ROTATION_B],
  ],
};

/** One lift's first set: its usual load, scaled by the fall and the day's draw. */
type Draw = (name: string, scale: number, random: () => number, day: number) => Lift;

const independent: Draw = (name, scale, random) => {
  const load = (USUAL[name] as number) * scale * Math.exp(0.04 * normal(random));
  return [5, Math.round(load * 100) / 100, 2];
};
/** A fifth of the noise the day's, shared by every lift that day. */
const shared: Draw = (name, scale, random, day) => {
  const draw = Math.sqrt(0.2) * day + Math.sqrt(0.8) * normal(random);
  const load = (USUAL[name] as number) * scale * Math.exp(0.04 * draw);
  return [5, Math.round(load * 100) / 100, 2];
};
/** The same ask every session, whole reps and reserve around 5 and 2 (a stalled lifter). */
const stalled: Draw = (name, _scale, random) => {
  const load = USUAL[name] as number;
  const reps = Math.min(12, Math.max(1, Math.round(5 + normal(random))));
  const rir = Math.min(3, Math.max(0, Math.round(2 + 0.8 * normal(random))));
  return [reps, load, rir, load];
};

const MOVE: ScheduleMove = {
  id: SCHEDULE_MOVE_ID,
  at: new Date(2026, 8, 7, 8, 0).toISOString(),
  from: { weeklyFrequency: 4, availableDays: ['mon', 'tue', 'thu', 'fri'] as Weekday[] },
  to: { weeklyFrequency: 4, availableDays: ['tue', 'wed', 'fri', 'sat'] as Weekday[] },
  since: null,
  watched: true,
};
/** Noon each day from four weeks after the change to the last day before eight. */
const LOOKS = Array.from({ length: 28 }, (_, day) =>
  new Date(2026, 8, 7 + 28 + day, 12, 0).toISOString(),
);

interface Scenario {
  program: { before: Week; after: Week };
  draw?: Draw;
  /** How far the lifts the change reaches fall after it: 0.08 is 8%. */
  fall?: number;
  reaches?: (name: string) => boolean;
  /** A trend a month, from the first session on. */
  monthly?: number;
}

function lifter(seed: number, scenario: Scenario): WorkoutRecord[] {
  const random = seeded(seed);
  const draw = scenario.draw ?? independent;
  const records: WorkoutRecord[] = [];
  const start = new Date(2026, 8, 7, 18, 0);
  const add = (offset: number, names: string[], after: boolean) => {
    const when = new Date(start);
    when.setDate(when.getDate() + offset);
    const day = normal(random);
    const lifts: Lifts = {};
    for (const name of names) {
      const trend = Math.exp(((scenario.monthly ?? 0) * offset) / 30);
      const reached = after && (scenario.reaches?.(name) ?? true);
      lifts[name] = draw(name, trend * (reached ? 1 - (scenario.fall ?? 0) : 1), random, day);
    }
    records.push(session(when.toISOString(), lifts));
  };
  for (let week = -8; week < 0; week += 1) {
    for (const [offset, names] of scenario.program.before) add(week * 7 + offset, names, false);
  }
  for (let week = 0; week < 8; week += 1) {
    for (const [offset, names] of scenario.program.after) add(week * 7 + offset, names, true);
  }
  return records;
}

/** The share of lifters the watch spoke to at any of the looks. */
function spoken(scenario: Scenario, lifters = 100): number {
  let count = 0;
  for (let seed = 1; seed <= lifters; seed += 1) {
    const history = lifter(seed * 7919, scenario);
    if (LOOKS.some((now) => scheduleWatch(MOVE, MOVE.to, history, now) !== null)) count += 1;
  }
  return count / lifters;
}

describe('the schedule watch in simulation', () => {
  it('almost never speaks when the change did nothing', () => {
    const quiet: Record<string, Scenario> = {
      'upper and lower twice a week': { program: UPPER_LOWER },
      'each lift once a week': { program: ONCE_A_WEEK },
      'full body three days': { program: FULL_BODY },
      'a fifth of the noise the day’s': { program: UPPER_LOWER, draw: shared },
      'a stalled lifter': { program: UPPER_LOWER, draw: stalled },
      'gaining 1% a month': { program: UPPER_LOWER, monthly: 0.01 },
    };
    for (const [name, scenario] of Object.entries(quiet)) {
      // Measured on 500 lifters: 0 to 1.2%; a hundred here keep the run short.
      expect(spoken(scenario), name).toBeLessThanOrEqual(0.03);
    }
  }, 120_000);

  it('nearly always speaks when the change brought a lasting fall', () => {
    const falls: Record<string, Scenario> = {
      'upper and lower, every lift 8%': { program: UPPER_LOWER, fall: 0.08 },
      'each lift once a week, 8%': { program: ONCE_A_WEEK, fall: 0.08 },
      'full body, 8%': { program: FULL_BODY, fall: 0.08 },
      'the upper-body lifts alone, 8%': {
        program: UPPER_LOWER,
        fall: 0.08,
        reaches: (name) => UPPER.includes(name),
      },
      'upper and lower, every lift 6%': { program: UPPER_LOWER, fall: 0.06 },
    };
    for (const [name, scenario] of Object.entries(falls)) {
      // Measured on 300 lifters: 98 to 100%.
      expect(spoken(scenario), name).toBeGreaterThanOrEqual(0.9);
    }
  }, 120_000);
});
