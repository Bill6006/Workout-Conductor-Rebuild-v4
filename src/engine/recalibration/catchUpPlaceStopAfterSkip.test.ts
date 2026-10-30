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
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Seventeenth review of round M: a regression from the sixteenth pass. A lift stopped because a
 * place could not equip it "picks up again where it fits" (`StoppedWork`, `why: 'place'`), and the
 * round keeps "a lift picked up again back at the gym" to the catch-up's sets. The sixteenth pass
 * marks a lift stopped with nothing to come in, off the plan, `why: 'skip'` (owes nothing more). The
 * generator reads what a slot owes as the least any of its stopped lifts owes (`owedBySlot`,
 * `reopened`), so a stand-in stopped that way zeroes the slot: the plan's own lift, stopped only by
 * the place, never picks up again back where it fits, and its muscle loses the set the stand-in
 * could not take. On 89dfb39 the bench press picked up its last set at the gym.
 *
 * Steps (synthetic data only): a catch-up at the gym for the chest and the side delts, the bench
 * press for three sets. One set done, the lifter moves home (dumbbells): the bench press stops at its
 * set, the push-up stands in for two. A set of it done, "Uncomfortable": "Push-Up stops at the sets
 * done: one set left is too few for another lift to take over." Back at the gym: the bench press,
 * which fits there, stays stopped ("Rebuilt for Gym: no changes needed."), the chest at two sets of
 * its three.
 *
 * Passes on 89dfb39 (the bench press picks up again: barbell-bench-press x2, one set more).
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const NOW = at(9, 18);
const profile = profileOf();
const records = [session(at(3, 18), [['barbell-row', 3]])];
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [
    { muscle: 'chest', sets: 3, minRir: 1, why: 'behind' },
    { muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' },
  ],
  sitOut: [],
};
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');

function day() {
  let location: LocationProfile = gym!;
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location,
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
    get completed() {
      return completed;
    },
    steps,
    log(entry: WorkoutEntry) {
      const set = working(entry).find(
        (each) =>
          !completed.sets.some((done) => done.entryId === entry.id && done.setIndex === each.index),
      )!;
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
    run(trigger: RecalibrationTrigger, at_?: LocationProfile): RecalibrationSuccess {
      if (at_) location = at_;
      const result = recalibrate({
        trigger,
        workout,
        completed,
        lockedEntryIds: [],
        currentEntryId: completed.currentEntryId,
        duration: 'default',
        profile,
        location,
        loading: { missingPlates: [] },
        history: records,
        constraints,
        reason: 'test',
        timestamp: at(9, 18, clock + 1),
      });
      if (!result.ok) throw new Error(result.error);
      workout = result.workout;
      constraints = result.constraints;
      steps.push(`${trigger.type}: ${result.summary.headline} => ${lifts(workout)}`);
      return result;
    },
  };
}

describe('a lift stopped by a place picks up again where it fits, its stand-in stopped since', () => {
  it('the bench press stopped at home, the push-up stopped there for comfort, back at the gym', () => {
    const today = day();
    expect(lifts(today.workout)).toBe(
      'barbell-bench-press x3 @RIR 2/2/2; lateral-raise x3 @RIR 1/1/1',
    );
    const bench = allEntries(today.workout.blocks)[0]!;
    today.log(bench);
    today.run({ type: 'location' }, home);
    const pushUp = allEntries(today.workout.blocks).find(
      (entry) => entry.exerciseId === 'push-up',
    )!;
    expect(working(pushUp)).toHaveLength(2);
    today.log(pushUp);
    const stop = today.run({ type: 'uncomfortable', entryId: pushUp.id });
    expect(stop.summary.headline).toBe(
      'Push-Up stops at the sets done: one set left is too few for another lift to take over.',
    );
    today.run({ type: 'location' }, gym!);
    const benchNow = allEntries(today.workout.blocks).find((entry) => entry.id === bench.id)!;
    // On 532aba6: the bench press stays stopped at its one set ("no changes needed").
    expect(isStopped(benchNow), today.steps.join(' | ')).toBe(false);
    // The chest's three sets, no more: the bench press's set, the push-up's, the bench press's last.
    const done = new Set(today.completed.sets.map((set) => `${set.entryId}:${set.setIndex}`));
    const chest = allEntries(today.workout.blocks)
      .filter((entry) => ['barbell-bench-press', 'push-up'].includes(entry.exerciseId))
      .reduce(
        (sum, entry) =>
          sum +
          working(entry).filter((set) => !isStopped(entry) || done.has(`${entry.id}:${set.index}`))
            .length,
        0,
      );
    expect(chest, today.steps.join(' | ')).toBe(3);
  });
});
