import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { rankAlternatives } from '../alternatives/rankAlternatives';
import type { CatchUpSpec } from '../planning/catchUp';
import {
  contextFor,
  emptyCompleted,
  emptyConstraints,
  recalibrate,
  swapsOffered,
} from './recalibrate';
import type {
  CompletedWork,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import {
  allEntries,
  stoppedBefore,
  type GeneratedWorkout,
  type WorkoutEntry,
} from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Sixteenth review of round M. The swap sheet, offering nothing, says why: the refusal's own reason
 * where every lift shares it (the fourteenth pass: it blamed the muscles for a lift with one set
 * left), and a generic line about the muscles otherwise. The fifteenth pass let a swap back skip the
 * one-set check and refused it, where its muscles have no room, for that room. So a lift with one
 * set owed whose sheet ranks the lift it stood in for now has two reasons among its refusals, and
 * the sheet falls back on the generic line, the fourteenth review's wrong reason again.
 *
 * In the lower-body catch-up at the gym: a set of the back squat, then the lifter swaps it for the
 * hack squat (two sets). "Make it easier" then gives the hamstrings the dumbbell Romanian deadlift,
 * two sets, the glutes having room again. A set of the hack squat done, one owed: its sheet offers
 * nothing and says "Every alternative would give the day's muscles more than they lack, or work one
 * that rests today." Five of the six lifts it ranks are refused because "Hack Squat has one set
 * left, too few for another lift to take over" (the engine's own words for each); only the back
 * squat, the swap back, is refused for the glutes. Synthetic data only.
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const profile = profileOf();
const lower: CatchUpSpec = {
  kind: 'catch-up',
  muscles: (['quads', 'glutes', 'hamstrings'] as const).map((muscle) => ({
    muscle,
    sets: 3,
    minRir: 1,
    why: 'behind' as const,
  })),
  sitOut: [],
};
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');

describe('the sheet of a lift with one set owed gives that reason beside a refused swap back', () => {
  it('the hack squat in for the back squat, a set of it done', () => {
    let workout: GeneratedWorkout = generateWorkout({
      profile,
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: lower },
    });
    let constraints: SessionConstraints = { ...emptyConstraints(), catchUp: lower };
    let completed: CompletedWork = { ...emptyCompleted(), startedAt: NOW, elapsedSeconds: 60 };
    let clock = 1;
    const log = (entry: WorkoutEntry) => {
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
    };
    const run = (trigger: RecalibrationTrigger): RecalibrationSuccess => {
      const result = recalibrate({
        trigger,
        workout,
        completed,
        lockedEntryIds: [],
        currentEntryId: completed.currentEntryId,
        duration: 'default',
        profile,
        location: gym,
        loading: { missingPlates: [] },
        history: records,
        constraints,
        reason: 'test',
        timestamp: at(9, 18, clock + 1),
      });
      if (!result.ok) throw new Error(result.error);
      workout = result.workout;
      constraints = result.constraints;
      return result;
    };
    const find = (id: string) =>
      allEntries(workout.blocks).find((entry) => entry.exerciseId === id);
    expect(lifts(workout)).toBe('back-squat x3 @RIR 2/2/2; leg-curl x3 @RIR 1/1/1');
    log(find('back-squat')!);
    run({ type: 'replace', entryId: find('back-squat')!.id, exerciseId: 'hack-squat' });
    run({ type: 'intensity', direction: 'easier' });
    expect(lifts(workout)).toBe(
      'back-squat x1 @RIR 2; hack-squat x2 @RIR 2/2; dumbbell-romanian-deadlift x2 @RIR 2/2',
    );
    const hack = find('hack-squat')!;
    log(hack);
    // As the Today and workout screens build the sheet: the lift a stand-in took over from is
    // offered back.
    const day = { constraints, completed, history: records, timestamp: NOW };
    const sheet = swapsOffered(
      rankAlternatives({
        current: requireExercise(hack.exerciseId),
        context: contextFor({ profile, location: gym }, constraints),
        otherExercises: allEntries(workout.blocks)
          .filter(
            (other) => other.id !== hack.id && !stoppedBefore(workout.blocks, hack).includes(other),
          )
          .map((other) => requireExercise(other.exerciseId)),
        plannedSets: { sets: hack.sets.length, restSeconds: hack.restSeconds },
        limit: 6,
      }),
      day,
      workout,
      hack,
    );
    // The engine refuses a lift the sheet ranks for the one set owed.
    const tried = (() => {
      try {
        run({ type: 'replace', entryId: hack.id, exerciseId: 'leg-press' });
        return 'changed';
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(tried).toBe(
      'Hack Squat has one set left, too few for another lift to take over, so nothing was changed.',
    );
    expect(sheet.candidates).toEqual([]);
    // On 89dfb39: "Every alternative would give the day’s muscles more than they lack, or work one
    // that rests today."
    expect(sheet.emptyReason).toMatch(/Hack Squat has one set left/);
  });
});
