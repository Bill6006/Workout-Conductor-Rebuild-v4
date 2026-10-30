import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { localDayKey } from '../time/localDate';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { at, describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-sixth review of round M (M31y-C), on the twenty-fifth pass's day of a saved second workout
 * (`loadSavedWorkout`: `trainedDay`, `localDayKey(saved.workout.generatedAt) === localDayKey(now)`).
 * `generatedAt` is the time of the plan's last rebuild, not the day it was made: the engine builds
 * every rebuild afresh at the change's time (`generateWorkout`'s `generatedAt: now`), and a workout
 * under way is rebuilt across midnight (a preview from an earlier day gives way first; a workout
 * begun does not). A second workout begun late, rebuilt past midnight and saved, reads as the next
 * day's own.
 *
 * The rules: the twenty-fifth pass, "A second workout stays one only on the day its plan was made,
 * while that day is still one trained; on any other it is a catch-up of its muscles", and its comment
 * in `loadSavedWorkout`, "A second workout is the day trained's: the day its plan was made"; the
 * twenty-fourth, `secondOnAnotherDay`, "a second workout is the day trained's, and says nothing of a
 * day trained on any other"; item 32's lines, "Hamstrings, trained today, sit out.", said of the day
 * trained.
 *
 * What happens: Thursday's second workout (after a row that morning) is begun at 23:30 and a set
 * logged; the lifter pauses at 23:50 and resumes at 00:15, and the long interruption rebuilds the
 * rest ("Back after 25 min"), so the plan's `generatedAt` is Friday 00:15. Finished and saved from
 * the completion screen as "Late second", it is loaded on Friday evening after a squat that morning:
 * Friday is a day trained and the plan's `generatedAt` is Friday, so the copy stays a second workout
 * of Thursday's, "A second workout today: it leads with what you missed, ..." and "Lats and upper
 * back, trained today, sit out." (rowed on Thursday), with "You trained today: this one leads with
 * what you missed and goes easy on the rest." on Today. On the previous head (0a82961), which read
 * the day from `saved.createdAt` (Friday 00:45), the same: fails too. A copy of the same plan saved
 * before midnight (or never rebuilt after it) is a catch-up of its muscles on Friday.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Thursday, a day the schedule
 * ticks, a barbell row at 8:00 (another device). At 23:30 the lifter begins the second workout and
 * logs a set, pauses at 23:50 and resumes at 00:15; finishes at 00:40 and, on the Plan tab, saves
 * today's workout as "Late second". On Friday a back squat at 8:00 (another device); at 18:00 the
 * lifter loads "Late second".
 *
 * The fix (the twenty-sixth pass): a copy records the day its plan was made (`planDay`), which no
 * rebuild moves; a copy saved before reads it off its workout as before.
 */

// On this device's clock (`at`, September 2026): Monday the 31st of August (day 0 of September),
// Thursday the 3rd, Friday the 4th.
const MONDAY = at(0, 12);
const THURSDAY_MORNING = at(3, 8);
const THURSDAY_LATE = at(3, 23, 30);
const THURSDAY_PAUSE = at(3, 23, 50);
const FRIDAY_RESUME = at(4, 0, 15);
const FRIDAY_FINISH = at(4, 0, 40);
const FRIDAY_SAVE = at(4, 0, 45);
const FRIDAY_MORNING = at(4, 8);
const FRIDAY_EVENING = at(4, 18);

const threeSets: [number, number, number][] = [
  [10, 100, 2],
  [10, 100, 2],
  [10, 100, 2],
];

async function lateSecondLoadedOnFriday() {
  const clock = { now: THURSDAY_LATE };
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
    id: 'w-row-thursday',
    startedAt: THURSDAY_MORNING,
    completedAt: THURSDAY_MORNING,
  });
  await handle.store.hydrate();
  const session = () => handle.store.getSnapshot().session!;
  expect(session().constraints.catchUp?.kind).toBe('second');
  handle.store.startWorkout();
  const first = allEntries(session().workout.blocks)[0]!;
  const set = first.sets.find((candidate) => candidate.kind === 'working')!;
  await handle.store.logSet(first.id, set.index, { weight: 100, reps: 10, rir: 2 });
  clock.now = THURSDAY_PAUSE;
  handle.store.pauseWorkout();
  clock.now = FRIDAY_RESUME;
  await handle.store.resumeWorkout();
  // The long interruption rebuilt the rest of Thursday's second workout just past midnight.
  expect(session().constraints.catchUp?.kind).toBe('second');
  expect(localDayKey(session().workout.generatedAt)).toBe('2026-09-04');
  clock.now = FRIDAY_FINISH;
  await handle.store.finishWorkout(null);
  clock.now = FRIDAY_SAVE;
  const saved = await handle.store.saveCurrentWorkout('Late second');
  expect(saved.catchUp?.kind).toBe('second');
  handle.store.dismissCompletion();
  // Friday: a squat this morning, from another device.
  clock.now = FRIDAY_EVENING;
  await db.put('workouts', {
    ...record(0, 'back-squat', threeSets, [8, 12], 2),
    id: 'w-squat-friday',
    startedAt: FRIDAY_MORNING,
    completedAt: FRIDAY_MORNING,
  });
  await handle.store.hydrate();
  expect(session().constraints.catchUp?.kind).toBe('second');
  handle.store.loadSavedWorkout(saved.id);
  expect(allEntries(session().workout.blocks).length).toBeGreaterThan(0);
  return session();
}

describe('a second workout rebuilt past midnight and saved, loaded after a workout that day', () => {
  it('is no second workout of that day', async () => {
    const loaded = await lateSecondLoadedOnFriday();
    // On 1e29f22 and 0a82961: "second".
    expect(loaded.constraints.catchUp?.kind, describeWorkout(loaded.workout).join('; ')).not.toBe(
      'second',
    );
  });

  it('says nothing of Thursday’s row as trained today', async () => {
    const loaded = await lateSecondLoadedOnFriday();
    // On 1e29f22 and 0a82961: "A second workout today: it leads with what you missed, ... / Lats and
    // upper back, trained today, sit out. / ...".
    expect(loaded.workout.explanation.reasons.join(' / ')).not.toMatch(
      /A second workout today|trained today/,
    );
    expect(dayNoteOf(loaded, true)?.text ?? '').not.toMatch(/leads with what you missed/);
  });
});
