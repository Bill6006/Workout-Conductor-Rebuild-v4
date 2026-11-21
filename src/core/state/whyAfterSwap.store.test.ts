import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { allEntries } from '../../engine/workout/types';
import { mainLiftName } from '../../engine/workoutGenerator/generate';
import { TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

/**
 * The owner, 2026-11-02: after a lift was swapped on Today, Why this workout still said the lift
 * swapped out "leads as the primary strength lift", a lift the plan no longer held. Through the
 * store: the swap, the plan saved and opened again, rebuilt at another length, swapped again and
 * swapped back. Synthetic data only.
 */

const leads = (name: string) =>
  `${name} leads as the primary strength lift with full rests and warm-up ramp sets.`;

/** The lift to push: the bench press, to 225 lb. */
const PUSH = {
  exerciseId: 'barbell-bench-press',
  target: 225,
  units: 'lb' as const,
  since: '2026-08-01T12:00:00.000Z',
};

async function atGym(handle: TestStoreHandle, pushing = false): Promise<void> {
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    {
      ...createDefaultProfile(TEST_NOW),
      bodyweight: 185,
      ...(pushing ? { pushLift: PUSH } : {}),
    },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  await handle.store.setCurrentLocation('gym');
}

const workoutOf = (handle: TestStoreHandle) => handle.store.getSnapshot().session!.workout;
const liftsOf = (handle: TestStoreHandle) =>
  allEntries(workoutOf(handle).blocks).map((entry) => entry.exerciseId);
const mainsOf = (handle: TestStoreHandle) =>
  workoutOf(handle).explanation.reasons.filter((line) => mainLiftName(line) !== null);

describe('Why this workout after a swap on Today (the owner, 2026-11-02)', () => {
  it('names the lift swapped in, saved and opened again, and rebuilt', async () => {
    const handle = createTestStore();
    await atGym(handle);
    const bench = allEntries(workoutOf(handle).blocks)[0]!;
    expect(bench.exerciseId).toBe('barbell-bench-press');
    expect(bench.role).toBe('primary-strength');
    expect(mainsOf(handle)).toEqual([leads('Barbell Bench Press')]);

    const result = await handle.store.swapExercise(bench.id, 'dumbbell-bench-press');
    expect(result?.ok).toBe(true);
    // The lift swapped out is gone from the plan, and from what leads.
    expect(liftsOf(handle)).not.toContain('barbell-bench-press');
    expect(mainsOf(handle)).toEqual([leads('Dumbbell Bench Press')]);
    expect(workoutOf(handle).explanation.reasons.join(' ')).not.toMatch(
      /Barbell Bench Press (leads|is the)/,
    );

    // Saved and opened again: the same lines.
    const again = createTestStore({ factory: handle.factory, storage: handle.storage });
    await again.store.hydrate();
    expect(workoutOf(again).explanation.reasons).toEqual(workoutOf(handle).explanation.reasons);

    // Built again at another length: the lift swapped in still leads, the one swapped out stays out.
    await handle.store.setDurationChoice(45);
    expect(workoutOf(handle).duration.choice).toBe(45);
    expect(liftsOf(handle)).not.toContain('barbell-bench-press');
    expect(mainsOf(handle)).toEqual([leads('Dumbbell Bench Press')]);
  });

  it('follows a second swap, and a swap back', async () => {
    const handle = createTestStore();
    await atGym(handle);
    const bench = allEntries(workoutOf(handle).blocks)[0]!;
    await handle.store.swapExercise(bench.id, 'dumbbell-bench-press');
    // A lift today's plan does not hold already.
    expect(liftsOf(handle)).not.toContain('machine-chest-press');
    const second = await handle.store.swapExercise(bench.id, 'machine-chest-press');
    expect(second?.ok ? null : second?.error).toBeNull();
    expect(liftsOf(handle)).not.toContain('dumbbell-bench-press');
    expect(mainsOf(handle)).toEqual([leads(requireExercise('machine-chest-press').name)]);
    expect((await handle.store.swapExercise(bench.id, 'barbell-bench-press'))?.ok).toBe(true);
    expect(mainsOf(handle)).toEqual([leads('Barbell Bench Press')]);
  });

  it('leaves every line as built after a swap and a swap back, the lift to push’s too', async () => {
    // The review: a line dropped while its lift was out never came back.
    const handle = createTestStore();
    await atGym(handle, true);
    const built = structuredClone(workoutOf(handle));
    const bench = allEntries(built.blocks)[0]!;
    expect(built.explanation.reasons).toContain(
      'Barbell Bench Press leads: the lift you are pushing to 225 lb goes first, where a lift gains most (Nunes et al. 2021).',
    );
    expect((await handle.store.swapExercise(bench.id, 'dumbbell-bench-press'))?.ok).toBe(true);
    expect((await handle.store.swapExercise(bench.id, 'barbell-bench-press'))?.ok).toBe(true);
    expect(liftsOf(handle)).toEqual(allEntries(built.blocks).map((entry) => entry.exerciseId));
    expect(workoutOf(handle).explanation.reasons).toEqual(built.explanation.reasons);
  });
});
