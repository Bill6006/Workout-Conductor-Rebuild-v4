import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { RECORD_NOW, record } from '../../test/records';
import { contextFor } from '../recalibration/recalibrate';
import { applyRouteStep, emptyRoutes } from '../strategy/plateau';
import { rankAlternatives } from './rankAlternatives';
import { buildRankingSignals, muscleLoads } from './signals';

const profile = createDefaultProfile(RECORD_NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const bench = requireExercise('barbell-bench-press');

function context() {
  return contextFor(
    {
      profile,
      location: gym,
      history: [],
      workout: { blocks: [], duration: { choice: 'default', targetMinutes: 60 } } as never,
      completed: { sets: [], currentEntryId: null } as never,
      constraints: {} as never,
      timestamp: RECORD_NOW,
    } as never,
    {} as never,
  );
}

describe('alternative ranking signals', () => {
  it('reads what was done, when, and how loaded each muscle is this week', () => {
    const history = [
      record(3, 'dumbbell-bench-press', [[8, 60, 2]]),
      record(9, 'cable-fly', [[12, 30, 1]]),
    ];
    const signals = buildRankingSignals({
      profile,
      history,
      now: RECORD_NOW,
      currentExerciseId: bench.id,
    });
    expect(signals.familiarIds?.has('dumbbell-bench-press')).toBe(true);
    expect(signals.lastPerformance?.get('dumbbell-bench-press')).toEqual({
      daysAgo: 3,
      line: 'last done Sep 7: 60 lb × 8',
    });
    expect(signals.muscleLoad?.chest).toBeDefined();
    expect(signals.routeWantsVariation).toBe(false);
    expect(signals.sessionPainJoints?.size).toBe(0);
  });

  it('knows when the coach route for the current lift wants a variation', () => {
    const routes = applyRouteStep(emptyRoutes(), bench.id, 0, 215.8, RECORD_NOW);
    const atVariation = {
      ...routes,
      routes: { [bench.id]: { ...routes.routes[bench.id]!, step: 1 } },
    };
    const signals = buildRankingSignals({
      profile,
      history: [],
      now: RECORD_NOW,
      coachRoutes: atVariation,
      currentExerciseId: bench.id,
    });
    expect(signals.routeWantsVariation).toBe(true);
  });

  it('classifies weekly load as behind, open, or covered', () => {
    const loads = muscleLoads([], profile, RECORD_NOW);
    expect(loads.chest).toBe('behind');
    const heavy = Array.from({ length: 5 }, (_, i) =>
      record(i, 'barbell-bench-press', [
        [5, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
      ]),
    );
    expect(muscleLoads(heavy, profile, RECORD_NOW).chest).toBe('covered');
  });
});

describe('ranking with signals', () => {
  it('explains each candidate with reasons and honours pain, load, history, and the route', () => {
    const ctx = context();
    const plain = rankAlternatives({ current: bench, context: ctx, limit: 6 });
    expect(plain.candidates.length).toBeGreaterThan(0);
    expect(plain.candidates[0]!.reasons.length).toBeGreaterThan(0);

    const history = [record(4, 'dumbbell-bench-press', [[8, 60, 2]])];
    const withHistory = rankAlternatives({
      current: bench,
      context: ctx,
      signals: buildRankingSignals({
        profile,
        history,
        now: RECORD_NOW,
        currentExerciseId: bench.id,
      }),
      limit: 8,
    });
    const dumbbell = withHistory.candidates.find((c) => c.exercise.id === 'dumbbell-bench-press');
    expect(dumbbell?.reasons.join(' ')).toMatch(/last done Sep 6: 60 lb × 8/);

    const hurting = rankAlternatives({
      current: bench,
      context: ctx,
      signals: {
        ...buildRankingSignals({
          profile,
          history: [],
          now: RECORD_NOW,
          currentExerciseId: bench.id,
        }),
        sessionPainJoints: new Set(['shoulder']),
      },
      limit: 8,
    });
    for (const candidate of hurting.candidates) {
      expect(candidate.exercise.jointStress.shoulder).not.toBe('high');
    }

    const routes = applyRouteStep(emptyRoutes(), bench.id, 0, 215.8, RECORD_NOW);
    const variation = rankAlternatives({
      current: bench,
      context: ctx,
      signals: buildRankingSignals({
        profile,
        history: [],
        now: RECORD_NOW,
        coachRoutes: {
          ...routes,
          routes: { [bench.id]: { ...routes.routes[bench.id]!, step: 1 } },
        },
        currentExerciseId: bench.id,
      }),
      limit: 8,
    });
    expect(variation.candidates[0]!.reasons.join(' ')).toMatch(/variation/);
  });
});
