import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { Readiness } from '../../engine/recalibration/types';
import { allEntries, type GeneratedWorkout } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The fifth adversarial review of Maintenance 33: a saved workout loaded on a day checked in is
 * changed by the check-in under the words "Loaded", which say nothing of it.
 *
 * Steps: a hybrid lifter with drop sets on saves today's workout ("Save today's workout": "Mine").
 * They check in with a head cold and short on time: "Adjusted for today (every set 2 or more short of
 * failure for the head cold, fitted to 45 min for time pressure)". On the Plan screen they tap "Use"
 * on "Mine".
 *
 * The rule: the engine's words (Maintenance 24, kept in the check-in's own case): "The words say
 * what changed on the lifts still to come, as the lifter sees them"; the loaded copy's own line,
 * "Change the length or any exercise and it recalibrates as usual", says the copy is as saved until
 * the lifter changes it.
 *
 * What happens: the fourth pass lays the day's check-in on the copy (`withDayCheckIn`, through the
 * engine's check-in), and keeps the copy's summary, not the engine's: Today says only "Loaded
 * "Mine"." and "Saved 2026-09-02. Change the length or any exercise and it recalibrates as usual.",
 * with no change listed (its counts all 0), the toast "Loaded "Mine"", while the copy is fitted to
 * 45 minutes (a set off six of its seven lifts, the bench press run straight), every set held 2 or
 * more short of failure, its drop set gone. With a sore joint told, a lift of the copy that loads it
 * gives way to another under the same words. The same check-in told on the loaded copy says what it
 * changed.
 *
 * New with the fourth pass's carry (before it the copy kept no check-in, the fourth review's
 * finding). On the previous head (3d24e37) this test fails earlier: the copy is not changed.
 *
 * Synthetic data only.
 *
 * The fix (the fifth pass): a check-in carried onto a plan that says something of itself adds what
 * it changed ("Today's check-in kept: ..."), with its changes.
 */

const DAY = 86_400_000;
const LIFTS = ['barbell-bench-press', 'back-squat', 'barbell-row'];
const at = (daysAgo: number) => new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();

const checkIn: Readiness = {
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: true,
  illness: 'head',
};

const workingSets = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).flatMap((entry) => entry.sets.filter((set) => set.kind === 'working'));

describe('a saved workout loaded on a day checked in', () => {
  it('says what the check-in changed in it', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    const base = createDefaultProfile(TEST_NOW);
    await store.completeOnboarding(
      {
        ...base,
        bodyweight: 185,
        programStyle: 'hybrid',
        techniques: { ...base.techniques, dropSets: true },
        // Every weekday ticked: today is a day of the plan.
        schedule: {
          ...base.schedule,
          availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
          weeklyFrequency: 5,
        },
      },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await store.getDatabase();
    for (const daysAgo of [12, 9]) {
      for (const exerciseId of LIFTS) {
        await db.put('workouts', {
          ...record(
            0,
            exerciseId,
            [
              [5, 135, 2],
              [5, 135, 2],
              [5, 135, 2],
            ],
            [4, 6],
            2,
          ),
          id: `w-${exerciseId}-${daysAgo}`,
          startedAt: at(daysAgo),
          completedAt: at(daysAgo),
        });
      }
    }
    await store.hydrate();
    const saved = await store.saveCurrentWorkout('Mine');
    await store.recalibrate({ type: 'readiness', readiness: checkIn });
    expect(store.getSnapshot().session!.lastSummary?.headline).toMatch(
      /^Adjusted for today \(every set 2 or more short of failure for the head cold, fitted to 45 min for time pressure\)/,
    );

    store.loadSavedWorkout(saved.id);
    const loaded = store.getSnapshot().session!;
    // The check-in is laid on the copy: fewer sets, every one 2 or more short of failure.
    expect(loaded.duration).toBe(45);
    expect(workingSets(loaded.workout).length).toBeLessThan(workingSets(saved.workout).length);
    expect(workingSets(loaded.workout).every((set) => set.targetRir >= 2)).toBe(true);
    // ... and the words on Today say so.
    const words = [loaded.lastSummary?.headline, ...(loaded.lastSummary?.details ?? [])].join(' ');
    expect(words).toMatch(/head cold/);
    expect(words).toMatch(/45 min/);
  });
});
