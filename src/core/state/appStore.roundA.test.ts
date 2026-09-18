import { describe, expect, it } from 'vitest';
import { getExercise } from '../../catalog/exercises/catalog';
import { dropSetWeight } from '../../engine/recalibration/dropSet';
import { weightStep } from '../../engine/plateMath/plateMath';
import { currentPosition } from '../../engine/workout/sequence';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { doneKeys } from './session';

/**
 * Maintenance 11, round A: skipping an exercise once something is logged, a
 * drop set's load taken from what was lifted, and a warm-up never becoming
 * the working set's prefill.
 */

async function seeded(): Promise<TestStoreHandle> {
  const handle = createTestStore({ minOverlayMs: 0 });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  handle.store.startWorkout();
  return handle;
}

function session(handle: TestStoreHandle) {
  const current = handle.store.getSnapshot().session;
  if (!current) throw new Error('no session');
  return current;
}

function position(handle: TestStoreHandle) {
  const current = session(handle);
  const keys = doneKeys(current.completed);
  return currentPosition(current.workout, (id, index) => keys.has(`${id}:${index}`));
}

function entryOf(handle: TestStoreHandle, entryId: string): WorkoutEntry {
  const entry = allEntries(session(handle).workout.blocks).find((item) => item.id === entryId);
  if (!entry) throw new Error(`no entry ${entryId}`);
  return entry;
}

function loggedFor(handle: TestStoreHandle, entryId: string) {
  return session(handle).completed.sets.filter((set) => set.entryId === entryId);
}

/** Logs the set in front, at a weight, with the target's low rep count, then skips the rest. */
async function logCurrent(handle: TestStoreHandle, weight: number): Promise<void> {
  const at = position(handle);
  if (!at) throw new Error('nothing to log');
  await handle.store.logSet(at.entryId, at.setIndex, {
    weight,
    reps: at.set.targetReps[0],
    rir: 2,
  });
  handle.store.skipRest();
}

describe('skipping an exercise', () => {
  it('with nothing logged, the engine removes it', async () => {
    const handle = await seeded();
    const first = position(handle);
    if (!first) throw new Error('no position');
    const result = await handle.store.skipExercise(first.entryId);
    expect(result.kind).toBe('removed');
    expect(allEntries(session(handle).workout.blocks).some((e) => e.id === first.entryId)).toBe(
      false,
    );
  });

  it('with a warm-up logged, the logged set stays and the rest are recorded as skipped', async () => {
    const handle = await seeded();
    const first = position(handle);
    if (!first) throw new Error('no position');
    expect(first.kind).toBe('warmup');
    await logCurrent(handle, 60);
    const entry = entryOf(handle, first.entryId);
    const before = loggedFor(handle, entry.id);
    expect(before).toHaveLength(1);

    const result = await handle.store.skipExercise(entry.id);
    expect(result).toMatchObject({ kind: 'trimmed', skippedSets: entry.sets.length - 1 });
    // Still in the workout, every set accounted for, the warm-up untouched, the rest skipped.
    expect(allEntries(session(handle).workout.blocks).some((e) => e.id === entry.id)).toBe(true);
    const after = loggedFor(handle, entry.id);
    expect(after).toHaveLength(entry.sets.length);
    expect(after.find((set) => set.setIndex === first.setIndex)).toMatchObject({
      weight: 60,
      skipped: false,
    });
    expect(after.filter((set) => set.skipped)).toHaveLength(entry.sets.length - 1);
    // The session has moved on to the next exercise.
    expect(position(handle)?.entryId).not.toBe(entry.id);
    // No calibration failure was raised.
    expect(handle.store.getSnapshot().calibration.status).not.toBe('failed');
  });

  it('with every set logged, refuses plainly instead of failing', async () => {
    const handle = await seeded();
    const first = position(handle);
    if (!first) throw new Error('no position');
    const entry = entryOf(handle, first.entryId);
    for (let guard = 0; guard < 20 && position(handle)?.entryId === entry.id; guard += 1) {
      await logCurrent(handle, 60);
    }
    expect(loggedFor(handle, entry.id)).toHaveLength(entry.sets.length);
    await expect(handle.store.skipExercise(entry.id)).rejects.toThrow(/already logged/);
    expect(loggedFor(handle, entry.id)).toHaveLength(entry.sets.length);
  });
});

describe('prefills and the drop set', () => {
  it('a warm-up leaves no draft; a working set does', async () => {
    const handle = await seeded();
    const first = position(handle);
    if (!first) throw new Error('no position');
    expect(first.kind).toBe('warmup');
    await logCurrent(handle, 60);
    expect(session(handle).drafts[first.entryId]).toBeUndefined();
    for (let guard = 0; guard < 6 && position(handle)?.kind === 'warmup'; guard += 1) {
      await logCurrent(handle, 60);
    }
    expect(session(handle).drafts[first.entryId]).toBeUndefined();
    const working = position(handle);
    expect(working?.kind).toBe('working');
    await logCurrent(handle, 100);
    expect(session(handle).drafts[first.entryId]).toMatchObject({ weight: 100 });
  });

  it('an accepted drop set carries no load until the last working set is lifted, then a step below it', async () => {
    const handle = await seeded();
    const candidate = allEntries(session(handle).workout.blocks).find(
      (entry) => getExercise(entry.exerciseId)?.dropSetSafe,
    );
    expect(candidate).toBeDefined();
    if (!candidate) return;
    await handle.store.recalibrate({ type: 'drop-set', entryId: candidate.id, on: true });
    const accepted = entryOf(handle, candidate.id);
    const dropRow = accepted.sets.find((set) => set.kind === 'drop');
    expect(dropRow).toBeDefined();
    expect(dropRow?.targetWeight).toBeNull();

    // Work through the session up to and through that exercise's working sets.
    for (let guard = 0; guard < 80; guard += 1) {
      const at = position(handle);
      if (!at) break;
      if (at.entryId === candidate.id && at.kind === 'drop') break;
      await logCurrent(handle, at.entryId === candidate.id ? 40 : 60);
    }
    const settled = entryOf(handle, candidate.id);
    const drop = settled.sets.find((set) => set.kind === 'drop');
    expect(drop).toBeDefined();
    const exercise = getExercise(candidate.exerciseId);
    const step = exercise ? weightStep(exercise, 'lb') : 5;
    expect(drop?.targetWeight).toBe(dropSetWeight(40, step));
    expect(drop?.targetWeight).toBeLessThan(40);
    // It is the set in front now, and it survives a resume rebuild.
    expect(position(handle)).toMatchObject({ entryId: candidate.id, kind: 'drop' });
    await handle.store.recalibrate({ type: 'resume', awaySeconds: 1800 });
    expect(entryOf(handle, candidate.id).sets.some((set) => set.kind === 'drop')).toBe(true);
  });

  it('the drop weight is a fifth off, rounded down, never the working weight when a lighter step exists', () => {
    expect(dropSetWeight(120, 5)).toBe(95);
    expect(dropSetWeight(10, 5)).toBe(5);
    expect(dropSetWeight(12.5, 2.5)).toBe(10);
    expect(dropSetWeight(5, 5)).toBe(5);
    expect(dropSetWeight(100, 2.5)).toBe(80);
  });
});
