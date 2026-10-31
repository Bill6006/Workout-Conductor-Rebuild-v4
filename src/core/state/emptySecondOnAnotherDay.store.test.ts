import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { session as workoutAt } from '../../test/clockDays';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-fifth review of round M (M31x-E), on the twenty-fourth pass's `secondOnAnotherDay`, its
 * branch for a second workout laid out on the split's day ("one laid out on the split's day, as with
 * nothing behind, is that day's plan"), met by a second workout with nothing more for today: its
 * layout is the split's day (`lower`), with no lift, titled "Second workout", "Nothing more for
 * today." Loaded on another day it keeps no offer (`spec: null`) and no lift: a day of the plan with
 * nothing in it.
 *
 * The rules: item 32, "When every lift left works a muscle trained today ..., there is nothing to
 * start ... The Full session is one tap away, the lifter's to choose"; item 12, on a day not ticked
 * "The full session stays one tap away"; `markEmptied`, "A day of the plan never comes to nothing: the
 * change that would empty it is refused"; the twenty-fourth pass, "one laid out on the split's day
 * is that day's plan".
 *
 * What happens: after a long session on Wednesday morning, Today says "You trained today, and
 * nothing is behind this week: nothing more for today." with "Full session". Saved and loaded on
 * Saturday, a day not ticked with nothing trained (whose own plan is "Not one of your training days:
 * a 20-minute catch-up for what is behind this week.", with "Full session"), the copy is "Lower body"
 * with no exercise, its summary still "Nothing more for today.", and Today says only "Not one of your
 * training days.": nothing to start and no button to the full session or the catch-up. On ce935fe
 * the copy was the second workout still, Today saying "You trained today, and nothing is behind this
 * week: nothing more for today." with "Full session": the test passes there, a regression of the
 * twenty-fourth pass (though there the words were of a day trained).
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule does
 * not tick, at the gym, a long session this morning (another device) leaves nothing more for today;
 * the lifter saves today's workout as "Nothing more"; on Saturday loads it.
 *
 * The fix (the twenty-fifth pass): a loaded copy with no lift that is none of the day's offer says
 * there is nothing more for today, the full session a tap away (`dayNoteOf`).
 */

const MONDAY = '2026-08-31T12:00:00.000Z';
const WEDNESDAY_MORNING = '2026-09-02T08:00:00.000Z';
const WEDNESDAY = '2026-09-02T12:00:00.000Z';
const SATURDAY = '2026-09-05T12:00:00.000Z';

const threeSets: [number, number, number][] = [
  [10, 100, 2],
  [10, 100, 2],
  [10, 100, 2],
];

/** Six working sets each, every muscle trained this morning. */
const LONG_MORNING = workoutAt(WEDNESDAY_MORNING, [
  ['barbell-bench-press', 6],
  ['incline-dumbbell-press', 6],
  ['lateral-raise', 6],
  ['rear-delt-fly', 6],
  ['barbell-shrug', 6],
  ['pull-up', 6],
  ['barbell-row', 6],
  ['ez-bar-curl', 6],
  ['wrist-curl', 6],
  ['back-squat', 6],
  ['romanian-deadlift', 6],
  ['standing-calf-raise', 6],
  ['ab-wheel-rollout', 6],
  ['overhead-press', 6],
  ['cable-triceps-pushdown', 6],
]);

async function nothingMoreLoadedOnSaturday() {
  const clock = { now: WEDNESDAY };
  const handle = createTestStore({ now: () => clock.now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(clock.now), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, clock.now),
  );
  const db = await handle.store.getDatabase();
  await db.put('workouts', {
    ...record(0, 'barbell-bench-press', threeSets, [8, 12], 2),
    id: 'w-bench-monday',
    startedAt: MONDAY,
    completedAt: MONDAY,
  });
  await db.put('workouts', { ...LONG_MORNING, id: 'w-long-morning' });
  await handle.store.hydrate();
  const session = () => handle.store.getSnapshot().session!;
  expect(dayNoteOf(session(), false)).toEqual({
    text: 'You trained today, and nothing is behind this week: nothing more for today.',
  });
  const saved = await handle.store.saveCurrentWorkout('Nothing more');
  clock.now = SATURDAY;
  handle.store.refreshSession();
  // Saturday's own plan: a catch-up, with no choice of kind.
  expect(dayNoteOf(session(), false)).not.toHaveProperty('action');
  const before = session();
  expect(handle.store.loadSavedWorkout(saved.id)).toBe('empty');
  expect(session()).toBe(before);
  return session();
}

describe('a second workout with nothing more for today, loaded on another day', () => {
  it('leaves the lifter something to start: an empty copy leaves today’s plan in place', async () => {
    const loaded = await nothingMoreLoadedOnSaturday();
    const lifts = allEntries(loaded.workout.blocks).length;
    const note = dayNoteOf(loaded, false);
    // On 992c87d: "Lower body", no exercise, "Nothing more for today.", and Today says "Not one of
    // your training days." with no button. On ce935fe: "You trained today, and nothing is behind this
    // week: nothing more for today.", with "Full session". With no choice of the day's kind (the owner,
    // 2026-10-31), an empty copy stands in for nothing: Saturday's own plan stays, saying so.
    expect(
      lifts > 0,
      `${loaded.workout.title}, ${lifts} exercises, "${loaded.workout.explanation.summary}"; Today: "${note?.text}"`,
    ).toBe(true);
  });
});
