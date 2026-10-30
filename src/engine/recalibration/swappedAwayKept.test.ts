import { describe, expect, it } from 'vitest';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { RecalibrationSuccess, RecalibrationTrigger, SessionConstraints } from './types';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * The seventeenth review of round M: a swap keeps the lift it replaced away through every later
 * swap, and so through the stand-in's leaving the plan by the lifter's hand. Skipped, the lift that
 * stood in takes the lift swapped away with it, on a day of the plan too; but a lift the lifter put
 * back in the plan elsewhere stays. Synthetic data only.
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(8, 18);
const profile = profileOf();

function pushDay() {
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location: gym,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
  let constraints: SessionConstraints = emptyConstraints();
  const steps: string[] = [describeWorkout(workout).join('; ')];
  return {
    get workout() {
      return workout;
    },
    get constraints() {
      return constraints;
    },
    steps,
    find: (id: string) => allEntries(workout.blocks).find((entry) => entry.exerciseId === id),
    run(trigger: RecalibrationTrigger): RecalibrationSuccess {
      const result = recalibrate({
        trigger,
        workout,
        completed: emptyCompleted(),
        lockedEntryIds: [],
        currentEntryId: null,
        duration: 'default',
        profile,
        location: gym,
        loading: { missingPlates: [] },
        history: records,
        constraints,
        reason: 'test',
        timestamp: NOW,
      });
      if (!result.ok) throw new Error(result.error);
      workout = result.workout;
      constraints = result.constraints;
      steps.push(`${trigger.type}: ${describeWorkout(workout).join('; ')}`);
      return result;
    },
  };
}

describe('a lift swapped away stays away once what stood in for it leaves', () => {
  it('the bench press swapped for the dumbbell bench press, that skipped, then an end time', () => {
    const day = pushDay();
    day.run({
      type: 'replace',
      entryId: day.find('barbell-bench-press')!.id,
      exerciseId: 'dumbbell-bench-press',
    });
    day.run({ type: 'skip', entryId: day.find('dumbbell-bench-press')!.id });
    // Turned away, not disliked: the lifter may still put it back (the eighteenth review).
    expect(day.constraints.swappedAway).toContain('barbell-bench-press');
    expect(day.constraints.avoidExerciseIds).not.toContain('barbell-bench-press');
    day.run({ type: 'end-by', time: at(8, 19, 30) });
    expect(day.find('barbell-bench-press'), day.steps.join(' | ')).toBeUndefined();
  });

  it('but one the lifter put back in the plan elsewhere stays', () => {
    const day = pushDay();
    day.run({
      type: 'replace',
      entryId: day.find('barbell-bench-press')!.id,
      exerciseId: 'dumbbell-bench-press',
    });
    day.run({
      type: 'replace',
      entryId: day.find('cable-fly')!.id,
      exerciseId: 'barbell-bench-press',
    });
    day.run({ type: 'skip', entryId: day.find('dumbbell-bench-press')!.id });
    expect(day.constraints.avoidExerciseIds).not.toContain('barbell-bench-press');
    // Still swapped away from its own place (the nineteenth review): it stands where the lifter
    // put it, and no pick of the plan's own brings it back anywhere else.
    expect(day.constraints.swappedAway).toContain('barbell-bench-press');
    day.run({ type: 'end-by', time: at(8, 19, 30) });
    expect(day.find('barbell-bench-press'), day.steps.join(' | ')).toBeDefined();
  });
});
