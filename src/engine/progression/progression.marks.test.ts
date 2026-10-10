import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import { RECORD_NOW, record } from '../../test/records';
import { emptyMaxes, type StrengthMaxes } from './maxes';
import { recommendNextTarget, summarizeProgression } from './progression';
import type { Prescription } from './roles';

/**
 * Maintenance 26, the re-check of item 42: a target says when the session it was read from fell
 * under its floor on its first working set (`missed`), and when an entered max raised it
 * (`fromMax`), so a hard start reads neither.
 */

const bench = requireExercise('barbell-bench-press');
const pullUp = requireExercise('pull-up');
const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
const MODERATE: Prescription = { sets: 3, reps: [6, 10], rir: 2, restSeconds: 120 };
const HEAVY: Prescription = { sets: 3, reps: [3, 6], rir: 2, restSeconds: 180 };

const target = (
  exercise: typeof bench,
  prescription: Prescription,
  history: ReturnType<typeof record>[],
  maxes: StrengthMaxes | null = null,
) =>
  recommendNextTarget({
    exercise,
    role: 'primary-strength',
    prescription,
    history,
    profile,
    now: RECORD_NOW,
    maxes,
  });

describe('the marks a target carries for a hard start (Maintenance 26, the re-check of item 42)', () => {
  it('marks a target read from a session whose first set fell under its floor, and not a tired last set', () => {
    const missedFirst = [
      record(
        3,
        bench.id,
        [
          [5, 135, 1],
          [6, 135, 1],
        ],
        [6, 10],
        2,
      ),
    ];
    expect(target(bench, MODERATE, missedFirst).missed).toBe(true);
    expect(summarizeProgression(target(bench, MODERATE, missedFirst)).missed).toBe(true);
    const tiredLast = [
      record(
        3,
        bench.id,
        [
          [10, 135, 2],
          [9, 135, 2],
          [5, 135, 0],
        ],
        [6, 10],
        2,
      ),
    ];
    expect(target(bench, MODERATE, tiredLast).missed).toBeUndefined();
    expect(summarizeProgression(target(bench, MODERATE, tiredLast)).missed).toBeUndefined();
  });

  it("reads the session at today's range: a miss at another range marks nothing", () => {
    // Pull-ups at 6-12 met, then at 3-6 missed: today at 6-12 reads the 6-12 session.
    const history = [
      record(6, pullUp.id, [[8, null, 1]], [6, 12], 2),
      record(3, pullUp.id, [[2, null, 0]], [3, 6], 2),
    ];
    expect(target(pullUp, MODERATE, history).missed).toBeUndefined();
    expect(target(pullUp, HEAVY, history).missed).toBe(true);
  });

  it('marks a target an entered max raised', () => {
    const history = [record(5, bench.id, [[8, 135, 2]], [6, 10], 2)];
    const plain = target(bench, MODERATE, history);
    expect(plain.fromMax).toBeUndefined();
    const maxes: StrengthMaxes = {
      ...emptyMaxes(),
      maxes: {
        [bench.id]: {
          e1rm: 260,
          units: 'lb',
          enteredAt: new Date(Date.parse(RECORD_NOW) - 86_400_000).toISOString(),
          from: null,
        },
      },
    };
    const raised = target(bench, MODERATE, history, maxes);
    expect(raised.weight).toBeGreaterThan(plain.weight as number);
    expect(raised.fromMax).toBe(true);
    expect(summarizeProgression(raised).fromMax).toBe(true);
  });
});

describe('the marks after the third pass of item 42', () => {
  it('marks a session whose first set fell as short as a hard start reads, at its floor too', () => {
    // A style asking 3 in reserve, lifted at the floor to failure: 6 at 0 against 6 at 3 is three
    // short, though no rep under the floor (a beginner on Foundation, every session).
    const foundation = { ...profile, programStyle: 'foundation' as const };
    const marked = (history: ReturnType<typeof record>[]) =>
      recommendNextTarget({
        exercise: bench,
        role: 'primary-strength',
        prescription: MODERATE,
        history,
        profile: foundation,
        now: RECORD_NOW,
        maxes: null,
      }).missed;
    expect(marked([record(3, bench.id, [[6, 135, 0]], [6, 10], 3)])).toBe(true);
    expect(marked([record(3, bench.id, [[6, 135, 1]], [6, 10], 3)])).toBeUndefined();
  });
});

describe('the marks after the fourth pass of item 42', () => {
  it("reads the session's first set against the plan's reserve: a day asked easier makes no mark", () => {
    // The plan asks 2 in reserve; a low check-in asked 3 that day. 6 at 0 is two short of the plan.
    const eased = [record(3, bench.id, [[6, 135, 0]], [6, 10], 3)];
    expect(target(bench, MODERATE, eased).missed).toBeUndefined();
  });

  it('marks a target read from another rep range', () => {
    // Pull-ups only at 3-6: today at 6-10 the target is read from that range.
    const history = [record(5, pullUp.id, [[6, null, 0]], [3, 6], 2)];
    expect(target(pullUp, MODERATE, history).otherRange).toBe(true);
    expect(summarizeProgression(target(pullUp, MODERATE, history)).otherRange).toBe(true);
    expect(target(pullUp, HEAVY, history).otherRange).toBeUndefined();
  });
});
