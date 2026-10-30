import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { offerKey } from '../../engine/workoutGenerator/generate';
import { dayNoteOf } from '../../features/today/dayNote';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twenty-second review of round M, on the twenty-first pass's carry of a workout saved with nothing
 * logged into the next plan (`dismissCompletion` hands the finished session to `ensureSession` as
 * `carry`), where it meets `ensureSession`'s own shortcut for a plan the lifter emptied
 * (`keepEmptied`: `workout = before.workout`).
 *
 * The rules: the twentieth pass, "The rebuild no longer hands back the old plan: the generator lays
 * out an emptied plan empty and says where it was built, and a place that lays out another plan
 * (the split's own day standing in) builds that one", fixing "an emptied plan taken to another place
 * kept the old place's lines"; the eighth pass, no compromise line names what a place cannot do
 * where it is not true ("No elbow extension option fits Home"); and "Why this workout" says where
 * the plan was built ("Built for Gym from the equipment saved there"), on an empty plan too.
 *
 * What happens: a change of place on the completion screen rebuilds nothing (`saveProfile` skips a
 * completed session and only moves its key). When the completion is put away, the carried session
 * is the plan the lifter emptied at the old place, and `ensureSession` hands that very workout back
 * whenever its offer and layout are marked, without asking the generator: at the gym the empty plan
 * still says "Built for Flat from the equipment saved there" and "No incline push option fits Flat
 * and your limits.", and keeps Flat as its place. The same plan emptied on Today and taken to the gym
 * is made again there (the twentieth pass's `emptiedLinesOtherPlace.store.test.ts`). A change of the
 * place's equipment on the completion screen takes the same way (`saveLocation` skips it too).
 *
 * Steps (synthetic data only): on Saturday, with no sessions left this week (so the offer reads the
 * same at every place and after the save), a bench press, a squat and a row this week; at Flat
 * (dumbbells only) the catch-up is built. The lifter starts it, skips each lift, saves the workout
 * with nothing logged, sets the place to the gym on the completion screen, and puts the completion
 * away: "Not one of your training days: nothing more for today.", the plan Flat's. Or, the place
 * left as it is, adds an adjustable bench to Flat on the completion screen: the empty plan still
 * says "No incline push option fits Flat and your limits.".
 *
 * A regression of the twenty-first pass: on 333f1d4 the completion put away carried nothing and the
 * plan was built whole at the gym, its lines the gym's (the test fails there only at the last
 * assertion, the plan kept empty, which is the twenty-first pass's own finding).
 */

const SATURDAY = '2026-09-05T12:00:00.000Z';
const DAY = 86_400_000;
const [dumbbells] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  SATURDAY,
) as [LocationProfile];
const flat: LocationProfile = { ...dumbbells, id: 'flat', name: 'Flat' };

async function lifter() {
  const handle = createTestStore({ now: () => SATURDAY });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(SATURDAY), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, SATURDAY),
  );
  const db = await handle.store.getDatabase();
  for (const [exerciseId, daysAgo] of [
    ['barbell-bench-press', 4],
    ['back-squat', 3],
    ['barbell-row', 1],
  ] as const) {
    const when = new Date(Date.parse(SATURDAY) - daysAgo * DAY).toISOString();
    await db.put('workouts', {
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
      id: `w-${exerciseId}`,
      startedAt: when,
      completedAt: when,
    });
  }
  await handle.store.hydrate();
  await handle.store.saveLocation(flat);
  return handle;
}

type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;
const lines = (handle: Handle) => [
  ...session(handle).workout.explanation.reasons,
  ...session(handle).workout.compromises,
];

async function moveTo(handle: Handle, id: string) {
  const profile = handle.store.getSnapshot().profile!;
  await handle.store.saveProfile({ ...profile, currentLocationId: id });
}

describe('a catch-up emptied in a workout saved with nothing logged, the place changed after', () => {
  it('says nothing of the place it was emptied at', async () => {
    const handle = await lifter();
    await moveTo(handle, 'flat');
    const offer = offerKey(session(handle).constraints);
    expect(lines(handle)).toContain('No incline push option fits Flat and your limits.');
    handle.store.startWorkout();
    for (const entry of allEntries(session(handle).workout.blocks)) {
      await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
    }
    expect(allEntries(session(handle).workout.blocks)).toEqual([]);
    await handle.store.finishWorkout(null);
    await moveTo(handle, 'gym');
    expect(session(handle).status).toBe('completed');
    handle.store.dismissCompletion();
    expect(offerKey(session(handle).constraints)).toBe(offer);
    // On e779122: "Built for Flat from the equipment saved there, ..." and "No incline push option
    // fits Flat and your limits.", and the plan's place Flat.
    expect(lines(handle).filter((line) => line.includes('Flat'))).toEqual([]);
    expect(session(handle).workout.locationId).toBe('gym');
    // The plan kept empty, as the twenty-first pass's rule says (on 333f1d4, built whole).
    expect(allEntries(session(handle).workout.blocks)).toEqual([]);
    expect(dayNoteOf(session(handle))?.text).toBe(
      'Not one of your training days: nothing more for today.',
    );
  });

  it('says nothing the place no longer lacks, its equipment changed after', async () => {
    const handle = await lifter();
    await moveTo(handle, 'flat');
    expect(lines(handle)).toContain('No incline push option fits Flat and your limits.');
    handle.store.startWorkout();
    for (const entry of allEntries(session(handle).workout.blocks)) {
      await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
    }
    await handle.store.finishWorkout(null);
    // An adjustable bench at Flat: the incline dumbbell press fits there now.
    const place = handle.store.getSnapshot().locations.find((one) => one.id === 'flat')!;
    await handle.store.saveLocation({
      ...place,
      equipment: [...place.equipment, 'adjustable-bench'],
    });
    expect(session(handle).status).toBe('completed');
    handle.store.dismissCompletion();
    // On e779122: "No incline push option fits Flat and your limits." still.
    expect(lines(handle)).not.toContain('No incline push option fits Flat and your limits.');
    // The plan kept empty, as the twenty-first pass's rule says (on 333f1d4, built whole).
    expect(allEntries(session(handle).workout.blocks)).toEqual([]);
  });
});
