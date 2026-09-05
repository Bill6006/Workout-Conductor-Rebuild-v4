import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { applyRouteStep, emptyRoutes } from '../strategy/plateau';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { conductCoach, gatherSignals, type CoachInput } from './coachConductor';
import type { ExperienceLevel } from './experience';

const NOW = RECORD_NOW;
const BENCH = 'barbell-bench-press';

function input(
  level: ExperienceLevel,
  history: WorkoutRecord[],
  overrides: Partial<CoachInput> = {},
): CoachInput {
  const profile = { ...createDefaultProfile(NOW), experience: level };
  const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);
  const workout = generateWorkout({
    profile,
    location: gym,
    history,
    now: NOW,
    duration: 'default',
  });
  const fatigue = interpretFatigue(history, NOW, null);
  return {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history,
    now: NOW,
    fatigue,
    strategy: analyzeStrategy({ history, profile, now: NOW, fatigue }),
    lastExportAt: NOW,
    workoutCount: history.length,
    ...overrides,
  };
}

/** The first entry of the session becomes the bench press, whatever the generator picked. */
function withBench(base: CoachInput): CoachInput {
  const blocks = base.workout.blocks.map((block, blockIndex) => ({
    ...block,
    entries: block.entries.map((entry, entryIndex) =>
      blockIndex === 0 && entryIndex === 0
        ? {
            ...entry,
            exerciseId: BENCH,
            sets: entry.sets.map((set) =>
              set.kind === 'working' ? { ...set, targetWeight: 185 } : set,
            ),
          }
        : entry,
    ),
  }));
  return { ...base, workout: { ...base.workout, blocks } };
}

/** Three sessions at the top of the range at the same load: the classic "ready for more load" nudge. */
function readyForLoad(): WorkoutRecord[] {
  return [14, 9, 4].map((daysAgo) =>
    record(daysAgo, BENCH, [
      [6, 185, 2],
      [6, 185, 2],
      [6, 185, 2],
    ]),
  );
}

function stalled(): WorkoutRecord[] {
  return [21, 14, 7, 1].map((daysAgo) =>
    record(daysAgo, BENCH, [
      [5, 185, 2],
      [5, 185, 2],
      [5, 185, 2],
    ]),
  );
}

describe('coaching by experience', () => {
  it('tells a beginner the obvious and hides it from intermediate and advanced lifters', () => {
    const history = readyForLoad();
    const beginner = conductCoach(input('beginner', history));
    expect(beginner?.signal.obvious).toBe(true);
    expect(beginner?.signal.headline).toMatch(/ready for more load|load goes up/);
    expect(beginner?.policy.tone).toBe('explain');

    for (const level of ['intermediate', 'advanced'] as const) {
      const card = conductCoach(input(level, history));
      const obvious = gatherSignals(input(level, history)).filter((signal) => signal.obvious);
      expect(obvious.length).toBeGreaterThan(0);
      expect(card?.signal.obvious ?? false).toBe(false);
      if (card) {
        expect(card.policy.tone).toBe('brief');
        expect(card.signal.why.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('returns no card at all when only obvious signals remain', () => {
    const history = readyForLoad();
    const all = gatherSignals(input('advanced', history));
    const card = conductCoach(
      input('advanced', history, { strategy: [], lastExportAt: NOW, workoutCount: 1 }),
    );
    // Whatever else the plan carries, nothing obvious is left on the card.
    expect(card?.signal.obvious ?? false).toBe(false);
    expect(all.some((signal) => signal.obvious)).toBe(true);
  });

  it('shows a stalled lift with its route and a one-tap step that carries the route reference', () => {
    const history = stalled();
    const card = conductCoach(withBench(input('intermediate', history)));
    expect(card?.signal.domain).toBe('plateau');
    expect(card?.signal.headline).toBe(
      'Barbell Bench Press has stalled for 4 exposures at the prescribed effort',
    );
    expect(card?.signal.why[0]).toMatch(/Best estimated max 215\.8 lb then, 215\.8 lb now/);
    expect(card?.signal.why[1]).toMatch(/^Route: 1 shift the rep range \(now\)/);
    const action = card?.signal.action;
    expect(action?.kind).toBe('recalibrate');
    expect(action?.route).toEqual({ exerciseId: BENCH, step: 0, baselineE1rm: 215.8 });
    if (action?.kind === 'recalibrate') {
      expect(action.trigger.type).toBe('rep-range');
      expect(action.label).toMatch(/^Shift to \d+-\d+ reps for two weeks$/);
    }
  });

  it('walks the route: the applied step is done, the next step is on offer', () => {
    const history = stalled();
    const routes = applyRouteStep(emptyRoutes(), BENCH, 0, 215.8, NOW);
    // Just applied: the step stays in place with no action until the exposures decide.
    const justApplied = conductCoach(withBench(input('advanced', history, { routes })));
    expect(justApplied?.signal.why[1]).toMatch(/1 shift the rep range \(applied\)/);
    expect(justApplied?.signal.action).toBeNull();
    const advanced = { ...routes, routes: { [BENCH]: { ...routes.routes[BENCH]!, step: 1 } } };
    const card = conductCoach(withBench(input('advanced', history, { routes: advanced })));
    expect(card?.signal.why[1]).toMatch(
      /1 shift the rep range \(done\) → 2 swap for a variation \(now\)/,
    );
    expect(card?.signal.action?.kind).toBe('alternatives');
    expect(card?.signal.action?.route?.step).toBe(1);

    const deload = { ...routes, routes: { [BENCH]: { ...routes.routes[BENCH]!, step: 2 } } };
    const third = conductCoach(withBench(input('advanced', history, { routes: deload })));
    expect(third?.signal.action?.kind).toBe('recalibrate');
    if (third?.signal.action?.kind === 'recalibrate') {
      expect(third.signal.action.major).toBe(true);
      expect(third.signal.action.label).toMatch(/^Deload to /);
    }

    const exhausted = {
      ...routes,
      routes: { [BENCH]: { ...routes.routes[BENCH]!, step: 3, exhausted: true } },
    };
    const last = conductCoach(withBench(input('advanced', history, { routes: exhausted })));
    expect(last?.signal.headline).toBe(
      'Barbell Bench Press: every route step tried, still stalled',
    );
    expect(last?.signal.action?.kind).toBe('alternatives');
  });

  it('diagnoses undershooting separately and offers the next load step', () => {
    const easy = [21, 14, 7, 1].map((daysAgo) =>
      record(daysAgo, BENCH, [
        [5, 185, 4],
        [5, 185, 4],
      ]),
    );
    const card = conductCoach(withBench(input('advanced', easy)));
    expect(card?.signal.headline).toBe(
      'Barbell Bench Press: 4 exposures without progress, sets ending too easy',
    );
    expect(card?.signal.action?.kind).toBe('recalibrate');
    expect(card?.signal.action?.route).toBeUndefined();
  });

  it('keeps the stall visible without an action when the lift is not in today’s session', () => {
    const history = stalled();
    const base = input('intermediate', history);
    const without = {
      ...base.workout,
      blocks: base.workout.blocks
        .map((block) => ({
          ...block,
          entries: block.entries.filter((entry) => entry.exerciseId !== BENCH),
        }))
        .filter((block) => block.entries.length > 0),
    };
    const card = conductCoach({ ...base, workout: without });
    expect(allEntries(without.blocks).some((entry) => entry.exerciseId === BENCH)).toBe(false);
    expect(card?.signal.domain).toBe('plateau');
    expect(card?.signal.action).toBeNull();
  });
});
