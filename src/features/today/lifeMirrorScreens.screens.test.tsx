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
  // A minute after 09:00 on TEST_NOW's day here: Life Mirror is read from 04:00 (the review of
  // item 48: TEST_NOW is before it in a zone far ahead of UTC).
  useNow: () => {
    const nine = new Date(TEST_NOW);
    nine.setHours(9, 1, 0, 0);
    return nine.getTime();
  },
  useMomentReached: () => false,
}));

/**
 * Item 48 on both screens that open the check-in: Today's own button, and the coach's "Quick
 * check-in" in a workout under way. With the switch on, a test token and a fake cloud holding
 * today's Life Mirror morning check-in, the sheet fills in what it gave. Synthetic data only.
 */

/** 09:00 on TEST_NOW's day in this device's zone. */
const NINE = (() => {
  const nine = new Date(TEST_NOW);
  nine.setHours(9, 0, 0, 0);
  return nine.toISOString();
})();

async function lifter(fatigued = false): Promise<AppStore> {
  const cloud = createFakeCloud();
  const { store } = createTestStore({
    now: () => NINE,
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
      const when = new Date(Date.parse(NINE) - days * 86_400_000).toISOString();
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
  const day = localDayKey(NINE);
  cloud.seed({
    app: LIFE_MIRROR_APP,
    store: LIFE_MIRROR_STORE,
    id: 'lm-1',
    day,
    body: JSON.stringify({
      day,
      block: 'morning',
      completedAt: NINE,
      updatedAt: NINE,
      answers: { energy: 4, stress: 4, mood: 3, sleepHours: 2, sleepQuality: 4, motivation: 3 },
    }),
    updated_at: NINE,
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
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('readiness-open'));
    expect(await screen.findByTestId('from-life-mirror-energy')).toBeInTheDocument();
    expect(screen.getByTestId('from-life-mirror-sleep')).toBeInTheDocument();
    // Its stress and mood too, with the switch on, and named once told (the review of item 48).
    expect(screen.getByTestId('from-life-mirror-stress')).toBeInTheDocument();
    expect(screen.getByTestId('from-life-mirror-mood')).toBeInTheDocument();
    await user.click(screen.getByTestId('readiness-apply'));
    await waitFor(() =>
      expect(screen.getByTestId('readiness-summary')).toHaveTextContent(
        'motivation 3/5 · stress 4/5 · mood 3/5.',
      ),
    );
  });

  it('reads nothing as Today’s check-in opens with one told today', async () => {
    const store = await lifter();
    await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 3,
        soreness: 2,
        sleep: 3,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
      },
    });
    const read = vi.spyOn(store, 'lifeMirrorPrefill');
    show(store, '#/today');
    await userEvent.setup().click(await screen.findByTestId('readiness-open'));
    expect(await screen.findByRole('radiogroup', { name: 'Energy' })).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
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
    expect(screen.getByTestId('from-life-mirror-stress')).toBeInTheDocument();
  });
});
