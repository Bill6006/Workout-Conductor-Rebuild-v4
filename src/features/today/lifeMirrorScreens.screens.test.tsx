import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import { LIFE_MIRROR_APP, LIFE_MIRROR_STORE } from '../../core/cloud/lifeMirror';
import { localDayKey } from '../../core/time/localDate';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { record } from '../../test/records';
import { createFakeCloud } from '../../test/fakeCloud';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse(TEST_NOW) + 60_000,
  useMomentReached: () => false,
}));

/**
 * Item 48 on both screens that open the check-in: Today's own button, and the coach's "Quick
 * check-in" in a workout under way. With the switch on, a test token and a fake cloud holding
 * today's Life Mirror morning check-in, the sheet fills in what it gave. Synthetic data only.
 */

async function lifter(fatigued = false): Promise<AppStore> {
  const cloud = createFakeCloud();
  const { store } = createTestStore({
    now: () => TEST_NOW,
    minOverlayMs: 0,
    cloudClient: async () => cloud.client,
    isOnline: () => true,
  });
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  if (fatigued) {
    // Two recent sessions a little nearer failure than planned, one rated too hard: fatigue builds.
    const db = await store.getDatabase();
    for (const days of [2, 1]) {
      const when = new Date(Date.parse(TEST_NOW) - days * 86_400_000).toISOString();
      await db.put('workouts', {
        ...record(
          0,
          'back-squat',
          [
            [5, 225, 1],
            [5, 225, 1],
            [5, 225, 1],
          ],
          [4, 6],
          2,
          days === 1
            ? { rating: { effort: 'too-hard', pain: false, energyAfter: 3, note: '' } }
            : {},
        ),
        id: `w-${days}`,
        startedAt: when,
        completedAt: when,
      });
    }
    await store.hydrate();
  }
  const day = localDayKey(TEST_NOW);
  cloud.seed({
    app: LIFE_MIRROR_APP,
    store: LIFE_MIRROR_STORE,
    id: 'lm-1',
    day,
    body: JSON.stringify({
      day,
      block: 'morning',
      completedAt: TEST_NOW,
      updatedAt: TEST_NOW,
      answers: { energy: 4, sleepHours: 2, sleepQuality: 4, motivation: 3 },
    }),
    updated_at: TEST_NOW,
  });
  await store.setCloudToken('test-token');
  await store.setLifeMirrorLink(true);
  return store;
}

function show(store: AppStore, hash: string): void {
  act(() => {
    window.location.hash = hash;
  });
  render(
    <Providers store={store}>
      <App />
    </Providers>,
  );
}

describe('Life Mirror’s check-in on screen', () => {
  it('fills in Today’s check-in', async () => {
    const store = await lifter();
    show(store, '#/today');
    await userEvent.setup().click(await screen.findByTestId('readiness-open'));
    expect(await screen.findByTestId('from-life-mirror-energy')).toBeInTheDocument();
    expect(screen.getByTestId('from-life-mirror-sleep')).toBeInTheDocument();
  });

  it('fills in the check-in the coach offers in a workout under way', async () => {
    const store = await lifter(true);
    store.startWorkout();
    show(store, '#/workout');
    const user = userEvent.setup();
    // Every card in turn until the coach's check-in.
    for (let tries = 0; tries < 10; tries += 1) {
      const action = await screen.findByTestId('coach-action').catch(() => null);
      if (action?.textContent === 'Quick check-in') {
        await user.click(action);
        break;
      }
      const dismiss = screen.queryByTestId('coach-dismiss');
      if (!dismiss) break;
      const before = screen.queryByTestId('coach-headline')?.textContent;
      await user.click(dismiss);
      await waitFor(() =>
        expect(screen.queryByTestId('coach-headline')?.textContent).not.toBe(before),
      );
    }
    expect(await screen.findByTestId('from-life-mirror-energy')).toBeInTheDocument();
  });
});
