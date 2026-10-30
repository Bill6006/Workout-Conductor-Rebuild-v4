import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-third review of round M, from the round's build (item 12 meeting saved workouts, from before
 * the round), beside the twenty-second pass's change to `loadSavedWorkout`: a catch-up saved and
 * loaded on a day of the plan.
 *
 * The rules: `loadSavedWorkout`, "everything after that recalibrates as usual", as it does for every
 * other saved workout: a saved push day loaded on an upper day stays the push day through "Make it
 * harder", a low check-in or an end time (each a rebuild that keeps the plan's layout); a catch-up
 * "keeps the slots it was laid out in with the plan, as the usual plan keeps its template: a rebuild
 * around what it keeps fills the same slots" (How it is kept).
 *
 * What happens: the saved catch-up keeps its layout (`templateId: 'catch-up'`, its `catchUpSlots`),
 * but on a day of the plan its session has no catch-up offer, and the generator cannot lay a catch-up
 * out without one: a rebuild that keeps the layout (`rebuild` passes `templateId`, and `catchUp:
 * null`) falls back to the split's own day. "Make it harder" turns the saved catch-up into the
 * split's pull day ("barbell-row x5 @RIR 1/1/1/1/1; chin-up x4 @RIR 0/0/0/0; ..."), the bench
 * press, the incline press, the lateral raise and the curl of the saved plan gone; so does a low
 * check-in ("dumbbell-curl x2 @RIR 1/1 + drop @RIR 0" among it) and an end time.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule does
 * not tick, at the gym, the lifter saves the catch-up as "Wednesday catch-up". On Thursday, a day of
 * the plan (the pull day), loads it, then makes it harder, or checks in low, or sets an end time.
 *
 * Also fails on e779122 (the saved catch-up has met a day of the plan so since the round's build).
 */

const MONDAY = '2026-08-31T12:00:00.000Z';
const WEDNESDAY = '2026-09-02T12:00:00.000Z';
const THURSDAY = '2026-09-03T12:00:00.000Z';

async function savedOnWednesdayLoadedOnThursday() {
  const clock = { now: WEDNESDAY };
  const handle = createTestStore({ now: () => clock.now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(WEDNESDAY), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, WEDNESDAY),
  );
  const db = await handle.store.getDatabase();
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
    startedAt: MONDAY,
    completedAt: MONDAY,
  });
  await handle.store.hydrate();
  expect(handle.store.getSnapshot().session!.workout.templateId).toBe('catch-up');
  const saved = await handle.store.saveCurrentWorkout('Wednesday catch-up');
  clock.now = THURSDAY;
  handle.store.refreshSession();
  expect(handle.store.getSnapshot().session!.workout.templateId).toBe('pull-arms');
  handle.store.loadSavedWorkout(saved.id);
  return handle;
}

type Handle = Awaited<ReturnType<typeof savedOnWednesdayLoadedOnThursday>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;
const ids = (handle: Handle) =>
  allEntries(session(handle).workout.blocks).map((entry) => entry.exerciseId);
const lifts = (handle: Handle) => describeWorkout(session(handle).workout).join('; ');

/** The saved catch-up's own lifts, as loaded. */
const SAVED = ['barbell-bench-press', 'incline-dumbbell-press', 'lateral-raise', 'ez-bar-curl'];

describe('a catch-up saved and loaded on a day of the plan', () => {
  it('stays the saved catch-up through "Make it harder"', async () => {
    const handle = await savedOnWednesdayLoadedOnThursday();
    expect(ids(handle)).toEqual(expect.arrayContaining(SAVED));
    expect((await handle.store.recalibrate({ type: 'intensity', direction: 'harder' }))?.ok).toBe(
      true,
    );
    // On 6af588c and e779122: the split's pull day, "barbell-row x5 @RIR 1/1/1/1/1; chin-up x4 @RIR
    // 0/0/0/0; ...".
    expect(ids(handle), lifts(handle)).toEqual(expect.arrayContaining(SAVED));
  });

  it('stays the saved catch-up through a low check-in', async () => {
    const handle = await savedOnWednesdayLoadedOnThursday();
    const result = await handle.store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 1,
        soreness: 4,
        sleep: 1,
        motivation: 2,
        jointDiscomfort: [],
        timePressure: false,
      },
    });
    expect(result?.ok).toBe(true);
    // On 6af588c and e779122: the split's pull day, a drop set to failure among it.
    expect(ids(handle), lifts(handle)).toEqual(expect.arrayContaining(SAVED));
  });

  it('stays the saved catch-up through an end time', async () => {
    const handle = await savedOnWednesdayLoadedOnThursday();
    expect((await handle.store.setEndBy(true))?.ok).toBe(true);
    // On 6af588c and e779122: the split's pull day fitted to the time.
    expect(ids(handle), lifts(handle)).toEqual(expect.arrayContaining(SAVED));
  });

  it('stays a catch-up through a save that builds it afresh', async () => {
    // A save that rebuilds a plan not yet begun builds a saved workout loaded afresh (from before
    // the round): as a plan of its own kind, the catch-up it was saved as (the twenty-third pass's
    // fix: the day's offer read again for the save took its own away, and the split's day came).
    const handle = await savedOnWednesdayLoadedOnThursday();
    const profile = handle.store.getSnapshot().profile!;
    await handle.store.saveProfile({ ...profile, reserveCheck: !profile.reserveCheck });
    expect(session(handle).workout.templateId, lifts(handle)).toBe('catch-up');
  });
});
