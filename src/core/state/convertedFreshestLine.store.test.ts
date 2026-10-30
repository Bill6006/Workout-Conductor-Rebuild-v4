import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { describeWorkout, session as workoutAt } from '../../test/clockDays';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-sixth review of round M (M31y-A), on the twenty-fifth pass's `named` in
 * `secondOnAnotherDay` (src/engine/workoutGenerator/generate.ts), which renames two of the three
 * places "Why this workout" names the session by its layout's title: ": second workout session," and
 * ": second workout today.". The third, the recovery line written when none of the layout's muscles
 * has had two days to recover (`${template.title} muscles are the freshest available`), keeps the
 * second workout's title.
 *
 * The rules: the twenty-fifth pass, "The converted copy's lines name the catch-up", and its comment
 * in `secondOnAnotherDay`, "The lines that name the session by its layout's title name the
 * catch-up's"; the twenty-fourth, "A second workout is the day trained's: loaded on another day, one
 * built from its muscles is a catch-up of them", which "says nothing of a day trained on any other".
 * Item 32 ("When nothing missed could go in, only what is left of today's, the line says so"): a
 * second workout of only what is left of today's work is one of the plans item 32 makes, so its
 * muscles, all trained that day, are never two days rested and the line is always this one.
 *
 * What happens: Friday's second workout after a bench press cut short (one set of four) is a cable
 * fly for what is left of the chest, "Second workout muscles are the freshest available; Triceps
 * trained in the last two days, so it sits out: second workout today." Saved and loaded on
 * Saturday, it is a catch-up ("Catch-up", "Catch-up: 1 exercise in about 10 min", "A catch-up for
 * what this week still lacks: chest, ..."), but its line reads "Second workout muscles are the
 * freshest available; Triceps trained in the last two days, so it sits out: catch-up today.": the
 * copy still names itself a second workout, beside the very line the twenty-fifth pass renamed.
 * Once it is rebuilt, the line is "Catch-up muscles are the freshest available; ...". On the previous
 * head (0a82961) the test fails too (there the line ended "...: second workout today." as well): the
 * twenty-fifth pass's fix stopped short of this line.
 *
 * Steps (synthetic data only): on Monday morning a long session for every muscle but the chest,
 * twelve working sets of each lift; on Friday, a day the schedule ticks, a bench press this morning
 * (another device) stopped after one of its four planned sets. At noon Today offers the second
 * workout; the lifter saves it as "Friday PM". On Saturday the lifter loads "Friday PM".
 *
 * The fix (the twenty-sixth pass): a converted copy names the catch-up in every line that named the
 * second workout (`named`), as its own rebuild writes them.
 */

const MONDAY_MORNING = '2026-08-31T08:00:00.000Z';
const FRIDAY_MORNING = '2026-09-04T08:00:00.000Z';
const FRIDAY = '2026-09-04T12:00:00.000Z';
const SATURDAY = '2026-09-05T12:00:00.000Z';

/** Twelve working sets of each lift: every muscle's week done but the chest's. */
const BIG_MONDAY = workoutAt(MONDAY_MORNING, [
  ['incline-dumbbell-press', 12],
  ['lateral-raise', 12],
  ['rear-delt-fly', 12],
  ['barbell-shrug', 12],
  ['pull-up', 12],
  ['barbell-row', 12],
  ['ez-bar-curl', 12],
  ['wrist-curl', 12],
  ['back-squat', 12],
  ['romanian-deadlift', 12],
  ['leg-curl', 12],
  ['hip-thrust', 12],
  ['standing-calf-raise', 12],
  ['ab-wheel-rollout', 12],
  ['overhead-press', 12],
  ['cable-triceps-pushdown', 12],
]);

/** Friday morning's bench press, one working set of the four planned. */
const CUT_SHORT = {
  ...workoutAt(FRIDAY_MORNING, [['barbell-bench-press', 1]]),
  endedEarly: true,
};
CUT_SHORT.entries[0]!.plannedSets = 4;

async function loadedOnSaturday() {
  const clock = { now: FRIDAY };
  const handle = createTestStore({ now: () => clock.now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(clock.now), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, clock.now),
  );
  const db = await handle.store.getDatabase();
  await db.put('workouts', { ...BIG_MONDAY, id: 'w-big-monday' });
  await db.put('workouts', { ...CUT_SHORT, id: 'w-bench-friday' });
  await handle.store.hydrate();
  const session = () => handle.store.getSnapshot().session!;
  // Friday's second workout: only what is left of the chest.
  expect(session().constraints.catchUp?.kind).toBe('second');
  expect(session().constraints.catchUp?.muscles.map((item) => item.why)).toEqual(['remainder']);
  const saved = await handle.store.saveCurrentWorkout('Friday PM');
  clock.now = SATURDAY;
  handle.store.refreshSession();
  handle.store.loadSavedWorkout(saved.id);
  // Saturday, nothing trained: a catch-up of its muscles.
  expect(session().constraints.catchUp?.kind).toBe('catch-up');
  expect(session().workout.title).toBe('Catch-up');
  expect(allEntries(session().workout.blocks).length).toBeGreaterThan(0);
  return { handle, session };
}

describe('a second workout of only what is left of the day, loaded the next day', () => {
  it('does not call itself a second workout in "Why this workout"', async () => {
    const { session } = await loadedOnSaturday();
    const reasons = session().workout.explanation.reasons;
    // On 1e29f22: "Second workout muscles are the freshest available; Triceps trained in the last
    // two days, so it sits out: catch-up today." On 0a82961 the same, ending ": second workout
    // today."
    expect(
      reasons.filter((line) => /second workout/i.test(line)),
      describeWorkout(session().workout).join('; '),
    ).toEqual([]);
  });

  it('names the catch-up there, as its own rebuild does', async () => {
    const { handle, session } = await loadedOnSaturday();
    const line = (pattern: RegExp) =>
      session().workout.explanation.reasons.find((reason) => pattern.test(reason));
    const loaded = line(/muscles are the freshest available/);
    expect((await handle.store.setDurationChoice(30))?.ok).toBe(true);
    const rebuilt = line(/muscles are the freshest available/);
    expect(rebuilt).toMatch(/^Catch-up muscles are the freshest available/);
    // On 1e29f22 and 0a82961: "Second workout muscles are the freshest available; ...".
    expect(loaded).toMatch(/^Catch-up muscles are the freshest available/);
  });
});
