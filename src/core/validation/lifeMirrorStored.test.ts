import { describe, expect, it } from 'vitest';
import { readSession, writeSession } from '../state/session';
import type { KeyValueStorage } from '../storage/localSettings';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { LIFE_MIRROR_LINK_ID, parseLifeMirrorLink } from './lifeMirrorLink';
import { createDefaultLocations } from './location';
import { createDefaultProfile } from './profile';
import { WorkoutRecordSchema } from './workoutRecord';

/**
 * Item 48's stored fields: Life Mirror's stress and mood on a check-in, where each value came from,
 * and the switch. Each optional, each part that does not read dropped alone, the switch off unless
 * it reads on. Synthetic data only.
 */

const told = {
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};

function memory(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  } as KeyValueStorage;
}

describe('a check-in with Life Mirror’s', () => {
  it('reads back on the session, a value off the scale and a time that does not read dropped alone', async () => {
    const handle = createTestStore({ now: () => TEST_NOW });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      createDefaultProfile(TEST_NOW),
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const session = handle.store.getSnapshot().session!;
    const storage = memory();
    writeSession(
      {
        ...session,
        constraints: {
          ...session.constraints,
          readiness: { ...told, stress: 9, mood: 2, fromLifeMirror: { sleep: 'this morning' } },
        },
      },
      storage,
    );
    expect(readSession(storage)?.constraints.readiness).toEqual({ ...told, mood: 2 });
  });

  it('reads back on a saved workout, as it was told', () => {
    const saved = WorkoutRecordSchema.parse({
      ...record(0, 'back-squat', [[5, 225, 2]]),
      readiness: { ...told, stress: 4, mood: 'low', fromLifeMirror: { energy: TEST_NOW } },
    });
    expect(saved.readiness).toEqual({ ...told, stress: 4, fromLifeMirror: { energy: TEST_NOW } });
  });

  it('reads as before without any of them', () => {
    expect(
      WorkoutRecordSchema.parse({ ...record(0, 'back-squat', [[5, 225, 2]]), readiness: told })
        .readiness,
    ).toEqual(told);
  });
});

describe('the Life Mirror switch as stored', () => {
  it('is off unless it reads on', () => {
    expect(parseLifeMirrorLink({ id: LIFE_MIRROR_LINK_ID })?.on).toBe(false);
    expect(parseLifeMirrorLink({ id: LIFE_MIRROR_LINK_ID, on: 'yes' })?.on).toBe(false);
    expect(parseLifeMirrorLink({ id: LIFE_MIRROR_LINK_ID, on: true })?.on).toBe(true);
  });
});
