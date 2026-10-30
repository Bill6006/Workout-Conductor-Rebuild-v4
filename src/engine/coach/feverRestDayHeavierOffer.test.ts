import { describe, expect, it } from 'vitest';
import { conductCoach, type CoachInput } from './coachConductor';
import { REST_TODAY } from '../readiness/checkIn';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import type { Readiness } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import type { StallDiagnosis } from '../strategy/plateau';
import { gym, plan, profileOf, trained } from '../../test/backOffs';
import { RECORD_NOW } from '../../test/records';

/**
 * The third adversarial review of Maintenance 33: on a fever's rest day the coach still offers to
 * take a lift heavier today.
 *
 * Steps: a hybrid lifter whose dumbbell shoulder press has stalled with its sets ending easy (the
 * plateau engine's "undershooting" diagnosis: three exposures at the same estimated max, the sets
 * ending well short of the prescribed effort). Before starting today's push day they check in
 * "Fever or aches". Today shows the rest day (`REST_TODAY`, no Start) and the coach card beneath it.
 *
 * The rule: the readiness model's illness gate (proposal part 2: "With fever or whole-body symptoms,
 * no session"; `REST_TODAY`: "Fever or aches all over: rest today, and train again once they have
 * gone"); the second review's fix: "A rest day adds no work" (`restToday`: "a rest day, with no
 * workout to add to"), whose own test (feverRestDayCoachOffer.store.test.ts) asks that the card on
 * the rest day carry no change to today's workout at all.
 *
 * What happens: the fix holds back only the offers `addsWork` names (a set, a drop set, a range
 * with a set more, an exercise). The plateau card for the undershooting shoulder press still wins,
 * with "Work to the prescribed effort, or take the next load step now." and the button "Take 40 lb
 * today", a heavier load offered on the screen that says to rest today, for a workout that cannot
 * be started. Nor does the filter hold back a "target-weight" offer of a strategy card, or a
 * "rep-range" with no set more ("Aim one rep higher", a new rep range for two weeks). With fatigue
 * high, the card is "Recovery first today" with "Fit to 45 min at held loads": a 45-minute workout
 * offered for the rest day. Both fail before the second review's fix too (80893d4).
 *
 * Synthetic data only.
 */

const profile = profileOf('hybrid');

const fever: Readiness = {
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
  illness: 'body',
};

const stall: StallDiagnosis = {
  exerciseId: 'dumbbell-shoulder-press',
  kind: 'undershooting',
  exposures: 3,
  totalExposures: 4,
  baselineE1rm: 44,
  latestE1rm: 44,
  effortMet: 0,
  effortUnknown: 0,
  firstDate: RECORD_NOW,
  lastDate: RECORD_NOW,
  why: ['Three exposures at the same estimated max, the sets ending easy.'],
};

function day(readiness: Readiness | null, high = false): CoachInput {
  const history = trained();
  const fatigue = interpretFatigue(history, RECORD_NOW);
  return {
    workout: plan(history, profile),
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: { ...emptyConstraints(), readiness },
    profile,
    history,
    now: RECORD_NOW,
    fatigue: high
      ? {
          ...fatigue,
          level: 'high',
          score: 5,
          evidence: ['2 of the last 3 sessions rated too hard.'],
        }
      : fatigue,
    strategy: [],
    stalls: [stall],
    lastExportAt: RECORD_NOW,
    workoutCount: 6,
    location: gym,
  };
}

describe('the coach on a fever rest day', () => {
  it('offers no heavier load for today', () => {
    // The card on an ordinary day: the next load step, a tap away.
    const ordinary = conductCoach(day(null))?.signal;
    expect(ordinary?.action?.label).toBe('Take 40 lb today');

    const rest = conductCoach(day(fever))?.signal;
    expect(REST_TODAY).toMatch(/rest today/);
    expect(rest?.action?.kind === 'recalibrate' ? rest.action.trigger.type : null).toBeNull();
    expect(rest?.why.join(' ') ?? '').not.toMatch(/take the next load step now/);
  });

  it('offers no workout for today with fatigue high', () => {
    // An ordinary day with fatigue high: today's workout fitted to 45 minutes at held loads.
    const ordinary = conductCoach(day(null, true))?.signal;
    expect(ordinary?.action?.label).toBe('Fit to 45 min at held loads');

    const rest = conductCoach(day(fever, true))?.signal;
    expect(rest?.action?.kind === 'recalibrate' ? rest.action.trigger.type : null).toBeNull();
  });
});
