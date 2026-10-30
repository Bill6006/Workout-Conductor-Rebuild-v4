import { describe, expect, it } from 'vitest';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, profileOf, session } from '../../test/clockDays';

/**
 * Sixteenth review of round M. "What comes in stays through every rebuild, as the lifter's pick
 * does ...; in a catch-up or a second workout, what comes in for comfort or pain is the lifter's
 * pick and stays where the lift it followed fits again" (on a day of the plan it gives way, as
 * before). A second workout with nothing behind this week is a second workout (planned off the
 * plan by the generator, the coach and Today alike), but `keptAsPicked` and `offPlanToday` read only
 * an offer with muscles: what comes in there for comfort is neither kept nor locked, and the next
 * rebuild plans its slot afresh, without it.
 *
 * This morning a lat pulldown and barbell curls; nothing is behind: at home with dumbbells the
 * second workout is the push day without the biceps' curl, the wrist curl in its place for the
 * forearms. "Uncomfortable" on the wrist curl brings the farmer carry. Then "Make it harder", or
 * "45 min": "1 exercise removed", the farmer carry gone and the forearms with no lift. Synthetic
 * data only.
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const NOW = at(9, 18);
const profile = profileOf();
const records = [
  session(at(3, 18), [['leg-press', 3]]),
  session(at(9, 9), [
    ['lat-pulldown', 3],
    ['barbell-curl', 3],
  ]),
];
const sitOut: MuscleId[] = ['lats', 'upper-back', 'biceps'];
const spec: CatchUpSpec = { kind: 'second', muscles: [], sitOut };
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const request = (
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  constraints: SessionConstraints,
): RecalibrationRequest => ({
  trigger,
  workout,
  completed: emptyCompleted(),
  lockedEntryIds: [],
  currentEntryId: null,
  duration: trigger.type === 'duration' ? trigger.choice : 'default',
  profile,
  location: home,
  loading: { missingPlates: [] },
  history: records,
  constraints,
  reason: 'test',
  timestamp: NOW,
});
const succeeded = (result: ReturnType<typeof recalibrate>): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};

describe('a second workout with nothing behind keeps what came in for comfort', () => {
  it.each([
    ['"Make it harder"', { type: 'intensity', direction: 'harder' } as RecalibrationTrigger],
    ['"45 min"', { type: 'duration', choice: 45 } as RecalibrationTrigger],
  ])('the farmer carry in for the wrist curl, then %s', (_, then) => {
    const plan = generateWorkout({
      profile,
      location: home,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const wrist = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'wrist-curl');
    expect(wrist, lifts(plan)).toBeDefined();
    const comfort = succeeded(
      recalibrate(
        request({ type: 'uncomfortable', entryId: wrist!.id }, plan, {
          ...emptyConstraints(),
          catchUp: spec,
        }),
      ),
    );
    expect(comfort.summary.headline).toBe('Wrist Curl replaced by Farmer Carry for comfort.');
    const after = succeeded(recalibrate(request(then, comfort.workout, comfort.constraints)));
    // On 89dfb39: "... 1 exercise removed." The farmer carry is gone.
    expect(
      allEntries(after.workout.blocks).some((entry) => entry.exerciseId === 'farmer-carry'),
      `${after.summary.headline} ${lifts(after.workout)}`,
    ).toBe(true);
  });
});
