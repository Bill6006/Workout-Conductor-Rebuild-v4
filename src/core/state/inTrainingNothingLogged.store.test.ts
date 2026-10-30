import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { catchUpKind, trainedIn } from '../../engine/planning/catchUp';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Twenty-second review of round M, on the twenty-first pass's rule for a workout saved with nothing
 * logged ("A workout saved with nothing logged is no workout of the day, as one discarded is not"),
 * where it meets the round's own check of who is offered a catch-up (`catchUpKind`).
 *
 * The rules: item 12, "Who is offered one: a lifter in training, with a workout in the last two
 * weeks. A new lifter, or one back after a break, has no week to catch up yet and gets the full
 * session on any day (product judgement)", which `CATCH_UP.ACTIVE_DAYS` gives as "catching up
 * restores the week's sets, and there are none to restore"; item 32 and the first pass, "a workout
 * begun by mistake and ended with nothing logged is no first workout" (`trainedIn`: "a set of it
 * done past the warm-ups"), which the second workout, what is left of today's dose and the
 * twenty-first pass's carry all read.
 *
 * What happens: the check for a lifter in training counts any record started in the last fourteen
 * days (`recent`), a workout saved with nothing logged among them, where every other reading of the
 * round asks for a set done (`trainedIn`). So a lifter back after a three-week break, given the full
 * session on a day not ticked, who starts a workout and saves it with nothing logged (begun by
 * mistake, or ended at once), is offered a catch-up for eleven muscles the next moment: "Not one of
 * your training days: a 46-minute catch-up for what is behind this week."
 *
 * Steps (synthetic data only): a bench press twenty days ago, the only workout in the log; on
 * Wednesday, a day the schedule does not tick, at the gym: the full session, no catch-up offered.
 * The lifter starts it, finishes with nothing logged and puts the completion away: a catch-up.
 * In the engine, `catchUpKind` gives "catch-up" for the same log with today's record as the store
 * writes a workout saved with nothing logged (its entries, no set in them).
 *
 * Also fails on 333f1d4 (from the round's build).
 */

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();
const sets3: [number, number, number][] = [
  [10, 100, 2],
  [10, 100, 2],
  [10, 100, 2],
];
const longAgo: WorkoutRecord = {
  ...record(0, 'barbell-bench-press', sets3, [8, 12], 2),
  id: 'w-bench-long-ago',
  startedAt: daysBefore(20),
  completedAt: daysBefore(20),
};

describe('a lifter back after a break, and a workout saved with nothing logged', () => {
  it('is still offered the full session, not a catch-up', async () => {
    const handle = createTestStore();
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await handle.store.getDatabase();
    await db.put('workouts', longAgo);
    await handle.store.hydrate();
    const session = () => handle.store.getSnapshot().session!;
    // Not in training: the full session, and nothing to choose.
    expect(session().constraints.catchUp).toBeUndefined();
    expect(dayNoteOf(session(), false)?.text).toBe('Not one of your training days.');
    handle.store.startWorkout();
    await handle.store.finishWorkout(null);
    handle.store.dismissCompletion();
    // Saved, with no set done: no workout trained since the break.
    expect(handle.store.getSnapshot().history).toHaveLength(2);
    expect(handle.store.getSnapshot().history.filter(trainedIn)).toHaveLength(1);
    // On e779122 and 333f1d4: "Not one of your training days: a 46-minute catch-up for what is
    // behind this week.", a catch-up of the bench press, the row, the shrug ...
    expect(
      session().constraints.catchUp ?? null,
      `${dayNoteOf(session(), false)?.text} ${describeWorkout(session().workout).join('; ')}`,
    ).toBeNull();
  });

  it('in the engine: a workout saved today with nothing logged makes no lifter in training', () => {
    const profile = createDefaultProfile(TEST_NOW);
    // As the store writes a workout saved with nothing logged: its entries, no set in them.
    const empty: WorkoutRecord = {
      ...longAgo,
      id: 'w-nothing-logged-today',
      startedAt: daysBefore(0.1),
      completedAt: daysBefore(0.05),
      entries: longAgo.entries.map((entry) => ({ ...entry, sets: [] })),
    };
    expect(trainedIn(empty)).toBe(false);
    expect(catchUpKind(profile, [longAgo], TEST_NOW)).toBeNull();
    // On e779122 and 333f1d4: "catch-up".
    expect(catchUpKind(profile, [longAgo, empty], TEST_NOW)).toBeNull();
  });
});
