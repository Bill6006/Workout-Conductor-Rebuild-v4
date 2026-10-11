import { describe, expect, it } from 'vitest';
import { getExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import type { WorkoutBlock, WorkoutEntry } from '../workout/types';
import {
  RESERVE_CHECK,
  currentRun,
  loggedReserveOf,
  readReserve,
  readingError,
  readingLine,
  reserveCheckSet,
  reserveCheckStatus,
  reserveEstimate,
  reserveReadings,
  suitsReserveCheck,
  takesReserveCheck,
  withReadReserve,
  type ReserveReading,
} from './reserveCheck';

const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(Date.parse(RECORD_NOW) - daysAgo * DAY).toISOString();

/** A workout whose last set of `exerciseId` went on to failure: `stop` reps at `judged`, `total` in all. */
function checked(
  daysAgo: number,
  stop: number,
  judged: number | null,
  total: number,
  options: {
    exerciseId?: string;
    weight?: number;
    failedEarly?: boolean;
    stopped?: boolean;
    style?: string;
    id?: string;
  } = {},
): WorkoutRecord {
  const exerciseId = options.exerciseId ?? 'cable-curl';
  const made = record(
    daysAgo,
    exerciseId,
    [
      [12, options.weight ?? 40, 1],
      [stop, options.weight ?? 40, judged],
    ],
    [10, 15],
    1,
  );
  const entry = made.entries[0]!;
  const last = entry.sets[1]!;
  entry.sets[1] = {
    ...last,
    reserveCheck: {
      total,
      ...(options.failedEarly ? { failedEarly: true } : {}),
      ...(options.stopped ? { stopped: true } : {}),
      style: options.style ?? 'hybrid',
    },
  };
  return { ...made, id: options.id ?? `w-check-${daysAgo}-${exerciseId}` };
}

function reading(overrides: Partial<ReserveReading> = {}): ReserveReading {
  return {
    exerciseId: 'cable-curl',
    recordId: 'w-1',
    at: at(3),
    weight: 40,
    stop: 12,
    judged: 1,
    total: 14,
    failedEarly: false,
    stopped: false,
    style: 'hybrid',
    ...overrides,
  };
}

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createDefaultProfile(RECORD_NOW), reserveCheck: true, ...overrides };
}

describe('which lifts a reserve check suits', () => {
  it('takes one-joint lifts on a machine or a cable stack, counted in reps', () => {
    for (const id of [
      'cable-curl',
      'leg-extension',
      'leg-curl',
      'pec-deck',
      'cable-triceps-pushdown',
    ]) {
      expect(suitsReserveCheck(getExercise(id)), id).toBe(true);
    }
  });

  it('never a free weight, a multi-joint lift, a corrective move or a bench dip', () => {
    for (const id of [
      'barbell-bench-press',
      'ez-bar-curl',
      'dumbbell-curl',
      'lateral-raise',
      'leg-press',
      'lat-pulldown',
      'face-pull',
      'pallof-press',
      'bench-dip',
    ]) {
      const exercise = getExercise(id);
      if (!exercise) continue;
      expect(suitsReserveCheck(exercise), id).toBe(false);
    }
    expect(suitsReserveCheck(undefined)).toBe(false);
  });
});

describe('the readings in the log', () => {
  it('reads each check with its stop, judgement and reps in all, oldest first', () => {
    const readings = reserveReadings([checked(2, 12, 1, 15), checked(9, 11, 2, 14)]);
    expect(readings.map((one) => [one.stop, one.judged, one.total])).toEqual([
      [11, 2, 14],
      [12, 1, 15],
    ]);
    expect(readings[0]!.style).toBe('hybrid');
  });

  it('leaves out a set with no check, a warm-up and a set not completed', () => {
    const made = checked(2, 12, 1, 15);
    const entry = made.entries[0]!;
    entry.sets[0] = { ...entry.sets[0]!, kind: 'warmup', reserveCheck: { total: 20 } };
    entry.sets[1] = { ...entry.sets[1]!, completed: false };
    expect(reserveReadings([made, record(1, 'cable-curl', [[12, 40, 1]])])).toEqual([]);
  });
});

describe('the error a reading shows', () => {
  it('is the reps left at the stop less the reserve judged there', () => {
    expect(readingError(reading({ stop: 12, judged: 1, total: 15 }))).toBe(2);
    expect(readingError(reading({ stop: 12, judged: 3, total: 14 }))).toBe(-1);
    expect(readingError(reading({ stop: 12, judged: 2, total: 14 }))).toBe(0);
  });

  it('says nothing when it stalled early, was stopped, or had no judgement', () => {
    expect(readingError(reading({ failedEarly: true }))).toBeNull();
    expect(readingError(reading({ stopped: true }))).toBeNull();
    expect(readingError(reading({ judged: null }))).toBeNull();
  });

  it('says nothing past twenty reps in all, under the stop, or on a lift it does not suit', () => {
    expect(readingError(reading({ total: RESERVE_CHECK.MAX_TOTAL + 1 }))).toBeNull();
    expect(readingError(reading({ total: RESERVE_CHECK.MAX_TOTAL }))).not.toBeNull();
    expect(readingError(reading({ stop: 12, total: 11 }))).toBeNull();
    expect(readingError(reading({ exerciseId: 'dumbbell-curl' }))).toBeNull();
  });
});

describe('the run of readings an estimate uses', () => {
  const now = RECORD_NOW;

  it('starts after a reset', () => {
    const readings = [reading({ at: at(20) }), reading({ at: at(10) }), reading({ at: at(2) })];
    expect(currentRun(readings, { now, style: 'hybrid', resetAt: at(15) })).toHaveLength(2);
  });

  it('starts after a reading under another style', () => {
    const readings = [
      reading({ at: at(20) }),
      reading({ at: at(10), style: 'strength-focus' }),
      reading({ at: at(2) }),
    ];
    expect(currentRun(readings, { now, style: 'hybrid' }).map((one) => one.at)).toEqual([at(2)]);
  });

  it('starts again after six weeks with no reading, and is empty six weeks after the last', () => {
    const gap = RESERVE_CHECK.RESTART_DAYS;
    const readings = [
      reading({ at: at(gap + 30) }),
      reading({ at: at(29) }),
      reading({ at: at(2) }),
    ];
    expect(currentRun(readings, { now, style: 'hybrid' })).toHaveLength(2);
    expect(currentRun([reading({ at: at(gap) })], { now, style: 'hybrid' })).toEqual([]);
    expect(currentRun([reading({ at: at(gap - 1) })], { now, style: 'hybrid' })).toHaveLength(1);
  });
});

describe("the estimate of a lifter's error", () => {
  const run = (errors: number[], total = 14) =>
    errors.map((error, index) =>
      reading({ at: at(30 - index), stop: 12, total, judged: total - 12 - error }),
    );

  it("starts at the population's lean with no readings, and acts on nothing", () => {
    const estimate = reserveEstimate([]);
    expect(estimate.bias).toBeCloseTo(RESERVE_CHECK.POPULATION_UNDER, 6);
    expect(estimate.usable).toBe(false);
    expect(estimate.correction).toBe(0);
    expect(estimate.band).toBeNull();
    expect(estimate.mean).toBeNull();
  });

  it('acts from four readings, about half a rep sure', () => {
    expect(reserveEstimate(run([2, 2, 2])).usable).toBe(false);
    const four = reserveEstimate(run([2, 2, 2, 2]));
    expect(four.usable).toBe(true);
    expect(four.sd).toBeCloseTo(1 / Math.sqrt(5), 6);
    expect(four.bias).toBeCloseTo((0.95 + 8) / 5, 6);
    expect(four.correction).toBe(2);
  });

  it('is drawn toward the population: four exact readings correct nothing', () => {
    const exact = reserveEstimate(run([0, 0, 0, 0]));
    expect(exact.bias).toBeCloseTo(0.95 / 5, 6);
    expect(exact.correction).toBe(0);
  });

  it('corrects the other way for a lifter who has fewer left than judged, and never past two', () => {
    expect(reserveEstimate(run([-2, -2, -2, -2])).correction).toBe(-1);
    expect(reserveEstimate(run([5, 5, 5, 5, 5])).correction).toBe(RESERVE_CHECK.MAX_CORRECTION);
    expect(reserveEstimate(run([-6, -6, -6, -6, -6])).correction).toBe(
      -RESERVE_CHECK.MAX_CORRECTION,
    );
  });

  it('keeps the latest eight, and acts on none that scatter wider than two reps', () => {
    const many = reserveEstimate(run([5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0]));
    expect(many.readings).toBe(RESERVE_CHECK.LATEST_READINGS);
    expect(many.mean).toBe(0);
    const scattered = reserveEstimate(run([4, -2, 4, -2]));
    expect(scattered.scatter).toBeGreaterThan(RESERVE_CHECK.MAX_SCATTER);
    expect(scattered.usable).toBe(false);
    expect(scattered.correction).toBe(0);
    const steady = reserveEstimate(run([3, 1, 3, 1]));
    expect(steady.scatter).toBeLessThanOrEqual(RESERVE_CHECK.MAX_SCATTER);
    expect(steady.usable).toBe(true);
  });

  it('counts only readings that can say, and spans the reps in all the lifter believed', () => {
    const estimate = reserveEstimate([
      ...run([1, 1], 13),
      ...run([1, 1], 16),
      reading({ failedEarly: true, total: 9 }),
      reading({ stopped: true, total: 30 }),
    ]);
    expect(estimate.readings).toBe(4);
    // Believed: 12 at the stop with 0 judged (13 in all), and 12 with 3 judged (16 in all).
    expect(estimate.band).toEqual([11, 16]);
  });
});

describe('when a check is due', () => {
  const status = (
    history: WorkoutRecord[],
    options: { profile?: UserProfile; now?: string } = {},
  ) =>
    reserveCheckStatus({
      history,
      profile: options.profile ?? profile(),
      now: options.now ?? RECORD_NOW,
    });

  it("is off without the lifter's yes, and under the styles that take nothing to failure", () => {
    expect(status([], { profile: profile({ reserveCheck: undefined }) }).on).toBe(false);
    expect(status([], { profile: profile({ reserveCheck: false }) }).due).toBe(false);
    for (const style of ['lean-down', 'foundation'] as const) {
      expect(status([], { profile: profile({ programStyle: style }) }).on, style).toBe(false);
    }
    expect(status([]).on).toBe(true);
    expect(status([]).due).toBe(true);
  });

  it('is due once a week while learning: not again in the week of the last check', () => {
    // RECORD_NOW is a Thursday: a check on Monday is this week's, one last Wednesday is not.
    expect(status([checked(3, 12, 1, 14)]).due).toBe(false);
    expect(status([checked(8, 12, 1, 14)]).due).toBe(true);
    expect(status([checked(8, 12, 1, 14)]).phase).toBe('learning');
  });

  it('counts a check that said nothing toward the week, but not toward the learning', () => {
    const history = [checked(3, 12, 1, 14, { stopped: true })];
    expect(status(history).due).toBe(false);
    expect(status(history).estimate.readings).toBe(0);
  });

  it('keeps one every four weeks once five readings are in', () => {
    const five = [35, 28, 21, 14, 7].map((days) => checked(days + 20, 12, 1, 14));
    const keeping = status(five);
    expect(keeping.phase).toBe('keeping');
    expect(keeping.due).toBe(false);
    const later = status(five, {
      now: new Date(Date.parse(RECORD_NOW) + 2 * DAY).toISOString(),
    });
    expect(later.due).toBe(true);
  });
});

function entry(exerciseId: string, overrides: Partial<WorkoutEntry> = {}): WorkoutEntry {
  return {
    id: `e-${exerciseId}`,
    exerciseId,
    role: 'isolation',
    sets: [0, 1, 2].map((index) => ({
      index,
      kind: 'working' as const,
      targetReps: [10, 15] as [number, number],
      targetRir: 1,
      targetWeight: 40,
      restSeconds: 60,
    })),
    restSeconds: 60,
    warmupSets: 0,
    dropSet: false,
    chosenFor: [],
    locked: false,
    pinned: false,
    ...overrides,
  };
}

function straight(...entries: WorkoutEntry[]): WorkoutBlock[] {
  return entries.map((one, index) => ({
    id: `b-${index}`,
    kind: 'straight' as const,
    label: one.exerciseId,
    rounds: one.sets.length,
    restSeconds: 60,
    entries: [one],
  })) as unknown as WorkoutBlock[];
}

describe('the set a check goes on', () => {
  const quiet = { deload: false, lowCheckIn: false, hardStart: false };
  const due = reserveCheckStatus({ history: [], profile: profile(), now: RECORD_NOW });
  const pick = (
    blocks: WorkoutBlock[],
    options: Partial<Parameters<typeof reserveCheckSet>[0]> = {},
  ) =>
    reserveCheckSet({ blocks, history: [], status: due, now: RECORD_NOW, day: quiet, ...options });

  it('takes the last working set of the first lift that suits a check', () => {
    const blocks = straight(
      entry('barbell-bench-press', { role: 'primary-strength' }),
      entry('cable-curl'),
    );
    expect(pick(blocks)).toEqual({
      entryId: 'e-cable-curl',
      setIndex: 2,
      exerciseId: 'cable-curl',
    });
  });

  it('takes none when none is due, or on a deload, a low check-in or a hard start', () => {
    const blocks = straight(entry('cable-curl'));
    expect(pick(blocks, { status: { ...due, due: false } })).toBeNull();
    expect(pick(blocks, { day: { ...quiet, deload: true } })).toBeNull();
    expect(pick(blocks, { day: { ...quiet, lowCheckIn: true } })).toBeNull();
    expect(pick(blocks, { day: { ...quiet, hardStart: true } })).toBeNull();
  });

  it('takes none in the first session back after three weeks', () => {
    const blocks = straight(entry('cable-curl'));
    expect(
      pick(blocks, { history: [record(RESERVE_CHECK.RETURN_DAYS, 'cable-curl', [[12, 40, 1]])] }),
    ).toBeNull();
    expect(
      pick(blocks, {
        history: [record(RESERVE_CHECK.RETURN_DAYS - 1, 'cable-curl', [[12, 40, 1]])],
      }),
    ).not.toBeNull();
  });

  it('skips a set whose stop is far from failure, a corrective role and a lift in a circuit', () => {
    const far = entry('leg-extension', {
      sets: entry('leg-extension').sets.map((set) => ({
        ...set,
        targetReps: [13, 20] as [number, number],
      })),
    });
    expect(takesReserveCheck(far)).toBe(false);
    expect(takesReserveCheck(entry('leg-extension', { role: 'corrective' }))).toBe(false);
    const grouped = (kind: string) =>
      [
        {
          id: 'b-pair',
          kind,
          label: 'pair',
          rounds: 3,
          restSeconds: 60,
          entries: [entry('cable-curl'), entry('cable-triceps-pushdown')],
        },
      ] as unknown as WorkoutBlock[];
    expect(pick(grouped('circuit'))).toBeNull();
    // A superset's last set takes one: its lifts work other muscles.
    expect(pick(grouped('superset'))?.exerciseId).toBe('cable-curl');
  });

  it('prefers a lift whose reading would pair for its curve, then the one done most often lately', () => {
    const blocks = straight(entry('cable-curl'), entry('leg-extension'));
    expect(
      pick(blocks, { pairs: (exerciseId) => exerciseId === 'leg-extension' })?.exerciseId,
    ).toBe('leg-extension');
    // Two sessions of leg extensions lately against one of cable curls: the extensions gather it.
    const history = [
      record(10, 'leg-extension', [[12, 60, 1]]),
      record(17, 'leg-extension', [[12, 60, 1]]),
      record(12, 'cable-curl', [[12, 40, 1]]),
      record(90, 'cable-curl', [[12, 40, 1]]),
      record(91, 'cable-curl', [[12, 40, 1]]),
    ].map((made, index) => ({ ...made, id: `w-${index}` }));
    expect(pick(blocks, { history })?.exerciseId).toBe('leg-extension');
    // With none logged, the first in the plan.
    expect(pick(blocks)?.exerciseId).toBe('cable-curl');
  });
});

describe('the reserve the rules read', () => {
  const estimate = { correction: 2, band: [12, 17] as [number, number] };
  const curl = getExercise('cable-curl');

  it("adds the lifter's error to a set it covers", () => {
    expect(readReserve(curl, 12, 1, estimate)).toBe(3);
    expect(readReserve(curl, 11, 6, estimate)).toBe(8);
  });

  it('reads as logged outside its reps, on another kind of lift, with no estimate, or no reserve', () => {
    expect(readReserve(curl, 6, 2, estimate)).toBe(2);
    expect(readReserve(curl, 16, 2, estimate)).toBe(2);
    expect(readReserve(getExercise('barbell-bench-press'), 12, 1, estimate)).toBe(1);
    expect(readReserve(curl, 12, 1, null)).toBe(1);
    expect(readReserve(curl, 12, 1, { correction: 0, band: [12, 17] })).toBe(1);
    expect(readReserve(curl, 12, null, estimate)).toBeNull();
  });

  it('never reads under nothing in reserve or over ten', () => {
    expect(readReserve(curl, 13, 0, { correction: -2, band: [12, 17] })).toBe(0);
  });

  it('gives the rules a view of the log and leaves the log itself as it was', () => {
    const history = [
      record(3, 'cable-curl', [
        [12, 40, 1],
        [12, 40, 2],
      ]),
      record(4, 'barbell-bench-press', [[5, 185, 1]]),
    ];
    const before = JSON.stringify(history);
    const view = withReadReserve(history, estimate);
    expect(view[0]!.entries[0]!.sets.map((set) => set.rir)).toEqual([3, 4]);
    expect(view[1]).toBe(history[1]);
    expect(JSON.stringify(history)).toBe(before);
    expect(withReadReserve(history, { correction: 0, band: [12, 17] })).toBe(history);
  });

  it("reads a check set's own reserve as it measured it, and keeps what was logged beside it", () => {
    const view = withReadReserve(
      [
        checked(3, 12, 1, 16),
        checked(4, 12, 0, 12, { failedEarly: true }),
        checked(5, 12, 1, 12, { stopped: true }),
      ],
      estimate,
    );
    // The ordinary set reads through the error (1 + 2); the check set as it measured: 4 left.
    const first = view[0]!.entries[0]!.sets;
    expect(first.map((set) => set.rir)).toEqual([3, 4]);
    expect(first.map((set) => loggedReserveOf(set))).toEqual([1, 1]);
    // Stalled before the stop: taken to failure there, nothing in reserve, whatever the error.
    expect(view[1]!.entries[0]!.sets[1]!.rir).toBe(0);
    // Stopped for pain or form: nothing measured, read as any set.
    expect(view[2]!.entries[0]!.sets[1]!.rir).toBe(3);
  });
});

describe('what a reading says', () => {
  it('names the reps left against the reserve judged', () => {
    expect(
      readingLine({ stop: 12, judged: 1, total: 15, failedEarly: false, stopped: false }),
    ).toBe('You judged 1 left at 12 and did 15 in all: 3 were left, 2 reps more than you judged.');
    expect(
      readingLine({ stop: 12, judged: 0, total: 13, failedEarly: false, stopped: false }),
    ).toBe('You judged 0 left at 12 and did 13 in all: 1 was left, 1 rep more than you judged.');
    expect(
      readingLine({ stop: 12, judged: 3, total: 14, failedEarly: false, stopped: false }),
    ).toBe('You judged 3 left at 12 and did 14 in all: 2 were left, 1 rep fewer than you judged.');
    expect(
      readingLine({ stop: 12, judged: 2, total: 14, failedEarly: false, stopped: false }),
    ).toBe('You judged 2 left at 12 and did 14 in all: exactly right.');
  });

  it('says plainly when there was nothing to check', () => {
    expect(
      readingLine({ stop: 9, judged: null, total: 9, failedEarly: true, stopped: false }),
    ).toBe('9 reps to failure, before your usual stop: no judgement to check this time.');
    expect(readingLine({ stop: 8, judged: 2, total: 8, failedEarly: false, stopped: true })).toBe(
      'Stopped before failure: this check counts for nothing.',
    );
  });

  it('says a reading it cannot use counts for nothing, and never reads it out', () => {
    expect(
      readingLine({ stop: 12, judged: 1, total: 10, failedEarly: false, stopped: false }),
    ).toBe('Fewer reps in all than at your stop: this check counts for nothing.');
    expect(
      readingLine({ stop: 12, judged: 1, total: 24, failedEarly: false, stopped: false }),
    ).toBe(
      '24 reps in all, past 20: a set that long says little about judging reserve, so this check counts for nothing.',
    );
  });
});
