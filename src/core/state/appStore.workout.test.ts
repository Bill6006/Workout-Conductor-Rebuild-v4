import { describe, expect, it } from 'vitest';
import { getExercise } from '../../catalog/exercises/catalog';
import { currentPosition, workoutSequence } from '../../engine/workout/sequence';
import { allEntries, type WorkoutBlock } from '../../engine/workout/types';
import { TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';
import type { Identified } from '../storage/indexedDb';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { doneKeys } from './session';

interface Clock {
  now: () => string;
  advance: (seconds: number) => void;
}

function makeClock(start = TEST_NOW): Clock {
  let current = Date.parse(start);
  return {
    now: () => new Date(current).toISOString(),
    advance: (seconds) => {
      current += seconds * 1000;
    },
  };
}

async function seeded(
  clock: Clock,
  extra: Partial<TestStoreHandle> = {},
): Promise<TestStoreHandle> {
  const handle = createTestStore({ minOverlayMs: 0, now: clock.now, ...extra });
  await handle.store.hydrate();
  if (!handle.store.getSnapshot().profile) {
    await handle.store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
  }
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

/** Logs every set until the given block is the current one. */
async function advanceTo(handle: TestStoreHandle, blockId: string): Promise<void> {
  for (let guard = 0; guard < 80; guard += 1) {
    const at = position(handle);
    if (!at || at.blockId === blockId) return;
    await handle.store.logSet(at.entryId, at.setIndex, {
      weight: 100,
      reps: at.set.targetReps[0],
      rir: 2,
    });
    handle.store.skipRest();
  }
  throw new Error(`never reached ${blockId}`);
}

describe('active workout in the store', () => {
  it('starts, logs with the programmed rest, advances, and saves one durable entry per exercise', async () => {
    const clock = makeClock();
    const handle = await seeded(clock);
    const { store } = handle;
    store.startWorkout();
    expect(session(handle).status).toBe('active');
    expect(session(handle).completed.startedAt).toBe(TEST_NOW);
    expect(session(handle).completed.currentEntryId).toBe('e1');

    const first = position(handle);
    expect(first?.kind).toBe('warmup');
    await store.logSet('e1', first!.setIndex, { weight: 95, reps: 8, rir: 5 });
    let current = session(handle);
    expect(current.completed.sets).toHaveLength(1);
    expect(current.rest?.seconds).toBe(45);
    expect(current.rest?.endsAt).toBe(new Date(Date.parse(TEST_NOW) + 45_000).toISOString());
    expect(current.rest?.nextLabel).toMatch(/^Next: Barbell Bench Press · ramp set 2 of 2/);
    expect(current.drafts.e1).toEqual({ weight: 95, reps: 8, rir: 5 });

    const superset = current.workout.blocks.find(
      (block) => block.kind === 'superset',
    ) as WorkoutBlock;
    await advanceTo(handle, superset.id);
    const [a, b] = superset.entries.map((entry) => entry.id);
    let at = position(handle);
    expect(at?.entryId).toBe(a);
    await store.logSet(a as string, at!.setIndex, { weight: 40, reps: 12, rir: 1 });
    // Switching to the second move: no rest, current moves to A2 in the same round.
    expect(session(handle).rest).toBeNull();
    at = position(handle);
    expect(at?.entryId).toBe(b);
    expect(at?.round).toBe(1);
    await store.logSet(b as string, at!.setIndex, { weight: 20, reps: 12, rir: 1 });
    current = session(handle);
    expect(current.rest?.seconds).toBe(superset.restBetweenRoundsSeconds);
    expect(position(handle)?.round).toBe(2);

    clock.advance(40 * 60);
    const completion = await store.finishWorkout({
      effort: 'right',
      pain: false,
      energyAfter: 4,
      note: 'solid',
    });
    expect(completion.elapsedSeconds).toBe(2400);
    expect(completion.setsCompleted).toBeGreaterThan(4);
    expect(completion.muscles).toContain('chest');
    expect(completion.nextImplication).toMatch(/^Right on target/);
    expect(session(handle).status).toBe('completed');

    const db = await store.getDatabase();
    const records = (await db.getAll<Identified>('workouts')) as WorkoutRecord[];
    expect(records).toHaveLength(1);
    const record = records[0] as WorkoutRecord;
    expect(record.entries).toHaveLength(allEntries(current.workout.blocks).length);
    const members = record.entries.filter((entry) => entry.blockId === superset.id);
    expect(members).toHaveLength(2);
    expect(members.map((entry) => entry.exerciseId)).toEqual(
      superset.entries.map((entry) => entry.exerciseId),
    );
    expect(members.every((entry) => entry.blockKind === 'superset')).toBe(true);
    expect(record.rating?.note).toBe('solid');
    expect(record.entries[0]?.sets[0]).toMatchObject({ kind: 'warmup', reps: 8, weight: 95 });
    expect(store.getSnapshot().history).toHaveLength(1);
    expect(store.getSnapshot().workoutCount).toBe(1);

    store.dismissCompletion();
    const next = session(handle);
    expect(next.status).toBe('preview');
    expect(next.id).not.toBe(current.id);
    expect(next.workout.templateId).not.toBe('push-arms');
  });

  it('corrects a set in place, deletes one, and undoes the last one without moving the current set', async () => {
    const clock = makeClock();
    const handle = await seeded(clock);
    const { store } = handle;
    store.startWorkout();
    store.skipWarmup('e1');
    const first = position(handle);
    expect(first?.kind).toBe('working');
    await store.logSet('e1', first!.setIndex, { weight: 185, reps: 5, rir: 2 });
    const second = position(handle);
    await store.logSet('e1', second!.setIndex, { weight: 185, reps: 5, rir: 2 });
    const restBefore = session(handle).rest;
    const currentBefore = position(handle);

    await store.logSet('e1', first!.setIndex, { weight: 190, reps: 6, rir: 1 });
    const edited = session(handle);
    expect(edited.completed.sets.filter((set) => !set.skipped)).toHaveLength(2);
    expect(edited.completed.sets.find((set) => set.setIndex === first!.setIndex)).toMatchObject({
      weight: 190,
      reps: 6,
      rir: 1,
    });
    expect(edited.rest).toEqual(restBefore);
    expect(position(handle)).toEqual(currentBefore);

    store.undoLastSet();
    expect(position(handle)?.setIndex).toBe(second!.setIndex);
    expect(session(handle).rest).toBeNull();
    store.deleteLoggedSet('e1', first!.setIndex);
    expect(position(handle)?.setIndex).toBe(first!.setIndex);
    store.skipSet('e1', first!.setIndex);
    expect(
      session(handle).completed.sets.find((set) => set.setIndex === first!.setIndex)?.skipped,
    ).toBe(true);
  });

  it('pauses the clock and the rest, and recalibrates after a long interruption', async () => {
    const clock = makeClock();
    const handle = await seeded(clock);
    const { store } = handle;
    store.startWorkout();
    store.skipWarmup('e1');
    const first = position(handle);
    await store.logSet('e1', first!.setIndex, { weight: 185, reps: 5, rir: 2 });
    clock.advance(10);
    store.pauseWorkout();
    let current = session(handle);
    expect(current.status).toBe('paused');
    expect(current.completed.elapsedSeconds).toBe(10);
    expect(current.rest?.pausedRemaining).toBeCloseTo(current.rest!.seconds - 10, 5);

    clock.advance(25 * 60);
    await store.resumeWorkout();
    current = session(handle);
    expect(current.status).toBe('active');
    expect(current.rest?.pausedRemaining).toBeNull();
    expect(Date.parse(current.rest!.endsAt) - Date.parse(clock.now())).toBeCloseTo(
      (current.rest!.seconds - 10) * 1000,
      -2,
    );
    expect(current.lastSummary?.headline).toMatch(/^Back after 25 min/);
    expect(current.log[0]?.trigger).toBe('resume');
    expect(current.completed.sets).toHaveLength(3);
  });

  it('reps far from target recalibrate the next sets of that exercise only', async () => {
    const clock = makeClock();
    const handle = await seeded(clock);
    const { store } = handle;
    store.startWorkout();
    store.skipWarmup('e1');
    const first = position(handle);
    const [, high] = first!.set.targetReps;
    await store.logSet('e1', first!.setIndex, { weight: 135, reps: high + 3, rir: 3 });
    const current = session(handle);
    expect(current.log[0]?.trigger).toBe('performance');
    expect(current.lastSummary?.headline).toMatch(/add a little weight/);
    const next = position(handle);
    expect(next?.entryId).toBe('e1');
    expect(next?.set.targetReps[1]).toBe(high + 2);
    const others = allEntries(current.workout.blocks).filter((entry) => entry.id !== 'e1');
    const before = allEntries(current.previous!.workout.blocks).filter(
      (entry) => entry.id !== 'e1',
    );
    expect(others).toEqual(before);
  });

  it('keeps notes and cues per exercise, and an active session survives a new day', async () => {
    const clock = makeClock();
    const handle = await seeded(clock);
    const { store } = handle;
    await store.saveExerciseNotes('barbell-bench-press', {
      notes: 'Bench 4, feet back',
      cues: ['Elbows tucked', ' Leg drive '],
    });
    expect(store.getSnapshot().customInstructions[0]).toMatchObject({
      exerciseId: 'barbell-bench-press',
      notes: 'Bench 4, feet back',
      cues: ['Elbows tucked', 'Leg drive'],
    });
    store.startWorkout();
    const id = session(handle).id;

    const tomorrow = makeClock('2026-09-03T12:00:00.000Z');
    const again = createTestStore({
      factory: handle.factory,
      storage: handle.storage,
      minOverlayMs: 0,
      now: tomorrow.now,
    });
    await again.store.hydrate();
    expect(again.store.getSnapshot().session?.id).toBe(id);
    expect(again.store.getSnapshot().session?.status).toBe('active');
    expect(again.store.getSnapshot().customInstructions).toHaveLength(1);
  });

  it('registers a custom exercise so it resolves like a catalog entry', async () => {
    const clock = makeClock();
    const handle = await seeded(clock);
    const created = await handle.store.addCustomExercise({
      name: 'Landmine Press',
      primaryMuscles: ['front-delts'],
      movementPattern: 'vertical-push',
      equipment: [['barbell']],
    });
    expect(created.id).toMatch(/^custom-landmine-press-/);
    expect(getExercise(created.id)?.name).toBe('Landmine Press');
    expect(handle.store.getSnapshot().customCounts.exercises).toBe(1);
    const media = await handle.store.addCustomMedia(created.id, {
      kind: 'image',
      mimeType: 'image/png',
      sizeBytes: 12,
      dataUrl: 'data:image/png;base64,AAAA',
    });
    expect(media.exerciseId).toBe(created.id);
    expect((await handle.store.getCustomMedia(created.id))?.dataUrl).toBe(
      'data:image/png;base64,AAAA',
    );
    expect(workoutSequence(session(handle).workout).length).toBeGreaterThan(0);
  });
});
