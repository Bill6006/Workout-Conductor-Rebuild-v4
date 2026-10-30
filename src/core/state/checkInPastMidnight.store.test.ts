import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { Readiness } from '../../engine/recalibration/types';
import { allEntries } from '../../engine/workout/types';
import { record, type SetSpec } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * The fourth review of Maintenance 33, through the store: a check-in told just after midnight, on a
 * workout made the evening before, is the day's it was told (`checkInAt`), through every change made
 * after it, and the store's reading of the start reads it so (`readStartOf`).
 *
 * Steps: the plan is made at 23:40, its first two lifts the bench press and the incline press (each
 * with two sessions to read it against), and started at 23:58. At 00:05 the lifter checks in with energy
 * and sleep low ("today's first sets are judged a step easier"). At 00:10 and 00:20 the first sets
 * of the bench press and the incline press are logged, each 3 reps short of what it asked: within the step the
 * check-in takes, so no hard start. Read against the evening the plan was made, the check-in is
 * none of the new day's, and the two sets read as a hard start. Synthetic data only.
 */

const MADE = '2026-09-10T23:40:00.000Z';
const STARTED = '2026-09-10T23:58:00.000Z';
const TOLD = '2026-09-11T00:05:00.000Z';
const DAY = 86_400_000;

const low: Readiness = {
  energy: 2,
  soreness: 2,
  sleep: 2,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};

async function startedLate(clock: { now: string }) {
  const { store } = createTestStore({ now: () => clock.now });
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(clock.now), bodyweight: 185, programStyle: 'hypertrophy-focus' },
    createDefaultLocations({ gymAccess: true }, clock.now),
  );
  const db = await store.getDatabase();
  const sessions: [string, number, SetSpec, [number, number]][] = [
    ['barbell-bench-press', 11, [5, 185, 2], [4, 6]],
    ['barbell-bench-press', 7, [5, 185, 2], [4, 6]],
    ['incline-dumbbell-press', 11, [8, 60, 2], [6, 10]],
    ['incline-dumbbell-press', 7, [8, 60, 2], [6, 10]],
    ['barbell-row', 1, [8, 135, 2], [6, 10]],
    ['back-squat', 1, [5, 225, 2], [4, 6]],
  ];
  for (const [exerciseId, daysAgo, set, target] of sessions) {
    const when = new Date(Date.parse(MADE) - daysAgo * DAY).toISOString();
    await db.put('workouts', {
      ...record(0, exerciseId, [set, set, set], target, 2),
      id: `w-${exerciseId}-${daysAgo}`,
      startedAt: when,
      completedAt: when,
    });
  }
  await store.hydrate();
  // The first two lifts are the two with sessions to read them against.
  for (const exerciseId of ['barbell-bench-press', 'incline-dumbbell-press']) {
    const at = ['barbell-bench-press', 'incline-dumbbell-press'].indexOf(exerciseId);
    const entry = allEntries(store.getSnapshot().session!.workout.blocks)[at]!;
    if (entry.exerciseId !== exerciseId) {
      const swapped = await store.recalibrate({ type: 'replace', entryId: entry.id, exerciseId });
      expect(swapped?.ok).toBe(true);
    }
  }
  clock.now = STARTED;
  store.startWorkout();
  return store;
}

describe('a check-in told past midnight on a workout made before it', () => {
  it('keeps the time it was told, and the start is judged a step easier', async () => {
    const clock = { now: MADE };
    const store = await startedLate(clock);
    clock.now = TOLD;
    await store.recalibrate({ type: 'readiness', readiness: low });
    expect(store.getSnapshot().session!.constraints.checkInAt).toBe(TOLD);
    const judged = allEntries(store.getSnapshot().session!.workout.blocks).slice(0, 2);
    expect(judged.map((entry) => entry.exerciseId)).toEqual([
      'barbell-bench-press',
      'incline-dumbbell-press',
    ]);
    for (const [entry, at] of [
      [judged[0]!, '2026-09-11T00:10:00.000Z'],
      [judged[1]!, '2026-09-11T00:20:00.000Z'],
    ] as const) {
      clock.now = at;
      const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
      await store.logSet(entry.id, set.index, {
        reps: set.targetReps[0] - 3,
        weight: set.targetWeight,
        rir: set.targetRir,
      });
    }
    const session = store.getSnapshot().session!;
    // Through every change since, the check-in is the day's it was told.
    expect(session.constraints.checkInAt).toBe(TOLD);
    // Three short each, within the step the check-in takes: no hard start.
    expect(session.constraints.badStart).toBeUndefined();
  });
});
