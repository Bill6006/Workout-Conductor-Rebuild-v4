import { describe, expect, it } from 'vitest';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import { RECORD_NOW } from '../../test/records';
import { createMemoryStorage } from '../storage/localSettings';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { parseSavedWorkouts } from '../validation/savedWorkout';
import { SESSION_KEY, createSession, readSession, writeSession } from './session';

/**
 * The twenty-third review of round M: a saved workout loaded keeps the day's own choices aside
 * (`dayChoices`), and a saved workout keeps the catch-up or second workout it was laid out for
 * (`catchUp`). Both are stored fields, optional with a catch: one that cannot be read is dropped
 * alone, never the session or the copy, each part of the day's choices alone too. Synthetic data
 * only.
 */
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [{ muscle: 'chest', sets: 3, minRir: 1, why: 'behind' }],
  sitOut: [],
};

const workout = () =>
  generateWorkout({
    profile: { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 },
    location: gym!,
    history: [],
    now: RECORD_NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });

function stored() {
  const session = createSession('key', workout(), RECORD_NOW);
  return {
    ...session,
    constraints: {
      ...session.constraints,
      catchUp: spec,
      dayChoices: {
        catchUp: spec,
        fullSession: true,
        emptied: [{ offer: 'catch-up:chest', layout: 'catch-up' }],
      },
    },
  };
}

describe('the day’s choices a saved workout loaded keeps aside', () => {
  it('read back as they were saved', () => {
    const storage = createMemoryStorage();
    writeSession(stored(), storage);
    expect(readSession(storage)?.constraints.dayChoices).toEqual(stored().constraints.dayChoices);
  });

  it('drop each part they cannot read alone, and the whole where it is no record', () => {
    const storage = createMemoryStorage();
    writeSession(stored(), storage);
    const raw = JSON.parse(storage.getItem(SESSION_KEY)!) as {
      constraints: Record<string, unknown>;
    };
    raw.constraints.dayChoices = {
      catchUp: { kind: 'a kind from a later copy' },
      fullSession: 'yes',
      emptied: [{ offer: 'catch-up:chest', layout: 'catch-up' }, { layout: 3 }],
    };
    storage.setItem(SESSION_KEY, JSON.stringify(raw));
    const read = readSession(storage);
    expect(read?.constraints.catchUp).toEqual(spec);
    expect(read?.constraints.dayChoices).toEqual({
      emptied: [{ offer: 'catch-up:chest', layout: 'catch-up' }],
    });
    raw.constraints.dayChoices = 'not a record';
    storage.setItem(SESSION_KEY, JSON.stringify(raw));
    const again = readSession(storage);
    expect(again).not.toBeNull();
    expect(again?.constraints.dayChoices).toBeUndefined();
  });
});

describe('the catch-up a saved workout was laid out for', () => {
  const copy = {
    id: 'saved-1',
    name: 'Catch-up',
    createdAt: RECORD_NOW,
    locationId: 'gym',
    duration: 'default',
    workout: workout(),
  };

  it('reads back as it was saved', () => {
    const [read] = parseSavedWorkouts([{ ...copy, catchUp: spec }]);
    expect(read?.catchUp).toEqual(spec);
  });

  it('is dropped alone where it cannot be read, the copy kept', () => {
    const [read] = parseSavedWorkouts([{ ...copy, catchUp: { kind: 'a kind from a later copy' } }]);
    expect(read?.name).toBe('Catch-up');
    expect(read?.catchUp).toBeUndefined();
  });
});
