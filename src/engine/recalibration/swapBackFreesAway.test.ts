import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { rankAlternatives } from '../alternatives/rankAlternatives';
import {
  contextFor,
  emptyCompleted,
  emptyConstraints,
  recalibrate,
  swapsOffered,
} from './recalibrate';
import type { RecalibrationSuccess, RecalibrationTrigger, SessionConstraints } from './types';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Nineteenth review of round M, on the eighteenth pass's `swappedAway`. The report: "A lift the
 * lifter swaps away stays away for the day (`swappedAway`): no change picks it by itself, as a slot's
 * own pick ...; the lifter may put it back, and a swap back to the plan's own pick turns nothing
 * away." The code (`replace`): "A swap back to what the plan had here ... leaves the plan as it was:
 * it turns nothing away", and the lift put back leaves the list.
 *
 * The two rules meet badly when the lifter puts the lift back in another slot and then swaps that
 * slot back to its own pick: putting it back took it off the list, and the swap back adds nothing, so
 * the lift the lifter swapped away from its own slot is on no list at all. Once its own slot is free
 * again, the next rebuild picks it there by itself. On 4cb40d7 the seventeenth pass's
 * `keepSwappedAway` kept it away (the skipped stand-in took it with it), so this is a regression.
 *
 * Steps (synthetic data only), each swap one the swap sheet offers: a pull day the schedule ticks,
 * at the gym, with two curls, the dumbbell curl and the EZ-bar curl. The lifter swaps the EZ-bar curl
 * for the cable curl (the EZ-bar curl turned away), swaps the dumbbell curl for the EZ-bar curl (put
 * back, in the dumbbell curl's place), swaps it back to the dumbbell curl (that slot's own pick:
 * "turns nothing away"), skips the cable curl, and picks 45 minutes: "1 exercise added", the EZ-bar
 * curl, back as its own slot's pick. On 4cb40d7 it stays out.
 *
 * Passes on 4cb40d7.
 */

const NOW = at(8, 18);
const profile = profileOf();
const records = [session(at(3, 18), [['barbell-bench-press', 3]])];
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');

function pullDay() {
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location: gym,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'pull-arms' },
  });
  let constraints: SessionConstraints = emptyConstraints();
  const steps: string[] = [lifts(workout)];
  const find = (id: string) => allEntries(workout.blocks).find((entry) => entry.exerciseId === id);
  return {
    get workout() {
      return workout;
    },
    get constraints() {
      return constraints;
    },
    steps,
    find,
    /** What the swap sheet offers for a lift, as Today builds it. */
    sheet(id: string): string[] {
      const entry = find(id)!;
      const ranked = rankAlternatives({
        current: requireExercise(entry.exerciseId),
        context: contextFor({ profile, location: gym }, constraints),
        otherExercises: allEntries(workout.blocks)
          .filter((other) => other.id !== entry.id)
          .map((other) => requireExercise(other.exerciseId)),
        dropSetPlanned: entry.dropSet,
        plannedSets: { sets: entry.sets.length, restSeconds: entry.restSeconds },
        limit: 6,
      });
      const day = {
        constraints,
        completed: emptyCompleted(),
        history: records,
        timestamp: NOW,
        profile,
        location: gym,
      };
      return swapsOffered(ranked, day, workout, entry).candidates.map(
        (candidate) => candidate.exercise.id,
      );
    },
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
      if (!result.ok) throw new Error(`${trigger.type}: ${result.error}`);
      workout = result.workout;
      constraints = result.constraints;
      steps.push(`${trigger.type}: ${result.summary.headline} => ${lifts(workout)}`);
      return result;
    },
  };
}

describe('a lift swapped away, put back in another slot and swapped back out', () => {
  it('stays away from its own slot', () => {
    const day = pullDay();
    const own = day.find('ez-bar-curl')?.slot;
    expect(own).toBeDefined();
    expect(day.find('dumbbell-curl')).toBeDefined();
    expect(day.sheet('ez-bar-curl')).toContain('cable-curl');
    day.run({ type: 'replace', entryId: day.find('ez-bar-curl')!.id, exerciseId: 'cable-curl' });
    // Put back, in the dumbbell curl's place.
    expect(day.sheet('dumbbell-curl')).toContain('ez-bar-curl');
    day.run({
      type: 'replace',
      entryId: day.find('dumbbell-curl')!.id,
      exerciseId: 'ez-bar-curl',
    });
    // And swapped back out, to that slot's own pick.
    expect(day.sheet('ez-bar-curl')).toContain('dumbbell-curl');
    day.run({
      type: 'replace',
      entryId: day.find('ez-bar-curl')!.id,
      exerciseId: 'dumbbell-curl',
    });
    expect(day.find('ez-bar-curl')).toBeUndefined();
    day.run({ type: 'skip', entryId: day.find('cable-curl')!.id });
    day.run({ type: 'duration', choice: 45 });
    // On 0f8d10f: "ez-bar-curl x3", back in its own slot, nothing having turned it away.
    expect(day.find('ez-bar-curl'), day.steps.join(' | ')).toBeUndefined();
  });

  it('put back where the plan had it, with a swap back, it is off the day’s list', () => {
    const day = pullDay();
    day.run({ type: 'replace', entryId: day.find('ez-bar-curl')!.id, exerciseId: 'cable-curl' });
    expect(day.constraints.swappedAway).toContain('ez-bar-curl');
    day.run({ type: 'replace', entryId: day.find('cable-curl')!.id, exerciseId: 'ez-bar-curl' });
    expect(day.constraints.swappedAway ?? []).not.toContain('ez-bar-curl');
    // A layout made again picks it as the plan does.
    day.run({ type: 'duration', choice: 45 });
    expect(day.find('ez-bar-curl'), day.steps.join(' | ')).toBeDefined();
  });
});
