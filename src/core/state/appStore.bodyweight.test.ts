import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { estimateWorkout } from '../../engine/duration/duration';
import { currentPosition } from '../../engine/workout/sequence';
import { allEntries } from '../../engine/workout/types';
import { TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { doneKeys } from './session';

/**
 * Maintenance 21, item 17, through the store: fewer reps over more sets in one tap, a 0 logged
 * on a lift done at bodyweight kept as the bodyweight, and a next target that asks for no weight.
 */

async function withChinUp(): Promise<{ handle: TestStoreHandle; entryId: string }> {
  const handle = createTestStore({ minOverlayMs: 0 });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const first = allEntries(handle.store.getSnapshot().session!.workout.blocks)[0]!;
  await handle.store.recalibrate({ type: 'replace', entryId: first.id, exerciseId: 'chin-up' });
  const chin = allEntries(handle.store.getSnapshot().session!.workout.blocks).find(
    (entry) => entry.exerciseId === 'chin-up',
  )!;
  return { handle, entryId: chin.id };
}

function entryOf(handle: TestStoreHandle, entryId: string) {
  return allEntries(handle.store.getSnapshot().session!.workout.blocks).find(
    (entry) => entry.id === entryId,
  )!;
}

describe('a lift done at bodyweight, in the store', () => {
  it('takes fewer reps over more sets in one tap, and the time estimate follows', async () => {
    const { handle, entryId } = await withChinUp();
    const before = entryOf(handle, entryId);
    const working = before.sets.filter((set) => set.kind === 'working').length;
    const result = await handle.store.recalibrate({
      type: 'rep-range',
      entryId,
      reps: [3, 5],
      workingDelta: 1,
    });
    expect(result?.ok).toBe(true);
    const after = entryOf(handle, entryId);
    const sets = after.sets.filter((set) => set.kind === 'working');
    expect(sets).toHaveLength(working + 1);
    expect(sets.every((set) => set.targetReps[0] === 3 && set.targetReps[1] === 5)).toBe(true);
    expect(after.manual).toMatchObject({ reps: true, sets: true });
    expect(handle.store.getSnapshot().session!.lastSummary?.headline).toBe(
      `Chin-Up: ${working + 1} sets of 3-5.`,
    );
    // The length shown is the length of the workout as it now stands.
    const workout = handle.store.getSnapshot().session!.workout;
    const fresh = estimateWorkout(
      workout.blocks,
      workout.warmup.generalMinutes,
      requireExercise,
      () => false,
    );
    expect(workout.duration.estimatedMinutes).toBe(Math.round(fresh.totalMinutes));
  });

  it('keeps its ramp within the new range, so a warm-up never asks for more than the work', async () => {
    const { handle, entryId } = await withChinUp();
    // A ramp at the old range: 6-12 at RIR 5, before the tap.
    await handle.store.recalibrate({ type: 'add-warmup', entryId });
    const ramps = () => entryOf(handle, entryId).sets.filter((set) => set.kind === 'warmup');
    expect(ramps().length).toBeGreaterThan(0);
    expect(ramps().every((set) => set.targetReps[1] > 5)).toBe(true);
    await handle.store.recalibrate({ type: 'rep-range', entryId, reps: [3, 5], workingDelta: 1 });
    expect(ramps().every((set) => set.targetReps[0] === 3 && set.targetReps[1] === 5)).toBe(true);
  });

  it('adds a ramp after the tap at the working range, never the usual 3-5 floor', async () => {
    const { handle, entryId } = await withChinUp();
    // A strength day's floor of 3 gives sets of 1-2; a ramp added then asks no more than that.
    await handle.store.recalibrate({ type: 'rep-range', entryId, reps: [1, 2], workingDelta: 1 });
    await handle.store.recalibrate({ type: 'add-warmup', entryId });
    const ramps = entryOf(handle, entryId).sets.filter((set) => set.kind === 'warmup');
    expect(ramps.length).toBeGreaterThan(0);
    expect(ramps.every((set) => set.targetReps[1] <= 2)).toBe(true);
  });

  it('adds a ramp mid-exercise at the range of the sets still to come', async () => {
    const { handle, entryId } = await withChinUp();
    const { store } = handle;
    store.startWorkout();
    store.skipWarmup(entryId);
    const session = store.getSnapshot().session!;
    const keys = doneKeys(session.completed);
    const at = currentPosition(session.workout, (id, index) => keys.has(`${id}:${index}`))!;
    expect(at.entryId).toBe(entryId);
    await store.logSet(entryId, at.setIndex, { weight: null, reps: 3, rir: 1 });
    // The rest lowered by hand, then a ramp: it asks for no more than those sets.
    await store.recalibrate({ type: 'rep-range', entryId, reps: [2, 4] });
    await store.recalibrate({ type: 'add-warmup', entryId });
    const added = entryOf(handle, entryId).sets.find(
      (set) =>
        set.kind === 'warmup' &&
        !doneKeys(store.getSnapshot().session!.completed).has(`${entryId}:${set.index}`),
    );
    expect(added?.targetReps).toEqual([2, 4]);
  });

  it('keeps a 0 logged on a chin-up as the bodyweight, and asks for no weight next time', async () => {
    const { handle, entryId } = await withChinUp();
    const { store } = handle;
    store.startWorkout();
    store.skipWarmup(entryId);
    const session = store.getSnapshot().session!;
    const keys = doneKeys(session.completed);
    const at = currentPosition(session.workout, (id, index) => keys.has(`${id}:${index}`))!;
    expect(at.entryId).toBe(entryId);
    await store.logSet(entryId, at.setIndex, { weight: 0, reps: 5, rir: 1 });
    const logged = store
      .getSnapshot()
      .session!.completed.sets.find((set) => set.entryId === entryId && !set.skipped);
    expect(logged?.weight).toBeNull();
    expect(store.getSnapshot().session!.drafts[entryId]?.weight).toBeNull();
    const completion = await store.finishWorkout(null, { endedEarly: true });
    const line = completion?.nextTargets.find((target) => target.startsWith('Chin-Up'));
    expect(line).toMatch(/^Chin-Up: bodyweight × \d+-\d+ \(/);
  });
});
