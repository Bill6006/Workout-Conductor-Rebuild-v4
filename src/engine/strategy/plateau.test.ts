import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../core/validation/profile';
import { RECORD_NOW, record } from '../../test/records';
import { coachingPolicy } from '../coach/experience';
import {
  applyRouteStep,
  describeRoute,
  detectStalls,
  emptyRoutes,
  reconcileRoutes,
} from './plateau';

const profile = createDefaultProfile(RECORD_NOW);
const intermediate = coachingPolicy('intermediate');
const beginner = coachingPolicy('beginner');
const BENCH = 'barbell-bench-press';

/** Four bench exposures at 185 × 5 with RIR at the prescribed 2: no progress at full effort. */
function stalledHistory(days = [21, 14, 7, 1]) {
  return days.map((daysAgo) =>
    record(daysAgo, BENCH, [
      [5, 185, 2],
      [5, 185, 2],
      [5, 185, 2],
    ]),
  );
}

describe('stall detection by exposure', () => {
  it('needs the policy number of exposures before it calls a stall', () => {
    expect(detectStalls(stalledHistory([14, 7, 1]), profile, intermediate)).toEqual([]);
    expect(detectStalls(stalledHistory([14, 7, 1]), profile, beginner)).toHaveLength(1);
  });

  it('calls a stall at prescribed effort and reads the evidence', () => {
    const [stall] = detectStalls(stalledHistory(), profile, intermediate);
    expect(stall).toMatchObject({
      exerciseId: BENCH,
      kind: 'stalled-at-effort',
      exposures: 4,
      effortMet: 4,
      effortUnknown: 0,
    });
    expect(stall!.why[0]).toMatch(/Best estimated max 215\.8 lb then, 215\.8 lb now/);
    expect(stall!.why[1]).toBe('Prescribed effort was reached in 4 of 4 logged exposures.');
  });

  it('does not call a stall when the max moved, when reps were missed, or without a weight', () => {
    const moved = [...stalledHistory([21, 14, 7]), record(1, BENCH, [[6, 190, 2]])];
    expect(detectStalls(moved, profile, intermediate)).toEqual([]);
    const missed = [
      record(21, BENCH, [[5, 185, 2]]),
      record(14, BENCH, [[3, 185, 0]]),
      record(7, BENCH, [[3, 185, 0]]),
      record(1, BENCH, [[5, 185, 2]]),
    ];
    expect(detectStalls(missed, profile, intermediate)).toEqual([]);
    const bodyweight = [21, 14, 7, 1].map((d) => record(d, 'push-up', [[12, null, 2]], [8, 12]));
    expect(detectStalls(bodyweight, profile, intermediate)).toEqual([]);
  });

  it('diagnoses undershooting when the sets end far from the prescribed effort', () => {
    const easy = [21, 14, 7, 1].map((d) =>
      record(d, BENCH, [
        [5, 185, 4],
        [5, 185, 4],
      ]),
    );
    const [stall] = detectStalls(easy, profile, intermediate);
    expect(stall?.kind).toBe('undershooting');
    expect(stall?.why[1]).toMatch(/4 reps in reserve on average/);
  });
});

describe('coach routes', () => {
  it('opens a route for a stall, advances after the step had its exposures, and closes when the max moves', () => {
    const history = stalledHistory();
    const stalls = detectStalls(history, profile, intermediate);
    const opened = reconcileRoutes(emptyRoutes(), stalls, history, intermediate, RECORD_NOW);
    expect(opened.events).toEqual([
      {
        exerciseId: BENCH,
        kind: 'started',
        step: 0,
        detail: 'Stalled for 4 exposures; route opened.',
      },
    ]);
    const route = opened.routes.routes[BENCH]!;
    expect(route.step).toBe(0);
    expect(describeRoute(route)).toBe(
      '1 shift the rep range (now) → 2 swap for a variation → 3 short deload → 4 add a set',
    );

    // The lifter taps the step; two more flat exposures pass.
    const applied = applyRouteStep(opened.routes, BENCH, 0, route.baselineE1rm, RECORD_NOW);
    expect(applied.routes[BENCH]!.applied).toEqual([{ step: 0, at: RECORD_NOW }]);
    const later = '2026-09-20T12:00:00.000Z';
    const flat = [
      ...history,
      {
        ...record(0, BENCH, [[5, 185, 2]]),
        id: 'f1',
        startedAt: '2026-09-14T12:00:00.000Z',
        completedAt: '2026-09-14T12:00:00.000Z',
      },
      {
        ...record(0, BENCH, [[5, 185, 2]]),
        id: 'f2',
        startedAt: '2026-09-18T12:00:00.000Z',
        completedAt: '2026-09-18T12:00:00.000Z',
      },
    ];
    const advanced = reconcileRoutes(
      applied,
      detectStalls(flat, profile, intermediate),
      flat,
      intermediate,
      later,
    );
    expect(advanced.routes.routes[BENCH]!.step).toBe(1);
    expect(advanced.events[0]).toMatchObject({ kind: 'advanced', step: 1 });
    expect(describeRoute(advanced.routes.routes[BENCH]!)).toMatch(
      /^1 shift the rep range \(done\) → 2 swap for a variation \(now\)/,
    );

    // One exposure is not enough to advance again.
    const stepTwo = applyRouteStep(advanced.routes, BENCH, 1, route.baselineE1rm, later);
    const one = [
      ...flat,
      {
        ...record(0, BENCH, [[5, 185, 2]]),
        id: 'f3',
        startedAt: '2026-09-22T12:00:00.000Z',
        completedAt: '2026-09-22T12:00:00.000Z',
      },
    ];
    expect(
      reconcileRoutes(stepTwo, [], one, intermediate, '2026-09-23T12:00:00.000Z').routes.routes[
        BENCH
      ]!.step,
    ).toBe(1);

    // The max moves: the route closes.
    const moved = [
      ...one,
      {
        ...record(0, BENCH, [[6, 195, 2]]),
        id: 'f4',
        startedAt: '2026-09-25T12:00:00.000Z',
        completedAt: '2026-09-25T12:00:00.000Z',
      },
    ];
    const closed = reconcileRoutes(stepTwo, [], moved, intermediate, '2026-09-26T12:00:00.000Z');
    expect(closed.routes.routes[BENCH]).toBeUndefined();
    expect(closed.events[0]).toMatchObject({ kind: 'resolved' });
  });

  it('marks a route exhausted after the last step and never applies a step twice', () => {
    let routes = emptyRoutes();
    for (let step = 0; step < 4; step += 1) {
      routes = applyRouteStep(routes, BENCH, step, 215.8, `2026-09-1${step}T12:00:00.000Z`);
    }
    routes = applyRouteStep(routes, BENCH, 3, 215.8, '2026-09-19T12:00:00.000Z');
    expect(routes.routes[BENCH]!.applied).toHaveLength(4);
    const flat = [
      record(4, BENCH, [[5, 185, 2]]),
      record(2, BENCH, [[5, 185, 2]]),
      {
        ...record(1, BENCH, [[5, 185, 2]]),
        id: 'late',
        startedAt: '2026-09-21T12:00:00.000Z',
        completedAt: '2026-09-21T12:00:00.000Z',
      },
      {
        ...record(1, BENCH, [[5, 185, 2]]),
        id: 'later',
        startedAt: '2026-09-23T12:00:00.000Z',
        completedAt: '2026-09-23T12:00:00.000Z',
      },
    ];
    const done = reconcileRoutes(routes, [], flat, intermediate, '2026-09-24T12:00:00.000Z');
    expect(done.routes.routes[BENCH]!.exhausted).toBe(true);
    expect(done.events[0]?.kind).toBe('exhausted');
    expect(describeRoute(done.routes.routes[BENCH]!)).toMatch(/4 add a set \(tried\)$/);
  });
});
