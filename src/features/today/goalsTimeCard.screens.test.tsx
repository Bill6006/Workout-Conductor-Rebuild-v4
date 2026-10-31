import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import type { Identified } from '../../core/storage/indexedDb';
import { COACH_SWITCHES_ID } from '../../core/validation/coachSwitches';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { TIME_OFFERS_ID } from '../../core/validation/timeOffers';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record } from '../../test/records';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
  useMomentReached: () => false,
}));

/**
 * Maintenance 34, the honest goals-versus-time card on Today: the default lifter (bigger arms
 * second) trained two squat days of 30 minutes a week, of a 60-minute Default, for the three weeks
 * before Wednesday, September 2, 2026: no set for the biceps or the triceps. Synthetic data only.
 */

const HEADLINE = 'Biceps and triceps under 4 sets a week for 3 weeks';
const DAY = 86_400_000;

function shortDay(daysAgo: number): WorkoutRecord {
  const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
  return {
    ...record(0, 'back-squat', [
      [5, 225, 2],
      [5, 225, 2],
      [5, 225, 2],
    ]),
    id: `w-short-${daysAgo}`,
    startedAt: when,
    completedAt: when,
    plannedMinutes: 30,
  };
}

async function lifter(meta: (Identified & Record<string, unknown>)[] = []): Promise<AppStore> {
  const { store } = createTestStore({ now: () => TEST_NOW, minOverlayMs: 0 });
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await store.getDatabase();
  // Tuesdays and Thursdays from August 11 to 27.
  for (const days of [22, 20, 15, 13, 8, 6]) await db.put('workouts', shortDay(days));
  for (const one of meta) await db.put('meta', one);
  await store.hydrate();
  return store;
}

async function showToday(store: AppStore): Promise<void> {
  act(() => {
    window.location.hash = '#/today';
  });
  render(
    <Providers store={store}>
      <App />
    </Providers>,
  );
  await screen.findAllByTestId('workout-entry');
}

/** Every coach card Today shows, in turn, each put away with Not now; stops at `until`. */
async function cardsUntil(until: string): Promise<string[]> {
  const user = userEvent.setup();
  const seen: string[] = [];
  const headline = () => screen.queryByTestId('coach-headline')?.textContent ?? null;
  for (let tries = 0; tries < 10; tries += 1) {
    const now = headline();
    if (now === null) break;
    seen.push(now);
    const dismiss = screen.queryByTestId('coach-dismiss');
    if (now === until || dismiss === null) break;
    await user.click(dismiss);
    await waitFor(() => expect(headline()).not.toBe(now));
  }
  return seen;
}

describe('the honest goals-versus-time card on Today', () => {
  it('says the goals’ muscles stayed short, and Adjust time opens the schedule', async () => {
    await showToday(await lifter());
    expect((await cardsUntil(HEADLINE)).at(-1)).toBe(HEADLINE);
    const action = screen.getByTestId('coach-action');
    expect(action).toHaveTextContent('Adjust time');
    await userEvent.setup().click(action);
    await waitFor(() => expect(window.location.hash).toBe('#/settings/schedule'));
  });

  it('stays away once put away with the same reading', async () => {
    await showToday(
      await lifter([
        {
          id: TIME_OFFERS_ID,
          shown: [],
          answers: [],
          pending: null,
          goalsTime: { at: TEST_NOW, muscles: ['biceps', 'triceps'], minutes: 30 },
        },
      ]),
    );
    expect(await cardsUntil(HEADLINE)).not.toContain(HEADLINE);
  });

  it('is never shown once Settings turns it off', async () => {
    await showToday(
      await lifter([{ id: COACH_SWITCHES_ID, tooSoon: true, longer: true, goalsTime: false }]),
    );
    expect(await cardsUntil(HEADLINE)).not.toContain(HEADLINE);
  });
});
