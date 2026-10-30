import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { readStart } from './badStart';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { CompletedSet, Readiness } from './types';
import { allEntries, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { record, type SetSpec } from '../../test/records';
import { checkInDayOf } from '../../core/state/session';

/**
 * The fourth adversarial review of Maintenance 33: a check-in told just after midnight, on a workout
 * made the evening before, is read by no reader, though its own words say today's first sets are
 * judged a step easier.
 *
 * Steps: a lifter makes today's plan at 23:40 and starts it at 23:58 (local time). At 00:05 they
 * check in: energy "Low" and sleep "Short" (two items clearly worse against the scale's middle). The
 * summary says "Checked in: energy and sleep low. The plan stays; today's first sets are judged a step
 * easier." At 00:10 and 00:20 they log the first sets of the bench press and the incline press, each
 * exactly 3 reps short of what it asked.
 *
 * The rule: the report, Readiness: "two items clearly worse (...) lower what the day's first sets
 * are expected to do"; the check-in's own words above; `readStart`: "What the day lowers the
 * expectation by: the check-in, read when the first set was logged"; and the third review's one day
 * context: a check-in told on an evening is that evening's ("past midnight, a check-in told on the
 * evening the session was made is that day's").
 *
 * What happens: the third review's fix keys the check-in to the day its session was made on
 * (`checkInOfDay(readiness, madeAt, at)`), not to the day it was told, so a check-in told after
 * midnight on a session made before it belongs to no day the readers read: the hard start, read at
 * the first set's time (the new day), drops it, takes no step, and the two sets read as a hard start
 * (the rest eased), against the words the lifter just read. The coach's "too soon" and the completion
 * drop it alike. Before the third review (9580f26) the hard start read the check-in it was given.
 *
 * The fix (the fourth pass): a check-in is the day's it was told (`checkInAt`, `checkInDayOf`), and
 * every reader of the day reads it so.
 *
 * Synthetic data only.
 */

const MADE = '2026-09-10T23:40:00.000Z';
const STARTED = '2026-09-10T23:58:00.000Z';
const TOLD = '2026-09-11T00:05:00.000Z';

const profile = {
  ...createDefaultProfile(MADE),
  bodyweight: 185,
  programStyle: 'hypertrophy-focus' as const,
};
const gym = createDefaultLocations({ gymAccess: true }, MADE).find((place) => place.id === 'gym')!;

const session = (
  exerciseId: string,
  daysAgo: number,
  set: SetSpec,
  target: [number, number],
): WorkoutRecord => ({
  ...record(daysAgo, exerciseId, [set, set, set], target, 2),
  id: `${exerciseId}-${daysAgo}`,
});

const history: WorkoutRecord[] = [
  session('barbell-bench-press', 11, [5, 185, 2], [4, 6]),
  session('barbell-bench-press', 7, [5, 185, 2], [4, 6]),
  session('incline-dumbbell-press', 11, [8, 60, 2], [6, 10]),
  session('incline-dumbbell-press', 7, [8, 60, 2], [6, 10]),
];

const low: Readiness = {
  energy: 2,
  soreness: 2,
  sleep: 2,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};

/** A lift's first working set logged exactly 3 reps short of what it asked, at `when`. */
function threeShort(entry: WorkoutEntry, when: string): CompletedSet {
  const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
  return {
    entryId: entry.id,
    exerciseId: entry.exerciseId,
    setIndex: set.index,
    kind: 'working',
    reps: set.targetReps[0] - 3,
    weight: set.targetWeight,
    rir: set.targetRir,
    completedAt: when,
  };
}

describe('a check-in told past midnight on a workout made before it', () => {
  it('judges the first sets a step easier, as its words say', () => {
    const plan = generateWorkout({
      profile,
      location: gym,
      history,
      now: MADE,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const told = recalibrate({
      trigger: { type: 'readiness', readiness: low },
      workout: plan,
      completed: { ...emptyCompleted(), startedAt: STARTED },
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile,
      location: gym,
      history,
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: TOLD,
    });
    if (!told.ok) throw new Error(told.error);
    expect(told.summary.headline).toBe(
      "Checked in: energy and sleep low. The plan stays; today's first sets are judged a step easier.",
    );
    const [bench, incline] = allEntries(told.workout.blocks);
    expect([bench!.exerciseId, incline!.exerciseId]).toEqual([
      'barbell-bench-press',
      'incline-dumbbell-press',
    ]);
    const sets = [
      threeShort(bench!, '2026-09-11T00:10:00.000Z'),
      threeShort(incline!, '2026-09-11T00:20:00.000Z'),
    ];
    const context = { profile, history, readiness: told.constraints.readiness, resets: null };
    // The same sets with the check-in read: a step easier, no hard start.
    expect(readStart(told.workout.blocks, sets, context).low).toBe(false);
    // As the store reads it (`readStartOf`: the time its check-in was told, `checkInDayOf`; at
    // ae6f610 the session's own time, `MADE`).
    const madeAt = checkInDayOf({ createdAt: MADE, constraints: told.constraints });
    expect(madeAt).toBe(TOLD);
    expect(readStart(told.workout.blocks, sets, { ...context, madeAt }).low).toBe(false);
  });
});
