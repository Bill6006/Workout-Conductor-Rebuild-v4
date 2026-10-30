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
 * Sixteenth review of round M. "A lift begun with nothing to come in stops at its sets done", and
 * what comes in for a lift "works a muscle the lift went in for". `bestAlternative` keeps to the
 * muscles the lift went in for (`chosenFor`); but once the lift has stopped, its slot owes the sets
 * it did not do (`owedBy`: a stop for a swap, comfort or pain owes them, only a skip does not), and
 * the next rebuild of any kind fills the slot afresh from the slot's own muscles and pattern, which
 * is not the same search. So a lift "Uncomfortable" stopped with nothing to come in has a lift come
 * in for it anyway at the next "Make it easier", "harder", end time or length.
 *
 * At home with dumbbells, a catch-up for the biceps and the forearms has the hammer curl.
 * "Uncomfortable" brings the dumbbell curl (for the biceps), and "Uncomfortable" on that the reverse
 * curl. A set of it, then "Uncomfortable": "Reverse Curl stops at the sets done: no comfortable
 * alternative fits Home." Then "Make it easier": "1 exercise added", the wrist curl, two sets, in
 * the slot the reverse curl stopped in. Likewise a lifter who swapped the push-up for the dumbbell
 * shoulder press (forearms and chest behind), "Uncomfortable" twice (the Arnold press, then the
 * lateral raise), a set of it and "Uncomfortable" again ("stops at the sets done"): an end time then
 * adds the push-up back, the very lift they swapped away. Synthetic data only.
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const profile = profileOf();
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const behind = (...muscles: ('biceps' | 'forearms' | 'chest')[]): CatchUpSpec => ({
  kind: 'catch-up',
  muscles: muscles.map((muscle) => ({ muscle, sets: 3, minRir: 1, why: 'behind' as const })),
  sitOut: [],
});

function day(spec: CatchUpSpec) {
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location: home,
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
    find: (id: string) => allEntries(workout.blocks).find((entry) => entry.exerciseId === id),
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
            reps: 10,
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
        location: home,
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

/** Nothing live in the slot the stopped lift is in. */
const slotLive = (workout: GeneratedWorkout, slot: number | undefined) =>
  allEntries(workout.blocks)
    .filter((entry) => entry.slot === slot && !isStopped(entry))
    .map((entry) => entry.exerciseId);

describe('a lift stopped with nothing to come in has nothing come in at the next rebuild', () => {
  it('the reverse curl, after the hammer curl and the dumbbell curl, then "Make it easier"', () => {
    const today = day(behind('biceps', 'forearms'));
    expect(lifts(today.workout)).toBe('hammer-curl x3 @RIR 1/1/1');
    today.run({ type: 'uncomfortable', entryId: today.find('hammer-curl')!.id });
    today.run({ type: 'uncomfortable', entryId: today.find('dumbbell-curl')!.id });
    const reverse = today.find('reverse-curl')!;
    today.log(reverse);
    const stop = today.run({ type: 'uncomfortable', entryId: reverse.id });
    expect(stop.summary.headline).toBe(
      'Reverse Curl stops at the sets done: no comfortable alternative fits Home.',
    );
    expect(slotLive(today.workout, reverse.slot)).toEqual([]);
    today.run({ type: 'intensity', direction: 'easier' });
    // On 89dfb39: "Rest of the workout made easier: 1 exercise added." wrist-curl x2.
    expect(slotLive(today.workout, reverse.slot), today.steps.join(' | ')).toEqual([]);
  });

  it('the push-up swapped away, the lateral raise stopped after two comfort swaps, then an end time', () => {
    const today = day(behind('forearms', 'chest'));
    expect(lifts(today.workout)).toBe('push-up x3 @RIR 2/2/2; hammer-curl x2 @RIR 1/1');
    today.run({
      type: 'replace',
      entryId: today.find('push-up')!.id,
      exerciseId: 'dumbbell-shoulder-press',
    });
    today.run({ type: 'uncomfortable', entryId: today.find('dumbbell-shoulder-press')!.id });
    today.run({ type: 'uncomfortable', entryId: today.find('arnold-press')!.id });
    const raise = today.find('lateral-raise')!;
    today.log(raise);
    const stop = today.run({ type: 'uncomfortable', entryId: raise.id });
    expect(stop.summary.headline).toBe(
      'Lateral Raise stops at the sets done: no comfortable alternative fits Home.',
    );
    expect(slotLive(today.workout, raise.slot)).toEqual([]);
    today.run({ type: 'end-by', time: at(9, 19, 30) });
    // On 89dfb39: "Ends by 7:30 PM: 1 exercise added." push-up x2, the lift swapped away.
    expect(slotLive(today.workout, raise.slot), today.steps.join(' | ')).toEqual([]);
  });
});
