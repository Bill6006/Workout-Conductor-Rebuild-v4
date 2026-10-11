import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { maxFromSet } from '../progression/maxes';
import {
  PUSH_PACE,
  dateCheck,
  paceReadings,
  pushPace,
  shortTwiceRunning,
  type PaceReading,
} from './pushPace';

/**
 * Maintenance 27, the owner's item 44: the pace toward a pushed lift's target, read from each
 * session's first working set, with a band from the lifter's own scatter.
 */

const DAY = 86_400_000;
const SINCE = '2026-06-01T12:00:00.000Z';
const day = (n: number) => new Date(Date.parse(SINCE) + n * DAY).toISOString();

function session(
  n: number,
  sets: { reps: number; weight: number | null; rir: number | null; completed?: boolean }[],
  options: { range?: [number, number]; targetRir?: number; exerciseId?: string } = {},
): WorkoutRecord {
  return {
    id: `w-${n}`,
    startedAt: day(n),
    completedAt: day(n),
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
        exerciseId: options.exerciseId ?? 'barbell-bench-press',
        sets: sets.map((set, index) => ({
          kind: 'working' as const,
          reps: set.reps,
          weight: set.weight,
          rir: set.rir,
          completed: set.completed ?? true,
          setIndex: index,
          targetReps: options.range ?? [4, 6],
          targetRir: options.targetRir ?? 2,
        })),
      },
    ],
  };
}

/** Readings twice a week for `weeks`, on a max growing `weekly`, with a fixed wobble. */
function trend(weeks: number, weekly: number, start = 200, wobble = 0.01): PaceReading[] {
  const out: PaceReading[] = [];
  for (let index = 0; index < weeks * 2; index += 1) {
    const n = Math.round(index * 3.5);
    const noise = (index % 3 === 0 ? 1 : index % 3 === 1 ? -1 : 0) * wobble;
    out.push({
      at: day(n),
      e1rm: start * (1 + weekly) ** (n / 7) * (1 + noise),
      range: '4-6',
    });
  }
  return out;
}

describe('the readings a pace is read from', () => {
  it("are each session's first completed working set, up to twelve reps and three in reserve", () => {
    const history = [
      session(-3, [{ reps: 5, weight: 185, rir: 2 }]),
      session(2, [
        { reps: 5, weight: 185, rir: 2, completed: false },
        { reps: 6, weight: 185, rir: 1 },
        { reps: 4, weight: 195, rir: 1 },
      ]),
      session(5, [{ reps: 13, weight: 135, rir: 1 }]),
      session(9, [{ reps: 5, weight: 185, rir: 4 }]),
      session(12, [{ reps: 5, weight: 185, rir: null }]),
      session(16, [{ reps: 8, weight: 165, rir: 2 }], { range: [6, 10] }),
    ];
    const readings = paceReadings(history, 'barbell-bench-press', SINCE);
    expect(readings.map((one) => one.e1rm)).toEqual([maxFromSet(185, 7), maxFromSet(165, 10)]);
    expect(readings.map((one) => one.range)).toEqual(['4-6', '6-10']);
  });
});

describe('the pace', () => {
  it('is nothing with no readings, and a baseline until six weeks and ten readings', () => {
    expect(pushPace({ readings: [], since: SINCE, now: day(10), target: 250 }).kind).toBe('none');
    const early = pushPace({
      readings: trend(4, 0.01),
      since: SINCE,
      now: day(28),
      target: 250,
    });
    expect(early).toMatchObject({ kind: 'baseline', readings: 8, sessionsToGo: 2, weeksToGo: 2 });
  });

  it('reads a steady gain, with a band that holds it', () => {
    const state = pushPace({
      readings: trend(8, 0.01),
      since: SINCE,
      now: day(56),
      target: 260,
    });
    expect(state.kind).toBe('pace');
    if (state.kind !== 'pace') return;
    expect(state.weekly).toBeCloseTo(0.01, 2);
    expect(state.low).toBeLessThan(0.01);
    expect(state.high).toBeGreaterThan(0.01);
    expect(state.current).toBeGreaterThan(210);
    expect(state.current).toBeLessThan(220);
  });

  it('keeps each rep range to its own level, so a lighter day does not read as a fall', () => {
    // Heavy days read a max 6% above the moderate days, alternating: a common line would wobble.
    const readings = trend(8, 0.01, 200, 0).map((one, index) =>
      index % 2 === 0 ? one : { ...one, e1rm: one.e1rm * 0.94, range: '6-10' },
    );
    const state = pushPace({ readings, since: SINCE, now: day(56), target: 260 });
    expect(state.kind).toBe('pace');
    if (state.kind === 'pace') expect(state.weekly).toBeCloseTo(0.01, 3);
  });

  it('projects within twelve weeks, past them names no date, and says when reached', () => {
    const near = pushPace({ readings: trend(8, 0.01), since: SINCE, now: day(56), target: 225 });
    expect(near.kind === 'pace' && near.projection.kind).toBe('within');
    const far = pushPace({ readings: trend(8, 0.01), since: SINCE, now: day(56), target: 300 });
    expect(far.kind === 'pace' && far.projection.kind).toBe('beyond');
    const reached = pushPace({
      readings: trend(8, 0.01),
      since: SINCE,
      now: day(56),
      target: 200,
    });
    expect(reached.kind === 'pace' && reached.projection.kind).toBe('reached');
  });

  it('is flat when the line falls, and waits for twelve weeks when the band is wider than it', () => {
    const falling = pushPace({
      readings: trend(8, -0.01),
      since: SINCE,
      now: day(56),
      target: 250,
    });
    expect(falling.kind === 'pace' && falling.projection.kind).toBe('flat');
    // Barely moving and noisy: the band is wider than the pace, so no pace until twelve weeks.
    const noisy = trend(8, 0.001, 200, 0.04);
    expect(pushPace({ readings: noisy, since: SINCE, now: day(56), target: 250 }).kind).toBe(
      'baseline',
    );
    expect(
      pushPace({
        readings: trend(PUSH_PACE.CLEAR_WEEKS, 0.001, 200, 0.04),
        since: SINCE,
        now: day(PUSH_PACE.CLEAR_WEEKS * 7),
        target: 250,
      }).kind,
    ).toBe('pace');
  });

  it('sets aside a reading far off even where the pace first shows, judged without it', () => {
    // Ten and twelve readings over six weeks, a pace of 1% a week; the newest a slip, either way.
    for (const [weeks, factor] of [
      [6, 10],
      [5, 0.75],
    ] as const) {
      const readings = trend(weeks, 0.01, 200, 0.005);
      const slipped = readings.map((one, index) =>
        index === readings.length - 1 ? { ...one, e1rm: one.e1rm * factor } : one,
      );
      const kept = pushPace({ readings: slipped, since: SINCE, now: day(42), target: 260 });
      expect(kept.kind, `${weeks} weeks, ${factor}`).toBe('pace');
      if (kept.kind === 'pace') {
        expect(kept.weekly, `${weeks} weeks, ${factor}`).toBeGreaterThan(0.005);
        expect(kept.weekly, `${weeks} weeks, ${factor}`).toBeLessThan(0.015);
      }
    }
  });

  it('counts no weeks before the push began, whatever the clock read', () => {
    // A screen's clock reads up to a minute late: just after the push is set, it is not yet set.
    const state = pushPace({
      readings: [{ at: day(0), e1rm: 228, range: '4-6' }],
      since: day(0),
      now: new Date(Date.parse(day(0)) - 30_000).toISOString(),
      target: 250,
    });
    expect(state.kind === 'baseline' && state.weeksToGo).toBe(PUSH_PACE.SHOW_WEEKS);
  });

  it('reads a lift logged the same every session as flat, not as rounding', () => {
    // The same set every session for six to sixteen weeks: the line is exactly flat (the re-check
    // of item 44: a band topping out at 2e-16 never read as flat, so the offer to end never came).
    for (const [weight, reps] of [
      [185, 5],
      [205, 3],
      [100, 8],
    ] as const) {
      for (const weeks of [6, 8, 10, 12, 14, 16]) {
        const readings = Array.from({ length: weeks * 3 }, (_, index) => ({
          at: day((index * 7) / 3),
          e1rm: maxFromSet(weight, reps + 2),
          range: '4-6',
        }));
        const state = pushPace({ readings, since: SINCE, now: day(weeks * 7), target: 300 });
        const where = `${weight} x ${reps}, ${weeks} weeks`;
        expect(state.kind, where).toBe('pace');
        if (state.kind === 'pace') {
          expect(state.high, where).toBe(0);
          expect(state.projection.kind, where).toBe('flat');
        }
      }
    }
  });

  it('keeps a real step after a stall logged the same every session', () => {
    // Six weeks of the same set, then five pounds more: 2%, inside a logged max's own noise, is
    // no slip (the re-check of item 44: it was set aside and the card stayed at the stall).
    const stall = maxFromSet(185, 7);
    const readings = [
      ...Array.from({ length: 18 }, (_, index) => ({
        at: day((index * 7) / 3),
        e1rm: stall,
        range: '4-6',
      })),
      { at: day(42), e1rm: maxFromSet(190, 7), range: '4-6' },
    ];
    const state = pushPace({ readings, since: SINCE, now: day(42), target: 250 });
    const current = state.kind === 'pace' || state.kind === 'baseline' ? state.current : null;
    expect(current).toBeGreaterThan(stall + 0.5);
  });

  it('sets aside one reading far off the line', () => {
    const readings = trend(8, 0.01, 200, 0.005);
    const slipped = readings.map((one, index) =>
      index === 15 ? { ...one, e1rm: one.e1rm * 1.4 } : one,
    );
    const clean = pushPace({ readings, since: SINCE, now: day(56), target: 260 });
    const kept = pushPace({ readings: slipped, since: SINCE, now: day(56), target: 260 });
    expect(clean.kind === 'pace' && kept.kind === 'pace').toBe(true);
    if (clean.kind === 'pace' && kept.kind === 'pace') {
      expect(kept.weekly).toBeCloseTo(clean.weekly, 3);
    }
  });
});

describe('a target date', () => {
  it('is checked against the pace, or against what lifters gain without one', () => {
    const state = pushPace({ readings: trend(8, 0.01), since: SINCE, now: day(56), target: 240 });
    const soon = dateCheck({
      state,
      target: 240,
      by: day(56 + 14),
      now: day(56),
      current: state.kind === 'pace' ? state.current : null,
      newLifter: false,
    });
    expect(soon?.likely).toBe(false);
    expect(soon?.ambitious).toBe(true);
    const later = dateCheck({
      state,
      target: 240,
      by: day(56 + 7 * 20),
      now: day(56),
      current: state.kind === 'pace' ? state.current : null,
      newLifter: false,
    });
    expect(later?.likely).toBe(true);
    expect(later?.ambitious).toBe(false);
    // Without a pace yet: no likely, only how it compares.
    const baseline = dateCheck({
      state: { kind: 'baseline', readings: 2, sessionsToGo: 8, weeksToGo: 5, current: 200 },
      target: 230,
      by: day(70),
      now: day(0),
      current: 200,
      newLifter: true,
    });
    expect(baseline?.likely).toBeNull();
    expect(baseline?.ambitious).toBe(false);
  });
});

describe('a fall twice running', () => {
  it('is the first working set well short of what it asked in each of the last two sessions', () => {
    const short = (n: number) => session(n, [{ reps: 3, weight: 185, rir: 0 }]);
    const fine = (n: number) => session(n, [{ reps: 5, weight: 185, rir: 2 }]);
    // The latest of the two names the run, so each run of it is its own (the review).
    expect(shortTwiceRunning([fine(1), short(3), short(5)], 'barbell-bench-press')).toBe(day(5));
    expect(shortTwiceRunning([short(1), fine(3), short(5)], 'barbell-bench-press')).toBeNull();
    expect(shortTwiceRunning([short(5)], 'barbell-bench-press')).toBeNull();
  });

  it('reads only sessions since the push began', () => {
    const short = (n: number) => session(n, [{ reps: 3, weight: 185, rir: 0 }]);
    // Two short before a push set on day 6: nothing to say of the push yet.
    expect(shortTwiceRunning([short(3), short(5)], 'barbell-bench-press', day(6))).toBeNull();
    expect(shortTwiceRunning([short(3), short(5)], 'barbell-bench-press', day(2))).toBe(day(5));
  });
});
