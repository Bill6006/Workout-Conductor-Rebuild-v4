import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { gatherSignals, type CoachInput } from './coachConductor';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { RecalibrationTrigger, SessionConstraints } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { record } from '../../test/records';

/**
 * Nineteenth review of round M, on the eighteenth pass's `swappedAway`, where it meets the coach's
 * coverage card. The report: "A lift the lifter swaps away stays away for the day (`swappedAway`): no
 * change picks it by itself". The coach's own rule for the lifter's swaps (`CoachInput.swaps`): "an
 * exercise swapped out is never offered", which its tests hold for a swap kept for weeks ("never
 * offers an accessory the lifter swapped out for weeks").
 *
 * The coach picks its accessory itself (`pickAccessoryFor`), reading the day's avoid list and the
 * kept swaps, not the lifts swapped away today. Until the eighteenth pass, a lift swapped away whose
 * stand-in the lifter then skipped went on the avoid list (`keepSwappedAway`), so the card offered
 * another lift; now it is on `swappedAway` only, and the card offers the very lift the lifter just
 * turned away, one tap from putting it back in the plan.
 *
 * Steps (synthetic data only): half the week done (two bench press sessions); at home, the push day
 * has the dumbbell curl as its only biceps lift. The lifter swaps it for the hammer curl, then skips
 * the hammer curl. The coach: "Biceps are under target this week", "Add 2 sets of Dumbbell Curl". On
 * 4cb40d7: "Add 2 sets of Incline Dumbbell Curl".
 *
 * Passes on 4cb40d7.
 */

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [home] = createDefaultLocations({ gymAccess: true }, NOW) as [LocationProfile];
const history: WorkoutRecord[] = [
  record(1, 'barbell-bench-press', [[5, 185, 2]]),
  record(3, 'barbell-bench-press', [[5, 185, 2]]),
];

function pushDay() {
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location: home,
    history,
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
  let constraints: SessionConstraints = emptyConstraints();
  return {
    get workout() {
      return workout;
    },
    find: (id: string) => allEntries(workout.blocks).find((entry) => entry.exerciseId === id),
    run(trigger: RecalibrationTrigger) {
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
        history,
        constraints,
        reason: 'test',
        timestamp: NOW,
      });
      if (!result.ok) throw new Error(`${trigger.type}: ${result.error}`);
      workout = result.workout;
      constraints = result.constraints;
    },
    /** The exercises the coach offers to add, as its cards' actions name them. */
    offered(): string[] {
      const fatigue = interpretFatigue(history, NOW);
      const input: CoachInput = {
        workout,
        status: 'preview',
        duration: 'default',
        completed: emptyCompleted(),
        constraints,
        profile,
        history,
        now: NOW,
        fatigue,
        strategy: analyzeStrategy({ history, profile, now: NOW, fatigue }),
        lastExportAt: NOW,
        workoutCount: history.length,
        location: home,
      };
      return gatherSignals(input).flatMap((signal) =>
        signal.action?.kind === 'recalibrate' && signal.action.trigger.type === 'add-exercise'
          ? [signal.action.trigger.exerciseId]
          : [],
      );
    },
  };
}

describe('the coach’s coverage card after the lifter swapped a lift away', () => {
  it('offers another lift than the one swapped away', () => {
    const day = pushDay();
    const biceps = allEntries(day.workout.blocks).filter((entry) =>
      ['dumbbell-curl', 'hammer-curl', 'incline-dumbbell-curl'].includes(entry.exerciseId),
    );
    expect(biceps.map((entry) => entry.exerciseId)).toEqual(['dumbbell-curl']);
    day.run({
      type: 'replace',
      entryId: day.find('dumbbell-curl')!.id,
      exerciseId: 'hammer-curl',
    });
    day.run({ type: 'skip', entryId: day.find('hammer-curl')!.id });
    const offered = day.offered();
    // The card is there: nothing for the biceps today, and room for two sets.
    expect(offered.length).toBeGreaterThan(0);
    // On 0f8d10f: ['dumbbell-curl'].
    expect(offered).not.toContain('dumbbell-curl');
  });
});
