import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import {
  LEARNING,
  RECOVERY,
  againstRested,
  dayRecovery,
  learnedWindows,
  readFirstSet,
  recoveryWindows,
  setMax,
} from './recovery';

/**
 * Maintenance 33 (docs/research/recovery-time-course.md): what the lifter's own sessions teach of a
 * muscle's window, within bounds; the rested sessions a first set is read against, each set read
 * against what it asked; a set logged with no reserve read at its target's; and the whole-body layer
 * of a run of hard days with energy low. Synthetic data only.
 */

const HOUR = 3_600_000;
const sets = (count: number, reps: number, rir: number | null, weight = 200): SetSpec[] =>
  Array.from({ length: count }, () => [reps, weight, rir] as SetSpec);

/** A session `hoursAgo` before RECORD_NOW. */
function session(
  hoursAgo: number,
  exerciseId: string,
  spec: SetSpec[],
  extra: Partial<WorkoutRecord> = {},
): WorkoutRecord {
  const done = record(hoursAgo / 24, exerciseId, spec, [4, 6], 1, extra);
  return { ...done, id: `s-${exerciseId}-${hoursAgo}` };
}

/** A session's sets with the load each asked (`record` saves none). */
const asking = (done: WorkoutRecord, weight: number, reps?: [number, number], rir?: number) => ({
  ...done,
  entries: done.entries.map((entry) => ({
    ...entry,
    sets: entry.sets.map((set) => ({
      ...set,
      targetWeight: weight,
      ...(reps ? { targetReps: reps } : {}),
      ...(rir !== undefined ? { targetRir: rir } : {}),
    })),
  })),
});

/**
 * Bench press sessions a rep short of failure (a 36 h window for the chest): four rested ones to
 * start, then five rounds of a rested session and one a day after it, the first set of the early
 * ones at `early` lb against 200 rested.
 */
function series(early: number, extra: (rested: boolean) => Partial<WorkoutRecord> = () => ({})) {
  const plan: { at: number; rested: boolean }[] = [];
  let t = 0;
  for (let i = 0; i < 4; i += 1) {
    plan.push({ at: t, rested: true });
    t += 72;
  }
  for (let i = 0; i < 5; i += 1) {
    plan.push({ at: t, rested: true });
    plan.push({ at: t + 24, rested: false });
    t += 24 + 72;
  }
  const end = t - 72;
  return plan.map(({ at, rested }) =>
    session(
      end - at + 48,
      'barbell-bench-press',
      sets(3, 5, 1, rested ? 200 : early),
      extra(rested),
    ),
  );
}

describe('a set read as a max', () => {
  it('load × (1 + (reps + reserve) / 30), only where reps and reserve read well', () => {
    expect(setMax({ reps: 5, weight: 200, rir: 1 })).toBe(240);
    expect(setMax({ reps: 13, weight: 100, rir: 1 })).toBeNull();
    expect(setMax({ reps: 5, weight: 200, rir: 4 })).toBeNull();
    expect(setMax({ reps: 5, weight: null, rir: 1 })).toBeNull();
    expect(setMax({ reps: 5, weight: 200, rir: null })).toBeNull();
  });
});

describe('a first set against the rested sessions', () => {
  const at200 = readFirstSet({ reps: 5, weight: 200, rir: 1 })!;

  it('the median against the last rested first sets, never one back inside its window', () => {
    const history = series(150);
    const last = history.at(-1)!;
    // Before the last early session: rested sessions at 240 each; the early ones at 180 are not read.
    expect(againstRested(at200, 'barbell-bench-press', history, last.startedAt)).toBe(1);
    const at150 = readFirstSet({ reps: 5, weight: 150, rir: 1 })!;
    expect(againstRested(at150, 'barbell-bench-press', history, last.startedAt)).toBe(0.75);
    // After it, three of the last five sessions are early ones at 180: still the rested ones.
    expect(againstRested(at200, 'barbell-bench-press', history, RECORD_NOW)).toBe(1);
  });

  it('none from fewer than three rested sessions', () => {
    const history = [
      session(200, 'barbell-bench-press', sets(3, 5, 1)),
      session(100, 'barbell-bench-press', sets(3, 5, 1)),
    ];
    expect(againstRested(at200, 'barbell-bench-press', history, RECORD_NOW)).toBeNull();
  });

  // The first review of Maintenance 33: a deload's first set lifted as asked read 11% under.
  const rested = [300, 200, 100].map((hoursAgo) =>
    asking(session(hoursAgo, 'barbell-bench-press', sets(3, 5, 1)), 200),
  );
  const asked = (reps: number, weight: number, rir: number, target: number, targetRir: number) =>
    readFirstSet({
      reps,
      weight,
      rir,
      targetWeight: target,
      targetReps: [4, 6],
      targetRir,
    })!;

  it('at the same ask, as lifted: fewer reps are a fall', () => {
    expect(againstRested(asked(5, 200, 1, 200, 1), 'barbell-bench-press', rested, RECORD_NOW)).toBe(
      1,
    );
    // 200 x (1 + 4 / 30) against 240.
    expect(
      againstRested(asked(3, 200, 1, 200, 1), 'barbell-bench-press', rested, RECORD_NOW),
    ).toBeCloseTo(226.67 / 240, 3);
  });

  it('at an ask the plan made lighter, lifted as asked anywhere in its range: no fall', () => {
    // A deload's 180 for 4-6 at 2 in reserve: 4 reps, or 6.
    for (const reps of [4, 6]) {
      expect(
        againstRested(asked(reps, 180, 2, 180, 2), 'barbell-bench-press', rested, RECORD_NOW),
      ).toBe(1);
    }
  });

  it('short of an ask the plan made lighter: the shortfall', () => {
    // Two reps at 180, 2 in reserve, on 4-6 asked: 180 x (1 + 4 / 30) against 180 x (1 + 6 / 30).
    expect(
      againstRested(asked(2, 180, 2, 180, 2), 'barbell-bench-press', rested, RECORD_NOW),
    ).toBeCloseTo(204 / 216, 3);
    // A rep less in reserve than asked: a rep short.
    expect(
      againstRested(asked(4, 180, 1, 180, 2), 'barbell-bench-press', rested, RECORD_NOW),
    ).toBeCloseTo(210 / 216, 3);
  });

  it('a set with no load asked is read only against such', () => {
    expect(againstRested(at200, 'barbell-bench-press', rested, RECORD_NOW)).toBeNull();
  });
});

describe('learned windows', () => {
  it('early sessions as strong as rested ones: half a day shorter', () => {
    const history = series(200);
    const learned = learnedWindows(history).get('chest')!;
    expect(learned).toMatchObject({ shift: -LEARNING.STEP_HOURS, early: 5 });
    expect(learned.rested).toBeGreaterThanOrEqual(LEARNING.LEAST);
    const window = recoveryWindows(history).get('chest')!;
    expect(window.prior).toBe(36);
    expect(window.hours).toBe(24);
    expect(window.reasons.join(' ')).toContain('your own sessions: 12 h less');
  });

  it('early sessions 5% or more weaker: half a day longer', () => {
    const history = series(185);
    expect(learnedWindows(history).get('chest')?.shift).toBe(LEARNING.STEP_HOURS);
    expect(recoveryWindows(history).get('chest')?.hours).toBe(48);
  });

  it('early sessions the plan asked less of, lifted as asked: nothing slower', () => {
    // Each early session asked 185 (a deload, a lift later in the session) and lifted so.
    const history = series(185).map((done) =>
      asking(done, done.entries[0]!.sets[0]!.weight as number),
    );
    expect(learnedWindows(history).get('chest')?.shift).toBe(-LEARNING.STEP_HOURS);
  });

  it('early sessions short of the same ask: half a day longer', () => {
    const history = series(185).map((done) => asking(done, 200));
    expect(learnedWindows(history).get('chest')?.shift).toBe(LEARNING.STEP_HOURS);
  });

  it('between the two: as estimated', () => {
    const history = series(195);
    expect(learnedWindows(history).get('chest')?.shift).toBe(0);
    expect(recoveryWindows(history).get('chest')?.hours).toBe(36);
  });

  it('fewer than five of each: as estimated', () => {
    const history = series(200).slice(0, -2);
    expect(learnedWindows(history).get('chest')?.shift).toBe(0);
  });

  it('days ill or after a short night are left out', () => {
    const history = series(200, (rested) =>
      rested
        ? {}
        : {
            readiness: {
              energy: 3,
              soreness: 2,
              sleep: 2,
              motivation: 3,
              jointDiscomfort: [],
              timePressure: false,
            },
          },
    );
    expect(learnedWindows(history).get('chest')?.early ?? 0).toBe(0);
    expect(recoveryWindows(history).get('chest')?.hours).toBe(36);
  });

  it('a reset of the learned windows reads only what was logged after it', () => {
    const history = series(200);
    expect(learnedWindows(history, { recovery: RECORD_NOW }).get('chest')?.shift ?? 0).toBe(0);
    expect(recoveryWindows(history, { resets: { recovery: RECORD_NOW } }).get('chest')?.hours).toBe(
      36,
    );
  });

  it('is read once for a log and a reset, and again for a log that changed', () => {
    // The coach reads the windows each minute: what the sessions taught is kept with the log.
    const history = series(200);
    const learned = learnedWindows(history);
    expect(learnedWindows(history)).toBe(learned);
    expect(learnedWindows(history, { recovery: RECORD_NOW })).not.toBe(learned);
    expect(learnedWindows(history, { recovery: RECORD_NOW }).get('chest')?.shift ?? 0).toBe(0);
    const longer = [...history, session(1, 'barbell-row', sets(3, 8, 2))];
    expect(learnedWindows(longer)).not.toBe(learned);
    expect(learnedWindows(longer).get('chest')?.shift).toBe(learned.get('chest')?.shift);
    const at180 = readFirstSet({ reps: 5, weight: 180, rir: 1 })!;
    expect(againstRested(at180, 'barbell-bench-press', longer, RECORD_NOW)).toBe(
      againstRested(at180, 'barbell-bench-press', history, RECORD_NOW),
    );
  });

  it('within bounds: never past four days, never under half its estimate', () => {
    // Squats to failure, six sets: a 96 h window, the most a learned one may be.
    const squats = (weight: number) => sets(6, 5, 0, weight);
    const plan: { at: number; rested: boolean }[] = [];
    let t = 0;
    for (let i = 0; i < 4; i += 1) {
      plan.push({ at: t, rested: true });
      t += 120;
    }
    for (let i = 0; i < 5; i += 1) {
      plan.push({ at: t, rested: true });
      plan.push({ at: t + 48, rested: false });
      t += 48 + 120;
    }
    const end = t - 120;
    const history = plan.map(({ at, rested }) =>
      session(end - at + 48, 'back-squat', squats(rested ? 300 : 250)),
    );
    expect(learnedWindows(history).get('quads')?.shift).toBe(LEARNING.STEP_HOURS);
    const window = recoveryWindows(history).get('quads')!;
    expect(window.prior).toBe(96);
    expect(window.hours).toBe(96);
  });
});

describe('a set logged with no reserve', () => {
  it('is read at the reserve its target asked', () => {
    const history = [session(24, 'barbell-bench-press', sets(3, 5, null))];
    // The target asked 1 in reserve: a day and a half for the chest.
    expect(recoveryWindows(history).get('chest')?.hours).toBe(36);
  });
});

describe('the whole-body layer', () => {
  const day = (hoursAgo: number) => session(hoursAgo, 'barbell-row', sets(3, 6, 2, 135));

  it('three hard days running, energy low today: half a day more on every window', () => {
    const history = [day(72), day(48), day(24)];
    const windows = recoveryWindows(history, { lowEnergy: true, now: RECORD_NOW });
    expect(windows.get('lats')?.hours).toBe(36 + RECOVERY.SHORT_NIGHT_HOURS);
    expect(windows.get('lats')?.reasons.join(' ')).toContain('3 hard days running');
  });

  it("today's energy read off the check-in, as every reader of the day reads it", () => {
    const history = [day(72), day(48), day(24)];
    const exhausted = {
      energy: 1,
      soreness: 2,
      sleep: 3,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    const today = (readiness: typeof exhausted) =>
      recoveryWindows(history, dayRecovery({ readiness, history, now: RECORD_NOW, resets: null }));
    expect(today(exhausted).get('lats')?.hours).toBe(36 + RECOVERY.SHORT_NIGHT_HOURS);
    expect(today({ ...exhausted, energy: 3 }).get('lats')?.hours).toBe(36);
  });

  it('energy not low, or two days only: none', () => {
    const history = [day(72), day(48), day(24)];
    expect(recoveryWindows(history, { now: RECORD_NOW }).get('lats')?.hours).toBe(36);
    expect(
      recoveryWindows([day(48), day(24)], { lowEnergy: true, now: RECORD_NOW }).get('lats')?.hours,
    ).toBe(36);
  });

  it('light days are no hard days', () => {
    const light = (hoursAgo: number) => session(hoursAgo, 'barbell-row', sets(3, 6, 4, 95));
    const history = [light(72), light(48), day(24)];
    expect(recoveryWindows(history, { lowEnergy: true, now: RECORD_NOW }).get('lats')?.hours).toBe(
      36,
    );
  });

  it('a short night and a run of hard days: half a day once', () => {
    const history = [day(72), day(48), day(24)];
    const hours = recoveryWindows(history, {
      readiness: { sleep: 1 },
      lowEnergy: true,
      now: RECORD_NOW,
    }).get('lats')?.hours;
    expect(hours).toBe(36 + RECOVERY.SHORT_NIGHT_HOURS);
  });

  it('the record of hours since and a new history are read again', () => {
    const history = [day(24)];
    const before = recoveryWindows(history).get('lats')!;
    history.push(session(12, 'barbell-row', sets(3, 6, 0, 155)));
    const after = recoveryWindows(history).get('lats')!;
    expect(Date.parse(after.at) - Date.parse(before.at)).toBe(12 * HOUR);
    expect(after.hours).toBe(48);
  });
});
