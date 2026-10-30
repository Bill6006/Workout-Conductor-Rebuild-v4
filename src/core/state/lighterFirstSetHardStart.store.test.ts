import { describe, expect, it } from 'vitest';
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
 * The third adversarial review of Maintenance 33: with "Lighter" in force, a first set three reps of
 * capacity short of what it asked reads two short, and the hard start is missed.
 *
 * Steps: a lifter whose first two lifts take their targets from their own log (the bench press, then
 * the incline dumbbell press). Before starting, they tap "Lighter for the chest" (the "too soon"
 * card's option): the bench press keeps its loads and asks a rep fewer at a rep more in reserve.
 * Each lift's first working set then falls three reps of capacity short of what it asked: the bench
 * press at its load, its eased reps plus its eased reserve less three, with none left; the incline
 * press likewise (not eased). The control: the same two falls with no "Lighter".
 *
 * The rule: the hard start (item 42): the first set of each of the first two lifts that can be
 * judged, "both well short" (`SHORT_BY_REPS`: three reps of capacity), eases the rest; `shortOf`:
 * "What the plan asked: no reserve the day's settings added (a check-in, easier, the hard start's
 * own), whenever they were applied, is counted against the set; the load may not have come down
 * with it"; and the expectation is lowered by "One step, never two" (`expectsLess`), by the
 * check-in or the windows only. "Lighter keeps the loads: a set fewer and a rep more in reserve on
 * its lifts today": at the same load a rep fewer at a rep more in reserve asks the same reps to
 * failure as the plan.
 *
 * What happens: `shortOf` reads the plan's reserve (`Math.min(set.targetRir, planRir)`) against the
 * eased set's reps (`set.targetReps[0]`): the rep "Lighter" took off the range is counted as a rep
 * the lifter need not have had, so a set three short of both the plan's ask and the eased ask reads
 * two short, and no hard start is called; without "Lighter" the same fall at the same load is one.
 * The same holds for a set the second review's `heldToTheDay` eases at its load on a head-cold day.
 * It fails before the second review's fix too (80893d4): "Lighter" kept the loads since the first.
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

/**
 * A lift's first working set three reps of capacity under what it asks at its load: its reps plus
 * its reserve, as the set shows them, less three, with none left.
 */
async function threeShort(store: AppStore, entry: WorkoutEntry) {
  store.skipWarmup(entry.id);
  const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
  const reps = set.targetReps[0] + set.targetRir - 3;
  await store.logSet(entry.id, set.index, { weight: set.targetWeight, reps, rir: 0 });
}

describe('the hard start with "Lighter" in force', () => {
  it('reads a first set three short of what it asked as three short, as without "Lighter"', async () => {
    // The control: no "Lighter", and the plan's own reserve on each first set.
    const control = await trained();
    control.startWorkout();
    const [first, second] = judgeable(control);
    expect(first!.exerciseId).toBe('barbell-bench-press');
    for (const lift of [first!, second!]) {
      const set = lift.sets.find((candidate) => candidate.kind === 'working')!;
      expect(set.targetRir).toBe(planRir(control, lift));
      await threeShort(control, lift);
    }
    expect(control.getSnapshot().session!.constraints.badStart).toBe(true);

    const store = await trained();
    await store.recalibrate({ type: 'lighter', muscle: 'chest' });
    store.startWorkout();
    const [bench, incline] = judgeable(store);
    expect(bench!.exerciseId).toBe('barbell-bench-press');
    // "Lighter": the same load, a rep fewer at a rep more in reserve: the same reps to failure.
    const eased = bench!.sets.find((candidate) => candidate.kind === 'working')!;
    const plain = first!.sets.find((candidate) => candidate.kind === 'working')!;
    expect(eased.targetWeight).toBe(plain.targetWeight);
    expect(eased.targetReps[0] + eased.targetRir).toBe(plain.targetReps[0] + plain.targetRir);
    await threeShort(store, bench!);
    await threeShort(store, incline!);
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
  });
});
