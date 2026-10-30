import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { learnedWindows, recoveryWindows } from '../../engine/recovery/recovery';
import { Providers, TEST_NOW, createTestStore } from '../../test/testStore';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));
vi.mock('../../core/time/clock', async (original) => ({
  ...(await original<typeof import('../../core/time/clock')>()),
  useNow: () => Date.parse(PLAN_NOW),
  useMomentReached: () => false,
}));

/**
 * The first adversarial review of Maintenance 33: the Plan screen's recovery balance ignores the
 * lifter's reset of the learned recovery windows.
 *
 * Steps: a synthetic log of bench press sessions a rep short of failure (a 36 h window for the
 * chest and the triceps) whose sessions back early held as well as the rested ones, so the chest's
 * window is learned half a day shorter (24 h); the last session 20 h before now. The lifter taps
 * "Forget your recovery windows" on the learned page (`resetLearned('recovery')`), then opens Plan.
 *
 * The rule: the learned page's reset reads "Forget your recovery windows", and the windows "read
 * only what was logged after it of what sessions teach" (`RecoveryContext.resets`); the report says
 * "The learned page shows each muscle its sessions moved, with a reset", and the Plan screen's
 * balance is one of the readers that must agree ("The windows are read where recovery is said: the
 * Plan screen's balance ..., the 'too soon' card ..."). The coach, the completion and the schedule
 * card all pass the resets.
 *
 * What happens: `PlanScreen` calls `recoveryBalance(state.readHistory, nowIso, { readiness,
 * lowEnergy })` with no `resets`, so `recoveryWindows` learns from the whole log. After the reset
 * the Plan screen still says "Chest (4 h left)" (the forgotten 24 h window), while the coach's own
 * windows (with the reset) say 16 h left of 36 h.
 *
 * Synthetic data only.
 */

const PLAN_NOW = '2026-09-02T12:01:00.000Z';
const HOUR = 3_600_000;

/** A bench press session `hoursAgo` before the Plan screen's clock: three sets of 5 at 1 in reserve. */
function bench(hoursAgo: number, weight: number): WorkoutRecord {
  const when = new Date(Date.parse(PLAN_NOW) - hoursAgo * HOUR).toISOString();
  return {
    id: `bench-${hoursAgo}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: 'push-arms',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId: 'barbell-bench-press',
        plannedSets: 3,
        sets: [0, 1, 2].map((setIndex) => ({
          kind: 'working' as const,
          reps: 5,
          weight,
          rir: 1,
          completed: true,
          setIndex,
          targetReps: [4, 6] as [number, number],
          targetRir: 1,
        })),
      },
    ],
  };
}

/**
 * Four rested sessions 72 h apart, then five rounds of a rested session and one a day after it,
 * every first set at 200 lb: the sessions back early hold as well as rested ones, so the chest
 * learns half a day shorter. The last (early) session ends 20 h before the Plan screen's clock.
 */
function learnedShorter(): WorkoutRecord[] {
  const plan: number[] = [];
  let t = 0;
  for (let i = 0; i < 4; i += 1) {
    plan.push(t);
    t += 72;
  }
  for (let i = 0; i < 5; i += 1) {
    plan.push(t, t + 24);
    t += 24 + 72;
  }
  const last = t - 72;
  return plan.map((at) => bench(last - at + 20, 200));
}

describe('the Plan screen after "Forget your recovery windows"', () => {
  it('reads the windows as the coach does, without what was forgotten', async () => {
    const history = learnedShorter();
    // As built: the chest learned 12 h shorter from the whole log, and nothing after a reset.
    expect(learnedWindows(history).get('chest')?.shift).toBe(-12);
    expect(recoveryWindows(history, { resets: { recovery: TEST_NOW } }).get('chest')?.hours).toBe(
      36,
    );

    const { store } = createTestStore();
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await store.getDatabase();
    for (const record of history) await db.put('workouts', record);
    await store.hydrate();
    await store.resetLearned('recovery');
    const state = store.getSnapshot();
    expect(state.learnedResets.recovery).toBe(TEST_NOW);
    // The coach's windows (`tooSoonSignals` passes the resets): 36 h, 16 h of them left.
    const coach = recoveryWindows(state.readHistory, {
      now: PLAN_NOW,
      resets: state.learnedResets,
    }).get('chest')!;
    expect(coach.hours).toBe(36);

    act(() => {
      window.location.hash = '#/plan';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    const balance = await screen.findByTestId('recovery-balance');
    expect(balance.textContent).toContain('Chest (16 h left)');
    expect(balance.textContent).not.toContain('Chest (4 h left)');
  });
});
