import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import {
  TOO_SOON_SOURCE,
  conductCoach,
  gatherSignals,
  isNudge,
  type CoachInput,
} from './coachConductor';
import { REST_TODAY } from '../readiness/checkIn';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { generateWorkout } from '../workoutGenerator/generate';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';

/**
 * The first adversarial review of Maintenance 33: on a fever rest day, before the start, the coach
 * still offers to make today's workout lighter.
 *
 * Steps: the chest worked hard 20 h ago (four bench sets a rep short of failure: a 36 h window).
 * Before the start the lifter checks in "Fever or aches". The check-in says "Fever or aches all
 * over: rest today, and train again once they have gone.", and Today hides Start.
 *
 * The rule: the readiness model's illness gate: "fever or aches all over, a rest day: Today hides
 * Start" (the report); `REST_TODAY`; the proposal, part 2: "With fever or whole-body symptoms, no
 * session". The coach talks only about the workout on the screen, and the new cards keep to one a
 * day and three a week (decision 5).
 *
 * What happens: `tooSoonSignals` never reads the illness, and the illness card is only for a
 * workout under way, so the coach's card on the rest day is "The chest may not have recovered",
 * "Lighter keeps the loads: a set fewer and a rep more in reserve on its lifts today.", with the
 * button "Lighter for the chest" for a workout that cannot be started. It is a new card, so it is
 * recorded as seen and uses the day's one new card.
 *
 * Synthetic data only.
 */

const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
const gym = createDefaultLocations({ gymAccess: true }, RECORD_NOW).find(
  (place) => place.id === 'gym',
)!;

const benchAt = (daysAgo: number, first: SetSpec, rir: number): WorkoutRecord => ({
  ...record(
    daysAgo,
    'barbell-bench-press',
    [first, [8, 100, rir], [8, 100, rir], [8, 100, rir]],
    [6, 10],
    rir,
  ),
  id: `bench-${daysAgo}`,
});

describe('the coach on a fever rest day', () => {
  it('offers no lighter workout for a day with nothing to start', () => {
    const history = [benchAt(20 / 24, [8, 100, 1], 1)];
    const plan = generateWorkout({
      profile,
      location: gym,
      history,
      now: RECORD_NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const checked = recalibrate({
      trigger: {
        type: 'readiness',
        readiness: {
          energy: 3,
          soreness: 2,
          sleep: 3,
          motivation: 3,
          jointDiscomfort: [],
          timePressure: false,
          illness: 'body',
        },
      },
      workout: plan,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile,
      location: gym,
      history,
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: RECORD_NOW,
    });
    if (!checked.ok) throw new Error(checked.error);
    expect(checked.summary.headline).toBe(REST_TODAY);
    const input: CoachInput = {
      workout: checked.workout,
      status: 'preview',
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
    const card = conductCoach(input)?.signal;
    expect(card?.action?.label ?? '').not.toMatch(/^Lighter for the /);
    expect(card !== undefined && isNudge(card)).toBe(false);
    expect(
      gatherSignals(input).filter((signal) => signal.source.startsWith(`${TOO_SOON_SOURCE}|`)),
    ).toEqual([]);
  });
});
