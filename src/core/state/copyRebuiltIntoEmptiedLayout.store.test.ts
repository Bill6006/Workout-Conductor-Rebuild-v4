import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout, session as workoutAt } from '../../test/clockDays';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-fifth review of round M (M31x-G), on the twenty-fourth pass's split of the day's marks at a
 * load (`loadSavedWorkout`: `marks`, kept aside in `dayChoices.emptied`, and `ownMarks`, the copy's
 * own `emptied`, only the mark of the copy's own offer and layout, only for a copy with no lift).
 * The copy's rebuilds read its own `emptied` alone (`emptiedLayoutsFor(constraints)` in `rebuild`),
 * so a mark of the copy's own offer in another layout, the split's day a place with no lift for the
 * offer puts in its place, is not read where the copy is laid out that way.
 *
 * The rules: the nineteenth pass, "The mark of a plan emptied keeps the layout emptied ...: the
 * offer's own, or the split's own day a place with no lift for the offer puts in its place. The
 * generator lays that layout out empty wherever it finds a lift for it, for every rebuild and for a
 * later plan the same day"; the twentieth, "Every later plan of that offer laid out the same way
 * takes no lift: every rebuild, the way back from the full session, a later plan the same day"; the
 * twenty-third, "The day's own choices are kept aside while it stands in for the day's plan ...,
 * through every change made on it"; and a saved catch-up or second workout loaded "is that plan
 * again" (the copy's offer here is the day's own, "second side-delts").
 *
 * What happens: on Sunday, after an upper session this morning, the second workout is a lateral
 * raise at the gym, saved as "Side delts". At home, with no equipment, nothing works the side delts
 * and the split's lower day stands in (Bulgarian split squat, standing calf raise, dead bug); the
 * lifter skips all three ("You trained today: nothing more for today."), marking that offer laid
 * out as the lower day. Back at the gym the lateral raise is another layout. Taken home again, the
 * day's own plan is laid out empty, as the rule says. But with "Side delts" loaded at the gym, the
 * mark is kept aside for later plans only, and taken home the copy is rebuilt as the lower day with
 * the three lifts the lifter skipped there: "bulgarian-split-squat x3 @RIR 1/1/1;
 * standing-calf-raise x3 @RIR 1/1/1; dead-bug x2 @RIR 2/2", "You trained today: what you trained sits
 * out." On ce935fe the same (fails too); on 6af588c, where a loaded copy kept the day's marks as its
 * own, it is laid out empty (passes): a regression of the twenty-third pass that the twenty-fourth
 * pass's `ownMarks` (the copy's own layout only) leaves.
 *
 * Steps (synthetic data only): a long lower session last Monday morning; on Sunday, a day the
 * schedule does not tick, an upper session this morning (another device). At the gym the lifter
 * saves the second workout as "Side delts"; sets the place to Home and skips each lift; sets it back
 * to the gym and loads "Side delts"; sets the place to Home again.
 *
 * The fix (the twenty-fifth pass): every mark the day holds for the copy's offer is the copy's own,
 * as it is the day's plan's, so its rebuild into any layout finds it; only its own layout's ends
 * with its lifts back.
 */

const MONDAY_MORNING = '2026-08-31T08:00:00.000Z';
const SUNDAY_MORNING = '2026-09-06T08:00:00.000Z';
const SUNDAY = '2026-09-06T12:00:00.000Z';

const LOWER = workoutAt(MONDAY_MORNING, [
  ['back-squat', 12],
  ['romanian-deadlift', 12],
  ['standing-calf-raise', 12],
  ['ab-wheel-rollout', 12],
  ['leg-curl', 12],
  ['hip-thrust', 12],
]);
const UPPER = workoutAt(SUNDAY_MORNING, [
  ['barbell-bench-press', 6],
  ['incline-dumbbell-press', 6],
  ['rear-delt-fly', 6],
  ['barbell-shrug', 6],
  ['pull-up', 6],
  ['barbell-row', 6],
  ['ez-bar-curl', 6],
  ['wrist-curl', 6],
  ['overhead-press', 6],
  ['cable-triceps-pushdown', 6],
]);

async function lifter() {
  const handle = createTestStore({ now: () => SUNDAY });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(SUNDAY), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true, homeEquipment: [] }, SUNDAY),
  );
  const db = await handle.store.getDatabase();
  await db.put('workouts', { ...LOWER, id: 'w-lower-monday' });
  await db.put('workouts', { ...UPPER, id: 'w-upper-sunday' });
  await handle.store.hydrate();
  return handle;
}

type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;
const ids = (handle: Handle) =>
  allEntries(session(handle).workout.blocks).map((entry) => entry.exerciseId);
const lifts = (handle: Handle) => describeWorkout(session(handle).workout).join('; ');
const place = (handle: Handle, kind: 'home' | 'gym') =>
  handle.store.getSnapshot().locations.find((location) => location.kind === kind)!.id;

/** The stand-in at home emptied by the lifter's skips; back at the gym, `load` there or not. */
async function emptiedAtHome(load: boolean) {
  const handle = await lifter();
  if (handle.store.getSnapshot().profile!.currentLocationId !== place(handle, 'gym')) {
    await handle.store.setCurrentLocation(place(handle, 'gym'));
  }
  expect(session(handle).constraints.catchUp?.muscles.map((item) => item.muscle)).toEqual([
    'side-delts',
  ]);
  expect(ids(handle)).toEqual(['lateral-raise']);
  const saved = await handle.store.saveCurrentWorkout('Side delts');
  await handle.store.setCurrentLocation(place(handle, 'home'));
  // No lift for the side delts at home: the split's lower day stands in.
  expect(session(handle).workout.templateId, lifts(handle)).toBe('lower');
  for (const entry of allEntries(session(handle).workout.blocks)) {
    expect((await handle.store.recalibrate({ type: 'skip', entryId: entry.id }))?.ok).toBe(true);
  }
  expect(dayNoteOf(session(handle), false)?.text).toBe(
    'You trained today: nothing more for today.',
  );
  await handle.store.setCurrentLocation(place(handle, 'gym'));
  expect(ids(handle)).toEqual(['lateral-raise']);
  if (load) {
    handle.store.loadSavedWorkout(saved.id);
    expect(ids(handle)).toEqual(['lateral-raise']);
  }
  await handle.store.setCurrentLocation(place(handle, 'home'));
  return handle;
}

describe('a saved second workout loaded, rebuilt where the lifter emptied its offer laid out another way', () => {
  it('takes no lift there, as the day’s own plan does', async () => {
    const own = await emptiedAtHome(false);
    // The rule, for the day's own plan: laid out empty at home.
    expect(ids(own), lifts(own)).toEqual([]);
    const handle = await emptiedAtHome(true);
    // On 992c87d and ce935fe: "bulgarian-split-squat x3 @RIR 1/1/1; standing-calf-raise x3 @RIR
    // 1/1/1; dead-bug x2 @RIR 2/2", the lifts skipped at home back.
    expect(ids(handle), lifts(handle)).toEqual([]);
    expect(dayNoteOf(session(handle), false)?.text).toBe(
      'You trained today: nothing more for today.',
    );
  });
});
