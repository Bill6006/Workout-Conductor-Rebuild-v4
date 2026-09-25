import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as conductor from '../../engine/coach/coachConductor';
import { allEntries } from '../../engine/workout/types';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { TEST_NOW, Providers, createTestStore } from '../../test/testStore';
import { useCoach } from './useCoach';

/** Maintenance 22: the coach hears about the swaps kept for weeks, so it never offers one back. */

vi.mock('../../engine/coach/coachConductor', async (original) => {
  const actual = await original<typeof conductor>();
  return { ...actual, conductCoach: vi.fn(actual.conductCoach) };
});

describe('the coach and the kept swaps', () => {
  it('passes the swaps still running to the coach', async () => {
    const handle = createTestStore();
    const { store } = handle;
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await store.setCurrentLocation('gym');
    const bench = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    await store.swapExercise(bench.id, 'dumbbell-bench-press', true);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Providers store={store}>{children}</Providers>
    );
    renderHook(() => useCoach(), { wrapper });
    const conduct = vi.mocked(conductor.conductCoach);
    await waitFor(() => expect(conduct).toHaveBeenCalled());
    expect(conduct.mock.calls.at(-1)?.[0].swaps).toEqual([
      expect.objectContaining({ from: 'barbell-bench-press', to: 'dumbbell-bench-press' }),
    ]);
  });
});

/** Maintenance 24: a load the coach offers is one the place makes today, missing plates and all. */
describe('the coach and the weights today', () => {
  it('passes the plates missing today to the coach', async () => {
    const handle = createTestStore();
    const { store } = handle;
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    await store.setCurrentLocation('gym');
    await store.setMissingPlates([2.5]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Providers store={store}>{children}</Providers>
    );
    renderHook(() => useCoach(), { wrapper });
    const conduct = vi.mocked(conductor.conductCoach);
    await waitFor(() => expect(conduct).toHaveBeenCalled());
    expect(conduct.mock.calls.at(-1)?.[0].loading).toEqual({ missingPlates: [2.5] });
  });
});
