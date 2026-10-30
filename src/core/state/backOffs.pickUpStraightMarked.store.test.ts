import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The fifteenth review of round N. A main lift begun before its top set (a ramp logged) and picked
 * up again on a day that now runs it straight (a check-in mid-workout takes fatigue high) is built
 * straight at its back-offs' load, as the plan builds such a day (`targetedSets` and the
 * generator's `targetedFor`, through `straightAfterTop`: "Straight sets today, at the back-offs'
 * load"). The swap back (`swapBack`) and the generator's pick-up (`reopened`) take the sets and
 * leave the entry as it was: no `atBackOffs` mark (the built target's `atBackOffs` is dropped, where
 * a swap, `applySubstitution`, takes it and the drop alike; the old `backOffDrop` stays too, on a
 * lift with no top set). So the session is saved as a straight session of the lift's own, and the
 * next plan's top set steps from the back-offs' load: 180 × 4-6 where the last top set (185 × 5 at
 * 1) asks 190.
 *
 * The rules (docs/reports/maintenance-32.md): the fourth pass, "a straight day at the back-offs'
 * load is saved as one, and a lift's top set reads past such days as past its back-offs"; the fifth
 * review's MEDIUM, "a lift swapped in after its place was begun ran straight at the back-offs' load
 * unmarked, so the lift's next top set stepped from the back-offs' load (195 for 205 after a push
 * ended)", fixed: "the push's extra and a stand-in are saved as such days"; the code's own words at
 * `standIn`: "A straight day at the back-offs' load, saved as one, as a change of place saves it".
 *
 * Steps: Hybrid, five days a week. The bench press 9 days ago straight at 175; 5 days ago on top set
 * plus back-offs, top set 185 × 5 at 1, back-offs 3 × 175 at 2; low check-ins (energy 2, sore) after
 * a squat, a leg press and a row session since (the fatigue score 4, elevated). Today's push day:
 * the bench press, top set 190 × 4-6 at 1, back-offs 3 × 180 at 2. Its first ramp logged; a check-in
 * (energy 1, sore): the fatigue score 7, high. The bench press swapped for the dumbbell bench press
 * and back (or home and back to the gym). Its working sets logged as shown (175 × 5 at 2) and the
 * workout finished. The next push day, four days on (the fatigue score 3). The same pick-up after a
 * plate marked missing (the top set standing in) builds the same unmarked straight day.
 *
 * What happens at 1fcd67a (and at 9e9078e, the previous head): the bench press picked up straight at
 * 175 × 4-6, unmarked, its drop of 5% kept; the saved session unmarked; the next plan's top set 180 ×
 * 4-6 ("Last: 175 lb × 5, 5, 5, 5 @ RIR 2"), back-offs 170, and the completion's "Barbell Bench Press:
 * 180 lb × 4-6 (load up)", where the same session marked gives 190 × 4-6 off the top set at 185,
 * back-offs 180. Synthetic data only.
 *
 * The fix (the fifteenth pass): a lift picked up again before its top set is the day's as built,
 * as a swap takes it (`swapBack`, and the generator's `reopened`): on top set plus back-offs with
 * their drop, or straight at the back-offs' load, marked as such a day, its drop gone.
 */

const DAY = 86_400_000;
const BENCH = 'barbell-bench-press';
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};
const tired = {
  energy: 2,
  sleep: 3,
  soreness: 4,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};

function on(daysAgo: number, id: string, entries: WorkoutRecord['entries']): WorkoutRecord {
  const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
  return {
    ...record(0, BENCH, []),
    id,
    templateId: 'pull',
    entries,
    startedAt: when,
    completedAt: when,
  };
}

const straight = (exerciseId: string, weight: number) =>
  record(0, exerciseId, [
    [5, weight, 2],
    [5, weight, 2],
    [5, weight, 2],
  ]).entries[0]!;

/** The bench press on top set plus back-offs: 185 × 5 at 1, then 3 × 175 × 5 at 2. */
function onTheStructure(): WorkoutRecord['entries'][number] {
  const entry = record(0, BENCH, [
    [5, 185, 1],
    [5, 175, 2],
    [5, 175, 2],
    [5, 175, 2],
  ]).entries[0]!;
  return {
    ...entry,
    role: 'primary-strength',
    backOffDrop: 0.05,
    backOffAt: 175,
    sets: entry.sets.map((set, index) =>
      index === 0
        ? { ...set, tier: 'top' as const, targetRir: 1 }
        : { ...set, tier: 'back-off' as const, targetRir: 2 },
    ),
  };
}

async function begunThenTired() {
  const { store } = createTestStore({ now: () => TEST_NOW });
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...everyDay },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await store.getDatabase();
  const history = [
    on(9, 'w9', [straight(BENCH, 175), straight('back-squat', 215), straight('barbell-row', 175)]),
    on(5, 'w5', [onTheStructure()]),
    { ...on(3, 'w3', [straight('back-squat', 215)]), readiness: tired },
    { ...on(2, 'w2', [straight('leg-press', 270)]), readiness: tired },
    { ...on(1, 'w1', [straight('barbell-row', 175)]), readiness: tired },
  ];
  for (const saved of history) await db.put('workouts', saved);
  await store.hydrate();
  const entries = () => allEntries(store.getSnapshot().session!.workout.blocks);
  const bench = (): WorkoutEntry =>
    entries().find((entry) => entry.exerciseId === BENCH && !entry.stopped)!;
  const working = () => bench().sets.filter((set) => set.kind === 'working');
  expect(working().map((set) => [set.tier, set.targetWeight])).toEqual([
    ['top', 190],
    ['back-off', 180],
    ['back-off', 180],
    ['back-off', 180],
  ]);
  store.startWorkout();
  const ramp = bench().sets.find((set) => set.kind === 'warmup')!;
  await store.logSet(bench().id, ramp.index, { weight: ramp.targetWeight, reps: 5, rir: 5 });
  await store.recalibrate({ type: 'readiness', readiness: { ...tired, energy: 1 } });
  // Under way, it keeps its top set and back-offs through the check-in.
  expect(working().map((set) => set.tier)).toEqual(['top', 'back-off', 'back-off', 'back-off']);
  return { store, entries, bench, working };
}

type Begun = Awaited<ReturnType<typeof begunThenTired>>;

async function swappedAwayAndBack(begun: Begun) {
  const { store, entries, bench } = begun;
  await store.recalibrate({
    type: 'replace',
    entryId: bench().id,
    exerciseId: 'dumbbell-bench-press',
  });
  const stand = entries().find(
    (entry) => entry.exerciseId === 'dumbbell-bench-press' && !entry.stopped,
  )!;
  await store.recalibrate({ type: 'replace', entryId: stand.id, exerciseId: BENCH });
}

async function homeAndBack(begun: Begun) {
  const { store } = begun;
  const gym = store.getSnapshot().profile!.currentLocationId;
  const home = store.getSnapshot().locations.find((place) => place.id !== gym)!;
  await store.setCurrentLocation(home.id);
  await store.setCurrentLocation(gym);
}

/** Its working sets logged as shown, the workout finished: the saved bench press, the next plan's. */
async function finishedAndNext(begun: Begun) {
  const { store, bench, working } = begun;
  for (const set of working()) {
    await store.logSet(bench().id, set.index, { weight: set.targetWeight, reps: 5, rir: 2 });
  }
  const completion = await store.finishWorkout(null, { endedEarly: true });
  const state = store.getSnapshot();
  const history = state.history;
  const saved = history
    .find((one) => !['w9', 'w5', 'w3', 'w2', 'w1'].includes(one.id))!
    .entries.find((entry) => entry.exerciseId === BENCH)!;
  const next = generateWorkout({
    profile: state.profile!,
    location: state.locations.find((place) => place.id === state.profile!.currentLocationId)!,
    history,
    now: new Date(Date.parse(TEST_NOW) + 4 * DAY).toISOString(),
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
  const plan = allEntries(next.blocks).find((entry) => entry.exerciseId === BENCH)!;
  return {
    saved,
    nextTime: completion.nextTargets.join(' '),
    next: plan.sets
      .filter((set) => set.kind === 'working')
      .map((set) => [set.tier ?? 'straight', set.targetWeight]),
  };
}

describe('a main lift picked up again before its top set on a day that runs it straight', () => {
  it.each([
    ['swapped away and back', swappedAwayAndBack],
    ['home and back', homeAndBack],
  ])('%s: straight at the back-offs’ load, marked as such a day', async (_, pickUp) => {
    const begun = await begunThenTired();
    await pickUp(begun);
    const sets = begun.working().map((set) => [set.tier ?? 'straight', set.targetWeight]);
    // Straight at the back-offs' load: 5% under the top set's 185, held for the day's fatigue.
    expect(sets.length).toBeGreaterThan(0);
    expect(sets.every(([tier, load]) => tier === 'straight' && load === 175)).toBe(true);
    // At 1fcd67a: undefined (and the entry keeps its drop of 5% with no top set).
    expect(begun.bench().atBackOffs).toBe(true);
  });

  it.each([
    ['swapped away and back', swappedAwayAndBack],
    ['home and back', homeAndBack],
  ])('%s: the next top set reads past it, to the top set at 185', async (_, pickUp) => {
    const begun = await begunThenTired();
    await pickUp(begun);
    const { saved, next, nextTime } = await finishedAndNext(begun);
    // At 1fcd67a: ['top', 180], stepped from the back-offs' 175 ("Last: 175 lb × 5, 5, 5 ...").
    expect(next[0]).toEqual(['top', 190]);
    // At 1fcd67a: "Barbell Bench Press: 180 lb × 4-6 (load up)".
    expect(nextTime).toMatch(/Barbell Bench Press: 190 lb/);
    // At 1fcd67a: undefined, saved as a straight session of the lift's own.
    expect(saved.atBackOffs).toBe(true);
  });
});

describe('a main lift picked up again after its top set, on a day that runs it straight', () => {
  it.each([
    ['swapped away and back', swappedAwayAndBack],
    ['home and back', homeAndBack],
  ])('%s: its back-offs owed, no straight day marked', async (_, pickUp) => {
    const begun = await begunThenTired();
    const { store, bench, working } = begun;
    const top = working().find((set) => set.tier === 'top')!;
    await store.logSet(bench().id, top.index, { weight: 190, reps: 5, rir: 1 });
    await pickUp(begun);
    // The fifteenth pass's own: its top set done, it owes its back-offs, and is no straight day.
    expect(working().map((set) => set.tier)).toEqual(['top', 'back-off', 'back-off', 'back-off']);
    expect(bench().atBackOffs).toBeUndefined();
  });
});
