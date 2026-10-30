import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { TOO_SOON_SOURCE } from '../../engine/coach/coachConductor';
import { allEntries } from '../../engine/workout/types';
import { coachContextOf } from '../../features/coach/useCoach';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * The fourth review of Maintenance 33, on the screens' coach (`coachContextOf`): a check-in told
 * just after midnight, on a workout made the evening before, is the day's it was told
 * (`checkInDayOf`), so the coach's "too soon" reads its short night.
 *
 * Steps: four bench press sets a rep short of failure on Tuesday at 18:10 (the chest's window 36 h,
 * 48 h after a short night; "too soon" warns inside three quarters of it). Wednesday at 23:40 the
 * plan is made, three sets of the dumbbell fly added to it; at 23:58 it is started; at 00:05 on Thursday the lifter checks
 * in with sleep "Short". At 00:10, 30 h after the bench, the coach warns the chest may not have
 * recovered. Read against the evening the plan was made, the short night is none of Thursday's and
 * the 30 h are past three quarters of 36. Synthetic data only.
 */

const BENCH_DAY = '2026-09-08T18:10:00.000Z';
const MADE = '2026-09-09T23:40:00.000Z';
const STARTED = '2026-09-09T23:58:00.000Z';
const TOLD = '2026-09-10T00:05:00.000Z';
const LOOKED = '2026-09-10T00:10:00.000Z';

describe('the coach past midnight', () => {
  it('reads a check-in told after midnight as the day’s it was told', async () => {
    const clock = { now: MADE };
    const { store } = createTestStore({ now: () => clock.now });
    await store.hydrate();
    const base = createDefaultProfile(clock.now);
    await store.completeOnboarding(
      {
        ...base,
        bodyweight: 185,
        // Every day ticked: Wednesday's plan is a day of the plan.
        schedule: {
          ...base.schedule,
          availableDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          weeklyFrequency: 6,
        },
      },
      createDefaultLocations({ gymAccess: true }, clock.now),
    );
    const db = await store.getDatabase();
    await db.put('workouts', {
      ...record(
        0,
        'barbell-bench-press',
        [
          [8, 100, 1],
          [8, 100, 1],
          [8, 100, 1],
          [8, 100, 1],
        ],
        [6, 10],
        1,
      ),
      id: 'w-bench-tuesday',
      startedAt: BENCH_DAY,
      completedAt: BENCH_DAY,
    });
    await store.hydrate();
    // Hard work for the chest still to come: three sets of the dumbbell fly.
    expect(
      (
        await store.recalibrate({
          type: 'add-exercise',
          exerciseId: 'dumbbell-fly',
          muscle: 'chest',
          sets: 3,
        })
      )?.ok,
    ).toBe(true);
    const fly = allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.exerciseId === 'dumbbell-fly',
    );
    expect(requireExercise(fly!.exerciseId).primaryMuscles).toContain('chest');
    clock.now = STARTED;
    store.startWorkout();
    clock.now = TOLD;
    await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 3,
        soreness: 2,
        sleep: 2,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
      },
    });
    clock.now = LOOKED;
    const card = coachContextOf(
      { ...store.getSnapshot(), lastExportAt: LOOKED },
      Date.parse(LOOKED),
    )?.card;
    expect(card?.signal.source.startsWith(`${TOO_SOON_SOURCE}|chest|`)).toBe(true);
  });
});
