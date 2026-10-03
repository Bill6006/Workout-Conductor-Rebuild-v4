import { describe, expect, it } from 'vitest';
import { postponeBehind } from '../../engine/workout/sequence';
import { allEntries, type WorkoutBlock } from '../../engine/workout/types';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import type { AppStore } from './appStore';
import { doneKeys } from './session';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

/**
 * Maintenance 25, the owner's item 37, as the lifter meets it: Equipment busy moves the lift in
 * front behind the next exercise; once that one is done the busy lift is in front again and can
 * move again; at the end nothing is left to move it behind, and it is done or skipped.
 */

async function started() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  handle.store.startWorkout();
  return handle.store;
}

const session = (store: AppStore) => store.getSnapshot().session!;
const blockOf = (store: AppStore, entryId: string) =>
  session(store).workout.blocks.find((block) =>
    block.entries.some((entry) => entry.id === entryId),
  ) as WorkoutBlock;

/** Every set of a block logged, ramps skipped, as the lifter works through it. */
async function doBlock(store: AppStore, block: WorkoutBlock) {
  for (const entry of block.entries) store.skipWarmup(entry.id);
  for (const entry of block.entries) {
    const live = allEntries(session(store).workout.blocks).find((each) => each.id === entry.id)!;
    for (const set of live.sets.filter((each) => each.kind !== 'warmup')) {
      if (doneKeys(session(store).completed).has(`${live.id}:${set.index}`)) continue;
      await store.logSet(live.id, set.index, { weight: set.targetWeight, reps: 8, rir: 2 });
    }
  }
  store.skipRest();
}

describe('Equipment busy in a workout', () => {
  it('moves the lift in front later, brings it back after the next exercise, and never loses it', async () => {
    const store = await started();
    const bench = allEntries(session(store).workout.blocks)[0]!;
    const count = allEntries(session(store).workout.blocks).length;
    expect(session(store).completed.currentEntryId).toBe(bench.id);

    for (let round = 0; ; round += 1) {
      const isDone = (id: string, index: number) =>
        doneKeys(session(store).completed).has(`${id}:${index}`);
      if (!postponeBehind(session(store).workout, bench.id, isDone)) break;
      const result = await store.recalibrate({ type: 'equipment-busy', entryId: bench.id });
      expect(result?.ok).toBe(true);
      // The next exercise is in front now; the bench waits right behind it.
      const next = session(store).workout.blocks.find(
        (block) =>
          block !== blockOf(store, bench.id) &&
          block.entries.some((entry) => entry.id === session(store).completed.currentEntryId),
      ) as WorkoutBlock;
      expect(next).toBeDefined();
      const order = session(store).workout.blocks;
      expect(order.indexOf(blockOf(store, bench.id))).toBe(order.indexOf(next) + 1);
      await doBlock(store, next);
      // That one done, the bench is in front again.
      expect(session(store).completed.currentEntryId).toBe(bench.id);
      expect(allEntries(session(store).workout.blocks)).toHaveLength(count);
      expect(round).toBeLessThan(10);
    }
    // Last of the workout: nothing left to move it behind. Skip today still takes it out.
    expect(session(store).workout.blocks.at(-1)?.entries[0]?.id).toBe(bench.id);
    const skipped = await store.skipExercise(bench.id);
    expect(skipped.kind).toBe('removed');
    expect(
      allEntries(session(store).workout.blocks).some(
        (entry) => entry.exerciseId === bench.exerciseId,
      ),
    ).toBe(false);
  });

  it('says on the overlay which lift it moves later', async () => {
    const store = await started();
    const bench = allEntries(session(store).workout.blocks)[0]!;
    const titles: string[] = [];
    const stop = store.subscribe(() => {
      const calibration = store.getSnapshot().calibration;
      if (calibration.status === 'running') titles.push(calibration.title);
    });
    await store.recalibrate({ type: 'equipment-busy', entryId: bench.id });
    stop();
    expect(titles).toContain('Moving Barbell Bench Press later');
  });

  it('ends the move when the lift it gave way to is skipped, and never moves a lift begun (from the second review)', async () => {
    const store = await started();
    const bench = allEntries(session(store).workout.blocks)[0]!;
    await store.recalibrate({ type: 'equipment-busy', entryId: bench.id });
    const passed = session(store).workout.blocks[0]!.entries[0]!;
    await store.recalibrate({ type: 'skip', entryId: passed.id });
    // Skipped, the lift it gave way to is done with: the bench leads, its move over.
    expect(session(store).constraints.postponed).toEqual([]);
    expect(session(store).completed.currentEntryId).toBe(bench.id);
    store.skipWarmup(bench.id);
    const live = allEntries(session(store).workout.blocks).find((entry) => entry.id === bench.id)!;
    for (const set of live.sets.filter((each) => each.kind === 'working').slice(0, 2)) {
      await store.logSet(bench.id, set.index, { weight: set.targetWeight, reps: 8, rir: 2 });
    }
    await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 2,
        soreness: 3,
        sleep: 2,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
      },
    });
    // The bench under way stays the lift in front: nothing takes it from the lifter.
    expect(session(store).completed.currentEntryId).toBe(bench.id);
    expect(session(store).workout.blocks[0]!.entries.some((entry) => entry.id === bench.id)).toBe(
      true,
    );
  });

  it('keeps the move of a lift moved while under way through a rebuild (from the third review)', async () => {
    const store = await started();
    const bench = allEntries(session(store).workout.blocks)[0]!;
    store.skipWarmup(bench.id);
    const live = allEntries(session(store).workout.blocks).find((entry) => entry.id === bench.id)!;
    for (const set of live.sets.filter((each) => each.kind === 'working').slice(0, 2)) {
      await store.logSet(bench.id, set.index, { weight: set.targetWeight, reps: 8, rir: 2 });
    }
    // Someone takes the bench between sets: it waits behind the next exercise.
    await store.recalibrate({ type: 'equipment-busy', entryId: bench.id });
    const passed = session(store).workout.blocks[0]!.entries[0]!;
    expect(session(store).completed.currentEntryId).toBe(passed.id);
    await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 2,
        soreness: 3,
        sleep: 2,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
      },
    });
    // Its equipment is still taken: the lift that passed it stays in front.
    expect(session(store).completed.currentEntryId).toBe(passed.id);
    expect(session(store).constraints.postponed.map((item) => item.exerciseId)).toContain(
      bench.exerciseId,
    );
  });
});
