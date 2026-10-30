import { describe, expect, it } from 'vitest';
import { getExercise } from '../../catalog/exercises/catalog';
import { isHold } from '../../catalog/exercises/exerciseSchema';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { AppStore } from './appStore';
import { topSetRir } from '../../engine/progression/backOffs';
import { prescribeFor } from '../../engine/progression/roles';
import { ESTIMATED_MODES } from '../../engine/recalibration/recalibrate';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The second adversarial review of Maintenance 33: a low check-in told after a hard start says "the
 * rest stays eased for the hard start", and the next set logged takes the ease away.
 *
 * Steps: the lifter's first two lifts (targets from their own log: the bench press and the incline
 * dumbbell press) each fall three reps of capacity short: a hard start, and the rest of the workout
 * is eased. They then check in: energy "Exhausted" (1) and sleep "Poor" (1). The summary says
 * "Checked in: the rest stays eased for the hard start." and "Energy and sleep low: today's first
 * sets are judged a step easier; the plan stays." They log the next set of their first lift as
 * asked. In the second case the chest was worked 40 h before the first set (a 36 h window, run),
 * and the check-in is sleep "Poor" alone, one item.
 *
 * The rule: the check-in's own words ("the rest stays eased for the hard start"; "the plan stays");
 * decision 1: the check-in lowers what the app expects of the day's first sets, "never the plan"
 * (the report: "two items clearly worse ... lower what the day's first sets are expected to do,
 * never the plan"; `RULES.worseItems`: "Two or more items clearly worse act; one alone does not");
 * item 42: the hard start's ease is the day's change, taken back when the start no longer reads
 * short after an undo or a correction ("or no longer do after an undo or a correction", types.ts).
 *
 * What happens: the hard start's reading reads today's check-in (`readStart`'s `lowered`), and since
 * the first review's fix its windows do too (`dayRecovery`: a short night adds 12 h to every
 * window). A check-in told after the start raises what the same two sets must fall short by: two
 * items clearly worse ask a rep more of each lift; a single short night puts the chest back inside
 * its window (40 h of 48), which asks a rep more of the bench press. The next set logged runs
 * `settleStart`, and the store takes the ease off: "Back to plan (the planned sets and effort
 * back)", the lifter having just reported an exhausted or sleepless day, a set after the check-in
 * said the rest stays eased. The first case also fails before the first review's fixes (d3877aa);
 * the second passes there: it came with the fix that put the check-in on the hard start's windows.
 *
 * Synthetic data only.
 */

async function trained(extra: readonly WorkoutRecord[] = []): Promise<AppStore> {
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
  for (const record of extra) await db.put('workouts', record);
  await handle.store.hydrate();
  await handle.store.setCoachFocus('chest');
  return handle.store;
}

const entries = (store: AppStore) => allEntries(store.getSnapshot().session!.workout.blocks);

function judgeable(store: AppStore): WorkoutEntry[] {
  return entries(store).filter((entry) => {
    const exercise = getExercise(entry.exerciseId);
    const mode = entry.progression?.mode;
    return (
      exercise &&
      !isHold(exercise) &&
      mode !== undefined &&
      !ESTIMATED_MODES.has(mode) &&
      entry.sets.some((set) => set.kind === 'working')
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
async function fallShort(store: AppStore, entry: WorkoutEntry) {
  store.skipWarmup(entry.id);
  const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
  const reserve = Math.min(set.targetRir, planRir(store, entry));
  const reps = set.targetReps[0] + reserve - 3;
  await store.logSet(entry.id, set.index, { weight: set.targetWeight, reps, rir: 0 });
}

/** The next working set of a lift, logged as asked. */
async function nextAsAsked(store: AppStore, entryId: string) {
  const session = store.getSnapshot().session!;
  const lift = entries(store).find((entry) => entry.id === entryId)!;
  const done = new Set(session.completed.sets.map((set) => `${set.entryId}:${set.setIndex}`));
  const next = lift.sets.find(
    (set) => set.kind === 'working' && !done.has(`${lift.id}:${set.index}`),
  )!;
  await store.logSet(lift.id, next.index, {
    weight: next.targetWeight,
    reps: next.targetReps[0],
    rir: next.targetRir,
  });
}

const checkIn = (energy: number, sleep: number) => ({
  energy,
  soreness: 2,
  sleep,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
});

describe('a low check-in after a hard start', () => {
  it('keeps the rest eased, as its summary says', async () => {
    const store = await trained();
    store.startWorkout();
    const [first, second] = judgeable(store);
    await fallShort(store, first!);
    await fallShort(store, second!);
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);

    await store.recalibrate({ type: 'readiness', readiness: checkIn(1, 1) });
    const told = store.getSnapshot().session!;
    expect(told.lastSummary?.headline).toBe('Checked in: the rest stays eased for the hard start.');
    expect(told.constraints.badStart).toBe(true);

    // The next set of the first lift, as asked.
    await nextAsAsked(store, first!.id);
    const after = store.getSnapshot().session!;
    expect(after.lastSummary?.headline ?? '').not.toMatch(/no longer falls short|Back to plan/);
    expect(after.constraints.badStart).toBe(true);
  });

  it('keeps the rest eased through a change made after the check-in', async () => {
    const store = await trained();
    store.startWorkout();
    const [first, second] = judgeable(store);
    await fallShort(store, first!);
    await fallShort(store, second!);
    await store.recalibrate({ type: 'readiness', readiness: checkIn(1, 1) });
    expect(store.getSnapshot().session!.constraints.checkInAfterStart).toBe(true);
    // A rest made longer on the lift still to come: a change of its own, the mark kept through it.
    await store.recalibrate({ type: 'rest-adjust', entryId: first!.id, deltaSeconds: 30 });
    expect(store.getSnapshot().session!.constraints.checkInAfterStart).toBe(true);
    await nextAsAsked(store, first!.id);
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
  });

  it('keeps the rest eased after a single short night, through the window it lengthens', async () => {
    // The chest worked 40 h before the first set: a 36 h window (one rep short), already run.
    const when = new Date(Date.parse(TEST_NOW) - 40 * 3_600_000).toISOString();
    const fly = {
      ...record(
        0,
        // No long-length work (the cable fly is one since the third review of Maintenance 33).
        'pec-deck',
        [
          [10, 40, 1],
          [10, 40, 1],
          [10, 40, 1],
        ],
        [10, 15],
        1,
      ),
      id: 'pec-deck-40h',
      startedAt: when,
      completedAt: when,
    };
    const store = await trained([fly]);
    store.startWorkout();
    const [first, second] = judgeable(store);
    expect(first!.exerciseId).toBe('barbell-bench-press');
    await fallShort(store, first!);
    await fallShort(store, second!);
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);

    // Sleep "Poor" alone: one item, which lowers nothing by itself (decision 1), but a short night.
    await store.recalibrate({ type: 'readiness', readiness: checkIn(3, 1) });
    const told = store.getSnapshot().session!;
    expect(told.lastSummary?.headline).toBe('Checked in: the rest stays eased for the hard start.');

    await nextAsAsked(store, first!.id);
    const after = store.getSnapshot().session!;
    expect(after.lastSummary?.headline ?? '').not.toMatch(/no longer falls short|Back to plan/);
    expect(after.constraints.badStart).toBe(true);
  });
});
