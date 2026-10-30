import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  CompletedWork,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, profileOf, session, working } from '../../test/clockDays';

/**
 * Sixteenth review of round M. Names are settled once every lift is picked, and "the change list
 * names only what changed". The fifteenth pass took a new name "past every name taken and every
 * name the plan had" (a stand-in took the leg curl's name, "Replaced Leg Curl"), but only where the
 * slot's own name (`e<slot + 1>`) is taken: the slot's own name may itself be a name the plan had
 * for another lift, one this rebuild leaves out, and the change list then reads the new lift as
 * that lift's replacement. A stand-in made in the workout is named one past the workout's names
 * (`spareEntryId`), which is the own name of the first slot with no lift, often a slot the time fit
 * left out.
 *
 * A lower day at home, 15 minutes: the goblet squat (e1, slot 0) and the dumbbell Romanian deadlift
 * (e2, slot 1), the other slots left out for time. A set of the goblet squat, then "Hurts" (knee):
 * the glute bridge stands in for it, named e3. "Uncomfortable" on the deadlift brings the dumbbell
 * reverse lunge. Then "Make it harder": the glute bridge and the reverse lunge give way, and the
 * Bulgarian split squat's slot (slot 2, own name e3) takes the reverse lunge, named e3. The change
 * list: "Replaced Glute Bridge with Reverse Lunge." The reverse lunge replaced nothing in the glute
 * bridge's place; the glute bridge was left out. Synthetic data only.
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const NOW = at(9, 18);
const records = [session(at(3, 18), [['barbell-row', 3]])];
const profile = profileOf();
const lifts = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks)
    .map((entry) => `${entry.id} ${entry.exerciseId} (slot ${entry.slot})`)
    .join('; ');

describe('a new lift is never named for a lift the same rebuild leaves out', () => {
  it('a lower day at home, 15 min: the glute bridge in for pain, then "Make it harder"', () => {
    let workout: GeneratedWorkout = generateWorkout({
      profile,
      location: home,
      history: records,
      now: NOW,
      duration: 15,
      constraints: { templateId: 'lower' },
    });
    let constraints: SessionConstraints = { ...emptyConstraints() };
    expect(describeWorkout(workout)).toEqual([
      'goblet-squat x3 @RIR 2/2/2',
      'dumbbell-romanian-deadlift x2 @RIR 1/1',
    ]);
    const squat = allEntries(workout.blocks)[0]!;
    const first = working(squat)[0]!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 240,
      currentEntryId: squat.id,
      sets: [
        {
          entryId: squat.id,
          exerciseId: squat.exerciseId,
          setIndex: first.index,
          kind: 'working',
          reps: 10,
          weight: first.targetWeight,
          rir: 2,
          completedAt: at(9, 18, 4),
        },
      ],
    };
    const run = (trigger: RecalibrationTrigger): RecalibrationSuccess => {
      const result = recalibrate({
        trigger,
        workout,
        completed,
        lockedEntryIds: [],
        currentEntryId: completed.currentEntryId,
        duration: 15,
        profile,
        location: home,
        loading: { missingPlates: [] },
        history: records,
        constraints,
        reason: 'test',
        timestamp: at(9, 18, 10),
      });
      if (!result.ok) throw new Error(result.error);
      workout = result.workout;
      constraints = result.constraints;
      return result;
    };
    run({ type: 'pain', entryId: squat.id, joint: 'knee' });
    const bridge = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'glute-bridge');
    expect(bridge, lifts(workout)).toBeDefined();
    const rdl = allEntries(workout.blocks).find(
      (entry) => entry.exerciseId === 'dumbbell-romanian-deadlift',
    )!;
    run({ type: 'uncomfortable', entryId: rdl.id });
    const before = lifts(workout);
    const harder = run({ type: 'intensity', direction: 'harder' });
    const detail = `${before} -> ${harder.summary.details.join(' / ')} | ${lifts(workout)}`;
    // On 89dfb39: "Replaced Glute Bridge with Reverse Lunge.", the reverse lunge named e3 in slot 2.
    const told = harder.changes.find(
      (change) =>
        change.kind === 'replaced' &&
        change.previousExerciseId === 'glute-bridge' &&
        change.exerciseId === 'reverse-lunge',
    );
    expect(told?.detail, detail).toBeUndefined();
  });
});
