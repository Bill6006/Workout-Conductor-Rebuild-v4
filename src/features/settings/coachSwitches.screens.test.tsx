import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { COACH_SWITCHES_ID } from '../../core/validation/coachSwitches';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { CoachSwitchesRows } from './CoachSwitchesRows';

/**
 * Maintenance 34, Settings: the Coaching group's three kinds of advice, each on until turned off,
 * and kept as turned. Synthetic data only.
 */

async function seeded() {
  const handle = createTestStore({ now: () => TEST_NOW });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  render(
    <Providers store={handle.store}>
      <CoachSwitchesRows />
    </Providers>,
  );
  return handle;
}

describe('the Coaching switches', () => {
  it('are each on until turned off', async () => {
    await seeded();
    for (const name of ['"Too soon" warnings', '"Longer would help"', 'Goals and time']) {
      expect(screen.getByRole('switch', { name: new RegExp(name) })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    }
  });

  it('turn one kind off, kept, the others on', async () => {
    const handle = await seeded();
    await userEvent.setup().click(screen.getByRole('switch', { name: /"Longer would help"/ }));
    await waitFor(() => expect(handle.store.getSnapshot().coachSwitches.longer).toBe(false));
    expect(screen.getByRole('switch', { name: /"Longer would help"/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('switch', { name: /Goals and time/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const db = await handle.store.getDatabase();
    expect(await db.get('meta', COACH_SWITCHES_ID)).toMatchObject({
      longer: false,
      tooSoon: true,
      goalsTime: true,
    });
  });
});
