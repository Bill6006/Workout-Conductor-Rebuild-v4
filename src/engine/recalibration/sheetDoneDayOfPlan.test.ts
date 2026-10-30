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
import type { CompletedWork } from './types';
import { allEntries, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Twenty-second review of round M, on the sheet of a finished lift (the fifteenth and sixteenth
 * passes), on a day of the plan.
 *
 * The rules: the sixteenth pass, "the sheet says a finished lift is done though nothing ranks"
 * (fixing "the sheet of a finished lift with nothing to rank said no alternative fits, not that the
 * lift is done"); the fifteenth, "a lift done says so on its sheet"; and the thirteenth, "the swap
 * sheet offers none it would refuse". The fifteenth pass's own test notes that the workout screen
 * opens the sheet on a finished lift too.
 *
 * What happens: the sheet learns a lift is done from `catchUpRefusal` (`swapsOffered`'s `itself`),
 * which gives no refusal at all on a day of the plan (`if (!spec) return null`). So on a day of the
 * plan, and on the full session taken, the sheet of a lift with every working set done lists its
 * alternatives, and each tap is refused by the swap itself ("Incline Dumbbell Press is done: nothing
 * is left to swap.", from Maintenance 22). A lift done in a catch-up says it is done and lists none
 * (the fifteenth pass's test).
 *
 * Steps (synthetic data only): a row on Thursday the 3rd; on Thursday the 10th, a day the schedule
 * ticks, the plan at the gym has the incline dumbbell press. Its working sets all done, the workout
 * screen's sheet on it lists four alternatives (the incline barbell bench press, the machine
 * shoulder press, the Arnold press, the overhead press); each tapped is refused.
 *
 * Also fails on 333f1d4 (the sheet's check of a finished lift has read the day's offer since the
 * fifteenth pass; the swap's refusal is from Maintenance 22).
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(10, 18);
const profile = profileOf();
const constraints = emptyConstraints();
const allDone = (entry: WorkoutEntry): CompletedWork => ({
  ...emptyCompleted(),
  startedAt: NOW,
  elapsedSeconds: 900,
  sets: working(entry).map((set, index) => ({
    entryId: entry.id,
    exerciseId: entry.exerciseId,
    setIndex: set.index,
    kind: 'working' as const,
    reps: 10,
    weight: set.targetWeight,
    rir: 2,
    completedAt: at(10, 18, index * 4),
  })),
});

describe('the swap sheet on a finished lift on a day of the plan', () => {
  it('says the lift is done, and offers no swap the swap refuses', () => {
    const plan = generateWorkout({
      profile,
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: {},
    });
    const lift = allEntries(plan.blocks).find(
      (entry) => entry.exerciseId === 'incline-dumbbell-press',
    )!;
    expect(lift, describeWorkout(plan).join('; ')).toBeDefined();
    const completed = allDone(lift);
    const sheet = swapsOffered(
      rankAlternatives({
        current: requireExercise(lift.exerciseId),
        context: contextFor({ profile, location: gym }, constraints),
        otherExercises: allEntries(plan.blocks)
          .filter((other) => other.id !== lift.id)
          .map((other) => requireExercise(other.exerciseId)),
        plannedSets: { sets: lift.sets.length, restSeconds: lift.restSeconds },
        limit: 6,
      }),
      { constraints, completed, history: records, timestamp: NOW },
      plan,
      lift,
    );
    const taps = sheet.candidates.map((candidate) => {
      const tried = recalibrate({
        trigger: { type: 'replace', entryId: lift.id, exerciseId: candidate.exercise.id },
        workout: plan,
        completed,
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
      return `${candidate.exercise.id}: ${tried.ok ? 'made' : tried.error}`;
    });
    const name = requireExercise(lift.exerciseId).name;
    // On e779122 and 333f1d4: every alternative listed, each "<lift> is done: nothing is left to
    // swap."
    expect(taps).toEqual([]);
    expect(sheet.emptyReason).toBe(`${name} is done: nothing is left to swap.`);
  });
});
