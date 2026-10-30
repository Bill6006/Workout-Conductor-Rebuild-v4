import { describe, expect, it, vi } from 'vitest';
import { getExercise } from '../../catalog/exercises/catalog';
import { isHold } from '../../catalog/exercises/exerciseSchema';
import type { AppStore } from './appStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { topSetRir } from '../../engine/progression/backOffs';
import { prescribeFor } from '../../engine/progression/roles';
import { ESTIMATED_MODES } from '../../engine/recalibration/recalibrate';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The third adversarial review of Maintenance 33: the mark of a check-in told under a hard start
 * outlives the hard start, and a later reading of the start ignores the check-in.
 *
 * Steps: the lifter's first two lifts (targets from their own log) each fall three reps of capacity
 * short: a hard start, and the rest is eased. They check in: energy "Exhausted" (1) and sleep "Poor"
 * (1), two items clearly worse; the summary says "Checked in: the rest stays eased for the hard
 * start." They then see the first lift's set was logged on the wrong exercise and delete it: the
 * start no longer reads short, and the ease comes off. Their third lift's first set then falls
 * three reps of capacity short.
 *
 * The rule: decision 1: two items clearly worse "lower what the day's first sets are expected to
 * do" (the report), a rep more short of a lift before it reads as a hard start (`StartContext`); the
 * second review's mark is for a hard start in force: "The day's check-in was told with a hard start
 * in force: the start's reading reads none of it, so it never takes the hard start back"
 * (`SessionConstraints.checkInAfterStart`), "Absent ... for a check-in told before a hard start".
 * Once the start is read afresh with no hard start in force, the check-in stands before it.
 *
 * What happens: nothing takes the mark away but a check-in told again with no hard start in force
 * (`execute`, `'readiness'`): the bad-start trigger that takes the ease off leaves it. So the
 * start's reading of the second and third lifts still reads no check-in, and their three-rep falls,
 * which the exhausted, sleepless check-in excuses by a rep, read as a new hard start: the rest is
 * eased again. Before the second review's fix (80893d4) the check-in was read and the falls were
 * excused.
 *
 * Synthetic data only.
 */

async function trained(): Promise<AppStore> {
  const handle = createTestStore({ minOverlayMs: 0 });
  await handle.store.hydrate();
  const profile = createDefaultProfile(TEST_NOW);
  await handle.store.completeOnboarding(
    {
      ...profile,
      bodyweight: 185,
      schedule: { ...profile.schedule, availableDays: [...profile.schedule.availableDays, 'wed'] },
    },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const planned = allEntries(handle.store.getSnapshot().session!.workout.blocks);
  const db = await handle.store.getDatabase();
  for (const daysAgo of [9, 5]) {
    const when = new Date(Date.parse(TEST_NOW) - daysAgo * 86_400_000).toISOString();
    for (const entry of planned) {
      const working = entry.sets.find((set) => set.kind === 'working');
      if (!working) continue;
      const reps = Math.round((working.targetReps[0] + working.targetReps[1]) / 2);
      await db.put('workouts', {
        ...record(
          daysAgo,
          entry.exerciseId,
          [
            [reps, working.targetWeight ?? null, working.targetRir],
            [reps, working.targetWeight ?? null, working.targetRir],
          ],
          working.targetReps,
          working.targetRir,
        ),
        id: `${entry.exerciseId}-${daysAgo}`,
        startedAt: when,
        completedAt: when,
      });
    }
  }
  await handle.store.hydrate();
  await handle.store.setCoachFocus('chest');
  return handle.store;
}

const entries = (store: AppStore) => allEntries(store.getSnapshot().session!.workout.blocks);

/** The lifts the start can judge: targets from the log, at most twelve reps to failure asked. */
function judgeable(store: AppStore): WorkoutEntry[] {
  return entries(store).filter((entry) => {
    const exercise = getExercise(entry.exerciseId);
    const mode = entry.progression?.mode;
    const set = entry.sets.find((candidate) => candidate.kind === 'working');
    return (
      exercise &&
      !isHold(exercise) &&
      mode !== undefined &&
      !ESTIMATED_MODES.has(mode) &&
      set !== undefined &&
      set.targetReps[0] + Math.min(set.targetRir, planRir(store, entry)) <= 12
    );
  });
}

function planRir(store: AppStore, entry: WorkoutEntry): number {
  const exercise = getExercise(entry.exerciseId)!;
  const { profile, history } = store.getSnapshot();
  const rir = prescribeFor(exercise, entry.role, profile!, history).rir;
  const first = entry.sets.find((set) => set.kind === 'working');
  return first?.tier === 'top' ? topSetRir(rir) : rir;
}

/** A lift's first working set three reps of capacity under what the plan asked. */
async function fallShort(store: AppStore, entryId: string) {
  const entry = entries(store).find((candidate) => candidate.id === entryId)!;
  store.skipWarmup(entry.id);
  const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
  const reserve = Math.min(set.targetRir, planRir(store, entry));
  const reps = set.targetReps[0] + reserve - 3;
  await store.logSet(entry.id, set.index, { weight: set.targetWeight, reps, rir: 0 });
  return set.index;
}

describe('a check-in told under a hard start', () => {
  it('is read again once the hard start is gone', async () => {
    const store = await trained();
    store.startWorkout();
    const [first, second, third] = judgeable(store);
    const firstSet = await fallShort(store, first!.id);
    await fallShort(store, second!.id);
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);

    await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 1,
        soreness: 2,
        sleep: 1,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
      },
    });
    expect(store.getSnapshot().session!.lastSummary?.headline).toBe(
      'Checked in: the rest stays eased for the hard start.',
    );

    // The first lift's set was logged on the wrong exercise: deleted, the start no longer reads short.
    store.deleteLoggedSet(first!.id, firstSet);
    await vi.waitFor(() => expect(store.getSnapshot().session!.constraints.badStart).toBeFalsy());

    // The third lift falls three short, a rep inside what the check-in excuses.
    await fallShort(store, third!.id);
    expect(store.getSnapshot().session!.constraints.badStart).toBeFalsy();
  });
});
