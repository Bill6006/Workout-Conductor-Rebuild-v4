import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { gatherSignals, type CoachInput } from './coachConductor';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { SessionConstraints } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import type { GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';

/**
 * Twenty-first review of round M, on the twentieth pass's fix to the pain pattern's card (item 45,
 * `painPatternSignal`): "The pain card's alternative reads the day's list and today's plan, as
 * every other offer does", so that its tap is not refused (the twentieth pass's finding: "the pain
 * pattern's card could offer a lift swapped away or set aside today, or one already in today's
 * plan, whose tap was refused").
 *
 * On a day off the plan the card's alternative still reads neither the day's resting muscles nor
 * what the day's muscles have left, which the swap reads (the fourteenth pass: "the swap keeps off
 * a muscle that rests or sits out"; the twelfth: "what comes in works a muscle its lift went in
 * for, none the plan's other lifts have given its sets"; and item 12: "No swap brings in a lift for
 * a muscle the day leaves alone: not a kept swap ..."). The coverage card's accessory reads the
 * day's resting muscles (`restingToday`); the pain card's four-week swap does not. So the card
 * offers "Use Romanian Deadlift for 4 weeks" and its tap is refused, the class the twentieth pass
 * fixed.
 *
 * Steps (synthetic data only): lower-back pain logged with the back squat on two lower days a week
 * apart, and the Romanian deadlift done in its place (swapped in for it) on two lower days since,
 * without a report. The coach: "Lower back pain with Back Squat, not with Romanian Deadlift", "Use
 * Romanian Deadlift for 4 weeks".
 * - A catch-up for the quads and the glutes (the back squat), the hamstrings trained yesterday: the
 *   tap is refused, "Romanian Deadlift works the hamstrings, which rest today, so nothing was
 *   changed."
 * - A catch-up for the glutes and the hamstrings (the back squat and the leg curl): refused,
 *   "Romanian Deadlift would give the hamstrings more than they lack today, so nothing was
 *   changed."
 * - A second workout for the quads and the glutes, the hamstrings trained this morning sitting out:
 *   refused, "Romanian Deadlift works the hamstrings, which rest today, so nothing was changed."
 * A catch-up for the quads and the glutes that leaves the hamstrings free takes the same card's
 * tap.
 *
 * The coach's other four-week swap, the variety offer for an accessory gone flat (item 49,
 * `varietyOffer`), reads the same lists and no more, and is refused the same way: the wrist curl
 * logged for thirteen weeks, no higher than eight weeks before; a catch-up for the forearms, the
 * biceps trained yesterday: "Wrist Curl: no higher in eight weeks", "Use Cable Curl for 4 weeks",
 * refused, "Cable Curl works the biceps, which rest today, so nothing was changed."
 *
 * All four also fail on 0fe4cb9 (from items 45 and 49 and the round's own rules).
 */

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW) as [
  LocationProfile,
  LocationProfile,
];
const sets3 = (reps: number, weight: number): [number, number, number][] => [
  [reps, weight, 2],
  [reps, weight, 2],
  [reps, weight, 2],
];
const squatHurt = (days: number): WorkoutRecord => ({
  ...record(days, 'back-squat', sets3(5, 185)),
  templateId: 'lower',
  painJoints: ['lower-back'],
  painReports: [{ exerciseId: 'back-squat', joint: 'lower-back' }],
});
const deadliftForSquat = (days: number): WorkoutRecord => {
  const base = record(days, 'romanian-deadlift', sets3(10, 135), [8, 12]);
  return {
    ...base,
    templateId: 'lower',
    painReports: [],
    entries: base.entries.map((entry) => ({ ...entry, replacedFrom: 'back-squat' })),
  };
};
const pattern: WorkoutRecord[] = [
  squatHurt(20),
  deadliftForSquat(16),
  squatHurt(13),
  deadliftForSquat(9),
];
const legCurl = (when: string): WorkoutRecord => ({
  ...record(0, 'leg-curl', sets3(10, 80), [8, 12]),
  id: `w-leg-curl-${when}`,
  startedAt: when,
  completedAt: when,
  templateId: 'lower',
  painReports: [],
});
/**
 * The wrist curl, weekly for thirteen weeks: 40 lb for 14 reps until seven weeks back, then up from
 * 9 to 12 reps, no higher than eight weeks before and no stall.
 */
const wristCurlFlat: WorkoutRecord[] = Array.from({ length: 13 }, (_, week) => ({
  ...record(
    3 + week * 7,
    'wrist-curl',
    sets3(week >= 6 ? 14 : 12 - Math.floor(week / 2), 40),
    [10, 15],
  ),
  templateId: 'pull-arms',
  painReports: [],
}));
const behind = (muscle: CatchUpSpec['muscles'][number]['muscle']) => ({
  muscle,
  sets: 3,
  minRir: 1,
  why: 'behind' as const,
});

/** The plan, and each four-week swap the coach's cards offer with what its tap does. */
function day(spec: CatchUpSpec, extra: WorkoutRecord[], base: WorkoutRecord[] = pattern) {
  const history = [...base, ...extra];
  const workout: GeneratedWorkout = generateWorkout({
    profile,
    location: gym,
    history,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  const constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec };
  const fatigue = interpretFatigue(history, NOW, null);
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
      {
        offer: `${signal.headline}: ${action.label}`,
        tap: result.ok ? 'made' : result.error,
      },
    ];
  });
  return { plan: describeWorkout(workout).join('; '), taps };
}

describe('the coach’s four-week swaps on a day off the plan', () => {
  it('a catch-up whose hamstrings rest: no four-week swap the swap refuses', () => {
    const today = day(
      { kind: 'catch-up', muscles: [behind('quads'), behind('glutes')], sitOut: [] },
      [legCurl('2026-09-09T12:00:00.000Z')],
    );
    expect(today.plan).toBe('back-squat x3 @RIR 2/2/2');
    // On 333f1d4 and 0fe4cb9: "Lower back pain with Back Squat, not with Romanian Deadlift: Use
    // Romanian Deadlift for 4 weeks", refused: "Romanian Deadlift works the hamstrings, which rest
    // today, so nothing was changed."
    for (const { offer, tap } of today.taps) expect(tap, offer).toBe('made');
  });

  it('a catch-up whose hamstrings have their sets: no four-week swap the swap refuses', () => {
    const today = day(
      { kind: 'catch-up', muscles: [behind('glutes'), behind('hamstrings')], sitOut: [] },
      [],
    );
    expect(today.plan).toBe('back-squat x3 @RIR 2/2/2; leg-curl x3 @RIR 1/1/1');
    // On 333f1d4 and 0fe4cb9: refused, "Romanian Deadlift would give the hamstrings more than they
    // lack today, so nothing was changed."
    for (const { offer, tap } of today.taps) expect(tap, offer).toBe('made');
  });

  it('a second workout whose hamstrings sit out: no four-week swap the swap refuses', () => {
    const today = day(
      { kind: 'second', muscles: [behind('quads'), behind('glutes')], sitOut: ['hamstrings'] },
      [legCurl('2026-09-10T08:00:00.000Z')],
    );
    expect(today.plan).toBe('back-squat x3 @RIR 2/2/2');
    // On 333f1d4 and 0fe4cb9: refused, "Romanian Deadlift works the hamstrings, which rest today,
    // so
    // nothing was changed."
    for (const { offer, tap } of today.taps) expect(tap, offer).toBe('made');
  });

  it('the variety offer, a catch-up whose biceps rest: no four-week swap the swap refuses', () => {
    const today = day(
      { kind: 'catch-up', muscles: [behind('forearms')], sitOut: [] },
      [{ ...record(1, 'barbell-curl', sets3(10, 60), [8, 12]), templateId: 'pull-arms' }],
      wristCurlFlat,
    );
    expect(today.plan).toBe('wrist-curl x2 @RIR 1/1');
    // On 333f1d4 and 0fe4cb9: "Wrist Curl: no higher in eight weeks: Use Cable Curl for 4 weeks",
    // refused: "Cable Curl works the biceps, which rest today, so nothing was changed."
    for (const { offer, tap } of today.taps) expect(tap, offer).toBe('made');
  });

  it('a catch-up that leaves the hamstrings free takes the card’s tap', () => {
    const today = day(
      { kind: 'catch-up', muscles: [behind('quads'), behind('glutes')], sitOut: [] },
      [],
    );
    expect(today.plan).toBe('back-squat x3 @RIR 2/2/2');
    expect(today.taps).toEqual([
      {
        offer:
          'Lower back pain with Back Squat, not with Romanian Deadlift: Use Romanian Deadlift for 4 weeks',
        tap: 'made',
      },
    ]);
  });
});
