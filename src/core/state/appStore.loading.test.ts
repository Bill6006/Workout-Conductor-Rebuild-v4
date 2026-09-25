import { describe, expect, it } from 'vitest';
import { getExercise } from '../../catalog/exercises/catalog';
import { DUMBBELLS_KEY, PLATES_KEY } from '../../engine/loading/loading';
import { currentPosition } from '../../engine/workout/sequence';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';
import type { OutboxEntry } from '../storage/indexedDb';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

/**
 * Maintenance 12, round B: what a place can load reaches the targets. A
 * recorded set of dumbbells snaps and caps the loads, a plate missing today
 * widens the bar's step for the session, and the place's record syncs.
 */

async function seeded(): Promise<TestStoreHandle> {
  const handle = createTestStore({ minOverlayMs: 0 });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

function session(handle: TestStoreHandle) {
  const current = handle.store.getSnapshot().session;
  if (!current) throw new Error('no session');
  return current;
}

function entriesWithLoad(handle: TestStoreHandle, loads: readonly string[]): WorkoutEntry[] {
  return allEntries(session(handle).workout.blocks).filter((entry) =>
    loads.includes(getExercise(entry.exerciseId)?.load ?? ''),
  );
}

function workingWeights(entry: WorkoutEntry): number[] {
  return entry.sets
    .filter((set) => set.kind === 'working')
    .map((set) => set.targetWeight)
    .filter((weight): weight is number => weight !== null);
}

describe('what a place can load', () => {
  it('a recorded set of dumbbells snaps every dumbbell target onto it and caps the heaviest, pushing reps', async () => {
    const handle = await seeded();
    const { store } = handle;
    const before = entriesWithLoad(handle, ['dumbbell-each', 'kettlebell']);
    expect(before.length).toBeGreaterThan(0);
    const place = store.getSnapshot().profile?.currentLocationId;
    if (!place) throw new Error('no place');

    // A pair that only goes to 20: heavy enough to cap at least one target in the default plan.
    await store.saveLoading(place, DUMBBELLS_KEY, {
      kind: 'dumbbells',
      ranges: [{ from: 5, to: 20, step: 5 }],
    });
    const saved = store.getSnapshot().locations.find((candidate) => candidate.id === place);
    expect(saved?.loading[DUMBBELLS_KEY]).toMatchObject({ kind: 'dumbbells' });

    const after = entriesWithLoad(handle, ['dumbbell-each', 'kettlebell']);
    for (const entry of after) {
      for (const weight of workingWeights(entry)) {
        expect(weight).toBeLessThanOrEqual(20);
        expect(weight % 5).toBe(0);
      }
    }
    const capped = after.filter((entry) => entry.progression?.capped);
    for (const entry of capped) {
      expect(entry.progression?.capped).toEqual({ at: 20 });
      expect(entry.progression?.evidence.some((line) => /heaviest weight here/.test(line))).toBe(
        true,
      );
      const original = before.find((candidate) => candidate.id === entry.id);
      const first = entry.sets.find((set) => set.kind === 'working');
      const was = original?.sets.find((set) => set.kind === 'working');
      if (first && was) expect(first.targetReps[1]).toBeGreaterThanOrEqual(was.targetReps[1]);
    }
    // The place's record is mirrored like any other place change.
    const db = await store.getDatabase();
    const queued = (await db.getAll<OutboxEntry>('outbox')).map((entry) => entry.id);
    expect(queued).toContain(`locations|${place}`);
  });

  it('a plate missing today puts every bar target on the grid the rack can make, for this session only', async () => {
    const handle = await seeded();
    const { store } = handle;
    const bars = entriesWithLoad(handle, ['barbell', 'ez-bar', 'trap-bar', 'smith']);
    expect(bars.length).toBeGreaterThan(0);
    await store.setMissingPlates([2.5]);
    expect(session(handle).loading.missingPlates).toEqual([2.5]);
    for (const entry of entriesWithLoad(handle, ['barbell', 'ez-bar', 'trap-bar', 'smith'])) {
      const exercise = getExercise(entry.exerciseId);
      const bar = exercise?.barWeight?.lb ?? 45;
      for (const weight of workingWeights(entry)) {
        expect((weight - bar) % 10).toBe(0);
      }
    }
    // The place itself is untouched: nothing about the rack was recorded.
    const place = store.getSnapshot().profile?.currentLocationId;
    const saved = store.getSnapshot().locations.find((candidate) => candidate.id === place);
    expect(saved?.loading[PLATES_KEY]).toBeUndefined();
    // Putting the plate back restores the finer grid.
    await store.setMissingPlates([]);
    expect(session(handle).loading.missingPlates).toEqual([]);
  });

  it('a plate missing mid-exercise moves the sets to come, and the dial starts from them', async () => {
    const handle = await seeded();
    const { store } = handle;
    const [lift] = entriesWithLoad(handle, ['barbell']);
    if (!lift) throw new Error('no bar lift');
    store.startWorkout();
    // Every ramp and the first working set, the working one at 100.
    const firstWorking = lift.sets.findIndex((set) => set.kind === 'working');
    for (const set of lift.sets.slice(0, firstWorking + 1)) {
      await store.logSet(lift.id, set.index, {
        weight: set.kind === 'working' ? 100 : set.targetWeight,
        reps: 9,
        rir: 2,
      });
    }
    expect(session(handle).drafts[lift.id]?.weight).toBe(100);

    await store.setMissingPlates([2.5]);
    // 100 cannot be made without the 2.5s, so the dial does not start from it.
    expect(session(handle).drafts[lift.id]).toBeUndefined();
    const after = allEntries(session(handle).workout.blocks).find((entry) => entry.id === lift.id);
    const logged = session(handle).completed.sets.filter((set) => set.entryId === lift.id);
    expect(logged.map((set) => set.weight).at(-1)).toBe(100);
    for (const set of after?.sets ?? []) {
      if (set.kind !== 'working' || logged.some((done) => done.setIndex === set.index)) continue;
      const bar = getExercise(lift.exerciseId)?.barWeight?.lb ?? 45;
      expect(((set.targetWeight ?? bar) - bar) % 10).toBe(0);
    }
  });

  it('a change of place mid-exercise fits the sets to come there, and the dial drops a weight it cannot make', async () => {
    // A bodyweight, so the first dumbbell targets start past what home makes.
    const handle = createTestStore({ minOverlayMs: 0 });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const { store } = handle;
    // Home's dumbbells go to 20 lb, recorded from the gym: nothing in today's plan moves.
    await store.saveLoading('home', DUMBBELLS_KEY, {
      kind: 'dumbbells',
      ranges: [{ from: 5, to: 20, step: 5 }],
    });
    const lift = entriesWithLoad(handle, ['dumbbell-each']).find((entry) =>
      workingWeights(entry).some((weight) => weight > 20),
    );
    if (!lift) throw new Error('no dumbbell lift over 20 lb');
    store.startWorkout();
    const firstWorking = lift.sets.findIndex((set) => set.kind === 'working');
    for (const set of lift.sets.slice(0, firstWorking + 1)) {
      await store.logSet(lift.id, set.index, { weight: set.targetWeight, reps: 8, rir: 2 });
    }
    expect(session(handle).drafts[lift.id]?.weight).toBeGreaterThan(20);

    const profile = store.getSnapshot().profile;
    if (!profile) throw new Error('no profile');
    await store.saveProfile({ ...profile, currentLocationId: 'home' });
    // The dial no longer starts from a weight home cannot make, and the sets to come are there.
    expect(session(handle).drafts[lift.id]).toBeUndefined();
    const after = allEntries(session(handle).workout.blocks).find((entry) => entry.id === lift.id);
    expect(after?.stopped).toBeUndefined();
    const logged = session(handle).completed.sets.filter((set) => set.entryId === lift.id);
    const toCome = (after?.sets ?? []).filter(
      (set) => set.kind === 'working' && !logged.some((done) => done.setIndex === set.index),
    );
    expect(toCome.length).toBeGreaterThan(0);
    for (const set of toCome) expect(set.targetWeight).toBeLessThanOrEqual(20);
  });

  it('a ramp added and logged, then a move to the gym, is saved as a ramp', async () => {
    const handle = createTestStore({ minOverlayMs: 0 });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW, 'home'), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const { store } = handle;
    await store.saveLoading('home', DUMBBELLS_KEY, {
      kind: 'dumbbells',
      ranges: [{ from: 5, to: 20, step: 5 }],
    });
    store.startWorkout();
    const first = session(handle).completed.currentEntryId;
    if (!first) throw new Error('nothing in front');
    const entryNow = () => {
      const found = allEntries(session(handle).workout.blocks).find((entry) => entry.id === first);
      if (!found) throw new Error('no entry');
      return found;
    };
    await store.recalibrate({ type: 'add-warmup', entryId: first });
    const added = entryNow().sets[0];
    if (!added || added.kind !== 'warmup') throw new Error('no ramp added');
    await store.logSet(first, added.index, { weight: 10, reps: 5, rir: 5 });
    const profile = store.getSnapshot().profile;
    if (!profile) throw new Error('no profile');
    await store.saveProfile({ ...profile, currentLocationId: 'gym' });
    expect(entryNow().sets.find((set) => set.index === added.index)?.kind).toBe('warmup');
    // The lifter logs what the app puts in front of them until the lift is done.
    for (let guard = 0; guard < 12; guard += 1) {
      const now = session(handle);
      const keys = new Set(now.completed.sets.map((set) => `${set.entryId}:${set.setIndex}`));
      const position = currentPosition(now.workout, (id, index) => keys.has(`${id}:${index}`));
      if (!position || position.entryId !== first) break;
      await store.logSet(first, position.setIndex, {
        weight: position.set.targetWeight,
        reps: position.set.targetReps[1],
        rir: position.kind === 'warmup' ? 5 : 1,
      });
    }
    await store.finishWorkout(null, { endedEarly: true });
    const saved = store.getSnapshot().history.at(-1);
    const lift = saved?.entries.find((entry) => entry.exerciseId === entryNow().exerciseId);
    const workingSaved = (lift?.sets ?? []).filter((set) => set.kind === 'working');
    // Every working set saved was lifted as one: none is the 10 lb ramp.
    expect(workingSaved.map((set) => [set.weight, set.reps])).not.toContainEqual([10, 5]);
    expect(workingSaved).toHaveLength(
      entryNow().sets.filter((set) => set.kind === 'working').length,
    );
  });

  it('two ramps added and logged at a light home, then the gym: every ramp keeps a weight, and the workout is saved', async () => {
    const handle = createTestStore({ minOverlayMs: 0 });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW, 'home'), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const { store } = handle;
    await store.saveLoading('home', DUMBBELLS_KEY, {
      kind: 'dumbbells',
      ranges: [{ from: 5, to: 20, step: 5 }],
    });
    // A lift the light dumbbells push, with its ramps.
    const lift = allEntries(session(handle).workout.blocks).find(
      (entry) =>
        entry.sets.some((set) => set.kind === 'warmup' && set.targetWeight !== null) &&
        entry.sets.some((set) => set.kind === 'working' && set.asked !== undefined),
    );
    if (!lift) throw new Error('no pushed lift with ramps');
    store.startWorkout();
    const entryNow = () => {
      const found = allEntries(session(handle).workout.blocks).find(
        (entry) => entry.id === lift.id,
      );
      if (!found) throw new Error('no entry');
      return found;
    };
    await store.recalibrate({ type: 'add-warmup', entryId: lift.id });
    await store.recalibrate({ type: 'add-warmup', entryId: lift.id });
    const added = entryNow().sets.filter(
      (set) => set.kind === 'warmup' && set.targetWeight === null,
    );
    expect(added).toHaveLength(2);
    for (const ramp of added) {
      await store.logSet(lift.id, ramp.index, { weight: 5, reps: 8, rir: 5 });
    }
    const profile = store.getSnapshot().profile;
    if (!profile) throw new Error('no profile');
    await store.saveProfile({ ...profile, currentLocationId: 'gym' });
    for (const set of entryNow().sets) {
      expect(set.targetWeight === null || Number.isFinite(set.targetWeight)).toBe(true);
    }
    // The lifter logs every set still shown for the lift, as the logger fills it in.
    for (const set of entryNow().sets) {
      const done = session(handle).completed.sets.some(
        (one) => one.entryId === lift.id && one.setIndex === set.index,
      );
      if (done || set.kind === 'drop') continue;
      await store.logSet(lift.id, set.index, {
        weight: set.targetWeight,
        reps: set.targetReps[1],
        rir: set.kind === 'warmup' ? 5 : 1,
      });
    }
    await store.finishWorkout(null, { endedEarly: true });
    const inHistory = (history: { entries: { exerciseId: string }[] }[]) =>
      history.some((saved) => saved.entries.some((entry) => entry.exerciseId === lift.exerciseId));
    expect(inHistory(store.getSnapshot().history)).toBe(true);
    const again = createTestStore({ factory: handle.factory, storage: handle.storage });
    await again.store.hydrate();
    expect(inHistory(again.store.getSnapshot().history)).toBe(true);
  });

  it('forgetting a record puts the usual step back', async () => {
    const handle = await seeded();
    const { store } = handle;
    const place = store.getSnapshot().profile?.currentLocationId;
    if (!place) throw new Error('no place');
    await store.saveLoading(place, DUMBBELLS_KEY, {
      kind: 'dumbbells',
      ranges: [{ from: 5, to: 20, step: 5 }],
    });
    await store.saveLoading(place, DUMBBELLS_KEY, null);
    const saved = store.getSnapshot().locations.find((candidate) => candidate.id === place);
    expect(saved?.loading[DUMBBELLS_KEY]).toBeUndefined();
    const capped = entriesWithLoad(handle, ['dumbbell-each']).filter(
      (entry) => entry.progression?.capped,
    );
    expect(capped).toHaveLength(0);
  });
});
