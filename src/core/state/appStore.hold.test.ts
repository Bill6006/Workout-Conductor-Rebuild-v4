import { describe, expect, it } from 'vitest';
import { currentPosition } from '../../engine/workout/sequence';
import { allEntries } from '../../engine/workout/types';
import { TEST_NOW, createTestStore, type TestStoreHandle } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { SESSION_KEY, doneKeys, heldSeconds, readSession } from './session';

/**
 * Maintenance 20: a hold's countdown lives on the session like the rest. It starts from a tap,
 * ends the running rest, freezes with a pause, fills in the seconds it held, and goes the moment
 * the set is logged, skipped or undone, or its exercise is swapped out.
 */

interface Clock {
  now: () => string;
  advance: (seconds: number) => void;
}

function makeClock(start = TEST_NOW): Clock {
  let current = Date.parse(start);
  return {
    now: () => new Date(current).toISOString(),
    advance: (seconds) => {
      current += seconds * 1000;
    },
  };
}

async function seeded(clock: Clock): Promise<TestStoreHandle> {
  const handle = createTestStore({ minOverlayMs: 0, now: clock.now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return handle;
}

function session(handle: TestStoreHandle) {
  const current = handle.store.getSnapshot().session;
  if (!current) throw new Error('no session');
  return current;
}

function position(handle: TestStoreHandle) {
  const current = session(handle);
  const keys = doneKeys(current.completed);
  return currentPosition(current.workout, (id, index) => keys.has(`${id}:${index}`));
}

/** Swaps the first exercise for a Plank, starts, and logs a set of it so a rest runs. */
async function plankUnderway(clock: Clock) {
  const handle = await seeded(clock);
  const { store } = handle;
  const first = allEntries(session(handle).workout.blocks)[0]!;
  await store.recalibrate({ type: 'replace', entryId: first.id, exerciseId: 'plank' });
  const plank = allEntries(session(handle).workout.blocks).find(
    (entry) => entry.exerciseId === 'plank',
  )!;
  expect(plank).toBeDefined();
  store.startWorkout();
  store.skipWarmup(plank.id);
  return { handle, store, plank };
}

describe('a hold counting down on the session', () => {
  it('starts from the tap, ends the rest, and fills in the full seconds when it runs out', async () => {
    const clock = makeClock();
    const { handle, store, plank } = await plankUnderway(clock);
    const at = position(handle)!;
    expect(at.entryId).toBe(plank.id);
    const seconds = at.set.targetReps[0];
    // Log one set so a rest is running, then start the next set's hold.
    await store.logSet(plank.id, at.setIndex, { weight: null, reps: seconds, rir: null });
    expect(session(handle).rest).not.toBeNull();
    expect(session(handle).completed.sets.at(-1)?.rir).toBeNull();
    const next = position(handle)!;
    store.startHold(plank.id, next.setIndex, seconds);
    let current = session(handle);
    expect(current.rest).toBeNull();
    expect(current.hold).toMatchObject({ entryId: plank.id, setIndex: next.setIndex, seconds });
    expect(heldSeconds(current.hold!, Date.parse(clock.now()))).toBeNull();

    clock.advance(seconds + 1);
    current = session(handle);
    expect(heldSeconds(current.hold!, Date.parse(clock.now()))).toBe(seconds);
    // Logging the set takes the countdown with it.
    await store.logSet(plank.id, next.setIndex, { weight: null, reps: seconds, rir: null });
    expect(session(handle).hold).toBeNull();
  });

  it('stops early with the seconds held, freezes with a pause, and survives a reload', async () => {
    const clock = makeClock();
    const { handle, store, plank } = await plankUnderway(clock);
    const at = position(handle)!;
    store.startHold(plank.id, at.setIndex, 40);
    clock.advance(10);
    store.pauseWorkout();
    expect(session(handle).hold?.pausedRemaining).toBeCloseTo(30, 5);
    clock.advance(600);
    expect(heldSeconds(session(handle).hold!, Date.parse(clock.now()))).toBeNull();
    await store.resumeWorkout();
    expect(session(handle).hold?.pausedRemaining).toBeNull();
    expect(Date.parse(session(handle).hold!.endsAt) - Date.parse(clock.now())).toBe(30_000);

    // The stored session carries the countdown, and a copy that no longer reads drops only it.
    const stored = JSON.parse(handle.storage.getItem(SESSION_KEY) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(readSession(handle.storage)?.hold?.endsAt).toBe(session(handle).hold!.endsAt);
    handle.storage.setItem(SESSION_KEY, JSON.stringify({ ...stored, hold: { endsAt: 'soon' } }));
    const reread = readSession(handle.storage);
    expect(reread?.hold).toBeNull();
    expect(reread?.completed.sets.length).toBe(session(handle).completed.sets.length);

    clock.advance(12);
    store.stopHold();
    const hold = session(handle).hold!;
    expect(hold.held).toBe(22);
    expect(heldSeconds(hold, Date.parse(clock.now()) + 60_000)).toBe(22);
  });

  it('runs again when an edit resumes a paused workout, and goes when a delete moves off its set', async () => {
    const clock = makeClock();
    const { handle, store, plank } = await plankUnderway(clock);
    const first = position(handle)!;
    await store.logSet(plank.id, first.setIndex, { weight: null, reps: 30, rir: null });
    const second = position(handle)!;
    store.startHold(plank.id, second.setIndex, 40);
    clock.advance(20);
    store.pauseWorkout();
    clock.advance(300);
    // Correcting the first set resumes the workout; the countdown picks up with its 20 s left.
    await store.logSet(plank.id, first.setIndex, { weight: null, reps: 32, rir: null });
    const hold = session(handle).hold!;
    expect(session(handle).status).toBe('active');
    expect(hold.pausedRemaining).toBeNull();
    expect(Date.parse(hold.endsAt) - Date.parse(clock.now())).toBe(20_000);
    expect(heldSeconds(hold, Date.parse(clock.now()))).toBeNull();

    // Deleting the first set puts it back in front of the lifter: the second set's countdown goes.
    store.deleteLoggedSet(plank.id, first.setIndex);
    expect(position(handle)!.setIndex).toBe(first.setIndex);
    expect(session(handle).hold).toBeNull();
  });

  it('is cleared by a skip and an undo, never starts on a lift, and goes when its exercise does', async () => {
    const clock = makeClock();
    const { handle, store, plank } = await plankUnderway(clock);
    const at = position(handle)!;
    store.startHold(plank.id, at.setIndex, 30);
    store.skipSet(plank.id, at.setIndex);
    expect(session(handle).hold).toBeNull();

    const next = position(handle)!;
    store.startHold(plank.id, next.setIndex, 30);
    store.undoLastSet();
    expect(session(handle).hold).toBeNull();

    const lift = allEntries(session(handle).workout.blocks).find(
      (entry) => entry.exerciseId !== 'plank',
    )!;
    store.startHold(lift.id, lift.sets[0]!.index, 30);
    expect(session(handle).hold).toBeNull();

    const again = position(handle)!;
    store.startHold(plank.id, again.setIndex, 30);
    await store.recalibrate({ type: 'replace', entryId: plank.id, exerciseId: 'dead-bug' });
    expect(session(handle).hold).toBeNull();
  });
});
