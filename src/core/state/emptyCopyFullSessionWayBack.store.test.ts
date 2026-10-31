import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { session as workoutAt } from '../../test/clockDays';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-sixth review of round M (M31y-B), on the twenty-fifth pass's new branch in `dayNoteOf`
 * (src/features/today/dayNote.ts): "A copy with no lift that is none of the day's offer has nothing
 * to start: the full session a tap away". The "Full session" it offers is the lifter taking the
 * full session for the day: the copy's `fullSession`, which every later plan the same day reads as
 * the day's choice (`dayChoicesOf`: "the full session taken from it", and `ensureSession`'s
 * `keepFull`). But on the full session it gives, Today offers no way back to the day's catch-up or
 * second workout: the plan is still the copy, none of the day's offer, so the line is the day "as it
 * is" with no button.
 *
 * The rules: item 12, "The button beside it, Full session, gives the usual plan; there, Catch-up
 * instead gives the catch-up back. The choice holds for the day."; item 32, "The Full session is one
 * tap away, the lifter's to choose, and Go easy instead gives the day's own plan back"; the
 * twenty-third pass, "every later plan the same day reads them with what the lifter chose on the
 * loaded plan: the full session taken from it".
 *
 * What happens: on Saturday, a day not ticked whose own plan is "Not one of your training days: a
 * 20-minute catch-up for what is behind this week.", the lifter loads "Nothing more" (Wednesday's
 * second workout with nothing more for that day, laid out on the lower day). Today says "Not one of
 * your training days: nothing more for today." with "Full session"; tapped, the plan is the upper
 * day, and Today says only "Not one of your training days.", no button: the day's catch-up is gone
 * from the screen. Yet the full session is the day's choice (`fullSession`): once begun and
 * discarded, the same upper day comes back as the day's own, "Not one of your training days." with
 * "Catch-up instead". Likewise on Friday, a day ticked and trained this morning, a catch-up the
 * lifter emptied on Wednesday and saved, loaded: "Nothing more for today." with "Full session", then
 * the pull day with no line at all, where the next plan the same day says "You trained today." with
 * "Go easy instead". On the previous head (0a82961) Saturday's copy said only "Not one of your
 * training days." and Friday's had no line, neither with "Full session" (the twenty-fifth review's
 * M31x-E), so both tests fail there before the button: the path is the twenty-fifth pass's.
 *
 * Steps (synthetic data only): Monday's bench press in the log. (1) On Wednesday, a day the schedule
 * does not tick, at the gym, a long session this morning (another device) leaves "nothing more for
 * today"; the lifter saves today's workout as "Nothing more"; on Saturday loads it and taps "Full
 * session". (2) On Wednesday the lifter skips each lift of the catch-up and saves it as "Empty
 * catch-up"; on Friday, a squat this morning (another device), loads it and taps "Full session".
 *
 * The fix (the twenty-sixth pass): the full session taken from a copy that stands for none of the
 * day's offer is the day's own (`session-kind`), so its way back is the day's offer.
 */

const MONDAY = '2026-08-31T12:00:00.000Z';
const WEDNESDAY_MORNING = '2026-09-02T08:00:00.000Z';
const WEDNESDAY = '2026-09-02T12:00:00.000Z';
const FRIDAY_MORNING = '2026-09-04T08:00:00.000Z';
const FRIDAY = '2026-09-04T18:00:00.000Z';
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

async function lifter(clock: { now: string }) {
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
  await handle.store.hydrate();
  return handle;
}

type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;

// The twenty-fifth review of round M gave a copy with no lift the full session's button, and the
// way back from it. With no choice of the day's kind (the owner, 2026-10-31), such a copy is never
// loaded: the day's own plan stays, saying so, and is the one the app chose.
describe('a loaded copy with no lift', () => {
  it('leaves the day’s catch-up in place, saying so', async () => {
    const clock = { now: WEDNESDAY };
    const handle = await lifter(clock);
    const db = await handle.store.getDatabase();
    await db.put('workouts', { ...LONG_MORNING, id: 'w-long-morning' });
    await handle.store.hydrate();
    const saved = await handle.store.saveCurrentWorkout('Nothing more');
    clock.now = SATURDAY;
    handle.store.refreshSession();
    // Saturday's own plan: a catch-up, with no choice of kind.
    expect(dayNoteOf(session(handle), false)).not.toHaveProperty('action');
    // An empty copy stands in for nothing (the owner, 2026-10-31): today's plan stays, untouched.
    const before = session(handle);
    expect(handle.store.loadSavedWorkout(saved.id)).toBe('empty');
    expect(session(handle)).toBe(before);
    expect(session(handle).workout.title).toBe('Catch-up');
    expect(session(handle).constraints.fullSession).toBeUndefined();
    expect(dayNoteOf(session(handle), false)?.text).toMatch(
      /^Not one of your training days: a \d+-minute catch-up for what is behind this week\.$/,
    );
  });

  it('leaves the day’s second workout in place on a day trained, saying so', async () => {
    const clock = { now: WEDNESDAY };
    const handle = await lifter(clock);
    for (const entry of allEntries(session(handle).workout.blocks)) {
      expect((await handle.store.recalibrate({ type: 'skip', entryId: entry.id }))?.ok).toBe(true);
    }
    const saved = await handle.store.saveCurrentWorkout('Empty catch-up');
    clock.now = FRIDAY;
    const db = await handle.store.getDatabase();
    await db.put('workouts', {
      ...record(0, 'back-squat', threeSets, [8, 12], 2),
      id: 'w-squat-friday',
      startedAt: FRIDAY_MORNING,
      completedAt: FRIDAY_MORNING,
    });
    await handle.store.hydrate();
    // Friday's own plan: the second workout.
    expect(session(handle).constraints.catchUp?.kind).toBe('second');
    // An empty copy stands in for nothing (the owner, 2026-10-31): today's plan stays, untouched.
    const before = session(handle);
    expect(handle.store.loadSavedWorkout(saved.id)).toBe('empty');
    expect(session(handle)).toBe(before);
    expect(session(handle).constraints.catchUp?.kind).toBe('second');
    expect(session(handle).constraints.fullSession).toBeUndefined();
    expect(allEntries(session(handle).workout.blocks).length).toBeGreaterThan(0);
  });
});
