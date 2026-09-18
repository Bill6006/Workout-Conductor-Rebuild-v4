import { describe, expect, it } from 'vitest';
import { allEntries } from '../../engine/workout/types';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

async function started() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  handle.store.startWorkout();
  return handle;
}

describe('a zero-rep log is a skip', () => {
  it('records it as skipped with no weight, and never feeds the engines', async () => {
    const handle = await started();
    const entry = allEntries(handle.store.getSnapshot().session!.workout.blocks)[0]!;
    const ramp = entry.sets.find((set) => set.kind === 'warmup')!;

    await handle.store.logSet(entry.id, ramp.index, { weight: 0, reps: 0, rir: 0 });
    const logged = handle.store
      .getSnapshot()
      .session!.completed.sets.find((set) => set.setIndex === ramp.index)!;
    expect(logged).toMatchObject({ skipped: true, reps: 0, weight: null, rir: null });

    // A zero-rep working set is a skip too, so in-session autoregulation never sees it.
    const first = entry.sets.find((set) => set.kind === 'working')!;
    handle.store.skipWarmup(entry.id);
    await handle.store.logSet(entry.id, first.index, { weight: 185, reps: 0, rir: 0 });
    const session = handle.store.getSnapshot().session!;
    expect(session.completed.sets.find((set) => set.setIndex === first.index)?.skipped).toBe(true);
    expect(session.log.some((item) => item.trigger === 'performance')).toBe(false);

    // A real set still logs as a set.
    const second = entry.sets.filter((set) => set.kind === 'working')[1]!;
    await handle.store.logSet(entry.id, second.index, { weight: 185, reps: 6, rir: 2 });
    expect(
      handle.store
        .getSnapshot()
        .session!.completed.sets.find((set) => set.setIndex === second.index),
    ).toMatchObject({ skipped: false, reps: 6, weight: 185 });
  });
});
