import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { AppStore } from '../../core/state/appStore';
import type { Identified } from '../../core/storage/indexedDb';
import { COACH_SWITCHES_ID } from '../../core/validation/coachSwitches';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { SCHEDULE_MOVE_ID } from '../../core/validation/scheduleMove';
import {
  DOWN,
  MOVE,
  MOVED,
  MWF,
  USUAL,
  WATCH_NOW,
  weeksAfter,
  weeksBefore,
} from '../../test/scheduleWatch';
import { Providers, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  // A minute after the store's clock: Monday 5 October, four weeks after the change.
  useNow: () => Date.parse(WATCH_NOW) + 60_000,
  useMomentReached: () => false,
}));

/**
 * Maintenance 36, the schedule watch's card on Today: the lifter moved from three days a week to
 * five on Monday 7 September, and both lifts fell about 7% after it, still down after each weekend.
 * One card names them, and Go back to it puts the schedule before it back. Synthetic data only.
 */

const HEADLINE = 'Barbell Bench Press and Back Squat down since the schedule changed';

async function lifter(meta: (Identified & Record<string, unknown>)[] = []): Promise<AppStore> {
  const { store } = createTestStore({ now: () => WATCH_NOW, minOverlayMs: 0 });
  await store.hydrate();
  const base = { ...createDefaultProfile(WATCH_NOW), bodyweight: 185 };
  await store.completeOnboarding(
    { ...base, schedule: { ...base.schedule, ...MOVED } },
    createDefaultLocations({ gymAccess: true }, WATCH_NOW),
  );
  const db = await store.getDatabase();
  for (const one of [...weeksBefore(USUAL), ...weeksAfter(DOWN)]) await db.put('workouts', one);
  await db.put('meta', MOVE);
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

describe('the schedule watch’s card on Today', () => {
  it('names the lifts down since the change, and Go back to it puts the schedule before back', async () => {
    const store = await lifter();
    await showToday(store);
    expect((await cardsUntil(HEADLINE)).at(-1)).toBe(HEADLINE);
    const action = screen.getByTestId('coach-action');
    expect(action).toHaveTextContent('Go back to it');
    await userEvent.setup().click(action);
    await waitFor(() =>
      expect(store.getSnapshot().profile!.schedule).toMatchObject({
        weeklyFrequency: 3,
        availableDays: MWF,
      }),
    );
    // The way back is a change the watch leaves alone: the card does not come back. Its record is
    // written after the profile, so it is waited for.
    await waitFor(() => expect(store.getSnapshot().scheduleMove).toMatchObject({ watched: false }));
    const db = await store.getDatabase();
    expect(await db.get('meta', SCHEDULE_MOVE_ID)).toMatchObject({ watched: false });
    await waitFor(() => expect(screen.queryByText(HEADLINE)).toBeNull());
  });

  it('is never shown once Settings turns it off', async () => {
    await showToday(
      await lifter([
        {
          id: COACH_SWITCHES_ID,
          tooSoon: true,
          longer: true,
          goalsTime: true,
          scheduleWatch: false,
        },
      ]),
    );
    expect(await cardsUntil(HEADLINE)).not.toContain(HEADLINE);
  });
});
