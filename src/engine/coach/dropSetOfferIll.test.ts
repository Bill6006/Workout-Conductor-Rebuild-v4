import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import {
  conductCoach,
  emptyDeclines,
  gatherSignals,
  recordDecline,
  type CoachInput,
  type CoachSignal,
} from './coachConductor';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type {
  Readiness,
  RecalibrationRequest,
  RecalibrationTrigger,
  SessionConstraints,
} from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { RECORD_NOW, record } from '../../test/records';

/**
 * The first adversarial review of Maintenance 33: the coach offers an optional drop set on a day
 * the illness gate says keeps every set short of failure (a head cold).
 *
 * Steps: a hybrid lifter with drop sets on checks in with a head cold before the push day. The
 * check-in takes the EZ-bar curl's drop set off and holds every set at 2 or more in reserve. The
 * coach's tips then offer "Optional drop set on Cable Fly", "Add the drop set" (it shows once the
 * weekly-coverage card above it is put away); the lifter taps it.
 *
 * The rule: `RULES.headColdRir` ("every set at 2 or more in reserve"); the report: "Illness: above
 * the neck, every set keeps two or more reps in reserve", "no top set or drop set"; recalibrate.ts:
 * "A drop set goes to failure; a head cold keeps every set 2 or more short of it".
 *
 * What happens: `tipSignals` never reads the check-in, so the drop-set opportunity is offered on the
 * head cold day; tapping it fails with "A head cold today: every set stops 2 or more short of
 * failure, so no drop set."
 *
 * Synthetic data only.
 */

const base = createDefaultProfile(RECORD_NOW);
const profile = {
  ...base,
  bodyweight: 185,
  programStyle: 'hybrid' as const,
  techniques: { ...base.techniques, dropSets: true },
};
const gym = createDefaultLocations({ gymAccess: true }, RECORD_NOW).find(
  (place) => place.id === 'gym',
)!;
const history = [7, 3].map((daysAgo) =>
  record(
    daysAgo,
    'barbell-bench-press',
    [
      [5, 185, 2],
      [5, 185, 2],
      [5, 185, 2],
    ],
    [4, 6],
    2,
  ),
);

const ill = (illness: NonNullable<Readiness['illness']>): Readiness => ({
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
  illness,
});

function run(
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  constraints: SessionConstraints,
) {
  const request: RecalibrationRequest = {
    trigger,
    workout,
    completed: emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: null,
    duration: 'default',
    profile,
    location: gym,
    history,
    constraints,
    reason: 'test',
    timestamp: RECORD_NOW,
  };
  return recalibrate(request);
}

function day(illness: NonNullable<Readiness['illness']>, status: CoachInput['status']) {
  const plan = generateWorkout({
    profile,
    location: gym,
    history,
    now: RECORD_NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
  const checked = run({ type: 'readiness', readiness: ill(illness) }, plan, emptyConstraints());
  if (!checked.ok) throw new Error(checked.error);
  const input: CoachInput = {
    workout: checked.workout,
    status,
    duration: 'default',
    completed: emptyCompleted(),
    constraints: checked.constraints,
    profile,
    history,
    now: RECORD_NOW,
    fatigue: interpretFatigue(history, RECORD_NOW),
    strategy: [],
    lastExportAt: RECORD_NOW,
    workoutCount: history.length,
  };
  return { input, checked };
}

const dropSetOffer = (input: CoachInput): CoachSignal | undefined =>
  gatherSignals(input).find(
    (signal) =>
      signal.action?.kind === 'recalibrate' &&
      signal.action.trigger.type === 'drop-set' &&
      signal.action.trigger.on,
  );

describe('the optional drop set on an illness day', () => {
  it('is never offered with a head cold, where tapping it can only fail', () => {
    const { input, checked } = day('head', 'preview');
    // The check-in itself took the plan's drop set off.
    expect(allEntries(checked.workout.blocks).some((entry) => entry.dropSet)).toBe(false);
    const offer = dropSetOffer(input);
    // On screen: Not now on any card above it until it shows.
    let shown = { ...input, declines: emptyDeclines() };
    for (let tries = 0; tries < 6; tries += 1) {
      const card = conductCoach(shown)?.signal;
      if (!card || card.source === offer?.source) break;
      shown = { ...shown, declines: recordDecline(shown.declines, card, RECORD_NOW) };
    }
    if (offer) expect(conductCoach(shown)?.signal.headline).toBe(offer.headline);
    if (offer?.action?.kind === 'recalibrate') {
      const tapped = run(offer.action.trigger, checked.workout, checked.constraints);
      // What the lifter meets on the tap: an error.
      expect(tapped.ok ? 'added' : tapped.error).toBe(
        'A head cold today: every set stops 2 or more short of failure, so no drop set.',
      );
    }
    expect(offer?.headline).toBeUndefined();
  });
});
