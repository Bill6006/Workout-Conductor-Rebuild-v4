import { describe, expect, it } from 'vitest';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { RecalibrationSuccess, RecalibrationTrigger, SessionConstraints } from './types';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Eighteenth review of round M, on the seventeenth pass's `keepSwappedAway`. The report: "A lift
 * leaving the plan by the lifter's hand (skipped, or left out for comfort or pain) takes the lift it
 * stood in for with it, unless the lifter put that lift back in the plan, on any day: a swap keeps
 * the lift it replaced away." The code's doc: "a swap keeps the lift it replaced away through every
 * later swap, and so through the stand-in's leaving".
 *
 * The fix reads one name only, `replacedFrom`, which a swap of a swap keeps pointing at the plan's
 * first pick (`applySubstitution`: `own = entry.replacedFrom ?? previousId`). A lifter's own swap
 * (`replace`) puts nothing on the avoid list, so in a chain of two swaps the lift in the middle,
 * which the second swap replaced, is remembered nowhere: once the last lift leaves the plan, the
 * next rebuild brings it back. ("Uncomfortable" and "Hurts" set their lift aside themselves, so a
 * comfort chain is safe; two swaps of the lifter's are not.)
 *
 * Steps (synthetic data only): at the gym, a catch-up for the chest and the side delts is the bench
 * press and the lateral raise. The lifter swaps the bench press for the close-grip bench press, then
 * the close-grip bench press for the machine chest press, then skips the machine chest press. An end
 * time: "Ends by 7:30 PM: 1 exercise added." The close-grip bench press, the lift the lifter swapped
 * away, is back. The same on a push day the schedule ticks ("on any day").
 *
 * Also fails on 532aba6 (there the bench press itself comes back too: no lift swapped away was
 * remembered).
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const profile = profileOf();
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');

function today(now: string, constraints: SessionConstraints, plan: GeneratedWorkout) {
  let workout = plan;
  let current = constraints;
  const steps: string[] = [lifts(workout)];
  return {
    get workout() {
      return workout;
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

/** Bench press, then the close-grip bench press, then the machine chest press, which is skipped. */
function twoSwapsThenSkip(day: ReturnType<typeof today>) {
  day.run({
    type: 'replace',
    entryId: day.find('barbell-bench-press')!.id,
    exerciseId: 'close-grip-bench-press',
  });
  day.run({
    type: 'replace',
    entryId: day.find('close-grip-bench-press')!.id,
    exerciseId: 'machine-chest-press',
  });
  day.run({ type: 'skip', entryId: day.find('machine-chest-press')!.id });
}

describe('every lift the lifter swapped away stays away once the last swap leaves the plan', () => {
  it('a catch-up at the gym: two swaps of the bench press, the last one skipped, then an end time', () => {
    const NOW = at(9, 18);
    const spec: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [
        { muscle: 'chest', sets: 3, minRir: 1, why: 'behind' },
        { muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' },
      ],
      sitOut: [],
    };
    const day = today(
      NOW,
      { ...emptyConstraints(), catchUp: spec },
      generateWorkout({
        profile,
        location: gym,
        history: records,
        now: NOW,
        duration: 'default',
        constraints: { catchUp: spec },
      }),
    );
    expect(lifts(day.workout)).toBe(
      'barbell-bench-press x3 @RIR 2/2/2; lateral-raise x3 @RIR 1/1/1',
    );
    twoSwapsThenSkip(day);
    expect(lifts(day.workout)).toBe('lateral-raise x3 @RIR 1/1/1');
    day.run({ type: 'end-by', time: at(9, 19, 30) });
    const ids = allEntries(day.workout.blocks).map((entry) => entry.exerciseId);
    expect(ids, day.steps.join(' | ')).not.toContain('barbell-bench-press');
    // On 4cb40d7: "Ends by 7:30 PM: 1 exercise added." close-grip-bench-press x3.
    expect(ids, day.steps.join(' | ')).not.toContain('close-grip-bench-press');
  });

  it('a push day the schedule ticks: the same two swaps, the last one skipped, then an end time', () => {
    const NOW = at(8, 18);
    const day = today(
      NOW,
      emptyConstraints(),
      generateWorkout({
        profile,
        location: gym,
        history: records,
        now: NOW,
        duration: 'default',
        constraints: { templateId: 'push-arms' },
      }),
    );
    expect(day.find('barbell-bench-press')).toBeDefined();
    twoSwapsThenSkip(day);
    day.run({ type: 'end-by', time: at(8, 19, 30) });
    const ids = allEntries(day.workout.blocks).map((entry) => entry.exerciseId);
    expect(ids, day.steps.join(' | ')).not.toContain('barbell-bench-press');
    expect(ids, day.steps.join(' | ')).not.toContain('close-grip-bench-press');
  });
});
