import { describe, expect, it } from 'vitest';
import { STRENGTH_MAXES_ID } from '../../engine/progression/maxes';
import { allEntries, workingSets, type WorkoutEntry } from '../../engine/workout/types';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import type { Identified } from '../storage/indexedDb';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

const BENCH = 'barbell-bench-press';

async function seeded() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

function benchOf(handle: ReturnType<typeof createTestStore>): WorkoutEntry {
  const session = handle.store.getSnapshot().session!;
  const entry = allEntries(session.workout.blocks).find(
    (candidate) => candidate.exerciseId === BENCH,
  );
  if (!entry) throw new Error('the default session has no bench press');
  return entry;
}

describe('entered maxes in the store', () => {
  it('starts a first-time bar lift at the empty bar, then from an entered max, keeps it across a reload, and snoozes the offer', async () => {
    const handle = await seeded();
    const before = benchOf(handle);
    expect(before.progression?.mode).toBe('start');
    expect(workingSets(before).find((set) => set.kind === 'working')?.targetWeight).toBe(45);
    expect(
      before.sets.filter((set) => set.kind === 'warmup').every((set) => set.targetWeight === 45),
    ).toBe(true);

    await handle.store.recordStrengthMax(BENCH, { kind: 'set', weight: 185, reps: 5 });
    const after = handle.store.getSnapshot();
    expect(after.strengthMaxes.maxes[BENCH]).toMatchObject({ e1rm: 215.8, units: 'lb' });
    const bench = benchOf(handle);
    // 215.8 max; 8 effective reps: 215.8 / 1.2667 = 170.4; 90% = 153.3 -> 155.
    expect(workingSets(bench).find((set) => set.kind === 'working')?.targetWeight).toBe(155);
    expect(bench.progression?.evidence.join(' ')).toMatch(
      /Your max for Barbell Bench Press: 215.8 lb/,
    );
    const ramps = bench.sets.filter((set) => set.kind === 'warmup').map((set) => set.targetWeight);
    expect(ramps.length).toBeGreaterThan(0);
    for (const ramp of ramps) {
      expect(ramp).not.toBeNull();
      expect(ramp as number).toBeGreaterThanOrEqual(45);
      expect(ramp as number).toBeLessThan(155);
    }
    expect(after.session?.lastSummary?.headline).toBe(
      'First target for Barbell Bench Press set from your max.',
    );

    const db = await handle.store.getDatabase();
    expect(await db.get<Identified>('meta', STRENGTH_MAXES_ID)).toBeDefined();
    const reopened = createTestStore({ factory: handle.factory, storage: handle.storage });
    await reopened.store.hydrate();
    expect(reopened.store.getSnapshot().strengthMaxes.maxes[BENCH]?.e1rm).toBe(215.8);

    await handle.store.snoozeMaxPrompt('back-squat', false);
    expect(handle.store.getSnapshot().strengthMaxes.prompts['back-squat']?.until).toBe(
      '2026-09-09T12:00:00.000Z',
    );
    await handle.store.snoozeMaxPrompt('deadlift', true);
    expect(handle.store.getSnapshot().strengthMaxes.prompts.deadlift).toEqual({ until: null });
    expect(await db.get<Identified>('meta', STRENGTH_MAXES_ID)).toMatchObject({
      prompts: { deadlift: { until: null } },
    });
  });

  it('leaves logged sets alone: a max entered after a working set waits for the next session', async () => {
    const handle = await seeded();
    const before = benchOf(handle);
    const firstWorking = before.sets.find((set) => set.kind === 'working')!;
    handle.store.startWorkout();
    handle.store.skipWarmup(before.id);
    await handle.store.logSet(before.id, firstWorking.index, { weight: 135, reps: 6, rir: 2 });

    await handle.store.recordStrengthMax(BENCH, { kind: 'max', e1rm: 250 });
    const session = handle.store.getSnapshot().session!;
    expect(session.lastSummary?.headline).toBe(
      'Barbell Bench Press already has logged sets; the next session starts from your max.',
    );
    const bench = benchOf(handle);
    // The remaining sets still follow the logged set, not the entered max.
    const remaining = workingSets(bench).filter(
      (set) => set.kind === 'working' && set.index > firstWorking.index,
    );
    for (const set of remaining) expect(set.targetWeight).not.toBe(200);
    expect(handle.store.getSnapshot().strengthMaxes.maxes[BENCH]?.e1rm).toBe(250);
  });
});
