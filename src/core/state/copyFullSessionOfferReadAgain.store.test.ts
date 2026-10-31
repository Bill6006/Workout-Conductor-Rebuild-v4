import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout, session as workoutAt } from '../../test/clockDays';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-seventh review of round M (M31z-B), on the twenty-sixth pass's way back from the full session
 * taken from a loaded copy (`session-kind` in src/engine/recalibration/recalibrate.ts), which writes
 * the day's offer into the copy's own (`constraints.catchUp = cloneSpec(offer)`): from there the plan
 * is the day's offer, and its way back the day's catch-up or second workout. But the store still
 * holds the plan for a copy, whose offer is its own: a save reads the day's offer again only into the
 * choices kept aside (`offerReadAgain`: "A saved workout loaded is read as itself: the offer read
 * again is the day's, kept aside"), never into the plan's. So the plan keeps the offer as it was when
 * the full session was taken, through a schedule saved and an experience saved.
 *
 * The rules: item 12, "A schedule, an experience or a place saved reads the day's offer again for a
 * plan not yet started: tick today and the catch-up gives way to the usual plan"; item 32, "A
 * beginner's muscles trained today always sit out (the settled question 5)", and the research's
 * "Novices: muscles trained today always sit out" (docs/research/catch-up-and-second-workout.md);
 * the twenty-sixth pass, "the full session taken from a copy that stands for none of the day's offer
 * is the day's own, so its way back is the day's offer". The day's own catch-up and full session
 * keep both rules (checked first in each test).
 *
 * What happens: (1) on Saturday, a day not ticked, the lifter loads "Nothing more" (Wednesday's second
 * workout with no lift), taps "Full session" and "Catch-up instead": the day's catch-up, "Not one of
 * your training days: a 20-minute catch-up for what is behind this week." (back squat x3, barbell
 * shrug x2). The lifter then ticks Saturday in the schedule: the plan stays "Catch-up", the back squat
 * and the shrug, and Today says nothing, where the day's own catch-up gives way to the usual plan
 * (the upper day, "Upper body: 7 exercises in about 60 min"). A place saved takes the same path
 * (`offerOverrides`), as do a technique and new equipment.
 * (2) On Friday, a day ticked, after a bench press cut short this morning (one set of four, another
 * device), the lifter loads "Empty catch-up" (Wednesday's catch-up the lifter emptied) and taps "Full
 * session", saves the experience as a beginner and taps "Go easy instead": "Triceps and chest take
 * only what is left of one session, three or more reps short of failure.", a close-grip bench press
 * x2 for the chest and triceps trained this morning (and the barbell row x3, the intermediate's dose),
 * where the day's own full session and back gives "Chest and triceps, trained today, sit out."
 *
 * On the previous head (1e29f22) the full session taken from such a copy had no way back (the
 * twenty-sixth review's M31y-B), so both tests fail there at the button: the path is the twenty-sixth
 * pass's.
 *
 * Steps (synthetic data only): Monday's bench press in the log. (1) On Wednesday, a day the schedule
 * does not tick, at the gym, a long session this morning (another device); the lifter saves today's
 * workout as "Nothing more"; on Saturday loads it, taps "Full session", then "Catch-up instead", and
 * saves the schedule with Saturday ticked. (2) On Wednesday the lifter skips each lift of the catch-up
 * and saves it as "Empty catch-up"; on Friday, a bench press this morning stopped after one of its four
 * sets (another device), loads "Empty catch-up", taps "Full session", saves the experience as
 * Beginner, then taps "Go easy instead".
 *
 * The fix (the twenty-seventh pass): the full session taken from such a copy makes the plan the
 * day's own from then on (`session-kind`): the day's offer, the plans the lifter emptied today, and
 * nothing kept aside, so a save reads the offer again into the plan's own (`offerReadAgain`).
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

/** Friday morning's bench press, one working set of the four planned. */
const CUT_SHORT = {
  ...workoutAt(FRIDAY_MORNING, [['barbell-bench-press', 1]]),
  id: 'w-bench-friday',
  endedEarly: true,
};
CUT_SHORT.entries[0]!.plannedSets = 4;

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
const lifts = (handle: Handle) => describeWorkout(session(handle).workout).join('; ');

async function saveProfile(handle: Handle, change: (profile: UserProfile) => UserProfile) {
  await handle.store.saveProfile(change(handle.store.getSnapshot().profile!));
}

const tickSaturday = (profile: UserProfile): UserProfile => ({
  ...profile,
  schedule: {
    ...profile.schedule,
    weeklyFrequency: 5,
    availableDays: ['mon', 'tue', 'thu', 'fri', 'sat'],
  },
});

/** The lifts that work one of the muscles directly. */
const working = (handle: Handle, muscles: readonly string[]) =>
  allEntries(session(handle).workout.blocks)
    .map((entry) => entry.exerciseId)
    .filter((id) => requireExercise(id).primaryMuscles.some((muscle) => muscles.includes(muscle)));

/** Saturday: "Nothing more" saved on Wednesday after the long morning. */
async function saturday(load: boolean) {
  const clock = { now: WEDNESDAY };
  const handle = await lifter(clock);
  const db = await handle.store.getDatabase();
  await db.put('workouts', { ...LONG_MORNING, id: 'w-long-morning' });
  await handle.store.hydrate();
  const saved = await handle.store.saveCurrentWorkout('Nothing more');
  clock.now = SATURDAY;
  handle.store.refreshSession();
  expect(session(handle).constraints.catchUp?.kind).toBe('catch-up');
  if (load) {
    // An empty copy stands in for nothing (the owner, 2026-10-31): today's plan stays, saying so.
    const before = session(handle).workout;
    handle.store.loadSavedWorkout(saved.id);
    expect(session(handle).workout).toBe(before);
    expect(session(handle).lastSummary?.headline).toMatch(
      /^Nothing in ".+" is left for today: today's plan stays\.$/,
    );
  }
  return handle;
}

/** Friday: "Empty catch-up" saved on Wednesday, the bench press cut short this morning. */
async function friday(load: boolean) {
  const clock = { now: WEDNESDAY };
  const handle = await lifter(clock);
  for (const entry of allEntries(session(handle).workout.blocks)) {
    expect((await handle.store.recalibrate({ type: 'skip', entryId: entry.id }))?.ok).toBe(true);
  }
  const saved = await handle.store.saveCurrentWorkout('Empty catch-up');
  clock.now = FRIDAY;
  const db = await handle.store.getDatabase();
  await db.put('workouts', CUT_SHORT);
  await handle.store.hydrate();
  // Friday's own plan: a second workout with what is left of the chest and the triceps.
  expect(session(handle).constraints.catchUp?.kind).toBe('second');
  expect(
    session(handle)
      .constraints.catchUp?.muscles.filter((item) => item.why === 'remainder')
      .map((item) => item.muscle)
      .sort(),
  ).toEqual(['chest', 'triceps']);
  if (load) {
    // An empty copy stands in for nothing (the owner, 2026-10-31): today's plan stays, saying so.
    const before = session(handle).workout;
    handle.store.loadSavedWorkout(saved.id);
    expect(session(handle).workout).toBe(before);
    expect(session(handle).lastSummary?.headline).toMatch(
      /^Nothing in ".+" is left for today: today's plan stays\.$/,
    );
  }
  return handle;
}

describe('the way back from the full session taken from a loaded copy, read again by a save', () => {
  it('gives way to the usual plan when today is ticked, as the day’s own catch-up does', async () => {
    // The day's own catch-up gives way to the usual plan.
    const own = await saturday(false);
    await saveProfile(own, tickSaturday);
    expect(session(own).workout.title, lifts(own)).not.toBe('Catch-up');
    const usual = session(own).workout.templateId;

    const handle = await saturday(true);
    expect((await handle.store.setFullSession(true))?.ok).toBe(true);
    const there = dayNoteOf(session(handle), false);
    // On 1e29f22: "Not one of your training days.", no button.
    expect(there, there?.text).not.toHaveProperty('action');
    expect((await handle.store.setFullSession(false))?.ok).toBe(true);
    expect(session(handle).workout.title).toBe('Catch-up');
    await saveProfile(handle, tickSaturday);
    // On f840d5b: "Catch-up", "back-squat x3 @RIR 2/2/2; barbell-shrug x2 @RIR 1/1", and no line on
    // Today.
    expect(session(handle).workout.title, lifts(handle)).not.toBe('Catch-up');
    expect(session(handle).workout.templateId).toBe(usual);
  });

  it('sits a beginner’s muscles trained today out, as the day’s own way back does', async () => {
    // The day's own full session and back, a beginner saved between: the chest and the triceps sit
    // out.
    const own = await friday(false);
    expect((await own.store.setFullSession(true))?.ok).toBe(true);
    await saveProfile(own, (profile) => ({ ...profile, experience: 'beginner' }));
    expect((await own.store.setFullSession(false))?.ok).toBe(true);
    expect(working(own, ['chest', 'triceps']), lifts(own)).toEqual([]);

    const handle = await friday(true);
    expect((await handle.store.setFullSession(true))?.ok).toBe(true);
    const there = dayNoteOf(session(handle), true);
    // On 1e29f22: no line at all.
    expect(there, there?.text).not.toHaveProperty('action');
    await saveProfile(handle, (profile) => ({ ...profile, experience: 'beginner' }));
    expect((await handle.store.setFullSession(false))?.ok).toBe(true);
    expect(session(handle).constraints.catchUp?.kind).toBe('second');
    // On f840d5b: "close-grip-bench-press x2 @RIR 3/3", "Triceps and chest take only what is left of
    // one session, three or more reps short of failure."
    expect(
      working(handle, ['chest', 'triceps']),
      session(handle).workout.explanation.reasons.join(' / '),
    ).toEqual([]);
  });
});
