import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { RecalibrationSuccess, RecalibrationTrigger, SessionConstraints } from './types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, profileOf, session } from '../../test/clockDays';

/**
 * Eighteenth review of round M, on the seventeenth pass's `keepSwappedAway` (found by the random
 * runs). The code's doc: "a swap keeps the lift it replaced away through every later swap, and so
 * through the stand-in's leaving"; the report: "a swap keeps the lift it replaced away". A lifter's
 * own swap (`replace`) puts the lift it replaced on no list, and the lift is put on the avoid list
 * only once what stood in for it leaves the plan with nothing in its place. When "Uncomfortable" or
 * "Hurts" finds something to come in, the search (`bestAlternative`) passes over the lifts in the
 * plan and those set aside, so the very lift the lifter swapped away a moment before comes back as
 * what comes in for comfort or pain: the "later swap" itself undoes the swap.
 *
 * Steps (synthetic data only): at home with dumbbells, a catch-up for the abs is the dead bug. The
 * lifter swaps it for the plank, then taps "Uncomfortable" on the plank: "Plank replaced by Dead Bug
 * for comfort." With "Hurts" (knee) in place of "Uncomfortable": "Protecting your knee: 1 exercise
 * replaced.", the dead bug again. On a push day the schedule ticks: the push-up swapped for the
 * diamond push-up, then "Uncomfortable": "Diamond Push-Up replaced by Push-Up for comfort."
 *
 * Also fails on 532aba6.
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const profile = profileOf();
const records = [session(at(3, 18), [['barbell-row', 3]])];
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');

function today(now: string, constraints: SessionConstraints, catchUp?: CatchUpSpec) {
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location: home,
    history: records,
    now,
    duration: 'default',
    constraints: catchUp ? { catchUp } : { templateId: 'push-arms' },
  });
  let current = constraints;
  const steps: string[] = [lifts(workout)];
  return {
    get workout() {
      return workout;
    },
    steps,
    find: (id: string) => allEntries(workout.blocks).find((entry) => entry.exerciseId === id)!,
    run(trigger: RecalibrationTrigger): RecalibrationSuccess {
      const result = recalibrate({
        trigger,
        workout,
        completed: emptyCompleted(),
        lockedEntryIds: [],
        currentEntryId: null,
        duration: 'default',
        profile,
        location: home,
        loading: { missingPlates: [] },
        history: records,
        constraints: current,
        reason: 'test',
        timestamp: now,
      });
      if (!result.ok) throw new Error(result.error);
      workout = result.workout;
      current = result.constraints;
      steps.push(`${trigger.type}: ${result.summary.headline} => ${lifts(workout)}`);
      return result;
    },
  };
}

const abs: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [{ muscle: 'abs', sets: 2, minRir: 1, why: 'behind' }],
  sitOut: [],
};
const changes: [string, (entry: WorkoutEntry) => RecalibrationTrigger][] = [
  ['"Uncomfortable"', (entry) => ({ type: 'uncomfortable', entryId: entry.id })],
  ['"Hurts" (knee)', (entry) => ({ type: 'pain', entryId: entry.id, joint: 'knee' })],
];

describe('what comes in for comfort or pain is never the lift the lifter swapped away', () => {
  for (const [name, change] of changes) {
    it(`a catch-up for the abs: the dead bug swapped for the plank, then ${name} on the plank`, () => {
      const NOW = at(9, 18);
      const day = today(NOW, { ...emptyConstraints(), catchUp: abs }, abs);
      expect(lifts(day.workout)).toBe('dead-bug x2 @RIR 2/2');
      day.run({ type: 'replace', entryId: day.find('dead-bug').id, exerciseId: 'plank' });
      day.run(change(day.find('plank')));
      // On 4cb40d7: the dead bug comes in for the plank, the lift swapped away a moment before.
      expect(
        allEntries(day.workout.blocks).map((entry) => entry.exerciseId),
        day.steps.join(' | '),
      ).not.toContain('dead-bug');
    });
  }

  it('a push day the schedule ticks: the push-up swapped for the diamond push-up, then "Uncomfortable"', () => {
    const NOW = at(8, 18);
    const day = today(NOW, emptyConstraints());
    day.run({ type: 'replace', entryId: day.find('push-up').id, exerciseId: 'diamond-push-up' });
    day.run({ type: 'uncomfortable', entryId: day.find('diamond-push-up').id });
    // On 4cb40d7: "Diamond Push-Up replaced by Push-Up for comfort."
    expect(
      allEntries(day.workout.blocks).map((entry) => entry.exerciseId),
      day.steps.join(' | '),
    ).not.toContain('push-up');
  });
});
