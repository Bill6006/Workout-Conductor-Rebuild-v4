import { describe, expect, it } from 'vitest';
import type { CompletedWork } from './types';
import type { GeneratedWorkout, WorkoutEntry } from '../../engine/workout/types';
import { BENCH, DB_BENCH, bench, entryOf, plan, run } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11 (the third review of round N): a top set skipped is no top
 * set lifted: swapped away and back, or a set added after a top set alone, the back-offs are where
 * the plan has them. Synthetic data only.
 */

/** The top set logged as a skip, as `logSet` stores one: 0 reps, no weight, no reserve. */
function topSkipped(entry: WorkoutEntry): CompletedWork {
  const top = entry.sets.find((set) => set.tier === 'top')!;
  return {
    startedAt: '2026-09-10T12:00:00.000Z',
    elapsedSeconds: 0,
    currentEntryId: entry.id,
    sets: [
      {
        entryId: entry.id,
        exerciseId: entry.exerciseId,
        setIndex: top.index,
        kind: 'working',
        reps: 0,
        weight: null,
        rir: null,
        completedAt: '2026-09-10T12:00:00.000Z',
        skipped: true,
      },
    ],
  } as CompletedWork;
}

const backOffLoads = (workout: GeneratedWorkout) =>
  bench(workout)
    .sets.filter((set) => set.kind === 'working' && set.tier === 'back-off')
    .map((set) => set.targetWeight);

describe('a top set skipped, the third review of round N', () => {
  it('swapped away and back: the back-offs come back where the plan had them', () => {
    const workout = plan();
    const entry = bench(workout);
    const planned = backOffLoads(workout);
    expect(planned).toEqual([180, 180, 180]);
    const done = topSkipped(entry);
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
    // Nothing was lifted on the top set: no step down for a "grind" that never happened.
    expect(owed).toEqual(owed.map(() => 180));
  });

  it('a set added after a top set alone, the top set skipped: a back-off at the plan’s drop', () => {
    let state = { workout: plan(), constraints: undefined as never };
    const id = bench(state.workout).id;
    while (bench(state.workout).sets.filter((set) => set.kind === 'working').length > 1) {
      state = run({ type: 'sets', entryId: id, workingDelta: -1 }, state.workout, {
        ...(state.constraints ? { constraints: state.constraints } : {}),
      }) as never;
    }
    const top = bench(state.workout).sets.find((set) => set.tier === 'top')!;
    expect(top.targetWeight).toBe(190);
    const added = run({ type: 'sets', entryId: id, workingDelta: 1 }, state.workout, {
      constraints: state.constraints,
      completed: topSkipped(bench(state.workout)),
    });
    expect(backOffLoads(added.workout)).toEqual([180]);
  });
});
