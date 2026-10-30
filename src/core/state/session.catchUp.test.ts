import { describe, expect, it } from 'vitest';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import { RECORD_NOW } from '../../test/records';
import { createMemoryStorage } from '../storage/localSettings';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { SESSION_KEY, createSession, readSession, writeSession } from './session';

/**
 * Maintenance 31: a session keeps the day's catch-up through a reload, and one that cannot be read
 * is dropped, never the session (a stored field is optional, with a catch).
 */
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [{ muscle: 'chest', sets: 3, minRir: 1, why: 'behind' }],
  sitOut: [],
};

function stored() {
  const workout = generateWorkout({
    profile: { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 },
    location: gym!,
    history: [],
    now: RECORD_NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  const session = createSession('key', workout, RECORD_NOW);
  return { ...session, constraints: { ...session.constraints, catchUp: spec, fullSession: true } };
}

describe('the day’s catch-up in the stored session', () => {
  it('reads back as it was saved', () => {
    const storage = createMemoryStorage();
    writeSession(stored(), storage);
    const read = readSession(storage);
    expect(read?.constraints.catchUp).toEqual(spec);
    expect(read?.constraints.fullSession).toBe(true);
  });

  it('drops one it cannot read, and keeps the session', () => {
    const storage = createMemoryStorage();
    writeSession(stored(), storage);
    const raw = JSON.parse(storage.getItem(SESSION_KEY)!) as {
      constraints: Record<string, unknown>;
    };
    raw.constraints.catchUp = { kind: 'a kind from a later copy', muscles: 'chest' };
    raw.constraints.fullSession = 'yes';
    storage.setItem(SESSION_KEY, JSON.stringify(raw));
    const read = readSession(storage);
    expect(read).not.toBeNull();
    expect(read?.constraints.catchUp).toBeUndefined();
    expect(read?.constraints.fullSession).toBeUndefined();
  });

  it('keeps the marks of a catch-up the lifter emptied, closed or swapped, and drops ones it cannot read', () => {
    // The seventeenth to twentieth reviews of round M: the plans the lifter's hand emptied, a slot
    // closed, the lifts swapped away today.
    const storage = createMemoryStorage();
    const session = stored();
    const slots = session.workout.catchUpSlots!;
    writeSession(
      {
        ...session,
        constraints: {
          ...session.constraints,
          emptied: [
            { offer: 'catch-up chest', layout: 'catch-up' },
            { offer: 'catch-up chest', layout: 'push-arms' },
          ],
          closedSlots: [0],
          swappedAway: ['push-up'],
        },
      },
      storage,
    );
    const read = readSession(storage);
    expect(read?.constraints.emptied).toEqual([
      { offer: 'catch-up chest', layout: 'catch-up' },
      { offer: 'catch-up chest', layout: 'push-arms' },
    ]);
    expect(read?.constraints.closedSlots).toEqual([0]);
    expect(read?.constraints.swappedAway).toEqual(['push-up']);
    const raw = JSON.parse(storage.getItem(SESSION_KEY)!) as {
      constraints: Record<string, unknown>;
    };
    // The twentieth review: a plan that cannot be read, its layout lost, is dropped alone.
    raw.constraints.emptied = [
      { offer: 'catch-up chest', layout: 7 },
      { offer: 'catch-up chest', layout: 'push-arms' },
    ];
    storage.setItem(SESSION_KEY, JSON.stringify(raw));
    const layoutLost = readSession(storage);
    expect(layoutLost?.constraints.emptied).toEqual([
      { offer: 'catch-up chest', layout: 'push-arms' },
    ]);
    // A mark saved before the plans were kept: dropped.
    raw.constraints.emptied = 'catch-up chest';
    storage.setItem(SESSION_KEY, JSON.stringify(raw));
    expect(readSession(storage)?.constraints.emptied).toBeUndefined();
    raw.constraints.emptied = 5;
    raw.constraints.closedSlots = 'yes';
    raw.constraints.swappedAway = [3];
    storage.setItem(SESSION_KEY, JSON.stringify(raw));
    const again = readSession(storage);
    expect(again).not.toBeNull();
    expect(again?.constraints.emptied).toBeUndefined();
    expect(again?.constraints.closedSlots).toBeUndefined();
    expect(again?.constraints.swappedAway).toBeUndefined();
    expect(again?.constraints.catchUp).toEqual(session.constraints.catchUp);
    expect(again?.workout.catchUpSlots).toHaveLength(slots.length);
  });
});
