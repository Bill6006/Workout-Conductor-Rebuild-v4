import { describe, expect, it } from 'vitest';
import { emptyCompleted } from './recalibrate';
import type { CompletedWork, Readiness } from './types';
import type { WorkoutEntry } from '../workout/types';
import { bench, plan, profileOf, run, shape } from '../../test/backOffs';
import { RECORD_NOW } from '../../test/records';

/**
 * The third adversarial review of Maintenance 33: an illness taken back leaves the lift in front of
 * the lifter at the illness's floor, under "Planned effort back".
 *
 * Steps: a hybrid lifter's push day, the bench press first: its top set asks 190 lb for 4-6 at 1 in
 * reserve, then three back-offs at 180 lb for 4-6 at 2. They log both warm-up sets (no working set
 * yet) and check in "Head cold": the top set becomes 190 lb for 3-5 at 2, every other lift 2 or more
 * short of failure. A moment later they see they tapped the wrong answer and update the check-in to
 * "Unwell: No". In the second case the first answer was "Fever or aches".
 *
 * The rule: the check-in's own rule for one that takes back an earlier one ("A check-in that takes
 * back an earlier one's adjustment brings the full workout back (Maintenance 24); kept as it was,
 * the plan would stay cut while the check-in says otherwise", recalibrate.ts, `execute`); Today's
 * rest day: "the plan is kept, so a check-in changed back gives it again" (TodayScreen.tsx); and the
 * summary itself: "Planned effort back". The illness's floor is the day's ("every set 2 or more
 * short of failure for the head cold"), not the lift's.
 *
 * What happens: since the second review's fix, `heldToTheDay` rewrites a begun lift's sets still to
 * come to the floor (a rep fewer at the same load) and keeps no record of what they were; the
 * rebuild keeps a begun lift's sets as they are (`keptEntries`), and with no floor `heldToTheDay`
 * does nothing. So the bench's top set, not yet lifted, stays at 190 lb for 3-5 at 2 for the rest
 * of the workout, while every other lift has its planned effort back and the summary says
 * "Planned effort back: 6 exercises adjusted." Before the second review's fix (80893d4) the
 * illness never touched a begun lift's working sets, and taking it back left the top set as
 * planned.
 *
 * Synthetic data only.
 */

const profile = profileOf('hybrid');

const checkIn = (illness?: NonNullable<Readiness['illness']>): Readiness => ({
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
  ...(illness ? { illness } : {}),
});

/** Every warm-up set of a lift logged: the lift is under way, no working set lifted. */
function warmedUp(entry: WorkoutEntry): CompletedWork {
  return {
    ...emptyCompleted(),
    startedAt: RECORD_NOW,
    currentEntryId: entry.id,
    sets: entry.sets
      .filter((set) => set.kind === 'warmup')
      .map((set) => ({
        entryId: entry.id,
        exerciseId: entry.exerciseId,
        setIndex: set.index,
        kind: 'warmup' as const,
        reps: 5,
        weight: set.targetWeight,
        rir: 5,
        completedAt: RECORD_NOW,
      })),
  };
}

const topSet = (entry: WorkoutEntry) => {
  const top = entry.sets.find((set) => set.tier === 'top')!;
  return [top.targetWeight, top.targetReps, top.targetRir];
};

describe('an illness taken back with a lift under way', () => {
  for (const illness of ['head', 'body'] as const) {
    it(`gives the top set not yet lifted its planned effort back (${illness})`, () => {
      const workout = plan(undefined, profile);
      const planned = bench(workout);
      expect(topSet(planned)).toEqual([190, [4, 6], 1]);
      const completed = warmedUp(planned);

      // The illness holds it at the day's floor (since the second review's fix: 190 lb for 3-5 at 2).
      const ill = run({ type: 'readiness', readiness: checkIn(illness) }, workout, {
        completed,
        profile,
      });

      const well = run({ type: 'readiness', readiness: checkIn() }, ill.workout, {
        completed,
        profile,
        constraints: ill.constraints,
      });
      expect(well.summary.headline).toMatch(/^Planned effort back/);
      // Nothing of the top set was lifted: with the illness gone it asks what the plan asks.
      expect(topSet(bench(well.workout))).toEqual([190, [4, 6], 1]);
      expect(shape(bench(well.workout))).toEqual(shape(planned));
    });
  }
});
