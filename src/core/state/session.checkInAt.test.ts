import { describe, expect, it } from 'vitest';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { RECORD_NOW } from '../../test/records';
import { createMemoryStorage } from '../storage/localSettings';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { SESSION_KEY, checkInDayOf, createSession, readSession, writeSession } from './session';

/**
 * The fourth review of Maintenance 33: the time a check-in was told (`checkInAt`) reads back after a
 * reload, and one that cannot be read is dropped alone, never the session or the check-in (a stored
 * field is optional, with a catch); with none, the check-in is the day's its session was made on
 * (`checkInDayOf`). Synthetic data only.
 */
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const TOLD = new Date(Date.parse(RECORD_NOW) + 3_600_000).toISOString();

function stored() {
  const workout = generateWorkout({
    profile: { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 },
    location: gym!,
    history: [],
    now: RECORD_NOW,
    duration: 'default',
  });
  const session = createSession('key', workout, RECORD_NOW);
  return {
    ...session,
    constraints: {
      ...session.constraints,
      readiness: {
        energy: 3,
        soreness: 2,
        sleep: 2,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
      },
      checkInAt: TOLD,
    },
  };
}

describe('the time a check-in was told, in the stored session', () => {
  it('reads back as it was saved', () => {
    const storage = createMemoryStorage();
    writeSession(stored(), storage);
    const read = readSession(storage)!;
    expect(read.constraints.checkInAt).toBe(TOLD);
    expect(checkInDayOf(read)).toBe(TOLD);
  });

  it('is dropped alone when it cannot be read, the check-in kept', () => {
    const storage = createMemoryStorage();
    writeSession(stored(), storage);
    const raw = JSON.parse(storage.getItem(SESSION_KEY)!) as {
      constraints: Record<string, unknown>;
    };
    raw.constraints.checkInAt = 'yesterday';
    storage.setItem(SESSION_KEY, JSON.stringify(raw));
    const read = readSession(storage);
    expect(read).not.toBeNull();
    expect(read?.constraints.checkInAt).toBeUndefined();
    expect(read?.constraints.readiness?.sleep).toBe(2);
    // With none, the day the session was made.
    expect(checkInDayOf(read!)).toBe(read!.createdAt);
  });
});
