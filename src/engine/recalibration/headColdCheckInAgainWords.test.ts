import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../core/validation/profile';
import { emptyCompleted } from './recalibrate';
import type { CompletedWork, Readiness } from './types';
import { allEntries } from '../workout/types';
import { BENCH, bench, plan, profileOf, run, trained } from '../../test/backOffs';
import { RECORD_NOW } from '../../test/records';

/**
 * The fourth adversarial review of Maintenance 33: a check-in told again on a head-cold day, with a
 * lift under way held at the floor, says the planned effort came back when nothing did.
 *
 * Steps: a hybrid lifter (drop sets on) starts the push day and logs the bench press's first warm-up.
 * They check in with a head cold: the bench press's top set still to come is held at the floor
 * (3-5 at 2 in reserve, from 4-6 at 1), every other lift rebuilt at 2 or more in reserve. A little
 * later they open the check-in again and tell the same head cold (or the head cold with energy
 * "Low"). Nothing changes: every set stays where the head cold put it.
 *
 * The rule: the readiness change's own words: "The words say what changed on the lifts still to
 * come, as the lifter sees them" (recalibrate.ts, `readiness`; Maintenance 24), and "the planned
 * effort back" only for effort that came back; the third review's floor as a layer: "every change
 * is made to the plan under it (`underTheFloor`) and the floor laid again over what the change
 * leaves".
 *
 * What happens: the words are worked out from the plan under the floor before the floor is laid
 * again (`dayChange` against `layer.shown`, inside `execute`; `heldToTheDay` runs after it), so the
 * bench press's top set reads as 2 in reserve going to 1, and the summary says "Adjusted for today
 * (the planned effort back): no changes needed." over a workout that did not change. The hard
 * start's words are worked out the same way. Before the third review (9580f26) the summary was
 * "Checked in: no changes needed."
 *
 * The fix (the fourth pass): the check-in's words read the plan with the day's floor laid again, as
 * it is after every change. A hard start's never differ by it (its own test below).
 *
 * Synthetic data only.
 */

const base = createDefaultProfile(RECORD_NOW);
const profile = profileOf('hybrid', { techniques: { ...base.techniques, dropSets: true } });
const history = trained();

const headCold: Readiness = {
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
  illness: 'head',
};

describe('a head cold told again with a lift under way at the floor', () => {
  it('claims no effort back', () => {
    const workout = plan(history, profile);
    const entry = bench(workout);
    const warmup = entry.sets.find((set) => set.kind === 'warmup')!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: RECORD_NOW,
      currentEntryId: entry.id,
      sets: [
        {
          entryId: entry.id,
          exerciseId: BENCH,
          setIndex: warmup.index,
          kind: 'warmup',
          reps: 5,
          weight: warmup.targetWeight,
          rir: 5,
          completedAt: RECORD_NOW,
        },
      ],
    };
    const options = { completed, currentEntryId: entry.id, profile, history };
    const told = run({ type: 'readiness', readiness: headCold }, workout, options);
    const top = bench(told.workout).sets.find((set) => set.tier === 'top')!;
    expect([top.targetReps, top.targetRir]).toEqual([[3, 5], 2]);

    for (const again of [headCold, { ...headCold, energy: 2 }]) {
      const result = run({ type: 'readiness', readiness: again }, told.workout, {
        ...options,
        constraints: told.constraints,
      });
      // Nothing changed.
      expect(result.changes).toEqual([]);
      expect(result.summary.headline).not.toMatch(/effort back/);
    }
  });

  it('a hard start with it claims no effort back either', () => {
    const workout = plan(history, profile);
    const entry = bench(workout);
    const warmup = entry.sets.find((set) => set.kind === 'warmup')!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: RECORD_NOW,
      currentEntryId: entry.id,
      sets: [
        {
          entryId: entry.id,
          exerciseId: BENCH,
          setIndex: warmup.index,
          kind: 'warmup',
          reps: 5,
          weight: warmup.targetWeight,
          rir: 5,
          completedAt: RECORD_NOW,
        },
      ],
    };
    const options = { completed, currentEntryId: entry.id, profile, history };
    const told = run({ type: 'readiness', readiness: headCold }, workout, options);
    // The bench, under way, held at the floor.
    const top = bench(told.workout).sets.find((set) => set.tier === 'top')!;
    expect(top.targetRir).toBe(2);
    const lifts = allEntries(told.workout.blocks)
      .filter((one) => one.id !== entry.id)
      .slice(0, 2)
      .map((one) => one.exerciseId);
    const hard = run({ type: 'bad-start', low: true, lifts }, told.workout, {
      ...options,
      constraints: told.constraints,
    });
    // The bench, begun, keeps its sets: the ease lands on the lifts not begun.
    expect(bench(hard.workout).sets).toEqual(bench(told.workout).sets);
    expect(hard.summary.headline).not.toMatch(/effort back/);
  });
});
