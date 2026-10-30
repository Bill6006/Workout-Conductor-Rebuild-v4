import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries, CATCH_UP_TEMPLATE_IDS } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { offerKey } from '../../engine/workoutGenerator/generate';
import { writeSession } from './session';

/**
 * Nineteenth review of round M, the store's own paths: the mark of a catch-up the lifter emptied
 * keeps the layout emptied (`emptiedLayout`). The split's own day standing in for it, at a place
 * with no lift for it, keeps the mark through a reload and a later plan the same day, which lays the
 * catch-up out again empty; the split's own day emptied where it stood in leaves the catch-up to a
 * place that lays it out (the engine's steps: `src/engine/recalibration/emptiedRoundTrip.test.ts`).
 * Synthetic data only.
 */

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();
const [bare] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, TEST_NOW) as [
  LocationProfile,
];
const travel: LocationProfile = { ...bare, id: 'travel', name: 'Travel' };
const NOTHING = 'Not one of your training days: nothing more for today.';

async function lifter(options: Parameters<typeof createTestStore>[0] = {}) {
  const handle = createTestStore(options);
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  const when = daysBefore(2);
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
    startedAt: when,
    completedAt: when,
  });
  await handle.store.hydrate();
  await handle.store.saveLocation(travel);
  return handle;
}

type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Pick<Handle, 'store'>) => handle.store.getSnapshot().session!;

async function moveTo(handle: Pick<Handle, 'store'>, id: string) {
  const profile = handle.store.getSnapshot().profile!;
  await handle.store.saveProfile({ ...profile, currentLocationId: id });
}

/** A workout from another device lands, twenty days old: the offer stays the same. */
async function anotherDevice(handle: Pick<Handle, 'store'>) {
  const db = await handle.store.getDatabase();
  const when = daysBefore(20);
  await db.put('workouts', {
    ...record(0, 'back-squat', [[5, 200, 2]], [4, 6], 2),
    id: 'w-elsewhere',
    startedAt: when,
    completedAt: when,
  });
  await handle.store.hydrate();
}

async function skipEvery(handle: Pick<Handle, 'store'>) {
  for (const entry of allEntries(session(handle).workout.blocks)) {
    await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
  }
  expect(allEntries(session(handle).workout.blocks)).toEqual([]);
}

describe('a catch-up the lifter emptied, through a later plan, a reload and another place', () => {
  it('the split’s own day standing in for it keeps the mark: made again, the catch-up stays empty', async () => {
    const handle = await lifter();
    await moveTo(handle, 'gym');
    expect(session(handle).workout.templateId).toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
    const offer = session(handle).constraints.catchUp!;
    await skipEvery(handle);
    const mark = [
      { offer: offerKey({ catchUp: offer }), layout: CATCH_UP_TEMPLATE_IDS['catch-up'] },
    ];
    expect(session(handle).constraints.emptied).toEqual(mark);
    // The split's own day with the mark, as the way back at a place with no lift for the offer
    // leaves it (catchUpEmptiedRoundTrip: the review's own steps, engine and store reading alike).
    await handle.store.setFullSession(true);
    const split = session(handle);
    expect(allEntries(split.workout.blocks).length).toBeGreaterThan(0);
    const standing = { ...split.constraints };
    delete standing.fullSession;
    writeSession({ ...split, constraints: standing }, handle.storage);

    // A reload reads the mark and the layout back.
    const reloaded = createTestStore({ factory: handle.factory, storage: handle.storage });
    await reloaded.store.hydrate();
    expect(session(reloaded).constraints.emptied).toEqual(mark);

    // A later plan the same day, made at the gym: the catch-up laid out again, emptied still.
    await anotherDevice(reloaded);
    expect(session(reloaded).constraints.catchUp).toEqual(offer);
    // On 0f8d10f: the mark went, and the catch-up came back whole.
    expect(allEntries(session(reloaded).workout.blocks)).toEqual([]);
    expect(dayNoteOf(session(reloaded))?.text).toBe(NOTHING);
    expect(session(reloaded).constraints.emptied).toEqual(mark);
  });

  it('the split’s own day emptied standing in leaves the catch-up to another place', async () => {
    const handle = await lifter();
    await moveTo(handle, 'gym');
    const today = session(handle);
    const offer = today.constraints.catchUp!;
    // Emptied by the lifter's hand where the split's own day stood in for the catch-up.
    writeSession(
      {
        ...today,
        workout: { ...today.workout, templateId: 'push-arms', blocks: [] },
        constraints: {
          ...today.constraints,
          emptied: [{ offer: offerKey({ catchUp: offer }), layout: 'push-arms' }],
        },
      },
      handle.storage,
    );
    const reloaded = createTestStore({ factory: handle.factory, storage: handle.storage });
    await reloaded.store.hydrate();
    // A later plan the same day is built afresh, as every plan is since the twenty-second review of
    // round M (the old plan handed back kept the lines of the place it was emptied at): the gym lays
    // out the catch-up itself, another layout, which the split's day's mark leaves whole.
    await anotherDevice(reloaded);
    expect(session(reloaded).workout.templateId).toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
    expect(allEntries(session(reloaded).workout.blocks).length).toBeGreaterThan(0);
    expect(session(reloaded).constraints.emptied).toEqual([
      { offer: offerKey({ catchUp: offer }), layout: 'push-arms' },
    ]);
    // Another place lays out the catch-up itself: another plan, built whole.
    await moveTo(reloaded, 'travel');
    expect(session(reloaded).workout.templateId).toBe(CATCH_UP_TEMPLATE_IDS['catch-up']);
    expect(allEntries(session(reloaded).workout.blocks).length).toBeGreaterThan(0);
  });
});
