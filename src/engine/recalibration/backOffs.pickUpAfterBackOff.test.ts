import { describe, expect, it } from 'vitest';
import type { CompletedWork } from './types';
import { BENCH, DB_BENCH, bench, entryOf, home, plan, run } from '../../test/backOffs';
import { RECORD_NOW } from '../../test/records';

/**
 * The seventh review of round N. A main lift picked up again after a back-off was logged: the top
 * set at 190 as asked, back-off 1 at 180 logged clearly easy (6 reps at 4 in reserve, asked 2), so
 * the back-offs after it go a step up, to 185. The lifter swaps the bench press for the dumbbell
 * bench press and back, or goes home and back to the gym: the bench press picks up again with its
 * back-offs owed at 180, the step back-off 1's log gave them gone. Both roads build what it owes
 * from the top set's log alone (`asBackOffs` in the recalibration, the generator's pick-up); the
 * second review kept the top set's step, the sixth the logged back-offs' steps through a
 * correction or a delete. The spec: the back-offs follow the top set as lifted, each back-off still
 * logged moving the ones after it as its log did; a lift picked up again carries on its back-offs
 * as they were. Synthetic data only.
 */

const backOffLoads = (workout: ReturnType<typeof plan>) =>
  bench(workout)
    .sets.filter((set) => set.kind === 'working' && set.tier === 'back-off')
    .map((set) => set.targetWeight);

/** The top set and back-off 1 logged, each followed as the store follows it. */
function easyBackOffLogged() {
  const workout = plan();
  const entry = bench(workout);
  const top = entry.sets.find((set) => set.tier === 'top')!;
  const [first] = entry.sets.filter((set) => set.tier === 'back-off');
  expect(top.targetWeight).toBe(190);
  expect(first!.targetWeight).toBe(180);
  const topLog = {
    entryId: entry.id,
    exerciseId: BENCH,
    setIndex: top.index,
    kind: 'working' as const,
    reps: 5,
    weight: 190,
    rir: 1,
    completedAt: RECORD_NOW,
  };
  const one = {
    startedAt: RECORD_NOW,
    elapsedSeconds: 0,
    currentEntryId: entry.id,
    sets: [topLog],
  } as CompletedWork;
  const afterTop = run(
    {
      type: 'performance',
      entryId: entry.id,
      setIndex: top.index,
      actualReps: 5,
      actualWeight: 190,
      plan: { kind: 'none', reason: 'On target.' },
    },
    workout,
    { completed: one, currentEntryId: entry.id },
  );
  const done = {
    ...one,
    sets: [topLog, { ...topLog, setIndex: first!.index, reps: 6, weight: 180, rir: 4 }],
  } as CompletedWork;
  const afterFirst = run(
    {
      type: 'performance',
      entryId: entry.id,
      setIndex: first!.index,
      actualReps: 6,
      actualWeight: 180,
      plan: { kind: 'weight', delta: 5, reason: 'Set 2: 6 reps with 4 in reserve: up 5 lb.' },
    },
    afterTop.workout,
    { completed: done, currentEntryId: entry.id },
  );
  // Back-offs 2 and 3 a step up after the easy back-off 1.
  expect(backOffLoads(afterFirst.workout)).toEqual([180, 185, 185]);
  return { workout: afterFirst.workout, entry, done };
}

describe('a main lift picked up again after a back-off’s log stepped the ones after it', () => {
  it('swapped away and back: the back-offs owed keep back-off 1’s step', () => {
    const { workout, entry, done } = easyBackOffLogged();
    const away = run({ type: 'replace', entryId: entry.id, exerciseId: DB_BENCH }, workout, {
      completed: done,
      currentEntryId: entry.id,
    });
    const stand = entryOf(away.workout, DB_BENCH);
    const back = run({ type: 'replace', entryId: stand.id, exerciseId: BENCH }, away.workout, {
      completed: done,
      constraints: away.constraints,
    });
    const owed = backOffLoads(back.workout).slice(1);
    expect(owed.length).toBeGreaterThan(0);
    // On e6ed7ed: [180, 180].
    expect(owed).toEqual(owed.map(() => 185));
  });

  it('home and back to the gym: the back-offs owed keep back-off 1’s step', () => {
    const { workout, entry, done } = easyBackOffLogged();
    const gone = run({ type: 'location' }, workout, {
      location: home,
      completed: done,
      currentEntryId: entry.id,
    });
    const back = run({ type: 'location' }, gone.workout, {
      completed: done,
      constraints: gone.constraints,
    });
    const owed = backOffLoads(back.workout).slice(1);
    expect(owed.length).toBeGreaterThan(0);
    // On e6ed7ed: [180, 180].
    expect(owed).toEqual(owed.map(() => 185));
  });
});
