import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  CompletedWork,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import { allEntries, isStopped, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, profileOf, session, working } from '../../test/clockDays';

/**
 * Seventeenth review of round M (found by the random runs; from before the round, any day). "The
 * change list names only what changed": the fifteenth and sixteenth passes made a new lift's name
 * past every name the plan had, and no name a lift left out still had, in the generator. A stand-in
 * made in the workout is named by the engine instead (`standIn`, `spareEntryId`: one past the names
 * the workout has as the change stands), and "Hurts" works through the plan's lifts in order
 * (`substituteUnfit`): a lift left out earlier in the same pass has freed its name, and a stand-in
 * made later in the pass takes it. The change list then reads the stand-in as that lift's
 * replacement, a swap that did not happen, and the lift it really stood in for as "2 sets fewer".
 *
 * Steps (synthetic data only): at a home with no equipment, a catch-up for the quads, the
 * hamstrings, the calves and the abs: the Bulgarian split squat (e1), the standing calf raise (e3),
 * the dead bug (e4). A set of the split squat, then "Equipment busy" on it (it moves to the end);
 * "Uncomfortable" on the dead bug brings the plank (still e4); "Hurts" (knee) on the plank. Nothing
 * knee-safe comes in for the plank, which is left out; the split squat under way stops, and the
 * reverse lunge stands in for it, named e4: "Replaced Plank with Reverse Lunge." Without the busy
 * move the same change reads "Replaced Bulgarian Split Squat with Reverse Lunge for the sets still
 * to come. | Left out Plank."
 *
 * Also fails on 89dfb39.
 */

const [bare] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
  LocationProfile,
];
const NOW = at(9, 18);
const profile = profileOf();
const records = [
  session(at(3, 18), [['barbell-row', 3]]),
  session(at(8, 18), [['barbell-curl', 3]]),
];
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [
    { muscle: 'quads', sets: 3, minRir: 1, why: 'behind' },
    { muscle: 'hamstrings', sets: 3, minRir: 1, why: 'behind' },
    { muscle: 'calves', sets: 2, minRir: 1, why: 'behind' },
    { muscle: 'abs', sets: 3, minRir: 1, why: 'behind' },
  ],
  sitOut: [],
};
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');

function day() {
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location: bare,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  let constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec };
  let completed: CompletedWork = { ...emptyCompleted(), startedAt: NOW, elapsedSeconds: 60 };
  let clock = 1;
  const steps: string[] = [lifts(workout)];
  return {
    get workout() {
      return workout;
    },
    steps,
    find: (id: string) =>
      allEntries(workout.blocks).find((entry) => entry.exerciseId === id && !isStopped(entry))!,
    log(entry: WorkoutEntry) {
      const set = working(entry)[0]!;
      clock += 3;
      completed = {
        ...completed,
        elapsedSeconds: completed.elapsedSeconds + 180,
        currentEntryId: entry.id,
        sets: [
          ...completed.sets,
          {
            entryId: entry.id,
            exerciseId: entry.exerciseId,
            setIndex: set.index,
            kind: 'working',
            reps: 8,
            weight: set.targetWeight,
            rir: 2,
            completedAt: at(9, 18, clock),
          },
        ],
      };
      steps.push(`log ${entry.exerciseId}`);
    },
    run(trigger: RecalibrationTrigger): RecalibrationSuccess {
      const result = recalibrate({
        trigger,
        workout,
        completed,
        lockedEntryIds: [],
        currentEntryId: completed.currentEntryId,
        duration: 'default',
        profile,
        location: bare,
        loading: { missingPlates: [] },
        history: records,
        constraints,
        reason: 'test',
        timestamp: at(9, 18, clock + 1),
      });
      if (!result.ok) throw new Error(result.error);
      workout = result.workout;
      constraints = result.constraints;
      steps.push(
        `${trigger.type}: ${result.summary.headline} [${result.changes.map((change) => change.detail).join(' | ')}] => ${lifts(workout)}`,
      );
      return result;
    },
  };
}

describe('a stand-in made in the same "Hurts" pass takes no name a lift left out had', () => {
  it('the split squat moved for busy equipment, the plank in for comfort, then "Hurts" (knee)', () => {
    const today = day();
    expect(lifts(today.workout)).toBe(
      'bulgarian-split-squat x3 @RIR 1/1/1; standing-calf-raise x2 @RIR 1/1; dead-bug x2 @RIR 2/2',
    );
    today.log(today.find('bulgarian-split-squat'));
    today.run({ type: 'equipment-busy', entryId: today.find('bulgarian-split-squat').id });
    today.run({ type: 'uncomfortable', entryId: today.find('dead-bug').id });
    const hurt = today.run({ type: 'pain', entryId: today.find('plank').id, joint: 'knee' });
    const details = hurt.changes.map((change) => change.detail);
    // On 532aba6: "Bulgarian Split Squat: 2 sets fewer. | Replaced Plank with Reverse Lunge."
    expect(details, today.steps.join(' | ')).not.toContain('Replaced Plank with Reverse Lunge.');
    expect(details, today.steps.join(' | ')).toContain(
      'Replaced Bulgarian Split Squat with Reverse Lunge for the sets still to come.',
    );
  });
});
