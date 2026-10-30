import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type Weekday } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import {
  SCHEDULE_SOURCE,
  conductCoach,
  emptyDeclines,
  gatherSignals,
  recordDecline,
  setAsideForWorkout,
  setAsideKey,
  type CoachInput,
} from './coachConductor';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { generateWorkout } from '../workoutGenerator/generate';
import { RECORD_NOW } from '../../test/records';

/**
 * The first adversarial review of Maintenance 33: the schedule card's new recovery line is cut
 * from the card for intermediate and advanced lifters, the default profile among them.
 *
 * Steps: a lifter on the default profile (intermediate, four days a week on Mon, Tue, Thu and Fri)
 * has trained Monday, Tuesday and Wednesday for four weeks. The coach's card to move the schedule
 * builds the moved week and finds Wednesday's plan works the side delts, lats, biceps and triceps
 * hard again when they may not have recovered. The lifter puts away any card above it until the
 * schedule card shows.
 *
 * The rule: the report, "The schedule card on the same check": the card "says the days whose plan
 * would work a muscle hard again when it may not have recovered, and that the coach offers a lighter
 * option those days"; the proposal, part 1: the schedule card runs the same recovery check "so the
 * two can never contradict". A line that must always show is a `footnote` ("A line under the card
 * that is always shown, never cut with the Why lines").
 *
 * What happens: the line is the third Why line, and `conductCoach` keeps `policy.whyLines` of them:
 * two for an intermediate or advanced lifter. The card on screen says the weeks and the move, and
 * never the days that crowd recovery; only a beginner sees it.
 *
 * Synthetic data only.
 */

const profile = createDefaultProfile(RECORD_NOW);
const gym = createDefaultLocations({ gymAccess: true }, RECORD_NOW).find(
  (place) => place.id === 'gym',
)!;
const OFFSET: Record<Weekday, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function trained(monday: string, day: Weekday): WorkoutRecord {
  const [year, month, date] = monday.split('-').map(Number) as [number, number, number];
  const when = new Date(year, month - 1, date + OFFSET[day], 12).toISOString();
  return {
    id: `w-${monday}-${day}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: 'full-body',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId: 'back-squat',
        sets: [{ kind: 'working' as const, reps: 5, weight: 100, rir: 2, completed: true }],
      },
    ],
  };
}

const history = ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'].flatMap((monday) =>
  (['mon', 'tue', 'wed'] as const).map((day) => trained(monday, day)),
);

const LINE =
  'On Wed the plan would work the side delts, lats, biceps and triceps hard again when they may not have recovered; the coach offers a lighter option that day.';

describe('the schedule card on screen for the default profile', () => {
  it('says the days the moved week crowds recovery', () => {
    expect(profile.experience).toBe('intermediate');
    let input: CoachInput = {
      workout: generateWorkout({
        profile,
        location: gym,
        history,
        now: RECORD_NOW,
        duration: 'default',
      }),
      status: 'preview',
      duration: 'default',
      completed: emptyCompleted(),
      constraints: emptyConstraints(),
      profile,
      history,
      now: RECORD_NOW,
      fatigue: interpretFatigue(history, RECORD_NOW),
      strategy: [],
      lastExportAt: RECORD_NOW,
      workoutCount: history.length,
      location: gym,
      stalls: [],
      declines: emptyDeclines(),
      accepted: [],
    };
    // The card as built carries the line.
    const built = gatherSignals(input).find((signal) => signal.source === SCHEDULE_SOURCE)!;
    expect(built.footnote).toBe(LINE);
    // Any card above it put away (Not now) until it shows.
    for (let tries = 0; tries < 10; tries += 1) {
      const shown = conductCoach(input)?.signal;
      if (!shown || shown.source === SCHEDULE_SOURCE) break;
      input = setAsideForWorkout(shown)
        ? { ...input, accepted: [...(input.accepted ?? []), setAsideKey(shown)] }
        : { ...input, declines: recordDecline(input.declines!, shown, RECORD_NOW) };
    }
    const shown = conductCoach(input)!.signal;
    expect(shown.source).toBe(SCHEDULE_SOURCE);
    expect(shown.footnote).toBe(LINE);
  });
});
