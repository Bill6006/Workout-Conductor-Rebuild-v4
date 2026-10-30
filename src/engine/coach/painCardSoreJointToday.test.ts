import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import { conductCoach, gatherSignals, type CoachInput } from './coachConductor';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { SessionConstraints } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { generateWorkout } from '../workoutGenerator/generate';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';

/**
 * Twenty-second review of round M, on the twentieth and twenty-first passes' fixes to the pain
 * pattern's card (item 45, `painPatternSignal`): "The pain card's alternative reads the day's list
 * and today's plan, as every other offer does" (the twentieth), and "The coach offers no four-week
 * swap the day turns down: the card reads the same refusal as the swap and its sheet" (the
 * twenty-first), both so that its tap is never refused.
 *
 * The card's alternative is checked against the place and the day's list
 * (`sessionConflictContext` with `excludeExerciseIds` only), not against the joints the lifter
 * flagged today (`constraints.painJoints`, from "Hurts" or the check-in). The swap its tap makes
 * reads them (`contextFor`: a lift with high stress on a joint flagged today is blocked), and so does
 * the coach's other four-week swap, the variety offer ("the alternative fits today as every offer
 * reads it: the place, the lifter's limits, what they avoid today and the joints protected today",
 * `jointsToProtect`), and the coverage card's accessory. So on a day the lifter flagged a joint, the
 * safety card offers a lift with high stress on it, and the tap is refused, the class the twentieth
 * and twenty-first passes fixed.
 *
 * Steps (synthetic data only): wrist pain logged with the close-grip bench press on two push days a
 * week apart, and the dip done in its place (swapped in for it) on two push days since, with no
 * report. The close-grip bench press a favourite, so today's plan (Thursday, a day of the plan, at
 * the gym) has it. The coach: "Wrist pain with Close-Grip Bench Press, not with Dip", "Use Dip for 4
 * weeks", and the tap takes it. With the shoulder flagged today (the check-in's sore shoulder, the
 * plan built with it), the same card, the one Today shows (`conductCoach`), and the tap is refused:
 * "Dip puts high stress on the shoulder you flagged." The store fuzz found the same through a
 * check-in with a sore shoulder and through "Hurts" on another lift.
 *
 * Also fails on 333f1d4 (from item 45; the twentieth and twenty-first passes' fixes left it).
 */

const NOW = '2026-09-10T12:00:00.000Z';
const profile = {
  ...createDefaultProfile(NOW),
  exercisePreferences: { preferred: ['Close-Grip Bench Press'], disliked: [] },
};
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW) as [
  LocationProfile,
  LocationProfile,
];
const sets3 = (reps: number, weight: number): [number, number, number][] => [
  [reps, weight, 2],
  [reps, weight, 2],
  [reps, weight, 2],
];
const pressHurt = (days: number): WorkoutRecord => ({
  ...record(days, 'close-grip-bench-press', sets3(8, 135)),
  templateId: 'push-arms',
  painJoints: ['wrist'],
  painReports: [{ exerciseId: 'close-grip-bench-press', joint: 'wrist' }],
});
const dipForPress = (days: number): WorkoutRecord => {
  const base = record(days, 'dip', sets3(10, 0), [8, 12]);
  return {
    ...base,
    templateId: 'push-arms',
    painReports: [],
    entries: base.entries.map((entry) => ({ ...entry, replacedFrom: 'close-grip-bench-press' })),
  };
};
const history = [pressHurt(20), dipForPress(16), pressHurt(13), dipForPress(9)];

/** Today's plan with the joints flagged today, and each four-week swap offered with its tap. */
function day(painJoints: Joint[]) {
  const workout = generateWorkout({
    profile,
    location: gym,
    history,
    now: NOW,
    duration: 'default',
    constraints: { painJoints },
  });
  const constraints: SessionConstraints = { ...emptyConstraints(), painJoints };
  const fatigue = interpretFatigue(history, NOW);
  const input: CoachInput = {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints,
    profile,
    history,
    now: NOW,
    fatigue,
    strategy: analyzeStrategy({ history, profile, now: NOW, fatigue }),
    lastExportAt: NOW,
    workoutCount: history.length,
    location: gym,
  };
  const taps = gatherSignals(input).flatMap((signal) => {
    const action = signal.action;
    if (action?.kind !== 'lasting-swap') return [];
    const result = recalibrate({
      trigger: { type: 'replace', entryId: action.entryId, exerciseId: action.exerciseId },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile,
      location: gym,
      loading: { missingPlates: [] },
      history,
      constraints,
      reason: 'test',
      timestamp: NOW,
    });
    return [
      { offer: `${signal.headline}: ${action.label}`, tap: result.ok ? 'made' : result.error },
    ];
  });
  // The one card Today shows.
  const shown = conductCoach(input)?.signal.headline ?? null;
  return { plan: describeWorkout(workout).join('; '), taps, shown };
}

describe('the pain pattern’s card on a day a joint is flagged', () => {
  it('offers no four-week swap the joint flagged today rules out', () => {
    const today = day(['shoulder']);
    expect(today.plan).toContain('close-grip-bench-press');
    // On e779122 and 333f1d4 the card Today shows is "Wrist pain with Close-Grip Bench Press, not
    // with Dip", its tap "Use Dip for 4 weeks" refused: "Dip puts high stress on the shoulder you
    // flagged." A swap the day turns down is no offer (the twenty-first pass): the card is not shown.
    expect(today.shown).not.toBe('Wrist pain with Close-Grip Bench Press, not with Dip');
    for (const { offer, tap } of today.taps) expect(tap, offer).toBe('made');
  });

  it('with no joint flagged, the card’s tap is taken', () => {
    const today = day([]);
    expect(today.shown).toBe('Wrist pain with Close-Grip Bench Press, not with Dip');
    expect(today.taps).toEqual([
      {
        offer: 'Wrist pain with Close-Grip Bench Press, not with Dip: Use Dip for 4 weeks',
        tap: 'made',
      },
    ]);
  });
});
