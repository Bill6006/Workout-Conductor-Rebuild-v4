import { describe, expect, it } from 'vitest';
import { localDayKey } from '../time/localDate';
import { createDefaultLocations, type LocationProfile } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import { allEntries } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The review of the catch-up decision (2026-10-31): a saved copy with a lift, which the day's
 * check-in then leaves with none, replaced today's plan with nothing to start, and with no button
 * since the owner's word of the same day. The check-in is laid on the copy first: one it empties
 * stands in for nothing, and today's plan stays, untouched. At home with dumbbells only, a copy of a
 * hamstring catch-up has the dumbbell Romanian deadlift alone; a check-in with lower-back discomfort
 * rules it out. Synthetic data only.
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  TEST_NOW,
) as [LocationProfile];
const profile = { ...createDefaultProfile(TEST_NOW, 'home'), bodyweight: 185 };
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [{ muscle: 'hamstrings', sets: 3, minRir: 1, why: 'behind' }],
  sitOut: [],
};

async function lifterWithCopy() {
  const handle = createTestStore({ now: () => TEST_NOW, minOverlayMs: 0 });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(profile, [home]);
  const workout = generateWorkout({
    profile,
    location: home,
    history: [],
    now: TEST_NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  expect(allEntries(workout.blocks).map((entry) => entry.exerciseId)).toEqual([
    'dumbbell-romanian-deadlift',
  ]);
  const db = await handle.store.getDatabase();
  await db.put('savedWorkouts', {
    id: 'saved-hamstrings',
    name: 'Hamstrings',
    createdAt: TEST_NOW,
    locationId: 'home',
    duration: 'default',
    workout,
    catchUp: spec,
    planDay: localDayKey(TEST_NOW),
  });
  await handle.store.hydrate();
  return handle;
}

const readiness = {
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: ['lower-back' as const],
  timePressure: false,
};

describe('a saved copy the day’s check-in leaves with nothing', () => {
  it('loads as itself with no check-in told', async () => {
    const { store } = await lifterWithCopy();
    expect(store.loadSavedWorkout('saved-hamstrings')).toBe('loaded');
    expect(
      allEntries(store.getSnapshot().session!.workout.blocks).map((entry) => entry.exerciseId),
    ).toEqual(['dumbbell-romanian-deadlift']);
  });

  it('stands in for nothing after a sore lower back is told: today’s plan stays, untouched', async () => {
    const { store } = await lifterWithCopy();
    expect((await store.recalibrate({ type: 'readiness', readiness }))?.ok).toBe(true);
    const before = store.getSnapshot().session!;
    expect(allEntries(before.workout.blocks).length).toBeGreaterThan(0);
    expect(store.loadSavedWorkout('saved-hamstrings')).toBe('empty');
    expect(store.getSnapshot().session).toBe(before);
  });
});
