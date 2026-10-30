import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { Providers, createTestStore } from '../../test/testStore';

const clock = vi.hoisted(() => ({ now: '2026-09-02T18:00:00.000Z' }));

vi.mock('../../features/library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse(clock.now),
  useMomentReached: () => false,
}));

/**
 * The second adversarial review of Maintenance 33: the Plan screen reads yesterday's check-in as
 * today's while yesterday's finished workout is still the session.
 *
 * Steps: Wednesday evening the lifter checks in with sleep "Poor" (a short night), trains the bench
 * press (every working set 5 at 185 lb, 2 in reserve) and finishes; they close the app on the
 * completion screen without tapping Done. Thursday at 9:00 (15 h later), with no check-in today, they
 * open Plan. Then they tap Done on Wednesday's completion (nothing logged changes) and look again.
 *
 * The rule: the whole-body layer is today's ("a short night on today's check-in ... lengthens every
 * window by 12 h", the report; `RecoveryContext.readiness`: "Today's check-in"); the first review's
 * fix: "every reader of today's windows reads the same day's context" (`dayRecovery`: "today's
 * check-in ..., the time, and what the lifter reset").
 *
 * What happens: the store keeps a finished session until Done, across days, and `PlanScreen` passes
 * `state.session?.constraints.readiness` as today's check-in, so on Thursday the chest's window is
 * still lengthened by Wednesday's short night: "Chest (33 h left)". After Done, with the same log at
 * the same minute, the same screen says "Chest (21 h left)", as the coach's windows for Thursday's
 * session read it.
 *
 * Synthetic data only.
 */

describe('the Plan screen the day after a finished workout', () => {
  it('reads no check-in from an earlier day as today’s', async () => {
    const handle = createTestStore({ now: () => clock.now });
    const { store } = handle;
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(clock.now), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, clock.now),
    );
    await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 3,
        soreness: 2,
        sleep: 1,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
      },
    });
    store.startWorkout();
    const entry = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    expect(entry.exerciseId).toBe('barbell-bench-press');
    for (const set of entry.sets) {
      if (set.kind === 'working') {
        await store.logSet(entry.id, set.index, { reps: 5, weight: 185, rir: 2 });
      }
    }
    await store.finishWorkout(
      { effort: 'right', pain: false, energyAfter: 4, note: '' },
      { endedEarly: true },
    );

    // Thursday morning: the app opened again, Wednesday's completion still the session.
    clock.now = '2026-09-03T09:00:00.000Z';
    const again = createTestStore({
      factory: handle.factory,
      storage: handle.storage,
      now: () => clock.now,
    });
    await again.store.hydrate();
    expect(again.store.getSnapshot().session?.status).toBe('completed');

    act(() => {
      window.location.hash = '#/plan';
    });
    render(
      <Providers store={again.store}>
        <App />
      </Providers>,
    );
    const balance = await screen.findByTestId('recovery-balance');
    // No check-in today: 36 h for sets two short of failure, 15 h of them gone.
    expect(balance.textContent).toContain('Chest (21 h left)');
  });
});
