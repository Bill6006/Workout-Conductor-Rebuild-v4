import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { LIFE_MIRROR_LINK_ID } from '../../core/validation/lifeMirrorLink';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));

/**
 * Item 48 in Settings: the Life Mirror switch, off until the lifter turns it on, and kept as turned.
 * Synthetic data only.
 */
describe('the Life Mirror switch in Settings', () => {
  it('is off until turned on, and kept as turned', async () => {
    const { store } = createTestStore({ now: () => TEST_NOW, minOverlayMs: 0 });
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    act(() => {
      window.location.hash = '#/settings';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    const toggle = await screen.findByRole('switch', { name: /Use Life Mirror’s check-in/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.setup().click(toggle);
    await waitFor(() => expect(store.getSnapshot().lifeMirrorLink.on).toBe(true));
    const db = await store.getDatabase();
    expect(await db.get('meta', LIFE_MIRROR_LINK_ID)).toMatchObject({ on: true });
  });
});
