import { describe, expect, it } from 'vitest';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import type { CompletedWork } from './types';
import { BENCH, DB_BENCH, bench, entryOf, home, plan, run, topDone } from '../../test/backOffs';

/**
 * The tenth review of round N. A lift picked up again back at the gym keeps the record of a weight
 * its back-offs took by hand (`manual.backOffs`) that the pick-up itself threw away: its back-offs
 * come back at the load its top set as lifted gives them, as a swap back gives them, but a later
 * correction of the top set puts them at the old hand weight, where after a swap back it leaves
 * them where the pick-up put them.
 *
 * The spec (docs/reports/maintenance-32.md): "A lift picked up again, back at the gym or swapped
 * back to, carries on its back-offs after its top set, as it was lifted"; the ninth pass, the weight
 * set by hand once the top set is done is the back-offs' own, and `withoutHandTargets` deletes it on
 * a swap ("An entry whose sets to come are built afresh (a swap, a swap back): the reps or the weight
 * set by hand were for the sets it had, and no longer apply", Maintenance 23); a correction to the
 * top set moves its back-offs "as the set logged right would have".
 *
 * What happens: the generator's pick-up of a lift the place stopped (`reopened` in generate.ts)
 * appends the owed back-offs at `owedBackOffLoad` off the top set as lifted, but never clears
 * `manual` as `swapBack` does (`withoutHandTargets(stopped)`); the `performance` trigger's top-set
 * branch then reads `manual.backOffs` as the back-offs' own ("back-offs kept at 170 lb").
 *
 * Steps: the bench press's top set logged as planned, 190 × 5 at 1 (back-offs 180); the weight set
 * by hand after it, 170, the back-offs' own. (a) The lifter goes home (no bench there: it stops
 * after its top set) and back to the gym: the back-offs come back at 180. (b) The same, swapped to
 * the dumbbell bench press and back: 180. Then the top set's reps corrected, 5 to 6: after (b) the
 * back-offs stay at 180; after (a) they go to 170.
 *
 * Reached in the app where a weight is set after the top set is done (the coach's offers come on a
 * lift with no set lifted: after a top set skipped, its skip then corrected). Passes on 1bbd451
 * (before the ninth pass): both give 180. Synthetic data only.
 */

const benchAny = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === BENCH && !entry.stopped)!;

const backOffLoads = (workout: GeneratedWorkout) =>
  benchAny(workout)
    .sets.filter((set) => set.tier === 'back-off')
    .map((set) => set.targetWeight);

describe('a weight the back-offs took by hand, then the lift picked up again', () => {
  it('back at the gym, a correction of the top set leaves the back-offs as a swap back does', () => {
    const workout = plan();
    const entry = bench(workout);
    const top = entry.sets.find((set) => set.tier === 'top')!;
    expect(top.targetWeight).toBe(190);
    const done = topDone(entry, 190);
    // Set by hand once the top set is done: the back-offs' own.
    const hand = run({ type: 'target-weight', entryId: entry.id, weight: 170 }, workout, {
      completed: done,
      currentEntryId: entry.id,
    });
    expect(backOffLoads(hand.workout)).toEqual([170, 170, 170]);
    const corrected: CompletedWork = {
      ...done,
      sets: done.sets.map((set) => ({ ...set, reps: 6 })),
    };
    const correctTop = (workout_: GeneratedWorkout) =>
      backOffLoads(
        run(
          {
            type: 'performance',
            entryId: entry.id,
            setIndex: top.index,
            actualReps: 6,
            actualWeight: 190,
            plan: { kind: 'none', reason: 'On target.' },
          },
          workout_,
          { completed: corrected, currentEntryId: entry.id },
        ).workout,
      );

    // (a) Home, where there is no bench, and back to the gym.
    const away = run({ type: 'location' }, hand.workout, {
      location: home,
      completed: done,
      currentEntryId: entry.id,
    });
    const back = run({ type: 'location' }, away.workout, {
      completed: done,
      constraints: away.constraints,
    });
    // (b) Swapped to the dumbbell bench press and back.
    const swapped = run(
      { type: 'replace', entryId: entry.id, exerciseId: DB_BENCH },
      hand.workout,
      {
        completed: done,
        currentEntryId: entry.id,
      },
    );
    const swappedBack = run(
      { type: 'replace', entryId: entryOf(swapped.workout, DB_BENCH).id, exerciseId: BENCH },
      swapped.workout,
      { completed: done, constraints: swapped.constraints },
    );
    // Picked up either way, the back-offs carry on off the top set as lifted.
    expect(backOffLoads(back.workout)).toEqual([180, 180, 180]);
    expect(backOffLoads(swappedBack.workout)).toEqual([180, 180, 180]);
    expect(correctTop(swappedBack.workout)).toEqual([180, 180, 180]);
    // On 25fd689: [170, 170, 170], the hand weight the pick-up had thrown away
    // (`manual.backOffs` still 170 on the entry).
    expect(correctTop(back.workout), JSON.stringify(benchAny(back.workout).manual)).toEqual([
      180, 180, 180,
    ]);
  });
});
