import { describe, expect, it } from 'vitest';
import { gatherSignals, type CoachInput } from '../../engine/coach/coachConductor';
import { emptyCompleted, emptyConstraints } from '../../engine/recalibration/recalibrate';
import type { RecalibrationTrigger } from '../../engine/recalibration/types';
import { interpretFatigue } from '../../engine/recovery/fatigue';
import { RECORD_NOW } from '../../test/records';
import { BENCH, bench, gym, plan, profileOf, run, shape, trained } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11, and the coach (the first review of round N): the coach's
 * deload of a stalled main lift (its route's "Deload to 170 lb this week") is a load eased, so it
 * runs on straight sets, as the plan's own micro-deload does. Synthetic data only.
 */

describe('the coach’s deload of a stalled main lift, the first review of round N', () => {
  it('runs the lighter load on straight sets, as a micro-deload does', () => {
    const workout = plan();
    expect(shape(bench(workout))[0]).toEqual([190, 1, 'top']);
    const input: CoachInput = {
      workout,
      status: 'preview',
      duration: 'default',
      completed: emptyCompleted(),
      constraints: emptyConstraints(),
      profile: profileOf(),
      history: trained(),
      now: RECORD_NOW,
      fatigue: interpretFatigue([], RECORD_NOW),
      strategy: [],
      lastExportAt: RECORD_NOW,
      workoutCount: 0,
      location: gym,
      stalls: [
        {
          exerciseId: BENCH,
          kind: 'stalled-at-effort',
          exposures: 4,
          totalExposures: 4,
          baselineE1rm: 220,
          latestE1rm: 220,
          effortMet: 4,
          effortUnknown: 0,
          firstDate: RECORD_NOW,
          lastDate: RECORD_NOW,
          why: ['No better estimated max in 4 exposures.'],
        },
      ],
      routes: {
        id: 'coach-routes',
        routes: {
          [BENCH]: {
            exerciseId: BENCH,
            step: 2,
            startedAt: RECORD_NOW,
            baselineE1rm: 220,
            applied: [],
            exhausted: false,
          },
        },
      },
    };
    const [route] = gatherSignals(input).filter((signal) => signal.source === 'stall: route');
    const action = route?.action;
    expect(action?.label).toBe('Deload to 170 lb this week');
    if (action?.kind !== 'recalibrate') throw new Error('no deload to take');
    const result = run(action.trigger as RecalibrationTrigger, workout);
    // Every working set at the deload's load, two short of failure: no top set at 1 in reserve.
    expect(shape(bench(result.workout))).toEqual(
      shape(bench(result.workout)).map(() => [170, 2, 'straight']),
    );
  });
});

describe('the coach’s micro-deload of a main lift, the first review of round N', () => {
  it('runs the lighter load on straight sets', () => {
    const workout = plan();
    const input: CoachInput = {
      workout,
      status: 'preview',
      duration: 'default',
      completed: emptyCompleted(),
      constraints: emptyConstraints(),
      profile: profileOf(),
      history: trained(),
      now: RECORD_NOW,
      fatigue: interpretFatigue([], RECORD_NOW),
      strategy: [
        {
          kind: 'load',
          recommendation: 'micro-deload',
          headline: 'Bench press: a lighter week',
          why: ['No better estimated max in 4 sessions.', 'Take a tenth off this week.'],
          exerciseId: BENCH,
          sessions: 4,
          confidence: 'medium',
          severity: 2,
        },
      ],
      lastExportAt: RECORD_NOW,
      workoutCount: 0,
      location: gym,
      stalls: [],
    };
    const card = gatherSignals(input).find((signal) => signal.source === 'strategy: load');
    const action = card?.action;
    expect(action?.label).toMatch(/^Micro-deload to \d+ lb$/);
    if (action?.kind !== 'recalibrate') throw new Error('no micro-deload to take');
    const result = run(action.trigger as RecalibrationTrigger, workout);
    const sets = shape(bench(result.workout));
    // Every working set at the lighter load, two short of failure: no top set at 1 in reserve.
    expect(sets).toEqual(sets.map(() => [sets[0]?.[0], 2, 'straight']));
    expect(sets[0]?.[0]).toBeLessThan(190);
  });
});
