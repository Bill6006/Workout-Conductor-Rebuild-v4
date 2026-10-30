import { describe, expect, it } from 'vitest';
import { COACH_SHOWN_ID, TOO_SOON_SOURCE } from '../../engine/coach/coachConductor';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 33, the owner's decision 5: the new coaching cards keep to one a day and three a week,
 * so the store remembers when each was first seen, in the meta store (a reload keeps it), one change
 * at a time. Only the new cards are remembered. Synthetic data only.
 */

const chest = { source: `${TOO_SOON_SOURCE}|chest|2026-08-31` };

describe('the new cards seen', () => {
  it('are remembered once, when first seen, and a reload keeps them', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.noteCoachShown(chest);
    const key = `${chest.source}|*`;
    expect(store.getSnapshot().coachShown.shown[key]).toBe(TEST_NOW);
    // Seen again later: the first time stands.
    await store.noteCoachShown(chest);
    expect(store.getSnapshot().coachShown.shown[key]).toBe(TEST_NOW);
    const db = await store.getDatabase();
    expect(await db.get('meta', COACH_SHOWN_ID)).toMatchObject({ shown: { [key]: TEST_NOW } });
    await store.hydrate();
    expect(store.getSnapshot().coachShown.shown[key]).toBe(TEST_NOW);
  });

  it('never an older card, and an unreadable entry is dropped, never the rest', async () => {
    const { store } = createTestStore();
    await store.hydrate();
    await store.noteCoachShown({ source: 'fatigue' });
    expect(store.getSnapshot().coachShown.shown).toEqual({});
    const db = await store.getDatabase();
    await db.put('meta', {
      id: COACH_SHOWN_ID,
      shown: { [`${chest.source}|*`]: TEST_NOW, odd: 7, worse: 'not a time' },
    });
    await store.hydrate();
    expect(store.getSnapshot().coachShown.shown).toEqual({ [`${chest.source}|*`]: TEST_NOW });
  });
});
