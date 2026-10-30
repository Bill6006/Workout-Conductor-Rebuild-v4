import { describe, expect, it } from 'vitest';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { RECORD_NOW } from '../../test/records';
import { createMemoryStorage } from '../storage/localSettings';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { SESSION_KEY, createSession, readSession, writeSession } from './session';

/**
 * The second review of Maintenance 33: the mark of a check-in told with a hard start in force
 * (`checkInAfterStart`) reads back after a reload, and one that cannot be read is dropped alone,
 * never the session (a stored field is optional, with a catch). Synthetic data only.
 */
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);

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
    constraints: { ...session.constraints, badStart: true, checkInAfterStart: true as const },
  };
}

describe('the mark of a check-in told after a hard start, in the stored session', () => {
  it('reads back as it was saved', () => {
    const storage = createMemoryStorage();
    writeSession(stored(), storage);
    expect(readSession(storage)?.constraints.checkInAfterStart).toBe(true);
  });

  it('is dropped alone when it cannot be read', () => {
    const storage = createMemoryStorage();
    writeSession(stored(), storage);
    const raw = JSON.parse(storage.getItem(SESSION_KEY)!) as {
      constraints: Record<string, unknown>;
    };
    raw.constraints.checkInAfterStart = 'yes';
    storage.setItem(SESSION_KEY, JSON.stringify(raw));
    const read = readSession(storage);
    expect(read).not.toBeNull();
    expect(read?.constraints.checkInAfterStart).toBeUndefined();
    expect(read?.constraints.badStart).toBe(true);
  });
});
