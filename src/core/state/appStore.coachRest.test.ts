import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { coachContextOf } from '../../features/coach/useCoach';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import type { AppStore } from './appStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

/**
 * Maintenance 25, the owner's item 38: after "Add 30 s to this rest" was taken, the card stayed
 * and each tap added another 30 s. It is taken once for the rest after the set that fell short;
 * a set that falls short again after it is a new occasion.
 */

/** The store's clock, moved by a test: a rest ends, a set is lifted again later. */
const clock = { now: TEST_NOW };
const later = (seconds: number) => new Date(Date.parse(TEST_NOW) + seconds * 1000).toISOString();

async function started() {
  clock.now = TEST_NOW;
  const handle = createTestStore({ now: () => clock.now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  handle.store.startWorkout();
  return handle.store;
}

/** The coach's card as the screens read it, at the store's time (a rest runs 150 s). */
function coachCard(store: AppStore) {
  const state = store.getSnapshot();
  return coachContextOf({ ...state, lastExportAt: TEST_NOW }, Date.parse(clock.now))?.card;
}

function lead(store: AppStore): WorkoutEntry {
  return allEntries(store.getSnapshot().session!.workout.blocks)[0]!;
}

async function logWorking(store: AppStore, nth: number, reps: number, rir: number) {
  const entry = lead(store);
  const set = entry.sets.filter((candidate) => candidate.kind === 'working')[nth]!;
  await store.logSet(entry.id, set.index, { weight: set.targetWeight ?? 45, reps, rir });
  return set.index;
}

describe('the coach’s longer rest', () => {
  it('is taken once for the rest it is about, and offered again only for a new drop', async () => {
    const store = await started();
    store.skipWarmup(lead(store).id);
    await logWorking(store, 0, 8, 1);
    const fell = await logWorking(store, 1, 5, 0);
    const rest = store.getSnapshot().session!.rest!;
    expect(rest.setIndex).toBe(fell);
    const card = coachCard(store)!;
    expect(card.signal.action).toMatchObject({ kind: 'rest', deltaSeconds: 30 });

    store.takeCoachRest(card.signal, 30);
    expect(store.getSnapshot().session!.rest!.seconds).toBe(rest.seconds + 30);
    // Taken: the card goes, and a second tap before it went adds nothing.
    expect(coachCard(store)?.signal.domain).not.toBe('rest');
    store.takeCoachRest(card.signal, 30);
    expect(store.getSnapshot().session!.rest!.seconds).toBe(rest.seconds + 30);

    // The next set falls short again: a new rest, a new occasion, one more offer.
    const again = await logWorking(store, 2, 3, 0);
    const next = store.getSnapshot().session!.rest!;
    expect(next.setIndex).toBe(again);
    const second = coachCard(store)!;
    expect(second.signal.domain).toBe('rest');
    store.takeCoachRest(second.signal, 30);
    expect(store.getSnapshot().session!.rest!.seconds).toBe(next.seconds + 30);
    expect(coachCard(store)?.signal.domain).not.toBe('rest');
  });

  it('is not offered once the rest after the set is no longer running', async () => {
    const store = await started();
    store.skipWarmup(lead(store).id);
    await logWorking(store, 0, 8, 1);
    await logWorking(store, 1, 5, 0);
    const card = coachCard(store)!;
    expect(card.signal.domain).toBe('rest');
    store.skipRest();
    expect(coachCard(store)?.signal.domain).not.toBe('rest');
    // A tap that lands after the rest ended changes nothing and says why.
    expect(() => store.takeCoachRest(card.signal, 30)).toThrow(
      'That rest is over: the next set can start.',
    );
    expect(store.getSnapshot().session!.rest).toBeNull();
  });

  it('lengthens the rest in a pair too: the one after the partner’s set, before the next round', async () => {
    const store = await started();
    // The rows before the pair are skipped today: the pair is the lift in front.
    for (;;) {
      const first = store.getSnapshot().session!.workout.blocks[0]!;
      if (first.kind === 'superset') break;
      await store.skipExercise(first.entries[0]!.id);
    }
    const pair = store
      .getSnapshot()
      .session!.workout.blocks.find((block) => block.kind === 'superset')!;
    const [a, b] = pair.entries as [WorkoutEntry, WorkoutEntry];
    const log = async (entry: WorkoutEntry, nth: number, reps: number, rir: number) => {
      const set = entry.sets.filter((candidate) => candidate.kind === 'working')[nth]!;
      await store.logSet(entry.id, set.index, { weight: set.targetWeight ?? 20, reps, rir });
    };
    await log(a, 0, 12, 1);
    await log(b, 0, 12, 1);
    await log(a, 1, 8, 0);
    await log(b, 1, 12, 1);
    const rest = store.getSnapshot().session!.rest!;
    const card = coachCard(store)!;
    expect(card.signal.headline).toMatch(/^Rest 30 s longer before the next /);
    store.takeCoachRest(card.signal, 30);
    expect(store.getSnapshot().session!.rest!.seconds).toBe(rest.seconds + 30);
  });

  it('refuses a card for a rest already over: the rest running now keeps its seconds', async () => {
    const store = await started();
    store.skipWarmup(lead(store).id);
    await logWorking(store, 0, 8, 1);
    await logWorking(store, 1, 5, 0);
    const card = coachCard(store)!;
    // The next set is logged before the tap lands: a new rest, not the one the card was for.
    await logWorking(store, 2, 5, 1);
    const next = store.getSnapshot().session!.rest!;
    expect(() => store.takeCoachRest(card.signal, 30)).toThrow(
      'That rest is over: the next set can start.',
    );
    expect(store.getSnapshot().session!.rest!.seconds).toBe(next.seconds);
  });

  it('goes when the rest is over, and a tap after it changes nothing and says so', async () => {
    const store = await started();
    store.skipWarmup(lead(store).id);
    await logWorking(store, 0, 8, 1);
    await logWorking(store, 1, 5, 0);
    const card = coachCard(store)!;
    expect(card.signal.domain).toBe('rest');
    const rest = store.getSnapshot().session!.rest!;
    // The 150 s run out: the timer says the rest is done, and the offer is gone with it.
    clock.now = later(151);
    expect(coachCard(store)?.signal.domain).not.toBe('rest');
    expect(() => store.takeCoachRest(card.signal, 30)).toThrow(
      'That rest is over: the next set can start.',
    );
    expect(store.getSnapshot().session!.rest!.seconds).toBe(rest.seconds);
  });

  it('brings nothing back for a set skipped after it: no new set fell short', async () => {
    const store = await started();
    store.skipWarmup(lead(store).id);
    await logWorking(store, 0, 8, 1);
    await logWorking(store, 1, 5, 0);
    store.takeCoachRest(coachCard(store)!.signal, 30);
    // "Skip set" logs no reps, and a rest starts after it.
    await logWorking(store, 2, 0, 0);
    expect(store.getSnapshot().session!.rest).not.toBeNull();
    expect(coachCard(store)?.signal.domain).not.toBe('rest');
  });

  it('counts a set undone and lifted again as a new set that fell short', async () => {
    const store = await started();
    store.skipWarmup(lead(store).id);
    await logWorking(store, 0, 8, 1);
    await logWorking(store, 1, 5, 0);
    store.takeCoachRest(coachCard(store)!.signal, 30);
    store.undoLastSet();
    clock.now = later(20);
    await logWorking(store, 1, 4, 0);
    const again = coachCard(store)!;
    expect(again.signal.domain).toBe('rest');
    const seconds = store.getSnapshot().session!.rest!.seconds;
    store.takeCoachRest(again.signal, 30);
    expect(store.getSnapshot().session!.rest!.seconds).toBe(seconds + 30);
  });

  it('brings nothing back after Equipment busy moves the lift: its sets are the same', async () => {
    const store = await started();
    const bench = lead(store);
    store.skipWarmup(bench.id);
    await logWorking(store, 0, 8, 1);
    await logWorking(store, 1, 5, 0);
    store.takeCoachRest(coachCard(store)!.signal, 30);
    await store.recalibrate({ type: 'equipment-busy', entryId: bench.id });
    // The row it gave way to, done: the bench leads again after the rest that follows it.
    const next = store.getSnapshot().session!.workout.blocks[0]!;
    for (const entry of next.entries) {
      store.skipWarmup(entry.id);
      for (const set of entry.sets.filter((candidate) => candidate.kind === 'working')) {
        await store.logSet(entry.id, set.index, { weight: set.targetWeight, reps: 8, rir: 2 });
      }
    }
    expect(store.getSnapshot().session!.completed.currentEntryId).toBe(bench.id);
    expect(store.getSnapshot().session!.rest).not.toBeNull();
    expect(coachCard(store)?.signal.domain).not.toBe('rest');
  });

  it('offers the longer rest for the pair’s second lift too: the round rest is the one before its next set', async () => {
    const store = await started();
    for (;;) {
      const first = store.getSnapshot().session!.workout.blocks[0]!;
      if (first.kind === 'superset') break;
      await store.skipExercise(first.entries[0]!.id);
    }
    const pair = store
      .getSnapshot()
      .session!.workout.blocks.find((block) => block.kind === 'superset')!;
    const [a, b] = pair.entries as [WorkoutEntry, WorkoutEntry];
    const log = async (entry: WorkoutEntry, nth: number, reps: number, rir: number) => {
      const set = entry.sets.filter((candidate) => candidate.kind === 'working')[nth]!;
      await store.logSet(entry.id, set.index, { weight: set.targetWeight ?? 20, reps, rir });
    };
    await log(a, 0, 12, 1);
    await log(b, 0, 12, 1);
    await log(a, 1, 12, 1);
    await log(b, 1, 8, 0);
    const rest = store.getSnapshot().session!.rest!;
    expect(rest.entryId).toBe(b.id);
    const card = coachCard(store)!;
    const bName = requireExercise(b.exerciseId).name;
    expect(card.signal.headline).toBe(`Rest 30 s longer before the next ${bName} set`);
    expect(store.takeCoachRest(card.signal, 30)).toBe(true);
    expect(store.getSnapshot().session!.rest!.seconds).toBe(rest.seconds + 30);
    expect(coachCard(store)?.signal.domain).not.toBe('rest');
  });

  it('lengthens a rest once: both lifts of a pair falling short in one round get one offer', async () => {
    const store = await started();
    for (;;) {
      const first = store.getSnapshot().session!.workout.blocks[0]!;
      if (first.kind === 'superset') break;
      await store.skipExercise(first.entries[0]!.id);
    }
    const pair = store
      .getSnapshot()
      .session!.workout.blocks.find((block) => block.kind === 'superset')!;
    const [a, b] = pair.entries as [WorkoutEntry, WorkoutEntry];
    const log = async (entry: WorkoutEntry, nth: number, reps: number, rir: number) => {
      const set = entry.sets.filter((candidate) => candidate.kind === 'working')[nth]!;
      await store.logSet(entry.id, set.index, { weight: set.targetWeight ?? 20, reps, rir });
    };
    await log(a, 0, 12, 1);
    await log(b, 0, 12, 1);
    await log(a, 1, 8, 0);
    await log(b, 1, 8, 0);
    const rest = store.getSnapshot().session!.rest!;
    const card = coachCard(store)!;
    expect(card.signal.domain).toBe('rest');
    store.takeCoachRest(card.signal, 30);
    // The rest is longer for the whole round: the partner's drop brings no second 30 s.
    expect(coachCard(store)?.signal.domain).not.toBe('rest');
    expect(store.getSnapshot().session!.rest!.seconds).toBe(rest.seconds + 30);
  });

  it('is not offered for another lift’s rest after Equipment busy moved the lift, taken or not', async () => {
    const store = await started();
    const bench = lead(store);
    store.skipWarmup(bench.id);
    await logWorking(store, 0, 8, 1);
    await logWorking(store, 1, 5, 0);
    expect(coachCard(store)?.signal.domain).toBe('rest');
    await store.recalibrate({ type: 'equipment-busy', entryId: bench.id });
    // The rest running now comes before the lift that passed the bench, not before a bench set.
    expect(coachCard(store)?.signal.domain).not.toBe('rest');
    const next = store.getSnapshot().session!.workout.blocks[0]!;
    for (const entry of next.entries) {
      store.skipWarmup(entry.id);
      for (const set of entry.sets.filter((candidate) => candidate.kind === 'working')) {
        await store.logSet(entry.id, set.index, { weight: set.targetWeight, reps: 8, rir: 2 });
      }
    }
    // The rest after that lift's last set comes before the bench, but the bench has rested for a
    // whole exercise: the drop is old news.
    expect(store.getSnapshot().session!.completed.currentEntryId).toBe(bench.id);
    expect(store.getSnapshot().session!.rest).not.toBeNull();
    expect(coachCard(store)?.signal.domain).not.toBe('rest');
  });

  it('says a second tap added nothing: the screens thank no one for it', async () => {
    const store = await started();
    store.skipWarmup(lead(store).id);
    await logWorking(store, 0, 8, 1);
    await logWorking(store, 1, 5, 0);
    const card = coachCard(store)!;
    expect(store.takeCoachRest(card.signal, 30)).toBe(true);
    expect(store.takeCoachRest(card.signal, 30)).toBe(false);
  });

  it('counts the round the rest follows: a skip in a pair keeps an old offer from standing in for a new drop (from the second review)', async () => {
    const store = await started();
    for (;;) {
      const first = store.getSnapshot().session!.workout.blocks[0]!;
      if (first.kind === 'superset') break;
      await store.skipExercise(first.entries[0]!.id);
    }
    const pair = store
      .getSnapshot()
      .session!.workout.blocks.find((block) => block.kind === 'superset')!;
    // A fourth round, so a rest follows the third.
    for (const entry of pair.entries) {
      await store.recalibrate({ type: 'sets', entryId: entry.id, workingDelta: 1 });
    }
    const four = store.getSnapshot().session!.workout.blocks.find((block) => block.id === pair.id)!;
    const [a, b] = four.entries as [WorkoutEntry, WorkoutEntry];
    const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');
    expect(Math.min(working(a).length, working(b).length)).toBeGreaterThanOrEqual(4);
    const log = async (entry: WorkoutEntry, nth: number, reps: number, rir: number) => {
      const set = working(entry)[nth]!;
      await store.logSet(entry.id, set.index, { weight: set.targetWeight ?? 20, reps, rir });
    };
    await log(a, 0, 12, 1);
    await log(b, 0, 12, 1);
    await log(a, 1, 8, 0);
    await log(b, 1, 12, 1);
    const first = coachCard(store)!;
    expect(first.signal.headline).toBe(
      `Rest 30 s longer before the next ${requireExercise(a.exerciseId).name} set`,
    );
    store.takeCoachRest(first.signal, 30);
    // Round three: the first lift's set is skipped, the second falls short.
    await log(a, 2, 0, 0);
    await log(b, 2, 8, 0);
    const second = coachCard(store)!;
    expect(second.signal.headline).toBe(
      `Rest 30 s longer before the next ${requireExercise(b.exerciseId).name} set`,
    );
  });

  it('brings back no drop for the rest after a skipped set', async () => {
    const store = await started();
    store.skipWarmup(lead(store).id);
    await logWorking(store, 0, 8, 1);
    await logWorking(store, 1, 5, 0);
    expect(coachCard(store)?.signal.domain).toBe('rest');
    // Not taken; the rest runs out, and the next set is skipped.
    clock.now = later(151);
    expect(coachCard(store)?.signal.domain).not.toBe('rest');
    await logWorking(store, 2, 0, 0);
    expect(store.getSnapshot().session!.rest).not.toBeNull();
    expect(coachCard(store)?.signal.domain).not.toBe('rest');
  });

  it('offers the longer rest again for a rest started again after an undo in a pair (from the third review)', async () => {
    const store = await started();
    for (;;) {
      const first = store.getSnapshot().session!.workout.blocks[0]!;
      if (first.kind === 'superset') break;
      await store.skipExercise(first.entries[0]!.id);
    }
    const pair = store
      .getSnapshot()
      .session!.workout.blocks.find((block) => block.kind === 'superset')!;
    const [a, b] = pair.entries as [WorkoutEntry, WorkoutEntry];
    const log = async (entry: WorkoutEntry, nth: number, reps: number, rir: number) => {
      const set = entry.sets.filter((candidate) => candidate.kind === 'working')[nth]!;
      await store.logSet(entry.id, set.index, { weight: set.targetWeight ?? 20, reps, rir });
    };
    await log(a, 0, 12, 1);
    await log(b, 0, 12, 1);
    await log(a, 1, 8, 0);
    await log(b, 1, 12, 1);
    expect(store.takeCoachRest(coachCard(store)!.signal, 30)).toBe(true);
    // The partner's set undone takes the rest with it; logged again, a new rest starts.
    store.undoLastSet();
    clock.now = later(10);
    await log(b, 1, 12, 1);
    const again = coachCard(store)!;
    expect(again.signal.domain).toBe('rest');
    const seconds = store.getSnapshot().session!.rest!.seconds;
    expect(store.takeCoachRest(again.signal, 30)).toBe(true);
    expect(store.getSnapshot().session!.rest!.seconds).toBe(seconds + 30);
  });

  it('offers nothing more for a rest once lengthened, when a set of the round is corrected after it', async () => {
    const store = await started();
    for (;;) {
      const first = store.getSnapshot().session!.workout.blocks[0]!;
      if (first.kind === 'superset') break;
      await store.skipExercise(first.entries[0]!.id);
    }
    const pair = store
      .getSnapshot()
      .session!.workout.blocks.find((block) => block.kind === 'superset')!;
    const [a, b] = pair.entries as [WorkoutEntry, WorkoutEntry];
    const log = async (entry: WorkoutEntry, nth: number, reps: number, rir: number) => {
      const set = entry.sets.filter((candidate) => candidate.kind === 'working')[nth]!;
      await store.logSet(entry.id, set.index, { weight: set.targetWeight ?? 20, reps, rir });
    };
    await log(a, 0, 12, 1);
    await log(b, 0, 12, 1);
    await log(a, 1, 8, 0);
    await log(b, 1, 8, 0);
    // Both fell short; the card is for one of the two drops.
    const card = coachCard(store)!;
    expect(card.signal.domain).toBe('rest');
    expect(store.takeCoachRest(card.signal, 30)).toBe(true);
    const seconds = store.getSnapshot().session!.rest!.seconds;
    // That lift's set corrected: it did not fall short after all, and the other lift's drop is the
    // one left. The rest running is already longer: no second offer for it.
    // The offer's occasion names the set it is about: `<entry>#<set>@...`.
    const taken = card.signal.occasion?.startsWith(`${a.id}#`) ? a : b;
    expect(card.signal.occasion?.startsWith(`${taken.id}#`)).toBe(true);
    await log(taken, 1, 12, 1);
    expect(store.getSnapshot().session!.rest!.seconds).toBe(seconds);
    expect(coachCard(store)?.signal.domain).not.toBe('rest');
  });

  it('adds nothing on a second tap of a card that names no occasion', async () => {
    const store = await started();
    store.skipWarmup(lead(store).id);
    await logWorking(store, 0, 8, 1);
    await logWorking(store, 1, 5, 0);
    const { source, exerciseId, headline } = coachCard(store)!.signal;
    const seconds = store.getSnapshot().session!.rest!.seconds;
    expect(store.takeCoachRest({ source, exerciseId, headline }, 30)).toBe(true);
    expect(store.takeCoachRest({ source, exerciseId, headline }, 30)).toBe(false);
    expect(store.getSnapshot().session!.rest!.seconds).toBe(seconds + 30);
  });
});
