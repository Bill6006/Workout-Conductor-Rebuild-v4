import { describe, expect, it } from 'vitest';
import { DELOAD_WEEK_ID } from '../../engine/planning/deload';
import { allEntries, workingSets } from '../../engine/workout/types';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import type { Identified } from '../storage/indexedDb';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

async function seeded() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

describe('deload week in the store', () => {
  it('plans a week, rebuilds the preview lighter when the week covers today, survives a reload, and cancels', async () => {
    const handle = await seeded();
    const before = handle.store.getSnapshot().session!;
    const benchBefore = allEntries(before.workout.blocks)[0]!;
    const setsBefore = workingSets(benchBefore).filter((set) => set.kind === 'working').length;

    // A window that covers today (TEST_NOW is 2026-09-02).
    await handle.store.planDeloadWeek({
      recommended: true,
      window: { startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-08T00:00:00.000Z' },
      reasons: ['8 sessions in the last 14 days.', 'Fatigue high (score 5).'],
    });
    const planned = handle.store.getSnapshot();
    expect(planned.deloadWeek?.startsAt).toBe('2026-09-01T00:00:00.000Z');
    expect(planned.session?.constraints.deload).toEqual({
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-09-08T00:00:00.000Z',
    });
    const first = allEntries(planned.session!.workout.blocks)[0]!;
    expect(workingSets(first).filter((set) => set.kind === 'working').length).toBe(setsBefore - 1);
    expect(planned.session?.workout.explanation.reasons.join(' ')).toMatch(/Deload week/);

    const db = await handle.store.getDatabase();
    expect(await db.get<Identified>('meta', DELOAD_WEEK_ID)).toBeDefined();
    const reopened = createTestStore({ factory: handle.factory, storage: handle.storage });
    await reopened.store.hydrate();
    expect(reopened.store.getSnapshot().deloadWeek?.endsAt).toBe('2026-09-08T00:00:00.000Z');

    await handle.store.cancelDeloadWeek();
    expect(handle.store.getSnapshot().deloadWeek).toBeNull();
    expect(handle.store.getSnapshot().session?.constraints.deload).toBeNull();
    expect(await db.get<Identified>('meta', DELOAD_WEEK_ID)).toBeUndefined();
  });

  it('drops a planned week that is already over when it loads', async () => {
    const handle = await seeded();
    const db = await handle.store.getDatabase();
    await db.put('meta', {
      id: DELOAD_WEEK_ID,
      startsAt: '2026-08-01T00:00:00.000Z',
      endsAt: '2026-08-08T00:00:00.000Z',
      plannedAt: '2026-07-31T00:00:00.000Z',
      reasons: [],
    });
    await handle.store.hydrate();
    expect(handle.store.getSnapshot().deloadWeek).toBeNull();
    await expect(
      handle.store.planDeloadWeek({ recommended: false, window: null, reasons: [] }),
    ).rejects.toThrow('No deload week is recommended');
  });
});

describe('a deload week that starts after today (Maintenance 24)', () => {
  it("leaves today's plan as it is, planned or cancelled", async () => {
    const handle = await seeded();
    const before = handle.store.getSnapshot().session!;
    await handle.store.planDeloadWeek({
      recommended: true,
      window: { startsAt: '2026-09-05T00:00:00.000Z', endsAt: '2026-09-12T00:00:00.000Z' },
      reasons: ['8 sessions in the last 14 days.'],
    });
    expect(handle.store.getSnapshot().session).toBe(before);
    await handle.store.cancelDeloadWeek();
    expect(handle.store.getSnapshot().session).toBe(before);
  });
});
