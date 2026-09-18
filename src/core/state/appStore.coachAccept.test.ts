import { describe, expect, it } from 'vitest';
import { acceptKey } from '../../engine/coach/coachConductor';
import { allEntries } from '../../engine/workout/types';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { readSession } from './session';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

const offer = {
  source: 'strategy: coverage',
  headline: 'Triceps is under its weekly target',
} as const;

describe('an offer taken is remembered for the session', () => {
  it('records it once, keeps it through a recalibration, and saves it with the session', async () => {
    const handle = createTestStore({ minOverlayMs: 0 });
    const { store } = handle;
    await store.hydrate();
    await store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    expect(store.getSnapshot().session?.coachAccepted).toEqual([]);

    store.acceptCoachSignal(offer);
    store.acceptCoachSignal(offer);
    expect(store.getSnapshot().session?.coachAccepted).toEqual([acceptKey(offer)]);

    const session = store.getSnapshot().session;
    if (!session) throw new Error('no session');
    const entry = allEntries(session.workout.blocks)[1];
    if (!entry) throw new Error('no entry');
    const result = await store.recalibrate({ type: 'sets', entryId: entry.id, workingDelta: 1 });
    expect(result?.ok).toBe(true);
    expect(store.getSnapshot().session?.coachAccepted).toEqual([acceptKey(offer)]);

    const saved = readSession(handle.storage);
    expect(saved?.coachAccepted).toEqual([acceptKey(offer)]);
  });
});
