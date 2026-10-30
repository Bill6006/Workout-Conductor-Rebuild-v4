import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries, type GeneratedWorkout } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The fifth adversarial review of Maintenance 33: "Lighter" is lost when a workout landing from
 * another device makes today's plan again, beside the day's check-in, which now holds.
 *
 * Steps: a hybrid lifter's plan for today runs the bench press on a top set (140 × 4-6 at 1 in
 * reserve) and three back-offs (135 × 4-6 at 2). Before the start they take "Lighter for the chest"
 * from the "too soon" card: the bench press keeps its loads, a set fewer and a rep more in reserve.
 * An old workout logged on another device lands (twenty days ago), and the store reads the log again.
 *
 * The rule: the report's second pass: "'Lighter' is a choice of the day through a preview made
 * again" (the second review: "'Lighter' was lost when the preview was made again"); the fourth pass:
 * "Every plan of the day keeps the day's check-in ... a workout landing from another device"; Round
 * M's day choices hold so too (`ensureSession`: "the eighteenth to twentieth reviews of round M: a
 * workout from another device brought every lift back").
 *
 * What happens: the new history makes the preview again through `ensureSession`, which keeps the
 * day's check-in since the fourth pass (`withDayCheckIn`) and Round M's choices, but not "Lighter":
 * that is kept only where the store builds a preview again itself (`rebuildPreview`'s `chosen`, the
 * second pass's fix). The plan comes back with the bench press's four sets at the plan's reserve and
 * no "Lighter" in force, under no words. The "too soon" card may show again, but the plan the lifter
 * chose for the day is gone (the same with a workout deleted from the log, or anything else that
 * makes the plan again through `ensureSession`).
 *
 * In the build since the second pass's fix (older than the fourth pass, whose carry of the check-in
 * on the same path it sits beside). On the previous head (3d24e37) this test fails the same way.
 *
 * Synthetic data only.
 *
 * The fix (the fifth pass): "Lighter" taken today holds on every plan of the day, as the check-in
 * does (`withDayCheckIn`).
 */

const DAY = 86_400_000;
const LIFTS = ['barbell-bench-press', 'back-squat', 'barbell-row'];
const at = (daysAgo: number) => new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();

const benchSets = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks)
    .find((entry) => entry.exerciseId === 'barbell-bench-press')!
    .sets.filter((set) => set.kind === 'working')
    .map((set) => [set.targetWeight, set.targetReps, set.targetRir]);

describe('"Lighter" taken today, a workout landing from another device', () => {
  it('holds through the plan made again', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    const base = createDefaultProfile(TEST_NOW);
    await store.completeOnboarding(
      {
        ...base,
        bodyweight: 185,
        programStyle: 'hybrid',
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
    const plan = benchSets(store.getSnapshot().session!.workout);
    const result = await store.recalibrate({ type: 'lighter', muscle: 'chest' });
    expect(result?.ok).toBe(true);
    const eased = benchSets(store.getSnapshot().session!.workout);
    expect(eased.length).toBe(plan.length - 1);

    // An old workout from another device lands: today's plan is made again.
    await db.put('workouts', {
      ...record(0, 'back-squat', [[5, 200, 2]], [4, 6], 2),
      id: 'w-elsewhere',
      startedAt: at(20),
      completedAt: at(20),
    });
    await store.hydrate();
    const session = store.getSnapshot().session!;
    expect(session.status).toBe('preview');
    expect(session.constraints.lighter).toEqual(['chest']);
    expect(benchSets(session.workout)).toEqual(eased);
  });
});

describe('"Lighter" taken one day', () => {
  it('is none of the next day’s plan', async () => {
    // The fifth pass's own: "Lighter" is the day's choice, as the check-in is.
    const clock = { now: TEST_NOW };
    const { store } = createTestStore({ now: () => clock.now });
    await store.hydrate();
    const base = createDefaultProfile(TEST_NOW);
    await store.completeOnboarding(
      {
        ...base,
        bodyweight: 185,
        programStyle: 'hybrid',
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
    const plan = benchSets(store.getSnapshot().session!.workout);
    expect((await store.recalibrate({ type: 'lighter', muscle: 'chest' }))?.ok).toBe(true);
    expect(store.getSnapshot().session!.constraints.lighter).toEqual(['chest']);

    // The next day, the plan left on the screen gives way to that day's own.
    clock.now = new Date(Date.parse(TEST_NOW) + DAY).toISOString();
    store.refreshSession();
    const next = store.getSnapshot().session!;
    expect(next.constraints.lighter).toBeUndefined();
    expect(benchSets(next.workout).length).toBe(plan.length);
  });
});
