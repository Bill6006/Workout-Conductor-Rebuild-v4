import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../../features/library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse(PLAN_NOW),
  useMomentReached: () => false,
}));

/**
 * The second adversarial review of Maintenance 33: after a short night the completion screen and the
 * Plan screen give the same session's muscles different windows.
 *
 * Steps: the lifter checks in with sleep "Poor" (a short night), trains the bench press (every
 * working set 5 reps at 185 lb, 2 in reserve) and finishes. The completion screen gives the
 * session's recovery line; a minute later they open Plan.
 *
 * The rule: the windows' whole-body layer, "a short night on today's check-in ... lengthens every
 * window by 12 h" (the report; recovery.ts `wholeBodyLayer`); the report: "The windows are read where
 * recovery is said: the Plan screen's balance ..., the completion screen (each muscle's own window
 * from that session), ... each with the same day's context (today's check-in and what the lifter
 * reset)"; the first review's fix: "every reader of today's windows reads the same day's context".
 *
 * What happens: `buildCompletion` reads `recoveryWindows(after, { now, resets })` without the
 * session's check-in, so the completion says "Chest and Triceps about 36 h", while the Plan screen
 * (which passes `dayRecovery` with the session's check-in) says "Chest (48 h left)" for the same
 * work a minute later.
 *
 * Synthetic data only.
 */

const PLAN_NOW = new Date(Date.parse(TEST_NOW) + 60_000).toISOString();

describe('the recovery line after a short night', () => {
  it('gives the completion the window the Plan screen gives', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const checkIn = await store.recalibrate({
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
    expect(checkIn?.ok).toBe(true);
    store.startWorkout();
    const entry = allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
    expect(entry.exerciseId).toBe('barbell-bench-press');
    for (const set of entry.sets) {
      if (set.kind === 'working') {
        await store.logSet(entry.id, set.index, { reps: 5, weight: 185, rir: 2 });
      }
    }
    const completion = await store.finishWorkout(
      { effort: 'right', pain: false, energyAfter: 4, note: '' },
      { endedEarly: true },
    );

    act(() => {
      window.location.hash = '#/plan';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    const balance = await screen.findByTestId('recovery-balance');
    // The Plan screen: 36 h for sets two short of failure, 12 h more for the short night.
    expect(balance.textContent).toContain('Chest (48 h left)');
    // The completion, for the same work, must say the same.
    expect(completion.recoveryNote).toMatch(
      /^Recovery before loading them hard again: Chest and Triceps about 48 h\./,
    );
  });
});
