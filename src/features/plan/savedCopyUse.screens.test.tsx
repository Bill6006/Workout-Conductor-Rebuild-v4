import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { localDayKey } from '../../core/time/localDate';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));

/**
 * The review of the catch-up decision (2026-10-31), on the Plan screen: a saved copy with no
 * exercise has no Use, and one the day's check-in leaves with nothing says so and leaves today's
 * plan in place, where it said "Loaded" before. At home with dumbbells only, the hamstring copy has
 * the dumbbell Romanian deadlift alone, and a sore lower back is told. Synthetic data only.
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

async function lifter(): Promise<AppStore> {
  const { store } = createTestStore({ now: () => TEST_NOW, minOverlayMs: 0 });
  await store.hydrate();
  await store.completeOnboarding(profile, [home]);
  const workout = generateWorkout({
    profile,
    location: home,
    history: [],
    now: TEST_NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  const db = await store.getDatabase();
  const base = {
    createdAt: TEST_NOW,
    locationId: 'home',
    duration: 'default' as const,
    planDay: localDayKey(TEST_NOW),
  };
  await db.put('savedWorkouts', {
    ...base,
    id: 'saved-hamstrings',
    name: 'Hamstrings',
    workout,
    catchUp: spec,
  });
  await db.put('savedWorkouts', {
    ...base,
    id: 'saved-empty',
    name: 'Nothing left',
    workout: { ...workout, blocks: [] },
  });
  await store.hydrate();
  expect(
    (
      await store.recalibrate({
        type: 'readiness',
        readiness: {
          energy: 3,
          soreness: 2,
          sleep: 3,
          motivation: 3,
          jointDiscomfort: ['lower-back'],
          timePressure: false,
        },
      })
    )?.ok,
  ).toBe(true);
  return store;
}

const row = (name: string) =>
  screen
    .getAllByTestId('saved-workout-row')
    .find((candidate) => within(candidate).queryByText(name) !== null)!;

describe('a saved copy with nothing to start today, on the Plan screen', () => {
  it('has no Use with no exercise in it, and says today’s plan stays where the check-in empties it', async () => {
    const store = await lifter();
    const before = store.getSnapshot().session;
    act(() => {
      window.location.hash = '#/plan';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    await waitFor(() => expect(screen.getAllByTestId('saved-workout-row')).toHaveLength(2));
    expect(within(row('Nothing left')).queryByTestId('use-saved-workout')).not.toBeInTheDocument();
    await userEvent.setup().click(within(row('Hamstrings')).getByTestId('use-saved-workout'));
    expect(
      await screen.findByText(`Nothing in "Hamstrings" is left for today: today's plan stays.`),
    ).toBeInTheDocument();
    expect(screen.queryByText('Loaded "Hamstrings"')).not.toBeInTheDocument();
    expect(store.getSnapshot().session).toBe(before);
  });
});
