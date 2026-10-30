import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The sixteenth review of round N: the pick-up the fifteenth pass marked (`swapBack` in
 * src/engine/recalibration/recalibrate.ts, the generator's `reopened`). A main lift picked up again
 * before its top set takes a top set and back-offs only where its entry still carries a drop
 * (`stopped.backOffDrop !== undefined && !topDone && backOffDay(...)`; the generator's
 * `target.backOffDrop !== undefined`). A lift built straight at the start, on a day of high fatigue,
 * has none (`mainLiftTarget` gives a straight day no drop). So once a check-in under way brings the
 * fatigue down, the day plans the lift on top set plus back-offs again, and the pick-up rebuilds the
 * sets it owes at the day's new reserve (2, where it stood at 3), but straight, at the back-offs'
 * load: the drop it was planned with at the start of the day is gone, so the structure never comes
 * back today. The pick-up takes the day's new reserve and not its structure. It is the mirror of the
 * fifteenth review's MEDIUM (begun on the structure, fatigue taken high, picked up straight), which
 * the fifteenth pass fixed by taking the day as built.
 *
 * The rules: docs/reports/maintenance-32.md, item 11, "A lift picked up again, back at the gym or
 * swapped back to, carries on its back-offs after its top set, as it was lifted, and takes its top
 * set and back-offs before it"; the code's own words at `swapBack`, "Its top set not yet done, a top
 * set and back-offs, as the day plans them (item 11, the first review of round N)"; the fifteenth
 * pass, "a lift picked up again before its top set is the day's as built"; the generator's
 * `reopened`, "Picked up again, its sets to come are built afresh, as a swap back's are".
 *
 * Steps: Hybrid, five days a week. The bench press 9 days ago straight at 175; 5 days ago on top set
 * plus back-offs, top set 185 × 5 at 1, back-offs 3 × 175 at 2; tired check-ins after a squat, a leg
 * press and a row session since. Today's push day plans the bench press at 190 × 4-6 at 1, back-offs
 * 3 × 180 at 2. A low check-in before the start (energy 1): fatigue high, the bench press straight
 * at its back-offs' load, 3 × 175 at 3. Its first ramp logged; a good check-in (energy 4): fatigue
 * back to elevated, and a plan built now for the day puts the bench press on its top set and
 * back-offs again (190 at 1, 3 × 180 at 2). The bench press swapped for the dumbbell bench press and
 * back (or home and back to the gym).
 *
 * What happens at 604fba7, and at 14d2e62 (the previous head) alike: the bench press picked up at
 * 3 × 180 × 4-6 at 2, straight at the back-offs' load, where the day as built gives a top set at 190
 * at 1 and back-offs at 180 at 2. Synthetic data only.
 *
 * The fix (the sixteenth pass): a lift picked up again with no working set done is the day's as it
 * plans it now, on top set plus back-offs where the day leaves it them, its drop with it.
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

async function begunStraightThenBetter() {
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
  /** Each working set still to come: its tier, load and reserve. */
  const working = () =>
    bench()
      .sets.filter(
        (set) =>
          set.kind === 'working' &&
          !store
            .getSnapshot()
            .session!.completed.sets.some(
              (log) => log.entryId === bench().id && log.setIndex === set.index,
            ),
      )
      .map((set) => `${set.tier ?? 'straight'} ${set.targetWeight} at ${set.targetRir}`);
  expect(working()).toEqual([
    'top 190 at 1',
    'back-off 180 at 2',
    'back-off 180 at 2',
    'back-off 180 at 2',
  ]);
  // A low check-in before the start: fatigue high, the bench press straight at its back-offs' load.
  await store.recalibrate({ type: 'readiness', readiness: { ...tired, energy: 1 } });
  expect(working()).toEqual(['straight 175 at 3', 'straight 175 at 3', 'straight 175 at 3']);
  store.startWorkout();
  const ramp = bench().sets.find((set) => set.kind === 'warmup')!;
  await store.logSet(bench().id, ramp.index, { weight: ramp.targetWeight, reps: 5, rir: 5 });
  // A good check-in under way: fatigue back to elevated. The lift under way keeps its sets.
  const good = { ...tired, energy: 4, sleep: 4, soreness: 2, motivation: 4 };
  await store.recalibrate({ type: 'readiness', readiness: good });
  expect(working()).toEqual(['straight 175 at 3', 'straight 175 at 3', 'straight 175 at 3']);
  // The day as built now, under that check-in: the bench press on its top set and back-offs.
  const state = store.getSnapshot();
  const fresh = generateWorkout({
    profile: state.profile!,
    location: state.locations.find((place) => place.id === state.profile!.currentLocationId)!,
    history: state.history,
    now: TEST_NOW,
    duration: 'default',
    constraints: { templateId: state.session!.workout.templateId, readiness: good },
  });
  const planned = allEntries(fresh.blocks).find((entry) => entry.exerciseId === BENCH)!;
  expect(
    planned.sets
      .filter((set) => set.kind === 'working')
      .map((set) => `${set.tier ?? 'straight'} ${set.targetWeight} at ${set.targetRir}`),
  ).toEqual(['top 190 at 1', 'back-off 180 at 2', 'back-off 180 at 2', 'back-off 180 at 2']);
  return { store, entries, bench, working };
}

type Begun = Awaited<ReturnType<typeof begunStraightThenBetter>>;

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

describe('a main lift begun straight on a day of high fatigue, picked up once it is lower', () => {
  it.each([
    ['swapped away and back', swappedAwayAndBack],
    ['home and back', homeAndBack],
  ])('%s: takes its top set and back-offs, as the day plans them', async (_, pickUp) => {
    const begun = await begunStraightThenBetter();
    await pickUp(begun);
    // At 604fba7: ['straight 180 at 2', 'straight 180 at 2', 'straight 180 at 2'].
    expect(begun.working()).toEqual(['top 190 at 1', 'back-off 180 at 2', 'back-off 180 at 2']);
  });
});

describe('a main lift that regained its top set by a pick-up', () => {
  it.each([
    ['swapped away and back', swappedAwayAndBack],
    ['home and back', homeAndBack],
  ])('%s: its back-offs follow the top set as lifted, the drop with it', async (_, pickUp) => {
    // The sixteenth pass's own: the structure comes back with its drop, so its top set's log moves
    // the back-offs as on any day: a grind takes them a step down.
    const begun = await begunStraightThenBetter();
    await pickUp(begun);
    const { store, bench } = begun;
    const top = bench().sets.find((set) => set.tier === 'top')!;
    await store.logSet(bench().id, top.index, { weight: 190, reps: 2, rir: 0 });
    expect(begun.working()).toEqual(['back-off 175 at 2', 'back-off 175 at 2']);
  });
});
