import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';
import { useCoach } from './useCoach';

/**
 * Maintenance 25, the owner's item 38: the coach's longer rest stands only while the rest runs.
 * The minute clock would see the rest end up to a minute late; the coach hears it at its end time.
 */

// The minute clock stays a minute into the store's day: only the rest's own end moves the coach.
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse('2026-09-02T12:01:00.000Z'),
}));

afterEach(() => {
  vi.useRealTimers();
});

describe('the coach and a running rest', () => {
  it('offers the longer rest while it runs, and not a moment after it ends', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    store.startWorkout();
    const bench = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    store.skipWarmup(bench.id);
    const working = bench.sets.filter((set) => set.kind === 'working');
    await store.logSet(bench.id, working[0]!.index, {
      weight: working[0]!.targetWeight,
      reps: 8,
      rir: 1,
    });
    await store.logSet(bench.id, working[1]!.index, {
      weight: working[1]!.targetWeight,
      reps: 5,
      rir: 0,
    });
    const endsAt = Date.parse(store.getSnapshot().session!.rest!.endsAt);

    vi.useFakeTimers({ now: endsAt - 30_000 });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Providers store={store}>{children}</Providers>
    );
    const { result } = renderHook(() => useCoach(), { wrapper });
    expect(result.current?.card?.signal.headline).toBe(
      'Rest 30 s longer before the next Barbell Bench Press set',
    );
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(result.current?.card?.signal.domain).not.toBe('rest');
  });
});
