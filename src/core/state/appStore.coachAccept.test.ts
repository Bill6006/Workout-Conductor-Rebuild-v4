import { describe, expect, it } from 'vitest';
import { acceptKey, setAsideKey } from '../../engine/coach/coachConductor';
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

    // Not now on the open-workout card lasts for this session; every other card keeps the longer memory.
    await store.dismissCoachSignal({ source: 'unfinished workout' });
    expect(store.getSnapshot().session?.coachAccepted).toContain('unfinished workout');
    expect(store.getSnapshot().coachDeclines.declines).toEqual({});
    await store.dismissCoachSignal({ source: 'extra set', exerciseId: 'cable-fly' });
    expect(Object.keys(store.getSnapshot().coachDeclines.declines)).toEqual([
      'extra set|cable-fly',
    ]);

    // Not now on a safety card sets that worry aside for this workout, and records no decline.
    const safety = { source: 'session pain', domain: 'safety', concern: 'shoulder' } as const;
    await store.dismissCoachSignal(safety);
    expect(store.getSnapshot().session?.coachAccepted).toContain(setAsideKey(safety));
    expect(Object.keys(store.getSnapshot().coachDeclines.declines)).toEqual([
      'extra set|cable-fly',
    ]);
    expect(readSession(handle.storage)?.coachAccepted).toContain(setAsideKey(safety));

    // Not now on a card with nothing to tap sets that note aside for this workout: no decline.
    const note = { source: 'stall: route', exerciseId: 'barbell-bench-press', action: null };
    await store.dismissCoachSignal(note);
    expect(setAsideKey(note)).toBe('set aside|stall: route|barbell-bench-press');
    expect(store.getSnapshot().session?.coachAccepted).toContain(setAsideKey(note));
    expect(Object.keys(store.getSnapshot().coachDeclines.declines)).toEqual([
      'extra set|cable-fly',
    ]);
    expect(readSession(handle.storage)?.coachAccepted).toContain(setAsideKey(note));
  });
});
