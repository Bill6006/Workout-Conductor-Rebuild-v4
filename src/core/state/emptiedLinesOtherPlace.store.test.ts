import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { offerKey } from '../../engine/workoutGenerator/generate';
import { dayNoteOf } from '../../features/today/dayNote';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * Twentieth review of round M, on the plan the lifter emptied kept through a change of place (the
 * fourteenth to sixteenth passes' `rebuild`: "a catch-up or a second workout the lifter's changes
 * emptied stays so through every rebuild"), which returns the old plan as it was, its lines with it.
 *
 * The rule its lines break: the eighth pass fixed a compromise line that named what a place could
 * not do where it was not true ("No elbow extension option fits Home"), and "Why this workout" says
 * what the plan is for and where it was built ("Built for Gym from the equipment saved there"). It
 * shows on an empty plan too (`WorkoutPreviewCard`: only the warm-up note and Start are hidden).
 *
 * What happens: `rebuild` hands back a clone of the emptied plan, only its length changed, so at the
 * new place "Why this workout" still says "Built for Flat from the equipment saved there ..." and
 * "No incline push option fits Flat and your limits.", under "Rebuilt for Gym: no changes needed."
 * (and the plan keeps Flat's place).
 *
 * Steps (synthetic data only): on Saturday, with no sessions left this week (so the offer reads the
 * same at every place), a bench press, a squat and a row this week; at Flat (dumbbells only) the
 * catch-up is built, with "No incline push option fits Flat and your limits.". The lifter skips each
 * lift: "nothing more for today". The place set to the gym: "Rebuilt for Gym: no changes needed.",
 * and the plan's lines still name Flat.
 *
 * Also fails on 0f8d10f (from the fourteenth to sixteenth passes).
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

describe('a catch-up the lifter emptied, taken to another place', () => {
  it('says nothing of the place it was emptied at', async () => {
    const handle = await lifter();
    await moveTo(handle, 'flat');
    const offer = offerKey(session(handle).constraints);
    expect(lines(handle)).toContain('No incline push option fits Flat and your limits.');
    for (const entry of allEntries(session(handle).workout.blocks)) {
      await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
    }
    expect(dayNoteOf(session(handle))?.text).toBe(
      'Not one of your training days: nothing more for today.',
    );
    await moveTo(handle, 'gym');
    // The same offer at the gym, and the plan kept empty, as the rules say.
    expect(offerKey(session(handle).constraints)).toBe(offer);
    expect(allEntries(session(handle).workout.blocks)).toEqual([]);
    expect(session(handle).lastSummary?.headline).toBe('Rebuilt for Gym: no changes needed.');
    // On 0fe4cb9 and 0f8d10f: "Built for Flat from the equipment saved there, ..." and "No
    // incline push option fits Flat and your limits.".
    expect(lines(handle).filter((line) => line.includes('Flat'))).toEqual([]);
  });
});
