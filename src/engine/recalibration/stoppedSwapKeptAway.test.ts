import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
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
 * Eighteenth review of round M, on the seventeenth pass's `keepSwappedAway`. The report: "A lift
 * leaving the plan by the lifter's hand (skipped, or left out for comfort or pain) takes the lift it
 * stood in for with it, unless the lifter put that lift back in the plan, on any day: a swap keeps
 * the lift it replaced away." The code's doc: "a swap keeps the lift it replaced away through every
 * later swap, and so through the stand-in's leaving".
 *
 * `keepSwappedAway` runs only where the lift is removed. A lift begun has its sets kept, so
 * "Uncomfortable" or "Hurts" with nothing to come in stops it at its sets done (`stopAtLogged`)
 * instead, and the lift it stood in for is put on no list. On a day of the plan the stop owes its
 * slot the sets still to come (`why: 'swap'`), and the next rebuild fills them with the slot's own
 * pick: the very lift the lifter swapped away.
 *
 * Steps (synthetic data only): a push day the schedule ticks, at home with dumbbells: the push-up
 * leads. The lifter swaps it for the Arnold press, does a set, and taps "Uncomfortable": "Arnold
 * Press stops at the sets done: no comfortable alternative fits Home." Then an end time: "Ends by
 * 7:30 PM: 1 exercise added." The push-up is back, for the Arnold press's three sets owed. The same
 * with "Hurts" (knee) in place of "Uncomfortable" ("Arnold Press stops at the sets done: nothing safe
 * fits right now.").
 *
 * Also fails on 532aba6 (no lift swapped away was remembered then).
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const NOW = at(8, 18);
const profile = profileOf();
const records = [session(at(3, 18), [['barbell-row', 3]])];
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');

function pushDay() {
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location: home,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
  let constraints: SessionConstraints = emptyConstraints();
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
            reps: 10,
            weight: set.targetWeight,
            rir: 2,
            completedAt: at(8, 18, clock),
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
        location: home,
        loading: { missingPlates: [] },
        history: records,
        constraints,
        reason: 'test',
        timestamp: at(8, 18, clock + 1),
      });
      if (!result.ok) throw new Error(result.error);
      workout = result.workout;
      constraints = result.constraints;
      steps.push(`${trigger.type}: ${result.summary.headline} => ${lifts(workout)}`);
      return result;
    },
  };
}

describe('a lift begun and stopped by the lifter takes the lift it stood in for with it', () => {
  const stops: [string, (entry: WorkoutEntry) => RecalibrationTrigger, RegExp][] = [
    [
      '"Uncomfortable"',
      (entry) => ({ type: 'uncomfortable', entryId: entry.id }),
      /^Arnold Press stops at the sets done/,
    ],
    [
      '"Hurts" (knee)',
      (entry) => ({ type: 'pain', entryId: entry.id, joint: 'knee' }),
      /Arnold Press stops at the sets done/,
    ],
  ];
  for (const [name, stop, said] of stops) {
    it(`the push-up swapped for the Arnold press, a set done, ${name}, then an end time`, () => {
      const day = pushDay();
      expect(day.find('push-up')).toBeDefined();
      day.run({ type: 'replace', entryId: day.find('push-up').id, exerciseId: 'arnold-press' });
      day.log(day.find('arnold-press'));
      const stopped = day.run(stop(day.find('arnold-press')));
      expect(
        [stopped.summary.headline, ...stopped.summary.details].join(' '),
        day.steps.join(' | '),
      ).toMatch(said);
      day.run({ type: 'end-by', time: at(8, 19, 30) });
      // On 4cb40d7: "Ends by 7:30 PM: 1 exercise added." push-up x3, the lift swapped away.
      expect(
        allEntries(day.workout.blocks).map((entry) => entry.exerciseId),
        day.steps.join(' | '),
      ).not.toContain('push-up');
    });
  }
});
