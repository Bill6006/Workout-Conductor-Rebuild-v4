import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../../engine/workout/types';
import { Providers, createTestStore } from '../../test/testStore';

const clock = vi.hoisted(() => ({ now: '2026-09-02T23:30:00.000Z' }));

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse(clock.now),
  useMomentReached: () => false,
}));

/**
 * The third adversarial review of Maintenance 33: a workout that runs past midnight gets one window
 * on the completion screen and another on the Plan screen a minute later.
 *
 * Steps (the device's clock on UTC): Wednesday at 23:30 the lifter checks in with sleep "Poor" (a
 * short night), starts, and trains the bench press (every working set 5 reps at 185 lb, 2 in
 * reserve). They finish at 0:20 on Thursday; the completion screen gives the session's recovery
 * line. A minute later they open Plan, the finished workout still the session.
 *
 * The rule: the report: "The windows are read where recovery is said: the Plan screen's balance
 * ..., the completion screen (each muscle's own window from that session) ... each with the same
 * day's context"; the first review's fix: "every reader of today's windows reads the same day's
 * context"; the second review's: "One day context (`dayRecovery`) for every reader of the windows,
 * the completion with its session's check-in, and a check-in is the day's its session was made on."
 *
 * What happens: the two readers apply the second review's day rule differently. `buildCompletion`
 * passes `dayRecovery` the session's check-in with no `madeAt`, so it is read as today's at 0:20 and
 * the short night adds 12 h: "Chest and Triceps about 48 h". The Plan screen passes the session's
 * `createdAt` (Wednesday) as `madeAt`, so a minute later the same check-in is none of Thursday's:
 * "Chest (36 h left)" for the same work. The coach's "too soon" card and the hard start read it
 * with no `madeAt` too, so during the workout itself the Plan screen disagrees with them from
 * midnight on. Before the second review's fixes (80893d4) the two disagreed the other way round
 * (the completion read no check-in at all).
 *
 * Synthetic data only.
 */

describe('the recovery line of a workout that runs past midnight', () => {
  it('gives the completion and the Plan screen the same window', async () => {
    const { store } = createTestStore({ now: () => clock.now });
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

    // Thursday, 0:20: finished.
    clock.now = '2026-09-03T00:20:00.000Z';
    const completion = await store.finishWorkout(
      { effort: 'right', pain: false, energyAfter: 4, note: '' },
      { endedEarly: true },
    );
    const said = /Chest and Triceps about (\d+) h/.exec(completion.recoveryNote)?.[1];
    expect(said).toBeDefined();

    // A minute later, the Plan screen.
    clock.now = '2026-09-03T00:21:00.000Z';
    act(() => {
      window.location.hash = '#/plan';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    const balance = await screen.findByTestId('recovery-balance');
    // A minute after the completion, the chest's window has its hours less one minute left (the
    // screen writes them with non-breaking spaces).
    expect(balance.textContent).toContain(`Chest (${said}\u00a0h\u00a0left)`);
  });
});
