import { describe, expect, it } from 'vitest';
import { lowCheckIn } from '../recalibration/recalibrate';
import type { Readiness } from '../recalibration/types';
import { RECORD_NOW } from '../../test/records';

/**
 * The first adversarial review of Maintenance 33: a "Wrecked" or "Very sore" check-in, or one
 * "Exhausted" answer, no longer keeps the day's reserve check (a set taken to failure) away.
 *
 * Steps: a lifter with the reserve check on (item 43) checks in before a session with soreness
 * "Wrecked" (5), every other answer at the middle; or with energy "Exhausted" (1) alone. The store
 * asks `reserveCheckSetFor` for today's check set, whose `day.lowCheckIn` is `lowCheckIn(...)`.
 *
 * The rule: item 43's approved day rule (docs/research/reserve-check.md, "Which day"): "None in a
 * deload week, after a low or sore check-in, on a hard-start day (item 42), or in the first session
 * back after three weeks or more". The owner's decision 1 changed which check-ins cut a set ("single
 * low answers and soreness >= 4 cutting a set"); it said nothing of the reserve check, which asks
 * for a set to failure; readiness-and-soreness.md keeps severe soreness as a flag where "your first
 * work set decides".
 *
 * What happens: `lowCheckIn` now reads `readCheckIn(...).lowered || illness`, and soreness never
 * lowers anything, nor does one item alone: both check-ins read as no low day, so the reserve check
 * (to failure) is asked on a "Wrecked" day and on an "Exhausted" one. Before Maintenance 33 both kept
 * it away (this test passes on 34dc615).
 *
 * Synthetic data only.
 */

const middle: Readiness = {
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};

describe('the reserve check after a sore or low check-in', () => {
  it('stays away on a "Wrecked" day', () => {
    expect(lowCheckIn({ ...middle, soreness: 5 }, [], RECORD_NOW)).toBe(true);
  });

  it('stays away after one "Exhausted" answer', () => {
    expect(lowCheckIn({ ...middle, energy: 1 }, [], RECORD_NOW)).toBe(true);
  });
});
