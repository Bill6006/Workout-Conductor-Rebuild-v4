import { describe, expect, it } from 'vitest';
import {
  BENCH,
  DB_BENCH,
  bench,
  entryOf,
  home,
  plan,
  run,
  shape,
  topDone,
} from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11 (the second review of round N): a main lift stopped after its
 * top set and picked up again, back at the gym or swapped back to, carries on its back-offs as the
 * top set was lifted: the drop off its load, the step its log gave them kept. Synthetic data only.
 */

/** The top set logged, and the follow run as the store runs it. */
function followed(
  weight: number,
  reps: number,
  plan_: { kind: 'none' } | { kind: 'weight'; delta: number },
  rir = 1,
) {
  const workout = plan();
  const entry = bench(workout);
  const top = entry.sets.find((set) => set.tier === 'top')!;
  expect(top.targetWeight).toBe(190);
  const done = { ...topDone(entry, weight) };
  done.sets = done.sets.map((set) => ({ ...set, reps, rir }));
  const result = run(
    {
      type: 'performance',
      entryId: entry.id,
      setIndex: top.index,
      actualReps: reps,
      actualWeight: weight,
      plan:
        plan_.kind === 'none'
          ? { kind: 'none', reason: 'On target.' }
          : { kind: 'weight', delta: plan_.delta, reason: 'Easy: a step up.' },
    },
    workout,
    { completed: done, currentEntryId: entry.id },
  );
  return { workout: result.workout, entry, done };
}

const backOffLoads = (workout: ReturnType<typeof plan>) =>
  bench(workout)
    .sets.filter((set) => set.kind === 'working' && set.tier === 'back-off')
    .map((set) => set.targetWeight);

describe('a main lift picked up again after its top set, the second review of round N', () => {
  it('back at the gym, the back-offs are 5% under the top set as lifted, not as planned', () => {
    // The top set lifted at 200 (planned 190): the back-offs follow it, to 190.
    const { workout, entry, done } = followed(200, 5, { kind: 'none' });
    expect(
      shape(bench(workout))
        .slice(1)
        .map((set) => set[0]),
    ).toEqual([190, 190, 190]);
    // The lifter goes home (no bench there): the bench press stops after its top set.
    const away = run({ type: 'location' }, workout, {
      location: home,
      completed: done,
      currentEntryId: entry.id,
    });
    // Back at the gym: it picks up again with its back-offs, 5% under the 200 lifted.
    const back = run({ type: 'location' }, away.workout, {
      completed: done,
      constraints: away.constraints,
    });
    const owed = backOffLoads(back.workout);
    expect(owed.length).toBeGreaterThan(0);
    expect(owed).toEqual(owed.map(() => 190));
  });

  it('swapped back after an easy top set, the back-offs keep the step up the follow gave them', () => {
    // The top set at the planned 190, clearly easy (the top of its range, 3 in reserve against 1):
    // the back-offs go a step up, to 185.
    const { workout, entry, done } = followed(190, 6, { kind: 'weight', delta: 5 }, 3);
    expect(backOffLoads(workout)).toEqual([185, 185, 185]);
    const away = run({ type: 'replace', entryId: entry.id, exerciseId: DB_BENCH }, workout, {
      completed: done,
      currentEntryId: entry.id,
    });
    const stand = entryOf(away.workout, DB_BENCH);
    const back = run({ type: 'replace', entryId: stand.id, exerciseId: BENCH }, away.workout, {
      completed: done,
      constraints: away.constraints,
    });
    const owed = backOffLoads(back.workout);
    expect(owed.length).toBeGreaterThan(0);
    expect(owed).toEqual(owed.map(() => 185));
  });
});
