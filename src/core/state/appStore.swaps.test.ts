import { describe, expect, it, vi, type MockInstance } from 'vitest';
import { currentPosition } from '../../engine/workout/sequence';
import { SWAP_WEEKS, type LastingSwap } from '../../engine/planning/lastingSwaps';
import { allEntries, isStopped, type WorkoutEntry } from '../../engine/workout/types';
import { TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { doneKeys, undoAvailable } from './session';

/**
 * Maintenance 22 through the store: item 29, a swap once sets are logged files each set under
 * the exercise it was done on; item 23, a swap kept for a few weeks, which Undo and Stop take back.
 */

interface Clock {
  now: () => string;
  advance: (days: number) => void;
}

async function atGym(): Promise<{ handle: TestStoreHandle; clock: Clock }> {
  let current = Date.parse(TEST_NOW);
  const clock: Clock = {
    now: () => new Date(current).toISOString(),
    advance: (days) => {
      current += days * 86_400_000;
    },
  };
  const handle = createTestStore({ now: clock.now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  await handle.store.setCurrentLocation('gym');
  return { handle, clock };
}

const entries = (handle: TestStoreHandle): WorkoutEntry[] =>
  allEntries(handle.store.getSnapshot().session!.workout.blocks);

/** Logs sets in order until `count` sets of the given entry are done. */
async function logOn(handle: TestStoreHandle, entryId: string, count: number, weight: number) {
  const { store } = handle;
  for (let done = 0; done < count; done += 1) {
    const session = store.getSnapshot().session!;
    const keys = doneKeys(session.completed);
    const at = currentPosition(session.workout, (id, index) => keys.has(`${id}:${index}`))!;
    expect(at.entryId).toBe(entryId);
    await store.logSet(at.entryId, at.setIndex, {
      weight: at.kind === 'working' ? weight : at.set.targetWeight,
      reps: 8,
      rir: 2,
    });
  }
}

describe('a swap once sets are logged, through to the saved workout', () => {
  it('files the barbell sets under the bench press and the dumbbell set under the dumbbells', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const bench = entries(handle)[0]!;
    expect(bench.exerciseId).toBe('barbell-bench-press');
    store.startWorkout();
    const ramps = bench.sets.filter((set) => set.kind === 'warmup').length;
    await logOn(handle, bench.id, ramps + 1, 95);
    await store.swapExercise(bench.id, 'dumbbell-bench-press');
    const stand = entries(handle).find((entry) => entry.exerciseId === 'dumbbell-bench-press')!;
    expect(isStopped(entries(handle).find((entry) => entry.id === bench.id)!)).toBe(true);
    // The dial starts from the dumbbells' own target, not the barbell's 95.
    expect(store.getSnapshot().session!.drafts[stand.id]).toBeUndefined();
    await logOn(handle, stand.id, 1, 40);
    const completion = await store.finishWorkout(null, { endedEarly: true });
    expect(completion).not.toBeNull();
    const [record] = store.getSnapshot().history;
    const barbell = record!.entries.find((entry) => entry.exerciseId === 'barbell-bench-press')!;
    const dumbbell = record!.entries.find((entry) => entry.exerciseId === 'dumbbell-bench-press')!;
    expect(barbell.sets.filter((set) => set.kind === 'working').map((set) => set.weight)).toEqual([
      95,
    ]);
    expect(dumbbell.sets.map((set) => set.weight)).toEqual([40]);
    expect(dumbbell.replacedFrom).toBe('barbell-bench-press');
  });

  it('files it as skipped when the exercise that took over is skipped too', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const bench = entries(handle)[0]!;
    store.startWorkout();
    const ramps = bench.sets.filter((set) => set.kind === 'warmup').length;
    await logOn(handle, bench.id, ramps, 95);
    await store.swapExercise(bench.id, 'dumbbell-bench-press');
    const stand = entries(handle).find((entry) => entry.exerciseId === 'dumbbell-bench-press')!;
    expect((await store.skipExercise(stand.id)).kind).toBe('removed');
    expect(entries(handle).find((entry) => entry.id === bench.id)?.stopped?.why).toBe('skip');
    const completion = await store.finishWorkout(null, { endedEarly: true });
    const [record] = store.getSnapshot().history;
    expect(record!.skippedExerciseIds).toContain('barbell-bench-press');
    expect(completion!.skipped).toContain('Barbell Bench Press');
    expect(completion!.substitutions).toEqual([]);
  });

  it('keeps a set logged on the new exercise: Undo of the swap steps aside', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const bench = entries(handle)[0]!;
    store.startWorkout();
    const ramps = bench.sets.filter((set) => set.kind === 'warmup').length;
    await logOn(handle, bench.id, ramps + 1, 95);
    await store.swapExercise(bench.id, 'dumbbell-bench-press');
    expect(undoAvailable(store.getSnapshot().session!)).toBe(true);
    const stand = entries(handle).find((entry) => entry.exerciseId === 'dumbbell-bench-press')!;
    const standRamps = stand.sets.filter((set) => set.kind === 'warmup').length;
    await logOn(handle, stand.id, standRamps + 1, 40);
    expect(undoAvailable(store.getSnapshot().session!)).toBe(false);
    await expect(store.undoRecalibration()).rejects.toThrow(
      'Sets logged since that change would be lost, so it stays.',
    );
    const session = store.getSnapshot().session!;
    const ids = new Set(allEntries(session.workout.blocks).map((entry) => entry.id));
    expect(session.completed.sets.filter((set) => !ids.has(set.entryId))).toEqual([]);
    const later = await store.recalibrate({ type: 'duration', choice: 45 });
    expect(later?.ok ? 'ok' : later?.error).toBe('ok');
    await store.finishWorkout(null, { endedEarly: true });
    const [record] = store.getSnapshot().history;
    const weights = record!.entries.flatMap((entry) =>
      entry.sets.filter((set) => set.kind === 'working').map((set) => set.weight),
    );
    expect(weights).toEqual([95, 40]);
  });

  it('files an exercise swapped out after its warm-up as swapped, never as skipped', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const bench = entries(handle)[0]!;
    store.startWorkout();
    const ramps = bench.sets.filter((set) => set.kind === 'warmup').length;
    expect(ramps).toBeGreaterThan(0);
    await logOn(handle, bench.id, ramps, 95);
    await store.swapExercise(bench.id, 'dumbbell-bench-press');
    const stand = entries(handle).find((entry) => entry.exerciseId === 'dumbbell-bench-press')!;
    await logOn(handle, stand.id, 1, 40);
    const completion = await store.finishWorkout(null, { endedEarly: true });
    const [record] = store.getSnapshot().history;
    expect(record!.skippedExerciseIds).not.toContain('barbell-bench-press');
    expect(completion!.skipped).not.toContain('Barbell Bench Press');
  });
});

describe('a swap kept for a few weeks', () => {
  it('is kept, survives a reopen, and the next plan picks it', async () => {
    const { handle, clock } = await atGym();
    const { store } = handle;
    const bench = entries(handle)[0]!;
    await store.swapExercise(bench.id, 'dumbbell-bench-press', true);
    expect(store.getSnapshot().lastingSwaps).toEqual([
      expect.objectContaining({ from: 'barbell-bench-press', to: 'dumbbell-bench-press' }),
    ]);
    const reopened = createTestStore({
      factory: handle.factory,
      storage: handle.storage,
      now: clock.now,
    });
    await reopened.store.hydrate();
    expect(reopened.store.getSnapshot().lastingSwaps).toHaveLength(1);
    // Tomorrow's plan, built fresh, picks the dumbbells where the bench press would go.
    clock.advance(1);
    reopened.store.refreshSession();
    const ids = entries(reopened).map((entry) => entry.exerciseId);
    expect(ids).toContain('dumbbell-bench-press');
    expect(ids).not.toContain('barbell-bench-press');
  });

  it('is only for today unless kept', async () => {
    const { handle } = await atGym();
    await handle.store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press');
    expect(handle.store.getSnapshot().lastingSwaps).toEqual([]);
  });

  it('goes with the swap when the swap is undone, and stays when a later change is', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const bench = entries(handle)[0]!;
    await store.swapExercise(bench.id, 'dumbbell-bench-press', true);
    store.undoRecalibration();
    await store.flushPendingWork();
    expect(store.getSnapshot().lastingSwaps).toEqual([]);
    expect(entries(handle)[0]!.exerciseId).toBe('barbell-bench-press');

    await store.swapExercise(bench.id, 'dumbbell-bench-press', true);
    await store.setDurationChoice(45);
    store.undoRecalibration();
    await store.flushPendingWork();
    expect(store.getSnapshot().lastingSwaps).toHaveLength(1);
  });

  it('ends on Stop, and a plan not started goes back to its own pick', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    await store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press', true);
    await store.stopLastingSwap('barbell-bench-press');
    expect(store.getSnapshot().lastingSwaps).toEqual([]);
    expect(entries(handle)[0]!.exerciseId).toBe('barbell-bench-press');
  });

  it('keeps a swap made on a kept swap’s exercise for four weeks from then', async () => {
    const { handle, clock } = await atGym();
    const { store } = handle;
    await store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press', true);
    clock.advance(21);
    store.refreshSession();
    const lead = entries(handle)[0]!;
    expect(lead.exerciseId).toBe('dumbbell-bench-press');
    await store.swapExercise(lead.id, 'machine-chest-press', true);
    clock.advance(8);
    store.refreshSession();
    expect(entries(handle)[0]!.exerciseId).toBe('machine-chest-press');
  });

  it('reads as none after its four weeks', async () => {
    const { handle, clock } = await atGym();
    const { store } = handle;
    await store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press', true);
    clock.advance(SWAP_WEEKS * 7);
    store.refreshSession();
    expect(entries(handle).map((entry) => entry.exerciseId)).toContain('barbell-bench-press');
  });
});

// The independent review of Maintenance 22 (store): each case below failed before its fix.
describe('Undo and the kept swaps', () => {
  const pairs = (handle: TestStoreHandle) =>
    handle.store.getSnapshot().lastingSwaps.map((swap) => [swap.from, swap.to]);

  it('puts the kept swaps back as they were when a swap of a swap is undone', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const bench = entries(handle)[0]!;
    await store.swapExercise(bench.id, 'dumbbell-bench-press', true);
    await store.swapExercise(bench.id, 'machine-chest-press', true);
    expect(pairs(handle)).toEqual([['barbell-bench-press', 'machine-chest-press']]);
    await store.undoRecalibration();
    expect(pairs(handle)).toEqual([['barbell-bench-press', 'dumbbell-bench-press']]);
  });

  it('ends a kept swap when the plan’s own pick is kept, and Undo brings it back', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const bench = entries(handle)[0]!;
    await store.swapExercise(bench.id, 'dumbbell-bench-press', true);
    await store.swapExercise(bench.id, 'barbell-bench-press', true);
    expect(pairs(handle)).toEqual([]);
    await store.undoRecalibration();
    expect(pairs(handle)).toEqual([['barbell-bench-press', 'dumbbell-bench-press']]);
  });

  it('keeps a swap made on a swapped-in exercise for the plan’s own pick', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const bench = entries(handle)[0]!;
    await store.swapExercise(bench.id, 'dumbbell-bench-press');
    await store.swapExercise(bench.id, 'machine-chest-press', true);
    expect(pairs(handle)).toEqual([['barbell-bench-press', 'machine-chest-press']]);
  });

  it('takes the kept swap back after the app is reopened', async () => {
    const { handle, clock } = await atGym();
    await handle.store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press', true);
    const reopened = createTestStore({
      factory: handle.factory,
      storage: handle.storage,
      now: clock.now,
    });
    await reopened.store.hydrate();
    await reopened.store.undoRecalibration();
    expect(pairs(reopened)).toEqual([]);
    expect(entries(reopened)[0]!.exerciseId).toBe('barbell-bench-press');
  });

  it('takes the kept swap back after a change that failed', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const [bench, incline] = entries(handle);
    store.startWorkout();
    const ramps = bench!.sets.filter((set) => set.kind === 'warmup').length;
    await logOn(handle, bench!.id, ramps + 1, 95);
    await store.swapExercise(incline!.id, 'incline-barbell-bench-press', true);
    expect(pairs(handle)).toHaveLength(1);
    // Refused: the bench press has sets logged, so it cannot be skipped whole.
    const refused = await store.recalibrate({ type: 'skip', entryId: bench!.id });
    expect(refused?.ok).toBe(false);
    await store.undoRecalibration();
    expect(pairs(handle)).toEqual([]);
  });

  it('takes the kept swap back when Undo comes the moment the swap lands', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const bench = entries(handle)[0]!;
    const pending = store.swapExercise(bench.id, 'dumbbell-bench-press', true);
    await vi.waitFor(() => expect(entries(handle)[0]!.exerciseId).toBe('dumbbell-bench-press'));
    await store.undoRecalibration();
    await pending;
    await store.flushPendingWork();
    expect(pairs(handle)).toEqual([]);
    const reopened = createTestStore({ factory: handle.factory, storage: handle.storage });
    await reopened.store.hydrate();
    expect(pairs(reopened)).toEqual([]);
  });

  it('takes back only its own kept swap, never one stopped on the Plan tab since', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const [bench, incline] = entries(handle);
    store.startWorkout();
    await store.swapExercise(bench!.id, 'dumbbell-bench-press', true);
    await store.swapExercise(incline!.id, 'incline-barbell-bench-press', true);
    expect(pairs(handle)).toHaveLength(2);
    await store.stopLastingSwap('barbell-bench-press');
    await store.undoRecalibration();
    expect(pairs(handle)).toEqual([]);
    expect(entries(handle)[1]!.exerciseId).toBe('incline-dumbbell-press');
  });

  it('keeps both of two swaps kept one right after the other', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const [bench, incline] = entries(handle);
    const first = store.swapExercise(bench!.id, 'dumbbell-bench-press', true);
    const second = store.swapExercise(incline!.id, 'incline-barbell-bench-press', true);
    await Promise.all([first, second]);
    expect(pairs(handle).map(([from]) => from)).toEqual([
      'barbell-bench-press',
      'incline-dumbbell-press',
    ]);
  });

  it('takes both of two Stops pressed together', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const [bench, incline] = entries(handle);
    await store.swapExercise(bench!.id, 'dumbbell-bench-press', true);
    await store.swapExercise(incline!.id, 'incline-barbell-bench-press', true);
    expect(pairs(handle)).toHaveLength(2);
    await Promise.all([
      store.stopLastingSwap('barbell-bench-press'),
      store.stopLastingSwap('incline-dumbbell-press'),
    ]);
    expect(pairs(handle)).toEqual([]);
    const reopened = createTestStore({ factory: handle.factory, storage: handle.storage });
    await reopened.store.hydrate();
    expect(pairs(reopened)).toEqual([]);
  });

  it('says so when keeping a swap cannot be saved, and keeps nothing', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const bench = entries(handle)[0]!;
    vi.spyOn(
      store as unknown as { writeSwaps: (swaps: readonly LastingSwap[]) => Promise<void> },
      'writeSwaps',
    ).mockRejectedValueOnce(new Error('disk full'));
    await expect(store.swapExercise(bench.id, 'dumbbell-bench-press', true)).rejects.toThrow(
      /keeping it for four weeks could not be saved/,
    );
    expect(pairs(handle)).toEqual([]);
    // The swap itself stands, and its Undo carries no kept swap.
    expect(entries(handle)[0]!.exerciseId).toBe('dumbbell-bench-press');
    expect(store.getSnapshot().session!.previous?.swapsBefore).toBeUndefined();
  });
});

// The fourth review of Maintenance 22: each case below failed before its fix.
describe('Undo never loses or misfiles a logged set', () => {
  /** Logs one set at the given index as lifted, with its own target reps. */
  async function lift(handle: TestStoreHandle, entryId: string, setIndex: number, weight: number) {
    const entry = entries(handle).find((candidate) => candidate.id === entryId)!;
    const set = entry.sets.find((candidate) => candidate.index === setIndex)!;
    await handle.store.logSet(entryId, setIndex, {
      weight,
      reps: set.targetReps[0],
      rir: set.targetRir,
    });
  }
  const undoable = (handle: TestStoreHandle) => undoAvailable(handle.store.getSnapshot().session!);

  it('is offered while every logged set keeps its place and its exercise', async () => {
    const { handle } = await atGym();
    const [bench, incline] = entries(handle);
    handle.store.startWorkout();
    await handle.store.swapExercise(incline!.id, 'incline-barbell-bench-press');
    const first = bench!.sets[0]!;
    await lift(handle, bench!.id, first.index, first.targetWeight ?? 45);
    expect(undoable(handle)).toBe(true);
  });

  it('is not offered once a set is lifted on an exercise a swap renamed in place', async () => {
    const { handle } = await atGym();
    const incline = entries(handle)[1]!;
    handle.store.startWorkout();
    await handle.store.swapExercise(incline.id, 'incline-barbell-bench-press');
    const renamed = entries(handle).find((entry) => entry.id === incline.id)!;
    expect(renamed.exerciseId).toBe('incline-barbell-bench-press');
    const working = renamed.sets.find((set) => set.kind === 'working')!;
    await lift(handle, incline.id, working.index, 135);
    expect(undoable(handle)).toBe(false);
  });

  it('is not offered once a set a change added is lifted', async () => {
    const { handle } = await atGym();
    const bench = entries(handle)[0]!;
    handle.store.startWorkout();
    const added = await handle.store.recalibrate({
      type: 'sets',
      entryId: bench.id,
      workingDelta: 1,
    });
    expect(added?.ok).toBe(true);
    const working = entries(handle)
      .find((entry) => entry.id === bench.id)!
      .sets.filter((set) => set.kind === 'working');
    await lift(handle, bench.id, working[working.length - 1]!.index, 777);
    expect(undoable(handle)).toBe(false);
  });

  it('is not offered once a set is lifted on the sets a place gave back', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const bench = entries(handle)[0]!;
    store.startWorkout();
    const ramps = bench.sets.filter((set) => set.kind === 'warmup').length;
    await logOn(handle, bench.id, ramps + 1, 135);
    await store.setCurrentLocation('home');
    expect(isStopped(entries(handle).find((entry) => entry.id === bench.id)!)).toBe(true);
    await store.setCurrentLocation('gym');
    const reopened = entries(handle).find((entry) => entry.id === bench.id)!;
    expect(isStopped(reopened)).toBe(false);
    const keys = doneKeys(store.getSnapshot().session!.completed);
    const next = reopened.sets.find(
      (set) => set.kind === 'working' && !keys.has(`${bench.id}:${set.index}`),
    )!;
    await lift(handle, bench.id, next.index, 555);
    expect(undoable(handle)).toBe(false);
  });

  it('is not offered once a set is lifted on a row a place change gave another exercise', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const before = new Map(entries(handle).map((entry) => [entry.id, entry.exerciseId]));
    store.startWorkout();
    const first = entries(handle)[0]!;
    await lift(handle, first.id, first.sets[0]!.index, first.sets[0]!.targetWeight ?? 45);
    await store.setCurrentLocation('home');
    const renamed = entries(handle).find(
      (entry) =>
        entry.id !== first.id && before.has(entry.id) && before.get(entry.id) !== entry.exerciseId,
    )!;
    const working = renamed.sets.find((set) => set.kind === 'working')!;
    await lift(handle, renamed.id, working.index, 33);
    expect(undoable(handle)).toBe(false);
  });
});

describe('a kept swap whose save fails', () => {
  const shown = (handle: TestStoreHandle) =>
    handle.store
      .getSnapshot()
      .lastingSwaps.map((swap) => `${swap.from}>${swap.to}`)
      .sort();
  async function saved(handle: TestStoreHandle): Promise<string[]> {
    const reopened = createTestStore({ factory: handle.factory, storage: handle.storage });
    await reopened.store.hydrate();
    return shown(reopened);
  }
  type Internals = { writeSwaps: (swaps: readonly LastingSwap[]) => Promise<void> };
  /**
   * Holds the next save until released. `fail`: it then fails; `landed`: it is written, then its
   * check fails; `ok`: it is written. Resolves once that save has begun.
   */
  async function holdNextSave(
    handle: TestStoreHandle,
    then: 'fail' | 'landed' | 'ok',
    begin: () => Promise<unknown>,
  ): Promise<{
    release: () => void;
    pending: Promise<string>;
    spy: MockInstance<Internals['writeSwaps']>;
  }> {
    const internals = handle.store as unknown as Internals;
    const write = internals.writeSwaps.bind(handle.store);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi.spyOn(internals, 'writeSwaps').mockImplementationOnce(async (swaps) => {
      await gate;
      if (then !== 'fail') await write(swaps);
      if (then !== 'ok') throw new Error('disk full');
    });
    const pending = outcome(begin());
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    return { release, pending, spy };
  }
  const outcome = (pending: Promise<unknown>) =>
    pending.then(
      () => 'resolved',
      (error: Error) => error.message,
    );
  const FAILED = 'The swap is made, but keeping it for four weeks could not be saved.';
  const BENCH = 'barbell-bench-press>dumbbell-bench-press';
  const INCLINE = 'incline-dumbbell-press>incline-barbell-bench-press';

  it('shows a keep only once it is saved', async () => {
    const { handle } = await atGym();
    const { release, pending } = await holdNextSave(handle, 'ok', () =>
      handle.store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press', true),
    );
    expect(shown(handle)).toEqual([]);
    release();
    expect(await pending).toBe('resolved');
    expect({ shown: shown(handle), saved: await saved(handle) }).toEqual({
      shown: [BENCH],
      saved: [BENCH],
    });
  });

  it('takes back nothing else: a keep made while it was saving is kept', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const [bench, incline] = entries(handle);
    const { release, pending } = await holdNextSave(handle, 'fail', () =>
      store.swapExercise(bench!.id, 'dumbbell-bench-press', true),
    );
    const second = outcome(store.swapExercise(incline!.id, 'incline-barbell-bench-press', true));
    release();
    expect(await pending).toBe(FAILED);
    expect(await second).toBe('resolved');
    expect({ shown: shown(handle), saved: await saved(handle) }).toEqual({
      shown: [INCLINE],
      saved: [INCLINE],
    });
    // Undo of the second swap takes its own keep back, and only that.
    await store.undoRecalibration();
    await store.flushPendingWork();
    expect(entries(handle)[1]!.exerciseId).toBe('incline-dumbbell-press');
    expect({ shown: shown(handle), saved: await saved(handle) }).toEqual({ shown: [], saved: [] });
  });

  it('keeps a Stop made while it was saving', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const [bench, incline] = entries(handle);
    await store.swapExercise(incline!.id, 'incline-barbell-bench-press', true);
    const { release, pending } = await holdNextSave(handle, 'fail', () =>
      store.swapExercise(bench!.id, 'dumbbell-bench-press', true),
    );
    const stop = outcome(store.stopLastingSwap('incline-dumbbell-press'));
    release();
    expect(await pending).toBe(FAILED);
    expect(await stop).toBe('resolved');
    expect({ shown: shown(handle), saved: await saved(handle) }).toEqual({ shown: [], saved: [] });
  });

  it('counts a save that landed as saved, though its check then failed', async () => {
    const { handle } = await atGym();
    const { release, pending } = await holdNextSave(handle, 'landed', () =>
      handle.store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press', true),
    );
    release();
    expect(await pending).toBe('resolved');
    expect({ shown: shown(handle), saved: await saved(handle) }).toEqual({
      shown: [BENCH],
      saved: [BENCH],
    });
  });

  it('says nothing, and keeps nothing, when the swap is undone while its keep fails', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const { release, pending } = await holdNextSave(handle, 'fail', () =>
      store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press', true),
    );
    const undo = outcome(store.undoRecalibration());
    release();
    expect(await pending).toBe('resolved');
    expect(await undo).toBe('resolved');
    expect(entries(handle)[0]!.exerciseId).toBe('barbell-bench-press');
    expect({ shown: shown(handle), saved: await saved(handle) }).toEqual({ shown: [], saved: [] });
  });

  it('takes the keep back when the swap is undone while its keep is being saved', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const { release, pending } = await holdNextSave(handle, 'ok', () =>
      store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press', true),
    );
    await store.undoRecalibration();
    release();
    expect(await pending).toBe('resolved');
    await store.flushPendingWork();
    expect(entries(handle)[0]!.exerciseId).toBe('barbell-bench-press');
    expect({ shown: shown(handle), saved: await saved(handle) }).toEqual({ shown: [], saved: [] });
  });

  it('writes nothing for a keep whose swap was undone before its turn', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const [bench, incline] = entries(handle);
    await store.swapExercise(incline!.id, 'incline-barbell-bench-press', true);
    // A Stop is saving; the swap and its keep come next, and Undo comes before the keep's turn.
    const { release, spy } = await holdNextSave(handle, 'ok', () =>
      store.stopLastingSwap('incline-dumbbell-press'),
    );
    const keep = outcome(store.swapExercise(bench!.id, 'dumbbell-bench-press', true));
    await vi.waitFor(() => expect(entries(handle)[0]!.exerciseId).toBe('dumbbell-bench-press'));
    await store.undoRecalibration();
    release();
    expect(await keep).toBe('resolved');
    await store.flushPendingWork();
    expect(spy).toHaveBeenCalledTimes(1);
    expect({ shown: shown(handle), saved: await saved(handle) }).toEqual({ shown: [], saved: [] });
  });

  it('with every save failing, shows what is saved whatever comes next', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const bench = entries(handle)[0]!;
    const { release, pending, spy } = await holdNextSave(handle, 'fail', () =>
      store.swapExercise(bench.id, 'dumbbell-bench-press', true),
    );
    spy.mockRejectedValue(new Error('disk full'));
    // Kept again as another exercise while the first keep is saving: the first is no longer in.
    const second = outcome(store.swapExercise(bench.id, 'machine-chest-press', true));
    await vi.waitFor(() => expect(entries(handle)[0]!.exerciseId).toBe('machine-chest-press'));
    release();
    expect(await pending).toBe('resolved');
    expect(await second).toBe(FAILED);
    // Undo and Stop find nothing kept to take back.
    expect(await outcome(store.undoRecalibration())).toBe('resolved');
    expect(await outcome(store.stopLastingSwap('barbell-bench-press'))).toBe('resolved');
    await store.flushPendingWork();
    expect({ shown: shown(handle), saved: await saved(handle) }).toEqual({ shown: [], saved: [] });
  });
});

// The fifth review of Maintenance 22: each case below failed before its fix.
describe('Undo and a new length', () => {
  it('is not offered once a set is lifted where the new length made a warm-up a working set', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    const planned = entries(handle)[0]!;
    await store.setDurationChoice(30);
    const lead = entries(handle).find((entry) => entry.id === planned.id)!;
    const first = lead.sets.find((set) => set.kind === 'working')!;
    expect(planned.sets.find((set) => set.index === first.index)?.kind).toBe('warmup');
    store.startWorkout();
    for (const set of lead.sets.filter((candidate) => candidate.index <= first.index)) {
      await store.logSet(lead.id, set.index, {
        weight: set.kind === 'working' ? 135 : set.targetWeight,
        reps: set.targetReps[0],
        rir: set.targetRir,
      });
    }
    expect(undoAvailable(store.getSnapshot().session!)).toBe(false);
  });

  it('is not offered once a warm-up is lifted where the new length made a working set one', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    await store.setDurationChoice(30);
    const short = entries(handle)[0]!;
    await store.setDurationChoice('default');
    const lead = entries(handle).find((entry) => entry.id === short.id)!;
    const ramps = lead.sets.filter((set) => set.kind === 'warmup');
    expect(
      ramps.some((set) => short.sets.find((c) => c.index === set.index)?.kind === 'working'),
    ).toBe(true);
    store.startWorkout();
    for (const set of ramps) {
      await store.logSet(lead.id, set.index, {
        weight: set.targetWeight,
        reps: set.targetReps[0],
        rir: set.targetRir,
      });
    }
    expect(undoAvailable(store.getSnapshot().session!)).toBe(false);
  });
});

describe('"Why this workout" and the kept swaps', () => {
  const KEPT = 'Dumbbell Bench Press in place of Barbell Bench Press, the swap you chose to keep.';
  const reasons = (handle: TestStoreHandle) =>
    handle.store.getSnapshot().session!.workout.explanation.reasons;

  it('drops the line once the exercise swapped in is swapped away for today', async () => {
    const { handle, clock } = await atGym();
    const { store } = handle;
    await store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press', true);
    clock.advance(1);
    store.refreshSession();
    const lead = entries(handle)[0]!;
    expect(lead.exerciseId).toBe('dumbbell-bench-press');
    expect(reasons(handle)).toContain(KEPT);
    await store.swapExercise(lead.id, 'machine-chest-press');
    expect(reasons(handle)).not.toContain(KEPT);
    // The lifter's own pick today: a rebuild names no kept swap for it either.
    expect((await store.setDurationChoice(45))?.ok).toBe(true);
    expect(
      reasons(handle).filter((line) => / in place of .+, (the swap|which you)/.test(line)),
    ).toEqual([]);
  });

  it('drops the line when the swap is stopped during the workout, which keeps its exercises', async () => {
    const { handle, clock } = await atGym();
    const { store } = handle;
    await store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press', true);
    clock.advance(1);
    store.refreshSession();
    store.startWorkout();
    expect(reasons(handle)).toContain(KEPT);
    await store.stopLastingSwap('barbell-bench-press');
    expect(entries(handle)[0]!.exerciseId).toBe('dumbbell-bench-press');
    expect(reasons(handle)).not.toContain(KEPT);
  });

  it('never credits the kept swap for a pick the plan made on its own', async () => {
    const { handle, clock } = await atGym();
    const { store } = handle;
    await store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press', true);
    await store.setCurrentLocation('home');
    clock.advance(1);
    store.refreshSession();
    // At Home the barbell cannot be used: the dumbbells are the plan's own pick.
    const lead = entries(handle)[0]!;
    expect(lead.exerciseId).toBe('dumbbell-bench-press');
    expect(reasons(handle)).not.toContain(KEPT);
    store.startWorkout();
    const set = lead.sets[0]!;
    await store.logSet(lead.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[0],
      rir: set.targetRir,
    });
    expect((await store.setDurationChoice(45))?.ok).toBe(true);
    expect(reasons(handle)).not.toContain(KEPT);
  });
});

// The sixth review of Maintenance 22: each case below failed before its fix.
describe('a keep on the exercise a kept swap put in', () => {
  const kept = (handle: TestStoreHandle) =>
    handle.store.getSnapshot().lastingSwaps.map((swap) => [swap.from, swap.to]);
  /** Day two: the incline slot's own pick is kept out, and its swap-in is already in. */
  async function nextBestDay() {
    const { handle, clock } = await atGym();
    const { store } = handle;
    const [bench, incline] = entries(handle);
    await store.swapExercise(bench!.id, 'dumbbell-bench-press');
    await store.swapExercise(incline!.id, 'barbell-bench-press', true);
    expect(kept(handle)).toEqual([['incline-dumbbell-press', 'barbell-bench-press']]);
    clock.advance(1);
    store.refreshSession();
    const around = entries(handle)[1]!;
    expect(around.exerciseId).toBe('incline-barbell-bench-press');
    expect(around.standsFor).toBe('incline-dumbbell-press');
    return { handle, clock, around };
  }

  it('is kept for the plan’s own pick, and the next plan uses it', async () => {
    const { handle, clock, around } = await nextBestDay();
    await handle.store.swapExercise(around.id, 'machine-shoulder-press', true);
    expect(kept(handle)).toEqual([['incline-dumbbell-press', 'machine-shoulder-press']]);
    clock.advance(1);
    handle.store.refreshSession();
    expect(entries(handle)[1]!.exerciseId).toBe('machine-shoulder-press');
    expect(entries(handle).map((entry) => entry.exerciseId)).not.toContain(
      'incline-dumbbell-press',
    );
  });

  it('is kept for the plan’s own pick after a swap for today on that exercise', async () => {
    const { handle, around } = await nextBestDay();
    await handle.store.swapExercise(around.id, 'machine-shoulder-press');
    await handle.store.swapExercise(around.id, 'machine-chest-press', true);
    expect(kept(handle)).toEqual([['incline-dumbbell-press', 'machine-chest-press']]);
  });

  it('ends the kept swap when the plan’s own pick is kept back there', async () => {
    const { handle, around } = await nextBestDay();
    await handle.store.swapExercise(around.id, 'incline-dumbbell-press', true);
    expect(kept(handle)).toEqual([]);
  });
});

describe('the kept swap lines through Undo, a saved workout, and a swap back', () => {
  const KEPT = 'Dumbbell Bench Press in place of Barbell Bench Press, the swap you chose to keep.';
  const reasons = (handle: TestStoreHandle) =>
    handle.store.getSnapshot().session!.workout.explanation.reasons;
  async function keptSinceYesterday() {
    const { handle, clock } = await atGym();
    await handle.store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press', true);
    clock.advance(1);
    handle.store.refreshSession();
    expect(entries(handle)[0]!.exerciseId).toBe('dumbbell-bench-press');
    expect(reasons(handle)).toContain(KEPT);
    return handle;
  }

  it('Undo after a Stop does not bring back the stopped swap’s line', async () => {
    const handle = await keptSinceYesterday();
    const { store } = handle;
    store.startWorkout();
    expect((await store.setDurationChoice(45))?.ok).toBe(true);
    await store.stopLastingSwap('barbell-bench-press');
    await store.undoRecalibration();
    expect(reasons(handle)).not.toContain(KEPT);
  });

  it('a saved workout loaded after the Stop does not name the stopped swap', async () => {
    const handle = await keptSinceYesterday();
    const { store } = handle;
    const saved = await store.saveCurrentWorkout('Push day');
    await store.stopLastingSwap('barbell-bench-press');
    store.loadSavedWorkout(saved.id);
    expect(entries(handle)[0]!.exerciseId).toBe('dumbbell-bench-press');
    expect(reasons(handle)).not.toContain(KEPT);
  });

  it('swapping back to the kept swap’s exercise brings its line back', async () => {
    const handle = await keptSinceYesterday();
    const { store } = handle;
    const lead = entries(handle)[0]!;
    store.startWorkout();
    const ramps = lead.sets.filter((set) => set.kind === 'warmup').length;
    await logOn(handle, lead.id, ramps + 1, 40);
    await store.swapExercise(lead.id, 'machine-chest-press');
    expect(reasons(handle)).not.toContain(KEPT);
    const stand = entries(handle).find((entry) => entry.exerciseId === 'machine-chest-press')!;
    await store.swapExercise(stand.id, 'dumbbell-bench-press');
    expect(entries(handle).find((entry) => entry.id === lead.id)!.stopped).toBeUndefined();
    expect(reasons(handle)).toContain(KEPT);
  });
});

describe('a reload while a keep is saving', () => {
  it('ends with the Plan tab showing what is saved', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    type Internals = { writeSwaps: (swaps: readonly LastingSwap[]) => Promise<void> };
    const internals = store as unknown as Internals;
    const write = internals.writeSwaps.bind(store);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi.spyOn(internals, 'writeSwaps').mockImplementationOnce(async (swaps) => {
      await gate;
      await write(swaps);
    });
    const keep = store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press', true);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    // The reload reads the list before the keep lands, and finishes after it.
    const db = await store.getDatabase();
    const count = db.count.bind(db);
    let releaseCount!: () => void;
    const countGate = new Promise<void>((resolve) => {
      releaseCount = resolve;
    });
    const countSpy = vi.spyOn(db, 'count').mockImplementationOnce(async (name) => {
      await countGate;
      return count(name);
    });
    const getSpy = vi.spyOn(db, 'get');
    const reload = store.hydrate();
    await vi.waitFor(() => expect(countSpy).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(getSpy.mock.calls.some(([, key]) => key === 'lasting-swaps')).toBe(true),
    );
    release();
    await keep;
    releaseCount();
    await reload;
    await store.flushPendingWork();
    const shown = store.getSnapshot().lastingSwaps.map((swap) => `${swap.from}>${swap.to}`);
    const reopened = createTestStore({ factory: handle.factory, storage: handle.storage });
    await reopened.store.hydrate();
    const saved = reopened.store
      .getSnapshot()
      .lastingSwaps.map((swap) => `${swap.from}>${swap.to}`);
    expect({ shown, saved }).toEqual({
      shown: ['barbell-bench-press>dumbbell-bench-press'],
      saved: ['barbell-bench-press>dumbbell-bench-press'],
    });
  });
});

describe('Undo and a finished workout', () => {
  it('is not offered once the workout is finished, and takes nothing back', async () => {
    const { handle } = await atGym();
    const { store } = handle;
    store.startWorkout();
    expect((await store.setDurationChoice(45))?.ok).toBe(true);
    const lead = entries(handle)[0]!;
    await logOn(handle, lead.id, 1, 45);
    expect(undoAvailable(store.getSnapshot().session!)).toBe(true);
    await store.finishWorkout(null, { endedEarly: true });
    const finished = store.getSnapshot().session!;
    expect(undoAvailable(finished)).toBe(false);
    await store.undoRecalibration();
    expect(store.getSnapshot().session!.workout).toBe(finished.workout);
  });
});

// The final review of Maintenance 22: each case below failed before its fix.
describe('a kept swap’s exercise swapped today, and Undo', () => {
  const KEPT = 'Dumbbell Bench Press in place of Barbell Bench Press, the swap you chose to keep.';
  const swapLinesOf = (handle: TestStoreHandle) =>
    handle.store
      .getSnapshot()
      .session!.workout.explanation.reasons.filter(
        (line) =>
          line.endsWith(', the swap you chose to keep.') ||
          line.endsWith(', which you swapped out.'),
      );
  const kept = (handle: TestStoreHandle) =>
    handle.store.getSnapshot().lastingSwaps.map((swap) => [swap.from, swap.to]);
  async function keptSinceYesterday() {
    const { handle, clock } = await atGym();
    await handle.store.swapExercise(entries(handle)[0]!.id, 'dumbbell-bench-press', true);
    clock.advance(1);
    handle.store.refreshSession();
    const lead = entries(handle)[0]!;
    expect(lead.exerciseId).toBe('dumbbell-bench-press');
    expect(lead.standsFor).toBe('barbell-bench-press');
    expect(swapLinesOf(handle)).toEqual([KEPT]);
    return { handle, lead };
  }

  it('Undo of another keep there puts the kept swap and its line back', async () => {
    const { handle, lead } = await keptSinceYesterday();
    const { store } = handle;
    await store.swapExercise(lead.id, 'machine-chest-press', true);
    expect(kept(handle)).toEqual([['barbell-bench-press', 'machine-chest-press']]);
    await store.undoRecalibration();
    await store.flushPendingWork();
    expect(kept(handle)).toEqual([['barbell-bench-press', 'dumbbell-bench-press']]);
    expect(swapLinesOf(handle)).toEqual([KEPT]);
  });

  it('Undo of that keep made after a set was logged puts the line back too', async () => {
    const { handle, lead } = await keptSinceYesterday();
    const { store } = handle;
    store.startWorkout();
    const ramps = lead.sets.filter((set) => set.kind === 'warmup').length;
    await logOn(handle, lead.id, ramps + 1, 40);
    await store.swapExercise(lead.id, 'machine-chest-press', true);
    await store.undoRecalibration();
    await store.flushPendingWork();
    expect(kept(handle)).toEqual([['barbell-bench-press', 'dumbbell-bench-press']]);
    expect(swapLinesOf(handle)).toEqual([KEPT]);
  });

  it('kept away and kept back again, the kept swap keeps its line', async () => {
    const { handle, lead } = await keptSinceYesterday();
    const { store } = handle;
    store.startWorkout();
    const ramps = lead.sets.filter((set) => set.kind === 'warmup').length;
    await logOn(handle, lead.id, ramps + 1, 40);
    await store.swapExercise(lead.id, 'machine-chest-press', true);
    const stand = entries(handle).find((entry) => entry.exerciseId === 'machine-chest-press')!;
    await store.swapExercise(stand.id, 'dumbbell-bench-press', true);
    expect(kept(handle)).toEqual([['barbell-bench-press', 'dumbbell-bench-press']]);
    expect(swapLinesOf(handle)).toEqual([KEPT]);
  });

  it('Undo after keeping the plan’s own pick back restores the kept swap and its line', async () => {
    const { handle, lead } = await keptSinceYesterday();
    const { store } = handle;
    await store.swapExercise(lead.id, 'barbell-bench-press', true);
    expect(kept(handle)).toEqual([]);
    await store.undoRecalibration();
    await store.flushPendingWork();
    expect(kept(handle)).toEqual([['barbell-bench-press', 'dumbbell-bench-press']]);
    expect(swapLinesOf(handle)).toEqual([KEPT]);
  });

  it('a swap for today is saved as what today’s plan had', async () => {
    const { handle, lead } = await keptSinceYesterday();
    const { store } = handle;
    await store.swapExercise(lead.id, 'machine-chest-press');
    store.startWorkout();
    const machine = entries(handle)[0]!;
    const ramps = machine.sets.filter((set) => set.kind === 'warmup').length;
    await logOn(handle, machine.id, ramps + 1, 100);
    const completion = await store.finishWorkout(null, { endedEarly: true });
    expect(completion!.substitutions).toEqual(['Dumbbell Bench Press became Machine Chest Press']);
  });

  it('swapped away and straight back, it is today’s plan again, with its line', async () => {
    const { handle, lead } = await keptSinceYesterday();
    const { store } = handle;
    await store.swapExercise(lead.id, 'machine-chest-press');
    await store.swapExercise(lead.id, 'dumbbell-bench-press');
    expect(entries(handle)[0]!.replacedFrom).toBeUndefined();
    expect(swapLinesOf(handle)).toEqual([KEPT]);
    store.startWorkout();
    const back = entries(handle)[0]!;
    const ramps = back.sets.filter((set) => set.kind === 'warmup').length;
    await logOn(handle, back.id, ramps + 1, 40);
    const completion = await store.finishWorkout(null, { endedEarly: true });
    expect(completion!.substitutions).toEqual([]);
  });
});

describe('a saved workout from a day an exercise stopped', () => {
  it('loads fresh: nothing stopped, and the exercise that took over does all its sets', async () => {
    const { handle, clock } = await atGym();
    const { store } = handle;
    const bench = entries(handle)[0]!;
    const planned = bench.sets.filter((set) => set.kind === 'working').length;
    store.startWorkout();
    const ramps = bench.sets.filter((set) => set.kind === 'warmup').length;
    await logOn(handle, bench.id, ramps + 1, 95);
    await store.swapExercise(bench.id, 'dumbbell-bench-press');
    await store.finishWorkout(null, { endedEarly: true });
    const saved = await store.saveCurrentWorkout('Push day');
    store.dismissCompletion();
    clock.advance(1);
    store.refreshSession();
    store.loadSavedWorkout(saved.id);
    const loaded = entries(handle);
    expect(loaded.filter(isStopped)).toEqual([]);
    expect(loaded.map((entry) => entry.exerciseId)).not.toContain('barbell-bench-press');
    const dumbbells = loaded.find((entry) => entry.exerciseId === 'dumbbell-bench-press')!;
    expect(dumbbells.sets.filter((set) => set.kind === 'working')).toHaveLength(planned);
    const pinned = await store.recalibrate({ type: 'pin', entryId: dumbbells.id, pinned: true });
    expect(pinned?.ok ? 'ok' : pinned?.error).toBe('ok');
  });
});
