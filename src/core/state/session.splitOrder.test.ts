import { describe, expect, it } from 'vitest';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import type { SplitOrder } from '../../engine/workout/types';
import { RECORD_NOW } from '../../test/records';
import { createMemoryStorage } from '../storage/localSettings';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { SESSION_KEY, createSession, readSession, writeSession } from './session';

/**
 * Maintenance 38: the split's order kept with the plan reads back after a reload, and one that
 * cannot be read is dropped alone, never the session (a stored field is optional, with a catch): the
 * day then plans in the rotation's order. Synthetic data only.
 */
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const ORDER: SplitOrder = {
  days: [
    { day: '2026-09-10', templateId: 'lower', was: 'upper' },
    { day: '2026-09-11', templateId: 'upper', was: 'lower' },
  ],
  spared: ['quads', 'hamstrings'],
  fewer: ['biceps'],
};

function stored() {
  const workout = generateWorkout({
    profile: { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 },
    location: gym!,
    history: [],
    now: RECORD_NOW,
    duration: 'default',
  });
  const session = createSession('key', workout, RECORD_NOW);
  return { ...session, constraints: { ...session.constraints, splitOrder: ORDER } };
}

describe('the split’s order in the stored session', () => {
  it('reads back as it was saved', () => {
    const storage = createMemoryStorage();
    writeSession(stored(), storage);
    expect(readSession(storage)?.constraints.splitOrder).toEqual(ORDER);
  });

  it('is dropped alone when it cannot be read, the rest kept', () => {
    for (const broken of [
      { days: 'tuesday', spared: [], fewer: [] },
      { days: [], spared: ['elbows'], fewer: [] },
      { days: [], spared: [], fewer: ['elbows'] },
      { days: [], spared: [] },
      7,
    ]) {
      const storage = createMemoryStorage();
      writeSession(stored(), storage);
      const raw = JSON.parse(storage.getItem(SESSION_KEY)!) as {
        constraints: Record<string, unknown>;
      };
      raw.constraints.splitOrder = broken;
      storage.setItem(SESSION_KEY, JSON.stringify(raw));
      const read = readSession(storage);
      expect(read).not.toBeNull();
      expect(read?.constraints.splitOrder).toBeUndefined();
      expect(read?.workout.templateId).toBe(stored().workout.templateId);
    }
  });

  it('reads one saved before it as none', () => {
    const storage = createMemoryStorage();
    const { constraints, ...rest } = stored();
    const older = Object.fromEntries(
      Object.entries(constraints).filter(([key]) => key !== 'splitOrder'),
    ) as typeof constraints;
    writeSession({ ...rest, constraints: older }, storage);
    expect(readSession(storage)?.constraints.splitOrder).toBeUndefined();
  });
});
