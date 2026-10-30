import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { Weekday } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Twenty-first review of round M, on the twentieth pass's carry of the plans the lifter emptied
 * into every later plan the same day ("`ensureSession` carries the whole list into every later plan
 * the same day"), where it meets the store's way out of a finished workout (`dismissCompletion`).
 *
 * The rules: "Every later plan of that offer laid out the same way takes no lift: every rebuild,
 * the way back from the full session, a later plan the same day" (the twentieth pass); "a workout
 * begun by mistake and ended with nothing logged is no first workout" and "the full session taken
 * was lost through a workout begun and discarded" (the first pass, fixed: `discardWorkout` hands
 * the session to `ensureSession` as `carry`); "The full session taken holds for its own day only".
 *
 * What happens: a workout saved with nothing logged is no first workout, so the day's offer stays
 * the catch-up, but `dismissCompletion` clears the session before `ensureSession()` runs, with no
 * `carry`: `before` is null, so the marks of the plans emptied (`marked`) and the full session
 * taken (`keepFull`) are read from nothing. The next plan is the catch-up laid out whole again,
 * every lift the lifter skipped back, and the full session taken is gone. Discarding the same
 * workout keeps both.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule
 * does not tick, at the gym, the catch-up has seven lifts.
 * - The lifter starts it, skips each lift ("nothing more for today", the mark kept), and saves the
 *   workout with nothing logged. Back on Today: the catch-up with all seven lifts, "a 46-minute
 *   catch-up for what is behind this week", the mark gone.
 * - Or the lifter skips each lift on Today, takes the full session, starts it and saves it with
 *   nothing logged. Back on Today: the catch-up with six lifts, not the full session; and Full
 *   session, then Catch-up instead, finds the catch-up whole. Discarded instead, the full session
 *   stays, and the way back finds the catch-up empty. (Here no training day is left in the week: a
 *   saved workout takes its place in the split's turn, as every saved workout has, and with
 *   sessions ahead the offer is read again with the week it leaves.)
 *
 * Both also fail on 0fe4cb9 (the carry has passed over a saved workout since the seventeenth pass).
 */

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();

async function lifter(days?: Weekday[]) {
  const handle = createTestStore();
  await handle.store.hydrate();
  const profile = createDefaultProfile(TEST_NOW);
  await handle.store.completeOnboarding(
    {
      ...profile,
      bodyweight: 185,
      ...(days ? { schedule: { ...profile.schedule, availableDays: days } } : {}),
    },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  const when = daysBefore(2);
  await db.put('workouts', {
    ...record(
      0,
      'barbell-bench-press',
      [
        [10, 100, 2],
        [10, 100, 2],
        [10, 100, 2],
      ],
      [8, 12],
      2,
    ),
    id: 'w-bench-monday',
    startedAt: when,
    completedAt: when,
  });
  await handle.store.hydrate();
  return handle;
}

type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;
const lifts = (handle: Handle) => describeWorkout(session(handle).workout).join('; ');

async function skipEvery(handle: Handle) {
  expect(allEntries(session(handle).workout.blocks).length).toBeGreaterThan(1);
  for (const entry of allEntries(session(handle).workout.blocks)) {
    await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
  }
  expect(allEntries(session(handle).workout.blocks)).toEqual([]);
  expect(session(handle).constraints.emptied?.length).toBe(1);
}

describe('a workout saved with nothing logged, on a day that offers a catch-up', () => {
  it('keeps the catch-up the lifter emptied empty in the next plan', async () => {
    const handle = await lifter();
    expect(session(handle).workout.templateId).toBe('catch-up');
    handle.store.startWorkout();
    await skipEvery(handle);
    await handle.store.finishWorkout(null);
    handle.store.dismissCompletion();
    // No first workout: the day still offers the catch-up.
    expect(session(handle).constraints.catchUp?.kind).toBe('catch-up');
    // On 333f1d4 and 0fe4cb9: seven lifts, "barbell-bench-press x3 @RIR 2/2/2; ...", and "Not one
    // of
    // your training days: a 46-minute catch-up for what is behind this week."
    expect(lifts(handle), dayNoteOf(session(handle))?.text).toBe('');
    expect(dayNoteOf(session(handle))?.text).toBe(
      'Not one of your training days: nothing more for today.',
    );
  });

  // No training day is left this week, so the session saved, which takes its place in the split's
  // turn as every saved workout has, moves nothing ahead and the offer stays the same.
  it('keeps the full session taken, and the catch-up emptied behind it', async () => {
    const handle = await lifter(['mon', 'tue']);
    await skipEvery(handle);
    await handle.store.setFullSession(true);
    expect(session(handle).constraints.fullSession).toBe(true);
    const offer = session(handle).constraints.catchUp;
    const marks = session(handle).constraints.emptied;
    handle.store.startWorkout();
    await handle.store.finishWorkout(null);
    handle.store.dismissCompletion();
    expect(session(handle).constraints.catchUp).toEqual(offer);
    expect(session(handle).constraints.emptied).toEqual(marks);
    // On 333f1d4 and 0fe4cb9: the catch-up with six lifts, the full session gone.
    expect(session(handle).constraints.fullSession, lifts(handle)).toBe(true);
    await handle.store.setFullSession(false);
    expect(lifts(handle)).toBe('');
  });

  // A set skipped is no set done: the workout saved is still one with nothing logged.
  it('with a set skipped in it', async () => {
    const handle = await lifter(['mon', 'tue']);
    await skipEvery(handle);
    await handle.store.setFullSession(true);
    handle.store.startWorkout();
    const first = allEntries(session(handle).workout.blocks)[0]!;
    const set = first.sets.find((one) => one.kind !== 'warmup')!;
    handle.store.skipSet(first.id, set.index);
    expect(session(handle).completed.sets.some((done) => done.skipped)).toBe(true);
    await handle.store.finishWorkout(null);
    handle.store.dismissCompletion();
    expect(session(handle).constraints.fullSession).toBe(true);
    await handle.store.setFullSession(false);
    expect(lifts(handle)).toBe('');
  });

  it('as a discarded workout does', async () => {
    const handle = await lifter();
    await skipEvery(handle);
    await handle.store.setFullSession(true);
    handle.store.startWorkout();
    handle.store.discardWorkout();
    expect(session(handle).constraints.fullSession).toBe(true);
    await handle.store.setFullSession(false);
    expect(lifts(handle)).toBe('');
  });
});

describe('a workout saved with a set done', () => {
  // The day's next plan starts afresh: the full session taken and trained as the day's second
  // workout is not taken again, and the day offers what is left.
  it('leaves the full session it was', async () => {
    const handle = await lifter(['mon', 'tue']);
    const db = await handle.store.getDatabase();
    const morning = new Date(Date.parse(TEST_NOW) - 4 * 3_600_000).toISOString();
    await db.put('workouts', {
      ...record(0, 'barbell-back-squat', [[8, 135, 2]], [6, 10], 2),
      id: 'w-squat-morning',
      startedAt: morning,
      completedAt: morning,
    });
    await handle.store.hydrate();
    expect(session(handle).constraints.catchUp?.kind).toBe('second');
    await handle.store.setFullSession(true);
    expect(session(handle).constraints.fullSession).toBe(true);
    handle.store.startWorkout();
    const first = allEntries(session(handle).workout.blocks)[0]!;
    const set = first.sets.find((one) => one.kind !== 'warmup')!;
    await handle.store.logSet(first.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[0],
      rir: 2,
    });
    await handle.store.finishWorkout(null);
    handle.store.dismissCompletion();
    expect(session(handle).constraints.catchUp?.kind).toBe('second');
    expect(session(handle).constraints.fullSession).toBeUndefined();
  });
});
