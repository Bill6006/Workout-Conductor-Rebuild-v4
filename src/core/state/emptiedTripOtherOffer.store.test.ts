import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries, CATCH_UP_TEMPLATE_IDS } from '../../engine/workout/types';
import { offerKey } from '../../engine/workoutGenerator/generate';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Twentieth review of round M, on the eighteenth and nineteenth passes' mark of a plan the lifter
 * emptied (`emptied`, `emptiedLayout`) where it meets the store's reading of a change of place
 * (`offerOverrides`, the week model read at the new place).
 *
 * The rules: "a catch-up or a second workout emptied stays so through every rebuild" (the
 * fourteenth to sixteenth passes); "Every rebuild, the way back from the full session and a later
 * plan the same day read the mark" (the eighteenth); and the known limit the nineteenth pass wrote
 * for a change of offer: "A save that changes the day's offer builds the new plan whole ... The old
 * offer's mark of a plan emptied stays, read by no plan of the new offer."
 *
 * What happens: the week model plans the week's sessions still to come at the current place, so a
 * place with less equipment reads another offer (more muscles behind). The store builds the plan
 * whole for it, as the known limit says, but `markEmptied` then ends the mark of the old offer,
 * since the new plan has lifts and is laid out as an offer (`laidOutAsOffer` reads the template
 * only, not whose offer the mark is). Back at the first place the old offer comes back, the mark is
 * gone, and the plan the lifter emptied there is built whole with new lifts. The nineteenth pass's
 * engine test of the same trip ("without the full session, a trip there and back keeps it empty")
 * holds the offer fixed, which the store does not.
 *
 * Steps (synthetic data only):
 * - Monday's bench press in the log; on Wednesday, a day the schedule does not tick, at the gym, the
 *   catch-up has seven lifts. The lifter skips each: "Not one of your training days: nothing more
 *   for today." The place set to Travel (no equipment): another offer, a catch-up of the push-up,
 *   the Bulgarian split squat and more. The place set back to the gym: the gym's offer again, and a
 *   catch-up of seven lifts (the close-grip bench press, the incline barbell bench press, the cable
 *   lateral raise ...), though the lifter emptied it there.
 * - The same for a second workout, with a row six days ago and a bench press done this morning:
 *   six lifts at the gym, the Bulgarian split squat and a calf raise at Travel, and six lifts back
 *   at the gym (the incline barbell bench press, the cable lateral raise ...).
 *
 * Also fails on 0f8d10f (the mark ended by any lift in the plan there).
 */

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();
const [bare] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, TEST_NOW) as [
  LocationProfile,
];
const travel: LocationProfile = { ...bare, id: 'travel', name: 'Travel' };

async function lifter(morning: boolean) {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  const put = (id: string, exerciseId: string, when: string) =>
    db.put('workouts', {
      ...record(
        0,
        exerciseId,
        [
          [10, 100, 2],
          [10, 100, 2],
          [10, 100, 2],
        ],
        [8, 12],
        2,
      ),
      id,
      startedAt: when,
      completedAt: when,
    });
  await put('w-bench-monday', 'barbell-bench-press', daysBefore(2));
  if (morning) {
    await put('w-row', 'barbell-row', daysBefore(6));
    await put(
      'w-morning',
      'barbell-bench-press',
      new Date(Date.parse(TEST_NOW) - 4 * 3600_000).toISOString(),
    );
  }
  await handle.store.hydrate();
  await handle.store.saveLocation(travel);
  return handle;
}

type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;
const lifts = (handle: Handle) => describeWorkout(session(handle).workout).join('; ');

async function moveTo(handle: Handle, id: string) {
  const profile = handle.store.getSnapshot().profile!;
  await handle.store.saveProfile({ ...profile, currentLocationId: id });
}

async function emptiedAtTheGym(handle: Handle) {
  await moveTo(handle, 'gym');
  const offer = session(handle).constraints.catchUp!;
  expect(allEntries(session(handle).workout.blocks).length).toBeGreaterThan(1);
  for (const entry of allEntries(session(handle).workout.blocks)) {
    await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
  }
  expect(allEntries(session(handle).workout.blocks)).toEqual([]);
  expect(session(handle).constraints.emptied).toEqual([
    { offer: offerKey({ catchUp: offer }), layout: session(handle).workout.templateId },
  ]);
  return offer;
}

describe('a plan the lifter emptied at the gym, through a trip to a place that reads another offer', () => {
  it('a catch-up stays empty back at the gym', async () => {
    const handle = await lifter(false);
    const offer = await emptiedAtTheGym(handle);
    expect(session(handle).workout.templateId).toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
    await moveTo(handle, 'travel');
    const there = lifts(handle);
    // Another offer at Travel, built whole for it, as the known limit says.
    expect(offerKey(session(handle).constraints)).not.toBe(offerKey({ catchUp: offer }));
    await moveTo(handle, 'gym');
    expect(session(handle).constraints.catchUp).toEqual(offer);
    // On 0fe4cb9 and 0f8d10f: seven lifts, "close-grip-bench-press x3 @RIR 2/2/2; ...".
    expect(lifts(handle), `Travel: ${there}`).toBe('');
    expect(dayNoteOf(session(handle))?.text).toBe(
      'Not one of your training days: nothing more for today.',
    );
  });

  it('a second workout stays empty back at the gym', async () => {
    const handle = await lifter(true);
    const offer = await emptiedAtTheGym(handle);
    expect(offer.kind).toBe('second');
    await moveTo(handle, 'travel');
    const there = lifts(handle);
    expect(offerKey(session(handle).constraints)).not.toBe(offerKey({ catchUp: offer }));
    await moveTo(handle, 'gym');
    expect(session(handle).constraints.catchUp).toEqual(offer);
    // On 0fe4cb9 and 0f8d10f: six lifts, "incline-barbell-bench-press x3 @RIR 1/1/1; ...".
    expect(lifts(handle), `Travel: ${there}`).toBe('');
    expect(dayNoteOf(session(handle))?.text).toBe('You trained today: nothing more for today.');
  });
});
