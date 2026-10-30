import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-fifth review of round M (M31x-C), on the twenty-fourth pass's `secondOnAnotherDay`: a saved
 * second workout loaded on another day is made a catch-up, its title, the summary's first word and
 * the catch-up's own lines (`CATCH_UP_LINE`) rewritten; the plan's other lines are kept as saved.
 *
 * The rules: the twenty-fourth pass, "loaded on another day, one built from its muscles is a catch-up
 * of them" (its test: "loaded on another day, says what it is there: a catch-up of its muscles"),
 * and `secondOnAnotherDay`, "a second workout is the day trained's, and says nothing of a day
 * trained on any other ... (loaded as itself, it said that what was trained the day it was saved sat
 * out today)"; "Why this workout" says what the workout is for (item 12: "'Why this workout' says
 * what it is for").
 *
 * What happens: two lines the generator writes from the template's title are not the catch-up's own
 * and stay: the goal line, "Goal build muscle with bigger arms: second workout session, heavy
 * strength work first and hypertrophy volume after it.", and the recovery line, "Traps, Upper chest,
 * Side delts have had 2+ days to recover; Lats and Upper back trained in the last two days, so they
 * sit out: second workout today." So the copy, titled "Catch-up", "Catch-up: 5 exercises in about 39
 * min", "A catch-up for what this week still lacks: ...", also says on Saturday that it is a second
 * workout today and that the lats and upper back, rowed on Wednesday morning, sit out of it. The
 * lines stay through every change that keeps the plan's lines (a lift skipped), until a rebuild
 * writes them afresh ("catch-up session", "...: catch-up today."). On ce935fe the copy was the
 * second workout itself, with these lines and "A second workout today: ...": both tests fail there
 * too, at the check that the copy is a catch-up ("second-workout"); the twenty-fourth pass's rewrite
 * misses these two lines. (The recovery line's "trained in the last two days", true the day it was
 * saved, is as old as saved workouts: any copy keeps it. Its "second workout today" is this pass's.)
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule does
 * not tick, at the gym, a barbell row this morning (another device), the lifter saves the second
 * workout as "Wednesday second"; on Saturday, not ticked, nothing trained, loads it; or skips its
 * first lift.
 *
 * The fix (the twenty-fifth pass): the lines naming the session by its layout's title name the
 * catch-up's (`secondOnAnotherDay`).
 */

const MONDAY = '2026-08-31T12:00:00.000Z';
const WEDNESDAY_MORNING = '2026-09-02T08:00:00.000Z';
const WEDNESDAY = '2026-09-02T12:00:00.000Z';
const SATURDAY = '2026-09-05T12:00:00.000Z';
const SECOND_WORDS = /second workout (today|session)/i;

const threeSets: [number, number, number][] = [
  [10, 100, 2],
  [10, 100, 2],
  [10, 100, 2],
];

async function wednesdaySecondOnSaturday() {
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
  await db.put('workouts', {
    ...record(0, 'barbell-row', threeSets, [8, 12], 2),
    id: 'w-row-morning',
    startedAt: WEDNESDAY_MORNING,
    completedAt: WEDNESDAY_MORNING,
  });
  await handle.store.hydrate();
  expect(handle.store.getSnapshot().session!.workout.templateId).toBe('second-workout');
  const saved = await handle.store.saveCurrentWorkout('Wednesday second');
  clock.now = SATURDAY;
  handle.store.refreshSession();
  handle.store.loadSavedWorkout(saved.id);
  const workout = handle.store.getSnapshot().session!.workout;
  // Loaded on another day, a catch-up of its muscles (`secondOnAnotherDay`).
  expect(workout.templateId).toBe('catch-up');
  expect(workout.title).toBe('Catch-up');
  return handle;
}

type Handle = Awaited<ReturnType<typeof wednesdaySecondOnSaturday>>;
const reasons = (handle: Handle) =>
  handle.store.getSnapshot().session!.workout.explanation.reasons.join(' / ');

describe('a saved second workout loaded on another day, made a catch-up', () => {
  it('does not call itself a second workout in "Why this workout"', async () => {
    const handle = await wednesdaySecondOnSaturday();
    // On 992c87d: "... / Goal build muscle with bigger arms: second workout session, heavy strength
    // work first and hypertrophy volume after it. / ... / Traps, Upper chest, Side delts have had 2+
    // days to recover; Lats and Upper back trained in the last two days, so they sit out: second
    // workout today. / ...".
    expect(reasons(handle)).not.toMatch(SECOND_WORDS);
  });

  it('does not call itself a second workout once a lift is skipped', async () => {
    const handle = await wednesdaySecondOnSaturday();
    const first = allEntries(handle.store.getSnapshot().session!.workout.blocks)[0]!;
    expect((await handle.store.recalibrate({ type: 'skip', entryId: first.id }))?.ok).toBe(true);
    expect(reasons(handle)).not.toMatch(SECOND_WORDS);
  });
});
