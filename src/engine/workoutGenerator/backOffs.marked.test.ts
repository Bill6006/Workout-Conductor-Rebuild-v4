import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries } from '../workout/types';
import { generateWorkout } from './generate';
import { record, type SetSpec } from '../../test/records';
import {
  BENCH,
  DB_BENCH,
  bench,
  entryOf,
  gym,
  home,
  plan,
  profileOf,
  run,
  topDone,
  trained,
} from '../../test/backOffs';
import { savedAs } from '../../test/backOffsSim';

/**
 * The fifth review of round N. A straight day at the back-offs' load is saved as one (`atBackOffs`)
 * so the lift's next top set reads past it (the fourth review). Two places that build such a day
 * drop the mark their target carries: the lift to push's extra exposure (the generator's extra
 * entry keeps nothing of `targetedFor` but its sets) and a lift swapped in after the lift in its
 * place was begun (`standIn` keeps nothing of `targetedSets` but its sets). Each says "Straight sets
 * today, at the back-offs' load" and is saved as a straight session of the lift's own, so the lift's
 * next top set steps from the back-offs' load: under the last top set lifted as asked. The same
 * stand-in brought in by a change of place is marked. Synthetic data only.
 */

const at = (day: number) =>
  new Date(Date.parse('2026-09-07T12:00:00.000Z') + day * 86_400_000).toISOString();

function structured(when: string, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = {
    ...record(0, BENCH, [top, ...backOffs], [4, 6], 2),
    id: 'top-day',
    startedAt: when,
    completedAt: when,
  };
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, index) => {
    set.tier = index === 0 ? 'top' : 'back-off';
    set.targetRir = index === 0 ? 1 : 2;
  });
  return done;
}

describe('the lift to push’s extra exposure at the back-offs’ load', () => {
  const pushDay = structured(
    at(0),
    [5, 200, 1],
    [
      [5, 190, 2],
      [5, 190, 2],
      [5, 190, 2],
    ],
  );
  const pushed = profileOf('hybrid', {
    pushLift: { exerciseId: BENCH, target: 250, units: 'lb', since: at(1) },
  });

  it('is saved as a day at the back-offs’ load, and the next top set reads past it', () => {
    // Two days on, a pull day with the bench press's extra exposure.
    const extraDay = generateWorkout({
      profile: pushed,
      location: gym,
      history: [pushDay],
      now: at(2),
      duration: 'default',
      constraints: { templateId: 'pull-arms' },
    });
    const extra = allEntries(extraDay.blocks).find((entry) => entry.exerciseId === BENCH)!;
    expect(extra.push).toBe('extra');
    expect(extra.progression?.evidence.join(' ')).toContain(
      "Straight sets today, at the back-offs' load",
    );
    // On 7f23a26: undefined, where the lift to push's own place (`natural`) is marked.
    expect(extra.atBackOffs).toBe(true);
  });

  it('the push ended after the extra: the next top set steps up from the last top set', () => {
    const extraDay = generateWorkout({
      profile: pushed,
      location: gym,
      history: [pushDay],
      now: at(2),
      duration: 'default',
      constraints: { templateId: 'pull-arms' },
    });
    // Lifted as asked, saved as the app saves it.
    const history = [pushDay, savedAs(extraDay, at(2), 'extra-day')];
    // The lifter ends the push; the next push day, the bench press its main lift again.
    const next = generateWorkout({
      profile: profileOf('hybrid'),
      location: gym,
      history,
      now: at(4),
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const top = allEntries(next.blocks)
      .find((entry) => entry.exerciseId === BENCH)!
      .sets.find((set) => set.tier === 'top')!;
    // The last top set, 200 x 5 at 1 in reserve as asked: 205 next, as without the extra.
    const without = generateWorkout({
      profile: profileOf('hybrid'),
      location: gym,
      history: [pushDay],
      now: at(4),
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const plainTop = allEntries(without.blocks)
      .find((entry) => entry.exerciseId === BENCH)!
      .sets.find((set) => set.tier === 'top')!;
    expect(plainTop.targetWeight).toBe(205);
    // On 7f23a26: the top set read from the extra's 190 x 5 at 2 in reserve.
    expect(top.targetWeight).toBe(plainTop.targetWeight);
  });
});

describe('a lift swapped in after the lift in its place was begun, at its own back-offs’ load', () => {
  /** The dumbbell bench press, the main lift at home: its last session on top set plus back-offs. */
  const homeTop = () => {
    const done = record(5, DB_BENCH, [
      [5, 80, 1],
      [5, 75, 2],
      [5, 75, 2],
      [5, 75, 2],
    ]);
    const entry = done.entries[0]!;
    entry.backOffDrop = 0.05;
    entry.role = 'primary-strength';
    entry.sets.forEach((set, index) => {
      set.tier = index === 0 ? 'top' : 'back-off';
      set.targetRir = index === 0 ? 1 : 2;
    });
    return done;
  };

  it('is marked as the same stand-in brought in by a change of place is', () => {
    const history = [...trained(), homeTop()];
    const workout = plan(history);
    const entry = bench(workout);
    // At the gym, the bench press's top set done, the bench is taken: the lifter swaps.
    const swap = run({ type: 'replace', entryId: entry.id, exerciseId: DB_BENCH }, workout, {
      history,
      completed: topDone(entry, 190),
      currentEntryId: entry.id,
    });
    const stand = entryOf(swap.workout, DB_BENCH);
    expect(stand.progression?.evidence.join(' ')).toContain(
      "Straight sets today, at the back-offs' load",
    );
    // A change of place brings the same stand-in in, marked.
    const away = run({ type: 'location' }, workout, {
      location: home,
      history,
      completed: topDone(entry, 190),
      currentEntryId: entry.id,
    });
    expect(entryOf(away.workout, DB_BENCH).atBackOffs).toBe(true);
    // On 7f23a26: undefined.
    expect(stand.atBackOffs).toBe(true);
  });
});
