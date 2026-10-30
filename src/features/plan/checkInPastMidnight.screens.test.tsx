import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { record } from '../../test/records';
import { Providers, createTestStore } from '../../test/testStore';

const clock = vi.hoisted(() => ({ now: '2026-09-09T23:40:00.000Z' }));

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse(clock.now),
  useMomentReached: () => false,
}));

/**
 * The fourth review of Maintenance 33, on the Plan screen: a check-in told just after midnight, on
 * a workout made the evening before, is the day's it was told (`checkInDayOf`), so the recovery
 * balance reads its short night.
 *
 * Steps (the device's clock on UTC): four bench press sets a rep short of failure on Tuesday at
 * 18:10 (the chest's window 36 h, 48 h after a short night). Wednesday at 23:40 the plan is made; at
 * 23:58 it is started; at 00:05 on Thursday the lifter checks in with sleep "Short". At 00:10, 30 h
 * after the bench, Plan gives the chest 18 h left. Read against the evening the plan was made, the
 * short night is none of Thursday's: 6 h left. Synthetic data only.
 */

describe('the Plan screen past midnight', () => {
  it('reads a check-in told after midnight as the day’s it was told', async () => {
    const { store } = createTestStore({ now: () => clock.now });
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(clock.now), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, clock.now),
    );
    const db = await store.getDatabase();
    await db.put('workouts', {
      ...record(
        0,
        'barbell-bench-press',
        [
          [8, 100, 1],
          [8, 100, 1],
          [8, 100, 1],
          [8, 100, 1],
        ],
        [6, 10],
        1,
      ),
      id: 'w-bench-tuesday',
      startedAt: '2026-09-08T18:10:00.000Z',
      completedAt: '2026-09-08T18:10:00.000Z',
    });
    await store.hydrate();
    clock.now = '2026-09-09T23:58:00.000Z';
    store.startWorkout();
    clock.now = '2026-09-10T00:05:00.000Z';
    await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 3,
        soreness: 2,
        sleep: 2,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
      },
    });

    clock.now = '2026-09-10T00:10:00.000Z';
    act(() => {
      window.location.hash = '#/plan';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    const balance = await screen.findByTestId('recovery-balance');
    // The screen writes the hours with non-breaking spaces.
    expect(balance.textContent).toContain('Chest (18 h left)');
  });
});
