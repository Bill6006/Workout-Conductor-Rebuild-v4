import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { dayNoteOf } from '../../features/today/dayNote';
import { session as workoutAt } from '../../test/clockDays';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-fifth review of round M (M31x-D), on the twenty-fourth pass's `dayNoteOf`: a loaded copy is
 * told as the day's offer where `dayChoices.catchUp?.kind` is the copy's kind, whether or not the
 * day offers anything of that kind: a day not ticked with nothing behind keeps a catch-up offer with
 * no muscles (`{ kind: 'catch-up', muscles: [] }`), which `offerKey` and `offPlanSpec` read as the
 * split's own session.
 *
 * The rules: item 12, "With nothing behind, the line says so ('Not one of your training days, and
 * nothing is behind this week.') and the plan is the usual one, as before the round"; the
 * twenty-fourth pass, "Today tells a loaded copy as the day's offer only where the day offers its
 * kind, and otherwise says the day as it is"; Today's one line is a fact about the day (`dayNoteOf`:
 * "The one line Today gives a day that offers a catch-up or a second workout").
 *
 * What happens: once nothing is behind this week (a big Monday session logged on another device
 * lands), Wednesday's own plan says "Not one of your training days, and nothing is behind this
 * week." A catch-up saved earlier that day and loaded now is told as the day's offer: "Not one of
 * your training days: a 46-minute catch-up for what is behind this week.", with "Full session", on a
 * week with nothing behind. On ce935fe the same line (a copy was told as the day's offer on any
 * day): fails there too; on 6af588c, before the copy kept its own catch-up, the loaded plan read
 * the day's offer and the line was "Not one of your training days, and nothing is behind this
 * week.": the twenty-third pass's reading, which the twenty-fourth pass's check by kind leaves.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule does
 * not tick, at the gym, the lifter saves the catch-up as "Wednesday catch-up". A long Monday morning
 * session logged on another device lands, every muscle's week done. The lifter loads "Wednesday
 * catch-up".
 *
 * The fix (the twenty-fifth pass): a loaded catch-up is told as the day's offer only where something
 * is behind, the day's offer built from it (`dayNoteOf`).
 */

const MONDAY_MORNING = '2026-08-31T08:00:00.000Z';
const MONDAY = '2026-08-31T12:00:00.000Z';
const WEDNESDAY = '2026-09-02T12:00:00.000Z';

const threeSets: [number, number, number][] = [
  [10, 100, 2],
  [10, 100, 2],
  [10, 100, 2],
];

/** Twelve working sets each: every muscle's weekly sets done on Monday. */
const BIG_MONDAY = workoutAt(MONDAY_MORNING, [
  ['barbell-bench-press', 12],
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
  ['standing-calf-raise', 12],
  ['ab-wheel-rollout', 12],
  ['overhead-press', 12],
  ['cable-triceps-pushdown', 12],
]);

async function copyLoadedWithNothingBehind() {
  const handle = createTestStore({ now: () => WEDNESDAY });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(WEDNESDAY), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, WEDNESDAY),
  );
  const db = await handle.store.getDatabase();
  await db.put('workouts', {
    ...record(0, 'barbell-bench-press', threeSets, [8, 12], 2),
    id: 'w-bench-monday',
    startedAt: MONDAY,
    completedAt: MONDAY,
  });
  await handle.store.hydrate();
  const session = () => handle.store.getSnapshot().session!;
  expect(session().workout.templateId).toBe('catch-up');
  const saved = await handle.store.saveCurrentWorkout('Wednesday catch-up');
  await db.put('workouts', { ...BIG_MONDAY, id: 'w-big-monday' });
  await handle.store.hydrate();
  // Wednesday's own plan, with nothing behind: the usual one, and the line says so.
  expect(dayNoteOf(session(), false)?.text).toBe(
    'Not one of your training days, and nothing is behind this week.',
  );
  handle.store.loadSavedWorkout(saved.id);
  expect(session().workout.templateId).toBe('catch-up');
  return session();
}

describe('a saved catch-up loaded on a day not ticked with nothing behind this week', () => {
  it('is not told as a catch-up for what is behind this week', async () => {
    const loaded = await copyLoadedWithNothingBehind();
    // On 992c87d and ce935fe: "Not one of your training days: a 46-minute catch-up for what is
    // behind this week.", with "Full session".
    expect(dayNoteOf(loaded, false)?.text ?? '').not.toMatch(/for what is behind this week/);
  });
});
