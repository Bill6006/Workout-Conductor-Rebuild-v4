import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The sixteenth review of round N: the fifteenth pass's mark on a lift picked up again (`swapBack`,
 * the generator's `reopened`: "Its top set still to come, straight at the back-offs' load where the
 * day runs it so, it is saved as such a day"). The coach's deload taken before the main lift's top
 * set runs it straight at the lighter load, its drop gone and no mark ("A load set by hand, or the
 * coach's deload, is the lifter's own: no day at the back-offs' load for the next top set to read
 * past", `target-weight`). Picked up again after sets lifted at the deload (swapped away and back,
 * or home and back), the lift drops the weight set by hand, as every pick-up does
 * (`withoutHandTargets`), and with no drop on it the sets it still owes are built straight at the
 * back-offs' load; the fifteenth pass now marks the day. So the whole session, the sets lifted at
 * the deload with it, is saved as a day at the back-offs' load, and the next top set reads past it
 * to the top set before: it steps up as if no deload was taken.
 *
 * The rules (docs/reports/maintenance-32.md): the sixth review's MEDIUM, "the coach's deload taken
 * on a straight day at the back-offs' load kept the day's mark, so the next top set read past it and
 * stepped up as if no deload was taken", fixed: "a load set by hand or the coach's deload clears the
 * day's mark"; item 11, "where the load is a guess or eased (... the coach's deload)" the lift runs
 * straight, its own.
 *
 * Steps: Hybrid, five days a week. The bench press 9 days ago straight at 175; 5 days ago on top set
 * plus back-offs, top set 185 × 5 at 1, back-offs 3 × 175 at 2. Today's push day plans it at 190 ×
 * 4-6 at 1, back-offs 3 × 180 at 2. The coach's deload to 170 taken before the start (the trigger
 * its card sends, "Deload to 170 lb this week" or "Micro-deload to 170 lb", offered while no set of
 * the lift is lifted: 4 × 170 at 2, straight); two sets lifted at 170 × 5 at 3; the bench press
 * swapped for the dumbbell bench press and back (or home and back to the gym): its last two sets at
 * 180. Every set lifted as shown, the workout finished, and the next push day planned four days on.
 *
 * What happens at 604fba7: the saved bench press marked as a day at the back-offs' load; the next
 * plan's top set 190 × 4-6, "Last: 185 lb × 5 @ RIR 1 (Aug 28)", and the completion's "Barbell Bench
 * Press: 190 lb × 4-6 (load up)". The same deload with no pick-up gives 175 off the deload ("Last: 170
 * lb × 5, 5, 5, 5 @ RIR 3 (Sep 2)"). At 14d2e62 (the previous head) both tests pass: the session is
 * saved unmarked and read (185, "Last: 180 lb × 5, 5, 5, 5 @ RIR 3 (Sep 2)"), so this is a regression
 * of the fifteenth pass. Synthetic data only.
 *
 * The fix (the sixteenth pass): a pick-up never marks a day the lifter made their own, a load set
 * by hand or the coach's deload lifted before it stopped (`swapBack`, the generator's `reopened`).
 */

const DAY = 86_400_000;
const BENCH = 'barbell-bench-press';
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
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

async function deloadedAndBegun() {
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
    on(3, 'w3', [straight('back-squat', 215)]),
    on(2, 'w2', [straight('leg-press', 270)]),
    on(1, 'w1', [straight('barbell-row', 175)]),
  ];
  for (const saved of history) await db.put('workouts', saved);
  await store.hydrate();
  const entries = () => allEntries(store.getSnapshot().session!.workout.blocks);
  const bench = (): WorkoutEntry =>
    entries().find((entry) => entry.exerciseId === BENCH && !entry.stopped)!;
  const working = () =>
    bench()
      .sets.filter((set) => set.kind === 'working')
      .map((set) => `${set.tier ?? 'straight'} ${set.targetWeight}`);
  expect(working()).toEqual(['top 190', 'back-off 180', 'back-off 180', 'back-off 180']);
  // The coach's deload, taken before the start: straight at the lighter load, no mark.
  await store.recalibrate({
    type: 'target-weight',
    entryId: bench().id,
    weight: 170,
    deload: true,
  });
  expect(working()).toEqual(['straight 170', 'straight 170', 'straight 170', 'straight 170']);
  expect(bench().atBackOffs).toBeUndefined();
  store.startWorkout();
  const [first, second] = bench().sets.filter((set) => set.kind === 'working');
  await store.logSet(bench().id, first!.index, { weight: 170, reps: 5, rir: 3 });
  await store.logSet(bench().id, second!.index, { weight: 170, reps: 5, rir: 3 });
  return { store, entries, bench };
}

type Begun = Awaited<ReturnType<typeof deloadedAndBegun>>;

async function swappedAwayAndBack({ store, entries, bench }: Begun) {
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

async function homeAndBack({ store }: Begun) {
  const gym = store.getSnapshot().profile!.currentLocationId;
  const home = store.getSnapshot().locations.find((place) => place.id !== gym)!;
  await store.setCurrentLocation(home.id);
  await store.setCurrentLocation(gym);
}

/** Every set left lifted as shown, the workout finished: the saved bench press, the next plan's. */
async function finishedAndNext({ store, bench }: Begun) {
  const logged = () =>
    store
      .getSnapshot()
      .session!.completed.sets.filter((log) => log.entryId === bench().id)
      .map((log) => log.setIndex);
  for (const set of bench().sets.filter(
    (one) => one.kind === 'working' && !logged().includes(one.index),
  )) {
    await store.logSet(bench().id, set.index, { weight: set.targetWeight, reps: 5, rir: 3 });
  }
  const completion = await store.finishWorkout(null, { endedEarly: true });
  const state = store.getSnapshot();
  const saved = state.history
    .find((one) => !['w9', 'w5', 'w3', 'w2', 'w1'].includes(one.id))!
    .entries.find((entry) => entry.exerciseId === BENCH)!;
  const next = generateWorkout({
    profile: state.profile!,
    location: state.locations.find((place) => place.id === state.profile!.currentLocationId)!,
    history: state.history,
    now: new Date(Date.parse(TEST_NOW) + 4 * DAY).toISOString(),
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
  const plan = allEntries(next.blocks).find((entry) => entry.exerciseId === BENCH)!;
  return {
    saved,
    nextTime: completion.nextTargets.join(' '),
    last: (plan.progression?.evidence ?? []).find((line) => line.startsWith('Last:')) ?? '',
  };
}

describe('the coach’s deload taken, sets lifted at it, then the main lift picked up again', () => {
  it.each([
    ['swapped away and back', swappedAwayAndBack],
    ['home and back', homeAndBack],
  ])('%s: the session is no day at the back-offs’ load', async (_, pickUp) => {
    const begun = await deloadedAndBegun();
    await pickUp(begun);
    const { saved } = await finishedAndNext(begun);
    expect(saved.sets.filter((set) => set.kind === 'working').map((set) => set.weight)).toEqual([
      170, 170, 180, 180,
    ]);
    // At 604fba7: true, the sets lifted at the deload passed over with the rest.
    expect(saved.atBackOffs).toBeUndefined();
  });

  it.each([
    ['swapped away and back', swappedAwayAndBack],
    ['home and back', homeAndBack],
  ])('%s: the next top set reads it, the deload taken', async (_, pickUp) => {
    const begun = await deloadedAndBegun();
    await pickUp(begun);
    const { last, nextTime } = await finishedAndNext(begun);
    // At 604fba7: "Last: 185 lb × 5 @ RIR 1 (Aug 28)", the top set before the deload.
    expect(last).toMatch(/\(Sep 2\)$/);
    // At 604fba7: "Barbell Bench Press: 190 lb × 4-6 (load up)", as if no deload was taken.
    expect(nextTime).not.toMatch(/Barbell Bench Press: 190 lb/);
  });
});
