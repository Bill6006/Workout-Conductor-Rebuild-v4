import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { COACH_DECLINES_ID } from '../../engine/coach/coachConductor';
import { LEARNED_RESETS_ID } from '../../engine/learned/resets';
import { LearnedValues } from '../../features/settings/LearnedValues';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

/**
 * Maintenance 27, the owner's item 47, through the store and on screen: a reset is saved and read
 * back, clears nothing logged, and asks once more before it happens.
 */

async function ready() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

describe('resetting what the app learned', () => {
  it('saves the reset and reads it back after a restart', async () => {
    const { store, factory, storage } = await ready();
    await store.resetLearned('habit');
    expect(store.getSnapshot().learnedResets).toEqual({ id: LEARNED_RESETS_ID, habit: TEST_NOW });
    const again = createTestStore({ factory, storage }).store;
    await again.hydrate();
    expect(again.getSnapshot().learnedResets.habit).toBe(TEST_NOW);
  });

  it('keeps a reset and a decline made while a reload was reading', async () => {
    const { store } = await ready();
    const reloading = store.hydrate();
    await store.resetLearned('habit');
    await store.declineCoachSignal({ source: 'extra set', exerciseId: 'barbell-bench-press' });
    await reloading;
    expect(store.getSnapshot().learnedResets.habit).toBe(TEST_NOW);
    expect(Object.keys(store.getSnapshot().coachDeclines.declines)).toHaveLength(1);
  });

  it('keeps a reset or a decline made while a reload held an older read', async () => {
    const { store } = await ready();
    const db = await store.getDatabase();
    const read = db.get.bind(db);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The reload reads both records first, and hands them back only after the changes are saved;
    // every later read (a save's own read-back) goes straight through.
    const heldOnce = new Set<string>();
    vi.spyOn(db, 'get').mockImplementation(async (name: string, key: string) => {
      const value = await read(name as never, key);
      if ((key === COACH_DECLINES_ID || key === LEARNED_RESETS_ID) && !heldOnce.has(key)) {
        heldOnce.add(key);
        await held;
      }
      return value as never;
    });
    const reloading = store.hydrate();
    await vi.waitFor(() => expect(heldOnce.size).toBe(2));
    await store.declineCoachSignal({ source: 'extra set', exerciseId: 'barbell-bench-press' });
    await store.resetLearned('habit');
    release();
    await reloading;
    expect(Object.keys(store.getSnapshot().coachDeclines.declines)).toHaveLength(1);
    expect(store.getSnapshot().learnedResets.habit).toBe(TEST_NOW);
  });

  it('keeps a reset a sync brought, and a field this copy does not know', async () => {
    const { store } = await ready();
    const db = await store.getDatabase();
    // A newer copy's record arrived by sync: a pain reset and a kind this copy does not know.
    await db.put('meta', { id: LEARNED_RESETS_ID, pain: TEST_NOW, pace: TEST_NOW });
    await store.resetLearned('habit');
    const expected = { id: LEARNED_RESETS_ID, pain: TEST_NOW, pace: TEST_NOW, habit: TEST_NOW };
    expect(store.getSnapshot().learnedResets).toEqual(expected);
    expect(await db.get('meta', LEARNED_RESETS_ID)).toMatchObject(expected);
  });

  it('forgets declined offers', async () => {
    const { store } = await ready();
    await store.declineCoachSignal({ source: 'extra set', exerciseId: 'barbell-bench-press' });
    expect(Object.keys(store.getSnapshot().coachDeclines.declines)).toHaveLength(1);
    await store.clearDeclines();
    expect(store.getSnapshot().coachDeclines.declines).toEqual({});
  });

  it('asks once more on the page, and then resets', async () => {
    const { store } = await ready();
    render(
      <Providers store={store}>
        <LearnedValues />
      </Providers>,
    );
    const habit = screen.getByTestId('learned-habit');
    const user = userEvent.setup();
    await user.click(within(habit).getByTestId('learned-reset-habit'));
    expect(store.getSnapshot().learnedResets.habit).toBeUndefined();
    await user.click(within(habit).getByTestId('learned-confirm-habit'));
    await waitFor(() => expect(store.getSnapshot().learnedResets.habit).toBe(TEST_NOW));
    expect(
      within(screen.getByTestId('learned-habit')).getByText(/^Last reset /),
    ).toBeInTheDocument();
    // The pace has its own reset since Maintenance 28 (item 4).
    expect(
      within(screen.getByTestId('learned-pace')).getByTestId('learned-reset-pace'),
    ).toHaveTextContent('Forget your pace');
  });
});
