import { describe, expect, it } from 'vitest';
import { MUSCLE_IDS, type MuscleId } from '../../catalog/muscles/muscles';
import { CATCH_UP, catchUpSpec } from './catchUp';
import type { MuscleWeek, WeekModel } from './weekModel';

/**
 * Maintenance 31, items 12 and 32: the catch-up and the second workout of a day take only what the
 * week still lacks (docs/research/catch-up-and-second-workout.md).
 */

/**
 * A week where every muscle is on track, with the given muscles changed. A muscle's sets today are
 * direct ones unless said otherwise.
 */
function weekWith(changes: Partial<Record<MuscleId, Partial<MuscleWeek>>>): WeekModel {
  const muscles = Object.fromEntries(
    MUSCLE_IDS.map((muscle) => [
      muscle,
      {
        done: 6,
        today: 0,
        todayDirect: changes[muscle]?.today ?? 0,
        planned: 4,
        target: 10,
        daysSince: 3,
        daysBefore: 3,
        ...changes[muscle],
      },
    ]),
  ) as Record<MuscleId, MuscleWeek>;
  return { week: '2026-09-07', sessionsAhead: 1, trainedToday: false, muscles };
}
const usual = () => 9;
const intermediate = { experience: 'intermediate' as const };
const beginner = { experience: 'beginner' as const };

describe('a catch-up on a day not ticked (item 12)', () => {
  it('takes only the muscles short of their week, largest share short first', () => {
    const spec = catchUpSpec(
      weekWith({
        chest: { done: 2, planned: 4 },
        'side-delts': { done: 0, planned: 2, target: 8 },
      }),
      intermediate,
      'catch-up',
      usual,
    );
    expect(spec.muscles.map((item) => item.muscle)).toEqual(['side-delts', 'chest']);
    expect(spec.muscles.every((item) => item.why === 'behind')).toBe(true);
  });

  it('gives each three sets, two for a beginner, and none to failure', () => {
    const week = weekWith({ chest: { done: 0, planned: 2 } });
    const [chest] = catchUpSpec(week, intermediate, 'catch-up', usual).muscles;
    expect(chest).toEqual({ muscle: 'chest', sets: 3, minRir: CATCH_UP.MIN_RIR, why: 'behind' });
    const [novice] = catchUpSpec(week, beginner, 'catch-up', usual).muscles;
    expect(novice).toEqual({
      muscle: 'chest',
      sets: 2,
      minRir: CATCH_UP.BEGINNER_MIN_RIR,
      why: 'behind',
    });
  });

  it('never more than the muscle is short, nor its usual sets, and never under two', () => {
    const short = (sets: number) =>
      catchUpSpec(
        weekWith({ chest: { done: 10 - sets, planned: 0 } }),
        intermediate,
        'catch-up',
        usual,
      ).muscles;
    expect(short(2.5)).toEqual([expect.objectContaining({ muscle: 'chest', sets: 2 })]);
    expect(short(1.5)).toEqual([]);
    const fewUsual = catchUpSpec(
      weekWith({ chest: { done: 0, planned: 0 } }),
      intermediate,
      'catch-up',
      () => 2,
    ).muscles;
    expect(fewUsual).toEqual([expect.objectContaining({ muscle: 'chest', sets: 2 })]);
  });

  it('leaves out a muscle trained in the last 48 hours, however short', () => {
    const spec = catchUpSpec(
      weekWith({ chest: { done: 0, planned: 0, daysSince: 1.5 } }),
      intermediate,
      'catch-up',
      usual,
    );
    expect(spec.muscles).toEqual([]);
  });

  it('has nothing to offer when the week is on track', () => {
    expect(catchUpSpec(weekWith({}), intermediate, 'catch-up', usual).muscles).toEqual([]);
  });

  it('never reads a muscle with no target', () => {
    const spec = catchUpSpec(
      weekWith({ forearms: { done: 0, planned: 0, target: 0 } }),
      intermediate,
      'catch-up',
      usual,
    );
    expect(spec.muscles).toEqual([]);
  });
});

describe('a second workout the same day (item 32)', () => {
  it('leads with what was missed; a muscle given its full dose today sits out', () => {
    const spec = catchUpSpec(
      weekWith({
        quads: { done: 9, today: 9, planned: 0, daysSince: 0.1 },
        chest: { done: 0, planned: 2, daysSince: 4 },
      }),
      intermediate,
      'second',
      usual,
    );
    expect(spec.muscles.map((item) => item.muscle)).toEqual(['chest']);
    expect(spec.sitOut).toContain('quads');
  });

  it('gives a muscle cut short today what is left of one session, at three or more in reserve', () => {
    const spec = catchUpSpec(
      weekWith({ quads: { done: 3, today: 3, planned: 0, daysSince: 0.1 } }),
      intermediate,
      'second',
      usual,
    );
    expect(spec.muscles).toEqual([
      { muscle: 'quads', sets: 3, minRir: CATCH_UP.REMAINDER_RIR, why: 'remainder' },
    ]);
    // Never past one session's dose for the day: 7 of 9 done leaves 2.
    const late = catchUpSpec(
      weekWith({ quads: { done: 7, today: 7, planned: 0, daysSince: 0.1 } }),
      intermediate,
      'second',
      usual,
    );
    expect(late.muscles).toEqual([expect.objectContaining({ muscle: 'quads', sets: 2 })]);
  });

  it('puts what was missed before what is left of today’s', () => {
    const spec = catchUpSpec(
      weekWith({
        quads: { done: 3, today: 3, planned: 0, daysSince: 0.1 },
        chest: { done: 4, planned: 2, daysSince: 4 },
      }),
      intermediate,
      'second',
      usual,
    );
    expect(spec.muscles.map((item) => item.muscle)).toEqual(['chest', 'quads']);
  });

  it('sits a beginner’s muscles trained today out, always', () => {
    const spec = catchUpSpec(
      weekWith({ quads: { done: 3, today: 3, planned: 0, daysSince: 0.1 } }),
      beginner,
      'second',
      usual,
    );
    expect(spec.muscles).toEqual([]);
    expect(spec.sitOut).toEqual(['quads']);
  });

  it('reads what is left from today’s own session where it is given', () => {
    // Today's session gave the quads 4 sets: 1 is left, under two, so they sit out.
    const spec = catchUpSpec(
      weekWith({ quads: { done: 3, today: 3, planned: 0, daysSince: 0.1 } }),
      intermediate,
      'second',
      usual,
      () => 4,
    );
    expect(spec.muscles).toEqual([]);
    expect(spec.sitOut).toEqual(['quads']);
  });

  it('sits out a muscle trained today that was trained in the 48 hours before too', () => {
    const spec = catchUpSpec(
      weekWith({ quads: { done: 3, today: 3, planned: 0, daysSince: 0.1, daysBefore: 1 } }),
      intermediate,
      'second',
      usual,
    );
    expect(spec.muscles).toEqual([]);
    expect(spec.sitOut).toEqual(['quads']);
  });

  it('counts a muscle worked today only as a secondary one as not trained today', () => {
    // Half sets today from a lift for another muscle: short of its week, it leads.
    const spec = catchUpSpec(
      weekWith({ biceps: { done: 1.5, today: 1.5, todayDirect: 0, planned: 0 } }),
      intermediate,
      'second',
      usual,
    );
    expect(spec.muscles).toEqual([
      { muscle: 'biceps', sets: 3, minRir: CATCH_UP.MIN_RIR, why: 'behind' },
    ]);
    expect(spec.sitOut).toEqual([]);
    // Never more than its usual sets in one session, today's half sets counted: 4 less 1.5 is 2.
    const fewUsual = catchUpSpec(
      weekWith({ biceps: { done: 1.5, today: 1.5, todayDirect: 0, planned: 0 } }),
      intermediate,
      'second',
      () => 4,
    );
    expect(fewUsual.muscles).toEqual([expect.objectContaining({ muscle: 'biceps', sets: 2 })]);
  });

  it('gives a muscle trained today nothing when its week is on track', () => {
    const spec = catchUpSpec(
      weekWith({ quads: { done: 3, today: 3, planned: 8, daysSince: 0.1 } }),
      intermediate,
      'second',
      usual,
    );
    expect(spec.muscles).toEqual([]);
    expect(spec.sitOut).toEqual(['quads']);
  });
});
