import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import type { RecalibrationTrigger } from '../../engine/recalibration/types';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { describeWorkout, working } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Seventeenth review of round M. Each muscle a catch-up gives "3 working sets, or 2 for a beginner",
 * "No set to failure: at least 1 rep in reserve, 2 for a beginner", and a change to the plan "holds
 * every lift to it". The eighth pass settled that a save which changes the dose and keeps the offer's
 * muscles gives the dose it now asks ("a kept layout takes the dose the offer asks now"); its test
 * goes up (a beginner saved as an intermediate) and looks only at the lifts not kept. Going down, the
 * lift the plan keeps through the rebuild keeps the old dose: a pin, the lifter's swap, or what came
 * in for comfort (the lifter's pick since the fifteenth pass) stays at three sets at 1 in reserve,
 * while every other lift drops to the beginner's two at 2 and the offer itself now asks two at 2 of
 * the side delts. A check-in holds a kept lift to the catch-up (`settleKept`); a save does not.
 *
 * Steps (synthetic data only): an intermediate lifter, Monday's bench press in the log, on a
 * Wednesday the schedule does not tick: the catch-up has the lateral raise, three sets at 1 in
 * reserve. The lifter pins it (or swaps it for the cable lateral raise, or finds it uncomfortable,
 * which brings the cable lateral raise), then saves their experience as beginner: "Rebuilt for your
 * updated profile", the offer read again with the same muscles at two sets and 2 in reserve each.
 *
 * Also fails on 89dfb39.
 */

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();

async function lifter(changes: Partial<UserProfile> = {}) {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...changes },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  const when = daysBefore(2);
  await db.put('workouts', {
    ...record(
      0,
      'barbell-bench-press',
      [
        [10, 100, 2],
        [10, 100, 2],
        [10, 100, 2],
      ],
      [8, 12],
      2,
    ),
    id: 'w-bench-monday',
    startedAt: when,
    completedAt: when,
  });
  await handle.store.hydrate();
  return handle;
}

type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;
const lifts = (handle: Handle) => describeWorkout(session(handle).workout).join('; ');
const sideDelts = (handle: Handle) =>
  allEntries(session(handle).workout.blocks).filter((entry) =>
    requireExercise(entry.exerciseId).primaryMuscles.includes('side-delts'),
  );

async function keptThenBeginner(keep: (raise: WorkoutEntry) => RecalibrationTrigger) {
  const handle = await lifter();
  expect(session(handle).workout.templateId).toBe('catch-up');
  const raise = allEntries(session(handle).workout.blocks).find(
    (entry) => entry.exerciseId === 'lateral-raise',
  )!;
  expect(describeWorkout(session(handle).workout)).toContain('lateral-raise x3 @RIR 1/1/1');
  const kept = await handle.store.recalibrate(keep(raise));
  expect(kept?.ok).toBe(true);
  const steps = [lifts(handle)];
  await handle.store.saveProfile({
    ...handle.store.getSnapshot().profile!,
    experience: 'beginner',
  });
  steps.push(`beginner: ${lifts(handle)}`);
  const asked = session(handle).constraints.catchUp!.muscles.find(
    (item) => item.muscle === 'side-delts',
  );
  // The offer read again keeps its muscles, at the beginner's dose.
  expect(asked).toMatchObject({ sets: 2, minRir: 2 });
  return { handle, steps: steps.join(' | ') };
}

function expectBeginnerDose(handle: Handle, steps: string) {
  const given = sideDelts(handle).reduce((sum, entry) => sum + working(entry).length, 0);
  // On 532aba6: three sets, at 1 in reserve.
  expect(given, steps).toBeLessThanOrEqual(2);
  for (const entry of sideDelts(handle)) {
    for (const set of working(entry)) expect(set.targetRir, steps).toBeGreaterThanOrEqual(2);
  }
}

describe('a save that lowers the catch-up’s dose holds the lifts it keeps to the new dose', () => {
  it('the lateral raise pinned, then the experience saved as beginner', async () => {
    const { handle, steps } = await keptThenBeginner((raise) => ({
      type: 'pin',
      entryId: raise.id,
      pinned: true,
    }));
    expectBeginnerDose(handle, steps);
  });

  it('the lateral raise swapped for the cable lateral raise, then beginner', async () => {
    const { handle, steps } = await keptThenBeginner((raise) => ({
      type: 'replace',
      entryId: raise.id,
      exerciseId: 'cable-lateral-raise',
    }));
    expectBeginnerDose(handle, steps);
  });

  it('the lateral raise uncomfortable (the cable lateral raise comes in), then beginner', async () => {
    const { handle, steps } = await keptThenBeginner((raise) => ({
      type: 'uncomfortable',
      entryId: raise.id,
    }));
    expectBeginnerDose(handle, steps);
  });
});
