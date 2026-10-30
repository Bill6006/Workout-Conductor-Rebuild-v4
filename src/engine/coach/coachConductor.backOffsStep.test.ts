import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { gatherSignals, type CoachInput } from './coachConductor';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import type { RecalibrationTrigger } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { BENCH, bench, gym, plan, profileOf, run, shape } from '../../test/backOffs';

/**
 * The sixth review of round N. The coach's next load step for a lift (`heavierHere`, the
 * undershooting stall's "Take N lb today" and the "ready for more load" card) steps from the weight
 * the lift's target moved from (`progression.from`). On a day the lift runs straight at its
 * back-offs' load, that is the last top set's load (`straightAfterTop` keeps the top set's
 * target's `from`), so the step offered is the top set's next load, for every straight set, at a
 * straight set's reserve: the third review's HIGH (the top set's load asked of every set at a
 * straight set's reserve), through the coach. On the main day the same card is taken by the plan
 * (its top set has the step) and never shown. Synthetic data only.
 */

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.parse(RECORD_NOW) + days * DAY).toISOString();

function upperDay(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, BENCH, [top, ...backOffs], [4, 6], 2, { templateId: 'upper' });
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, index) => {
    set.tier = index === 0 ? 'top' : 'back-off';
    set.targetRir = index === 0 ? 1 : 2;
  });
  return done;
}

// The lifter keeps the top set at 200, well short of failure (3 in reserve, asked 1).
const history = [
  upperDay(
    3,
    [5, 200, 3],
    [
      [5, 190, 3],
      [5, 190, 3],
      [5, 190, 3],
    ],
  ),
];

describe('the coach’s load step on a day the main lift runs at its back-offs’ load', () => {
  it('never asks the top set’s next load of every straight set', () => {
    // The full-body day: the bench press secondary, straight at the back-offs' load.
    const workout = plan(history, profileOf(), { templateId: 'full-body' });
    expect(bench(workout).atBackOffs).toBe(true);
    const straight = shape(bench(workout));
    const load = straight[0]![0] as number;
    const input: CoachInput = {
      workout,
      status: 'preview',
      duration: 'default',
      completed: emptyCompleted(),
      constraints: emptyConstraints(),
      profile: profileOf(),
      history,
      now: RECORD_NOW,
      fatigue: interpretFatigue(history, RECORD_NOW, null),
      strategy: [],
      lastExportAt: RECORD_NOW,
      workoutCount: 1,
      location: gym,
      // Four top sets at 200 x 5, each 3 in reserve where 1 was asked: undershooting.
      stalls: [
        {
          exerciseId: BENCH,
          kind: 'undershooting',
          exposures: 4,
          totalExposures: 4,
          baselineE1rm: 233.3,
          latestE1rm: 233.3,
          effortMet: 0,
          effortUnknown: 0,
          firstDate: at(-24),
          lastDate: at(-3),
          why: ['No better estimated max in 4 exposures.'],
        },
      ],
    };
    const card = gatherSignals(input).find((signal) => signal.source === 'stall: undershooting');
    const action = card?.action;
    // No step offered on such a day is no wrong step.
    if (action?.kind !== 'recalibrate') return;
    const taken = shape(
      bench(run(action.trigger as RecalibrationTrigger, workout, { history }).workout),
    );
    const lines = `${action.label}: ${JSON.stringify(straight)} -> ${JSON.stringify(taken)}`;
    // On 6f2d5ea: "Take 205 lb today", every straight set at 205 at 2 in reserve: over the last
    // top set (200 at 1 in reserve), a step above the back-offs' load the day had (195) twice over.
    expect(load).toBeLessThan(200);
    expect(Math.max(...taken.map((set) => set[0] as number)), lines).toBeLessThanOrEqual(200);
  });
});
