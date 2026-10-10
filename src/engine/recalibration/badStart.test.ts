import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultProfile } from '../../core/validation/profile';
import type { ProgressionMode, WorkoutBlock, WorkoutEntry } from '../workout/types';
import { JUDGED_REPS, SHORT_BY_REPS, readStart as readWith, startKey } from './badStart';
import type { CompletedSet } from './types';

/** The plan's own reserve for every lift here (`prescribeFor`), set by each test as it needs. */
const plan = vi.hoisted(() => ({ rir: 2 }));
vi.mock('../progression/roles', async (original) => {
  const real = await original<typeof import('../progression/roles')>();
  return {
    ...real,
    prescribeFor: (...args: Parameters<typeof real.prescribeFor>) => ({
      ...real.prescribeFor(...args),
      rir: plan.rir,
    }),
  };
});

beforeEach(() => {
  plan.rir = 2;
});

const context = { profile: createDefaultProfile('2026-10-09T10:00:00.000Z'), history: [] };
const readStart = (blocks: WorkoutBlock[], sets: CompletedSet[]) => readWith(blocks, sets, context);

interface Lift {
  id: string;
  exerciseId: string;
  mode?: ProgressionMode;
  /** Target reps, reserve and weight of its working sets. */
  target?: [[number, number], number, number | null];
  manual?: WorkoutEntry['manual'];
  slot?: number;
  replacedFrom?: string;
  /** The session its target was read from missed its floor on its first set. */
  missed?: boolean;
  /** An entered max raised its target. */
  fromMax?: boolean;
  /** Its target came with a saved workout, from the day it was saved. */
  saved?: boolean;
  /** Its target was read from another rep range. */
  otherRange?: boolean;
}

/** A straight block per lift, three working sets each, in the order given. */
function workout(lifts: Lift[]): WorkoutBlock[] {
  return lifts.map((lift) => {
    const [reps, rir, weight] = lift.target ?? [[6, 10], 2, 100];
    const entry = {
      id: lift.id,
      exerciseId: lift.exerciseId,
      role: 'primary-hypertrophy',
      sets: [0, 1, 2].map((index) => ({
        index,
        kind: 'working' as const,
        targetReps: reps,
        targetRir: rir,
        targetWeight: weight,
        restSeconds: 90,
      })),
      restSeconds: 90,
      warmupSets: 0,
      dropSet: false,
      chosenFor: [],
      locked: false,
      pinned: false,
      progression: {
        mode: lift.mode ?? 'reps',
        evidence: [],
        sessions: 2,
        viaFamily: false,
        confidence: 'medium',
        setsAdvice: 0,
        ...(lift.missed ? { missed: true } : {}),
        ...(lift.fromMax ? { fromMax: true } : {}),
        ...(lift.saved ? { saved: true } : {}),
        ...(lift.otherRange ? { otherRange: true } : {}),
      },
      ...(lift.manual ? { manual: lift.manual } : {}),
      ...(lift.slot !== undefined ? { slot: lift.slot } : {}),
      ...(lift.replacedFrom ? { replacedFrom: lift.replacedFrom } : {}),
    } as unknown as WorkoutEntry;
    return {
      id: `b-${lift.id}`,
      kind: 'straight',
      label: lift.id,
      entries: [entry],
    } as WorkoutBlock;
  });
}

let clock = 0;
/** A logged set; each one a minute after the last unless `at` says otherwise. */
function logged(
  entryId: string,
  setIndex: number,
  reps: number,
  rir: number | null,
  weight: number | null = 100,
  extra: Partial<CompletedSet> = {},
): CompletedSet {
  clock += 1;
  return {
    entryId,
    exerciseId: 'x',
    setIndex,
    kind: 'working',
    reps,
    weight,
    rir,
    completedAt: new Date(Date.UTC(2026, 9, 9, 10, clock)).toISOString(),
    ...extra,
  };
}

const bench: Lift = { id: 'e1', exerciseId: 'barbell-bench-press' };
const row: Lift = { id: 'e2', exerciseId: 'barbell-row' };
const curl: Lift = { id: 'e3', exerciseId: 'dumbbell-curl', target: [[8, 12], 2, 30] };

describe('readStart (Maintenance 26, item 42)', () => {
  // Asked: 6 at 2 in reserve, a capacity of 8. Logged 4 at 1: a capacity of 5, three short.
  it('reads a low start when the first sets of the first two lifts both fall three reps short', () => {
    const reading = readStart(workout([bench, row, curl]), [
      logged('e1', 0, 4, 1),
      logged('e2', 0, 5, 0),
    ]);
    expect(SHORT_BY_REPS).toBe(3);
    expect(reading).toEqual({ low: true, lifts: ['barbell-bench-press', 'barbell-row'] });
  });

  it('reads the first two lifts only: a third logged after them changes nothing', () => {
    expect(
      readStart(workout([bench, row, curl]), [
        logged('e1', 0, 4, 1),
        logged('e2', 0, 5, 0),
        logged('e3', 0, 10, 2, 30),
      ]),
    ).toEqual({ low: true, lifts: ['barbell-bench-press', 'barbell-row'] });
  });

  it('two reps short is ordinary variation', () => {
    expect(
      readStart(workout([bench, row]), [logged('e1', 0, 5, 1), logged('e2', 0, 4, 1)]),
    ).toEqual({ low: false, lifts: [] });
  });

  it('needs both: one lift short and one fine is no bad start', () => {
    expect(
      readStart(workout([bench, row, curl]), [
        logged('e1', 0, 3, 0),
        logged('e2', 0, 8, 2),
        logged('e3', 0, 4, 0, 30),
      ]).low,
    ).toBe(false);
  });

  it('reads only the first working set of a lift: a later set falling short is the lift itself tiring', () => {
    expect(
      readStart(workout([bench, row]), [
        logged('e1', 0, 7, 2),
        logged('e1', 1, 3, 0),
        logged('e2', 0, 3, 0),
      ]).low,
    ).toBe(false);
  });

  it('skips a lift that cannot be judged and reads the next', () => {
    const fresh: Lift = { id: 'e0', exerciseId: 'dumbbell-bench-press', mode: 'estimate' };
    const returning: Lift = { id: 'e4', exerciseId: 'goblet-squat', mode: 'return' };
    expect(
      readStart(workout([fresh, returning, bench, row]), [
        logged('e0', 0, 2, 0),
        logged('e4', 0, 2, 0),
        logged('e1', 0, 4, 1),
        logged('e2', 0, 4, 1),
      ]),
    ).toEqual({ low: true, lifts: ['barbell-bench-press', 'barbell-row'] });
  });

  it('no evidence: a set heavier than asked, no reserve logged, a target set by hand, or a hold', () => {
    const byHand: Lift = { id: 'e5', exerciseId: 'barbell-curl' };
    const plank: Lift = { id: 'e6', exerciseId: 'plank', target: [[30, 45], 2, null] };
    const reading = readStart(workout([bench, row, byHand, plank, curl]), [
      logged('e1', 0, 3, 0, 110),
      logged('e2', 0, 3, null),
      logged('e5', 0, 3, 0, 100, { byHand: true }),
      logged('e6', 0, 10, 0, null),
      logged('e3', 0, 5, 0, 30),
    ]);
    // Only the curl could be judged, and two lifts are needed.
    expect(reading.low).toBe(false);
    // A hold short of a target of 10-12 s is still no evidence: with the bench short too, read
    // after it with the row, the start is not low.
    const shortHold: Lift = { id: 'e11', exerciseId: 'plank', target: [[10, 12], 2, null] };
    expect(
      readStart(workout([shortHold, bench, row]), [
        logged('e11', 0, 5, 0, null),
        logged('e1', 0, 4, 1),
        logged('e2', 0, 8, 2),
      ]).low,
    ).toBe(false);
  });

  it('a lighter set still short is evidence', () => {
    expect(
      readStart(workout([bench, row]), [logged('e1', 0, 4, 1, 90), logged('e2', 0, 4, 1, 95)]).low,
    ).toBe(true);
  });

  it('a lift done at bodyweight is read by its reps', () => {
    const pushUp: Lift = { id: 'e7', exerciseId: 'push-up', target: [[10, 15], 2, null] };
    expect(
      readStart(workout([pushUp, bench]), [logged('e7', 0, 9, 0, null), logged('e1', 0, 4, 1)]),
    ).toEqual({ low: true, lifts: ['push-up', 'barbell-bench-press'] });
    // With a load added to a bodyweight target, it was heavier than asked.
    expect(
      readStart(workout([pushUp, bench]), [logged('e7', 0, 9, 0, 25), logged('e1', 0, 4, 1)]).low,
    ).toBe(false);
  });

  it('orders the lifts by when their first set was logged, as a superset alternates', () => {
    const sets = [logged('e2', 0, 4, 1), logged('e1', 0, 8, 2), logged('e3', 0, 5, 0, 30)];
    // The row came first and fell short; the bench came second and did not.
    expect(readStart(workout([bench, row, curl]), sets).low).toBe(false);
  });

  it('skipped sets and warm-ups say nothing', () => {
    expect(
      readStart(workout([bench, row]), [
        logged('e1', 0, 0, null, null, { skipped: true }),
        logged('e1', 1, 3, 0, 100, { kind: 'warmup' }),
        logged('e2', 0, 3, 0),
      ]).low,
    ).toBe(false);
  });
});

describe('readStart after the review of item 42', () => {
  it('reads a set by what it was when logged: set by hand after it, it still counts', () => {
    // The lifter lowered the weight by hand after a bad first set: the lift is marked by hand now,
    // but its first set was the app's own target.
    const lowered: Lift = { ...bench, manual: { weight: true } };
    expect(
      readStart(workout([lowered, row]), [logged('e1', 0, 4, 1), logged('e2', 0, 4, 1)]).low,
    ).toBe(true);
    expect(
      readStart(workout([bench, row]), [
        logged('e1', 0, 4, 1, 100, { byHand: true }),
        logged('e2', 0, 4, 1),
      ]).low,
    ).toBe(false);
  });

  it(`leaves sets asked for more than ${JUDGED_REPS} reps to failure unjudged: reserve is misjudged there`, () => {
    const light: Lift = {
      id: 'e8',
      exerciseId: 'cable-curl',
      target: [[15, 20], 2, 15],
    };
    // 10-12 at 2 in reserve asks twelve reps to failure: judged. 12-15 at 2 asks fourteen: not.
    const at12: Lift = { id: 'e9', exerciseId: 'dumbbell-curl', target: [[10, 12], 2, 25] };
    const at14: Lift = { id: 'e12', exerciseId: 'dumbbell-curl', target: [[12, 15], 2, 25] };
    expect(
      readStart(workout([at14, bench, row]), [
        logged('e12', 0, 10, 1, 25),
        logged('e1', 0, 4, 1),
        logged('e2', 0, 8, 2),
      ]).low,
    ).toBe(false);
    // The light lift would read four short; with the bench short too it would read low.
    expect(
      readStart(workout([light, bench, row]), [
        logged('e8', 0, 12, 1, 15),
        logged('e1', 0, 4, 1),
        logged('e2', 0, 8, 2),
      ]).low,
    ).toBe(false);
    expect(
      readStart(workout([at12, row]), [logged('e9', 0, 8, 1, 25), logged('e2', 0, 4, 1)]).low,
    ).toBe(true);
  });

  it('leaves a lift whose target came from a session under its floor unjudged: at bodyweight it would read every session', () => {
    const pushUp: Lift = { id: 'e7', exerciseId: 'push-up', target: [[10, 15], 2, null] };
    const missed: Lift = { ...pushUp, missed: true };
    const sets = [logged('e7', 0, 7, 1, null), logged('e1', 0, 4, 1), logged('e2', 0, 4, 1)];
    // Read with the bench and the row instead: still a hard start, from them.
    expect(readStart(workout([missed, bench, row]), sets)).toEqual({
      low: true,
      lifts: ['barbell-bench-press', 'barbell-row'],
    });
    expect(readStart(workout([missed, bench]), sets.slice(0, 2)).low).toBe(false);
    // Read from a session that reached its floor, it is read as ever.
    expect(readStart(workout([pushUp, bench]), sets.slice(0, 2)).low).toBe(true);
  });

  it('leaves a lift whose target an entered max raised unjudged: the max may ask more than the lift has', () => {
    const raised: Lift = { ...bench, fromMax: true };
    const sets = [logged('e1', 0, 4, 1), logged('e2', 0, 4, 1)];
    expect(readStart(workout([raised, row]), sets).low).toBe(false);
    expect(readStart(workout([bench, row]), sets).low).toBe(true);
  });

  it("reads what the plan asked: no reserve the day's settings added counts against a set", () => {
    // The plan asks 6 at 2 (8); the target carries an extra rep for the day (3). Logged 6 at 0 is
    // two short of the plan's 8, not three short of 9, whenever the day's settings came in.
    const easedWorkout = workout([
      { ...bench, target: [[6, 10], 3, 100] },
      { ...row, target: [[6, 10], 3, 100] },
    ]);
    expect(readStart(easedWorkout, [logged('e1', 0, 6, 0), logged('e2', 0, 6, 0)]).low).toBe(false);
    expect(readStart(easedWorkout, [logged('e1', 0, 5, 0), logged('e2', 0, 5, 0)]).low).toBe(true);
    // A target asking less reserve than the plan (a harder day) is read as it asks.
    const harder = workout([
      { ...bench, target: [[6, 10], 1, 100] },
      { ...row, target: [[6, 10], 1, 100] },
    ]);
    expect(readStart(harder, [logged('e1', 0, 4, 0), logged('e2', 0, 4, 0)]).low).toBe(true);
    expect(readStart(harder, [logged('e1', 0, 5, 0), logged('e2', 0, 5, 0)]).low).toBe(false);
    // Where the plan itself asks less reserve than the target carries, the plan's is read.
    plan.rir = 1;
    const usual = workout([bench, row]);
    expect(readStart(usual, [logged('e1', 0, 4, 1), logged('e2', 0, 4, 1)]).low).toBe(false);
    expect(readStart(usual, [logged('e1', 0, 4, 0), logged('e2', 0, 4, 0)]).low).toBe(true);
  });

  it('takes one reading for each place in the plan: a stand-in for a lift begun is no second', () => {
    const slotted: Lift = { ...bench, slot: 1 };
    const standIn: Lift = {
      id: 'e10',
      exerciseId: 'dumbbell-bench-press',
      slot: 1,
      target: [[6, 10], 2, 40],
    };
    const sets = [logged('e1', 0, 4, 1), logged('e10', 0, 4, 1, 40), logged('e2', 0, 8, 2)];
    expect(readStart(workout([slotted, standIn, row]), sets).low).toBe(false);
    // Known by what it replaced when the plan gives no place.
    const named: Lift = { ...standIn, slot: undefined, replacedFrom: 'barbell-bench-press' };
    expect(readStart(workout([bench, named, row]), sets).low).toBe(false);
    // Two lifts of their own, both short, still read low.
    expect(
      readStart(workout([bench, standIn, row]), [logged('e1', 0, 4, 1), logged('e10', 0, 4, 1, 40)])
        .low,
    ).toBe(true);
  });

  it('says a reading in one word, the lifts in any order', () => {
    expect(startKey({ low: true, lifts: ['barbell-bench-press', 'barbell-row'] })).toBe(
      'low:barbell-bench-press,barbell-row',
    );
    // A first set deleted and logged again changes the order begun, not the reading (the third
    // pass of item 42: an Undo of the hard start came back).
    expect(startKey({ low: true, lifts: ['barbell-row', 'barbell-bench-press'] })).toBe(
      'low:barbell-bench-press,barbell-row',
    );
    expect(startKey({ low: false, lifts: [] })).toBe('plan');
  });
});

describe('readStart after the third pass of item 42', () => {
  it("reads a set against the plan's reserve as it stood when the set was logged", () => {
    // The plan now asks 2 in reserve; when these were logged it asked 1. Logged 4 at 1 is two
    // short of 6 at 1, not three short of 6 at 2: a style changed since does not re-read it.
    const sets = [
      logged('e1', 0, 4, 1, 100, { planRir: 1 }),
      logged('e2', 0, 4, 1, 100, { planRir: 1 }),
    ];
    expect(readStart(workout([bench, row]), sets).low).toBe(false);
    expect(
      readStart(workout([bench, row]), [logged('e1', 0, 4, 1), logged('e2', 0, 4, 1)]).low,
    ).toBe(true);
  });

  it("leaves a saved workout's targets unjudged: they are the day it was saved's", () => {
    const sets = [logged('e1', 0, 4, 1), logged('e2', 0, 4, 1)];
    expect(readStart(workout([{ ...bench, saved: true }, row]), sets).low).toBe(false);
    expect(readStart(workout([bench, row]), sets).low).toBe(true);
  });
});

describe('readStart after the fourth pass of item 42', () => {
  it('leaves a target read from another rep range unjudged', () => {
    const sets = [logged('e1', 0, 4, 1), logged('e2', 0, 4, 1)];
    expect(readStart(workout([{ ...bench, otherRange: true }, row]), sets).low).toBe(false);
    expect(readStart(workout([bench, row]), sets).low).toBe(true);
  });
});
