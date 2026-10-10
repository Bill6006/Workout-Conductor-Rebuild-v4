import { describe, expect, it, vi } from 'vitest';
import { getExercise } from '../../catalog/exercises/catalog';
import { isHold } from '../../catalog/exercises/exerciseSchema';
import {
  ESTIMATED_MODES,
  dayAdjust,
  recalibrate as runRecalibration,
} from '../../engine/recalibration/recalibrate';
import { prescribeFor } from '../../engine/progression/roles';
import { setFloor } from '../../engine/workoutGenerator/generate';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';

/**
 * A store whose planned lifts were each logged twice lately, so their targets come from the log;
 * `engine` stands in for the recalibration engine where a test needs one that fails.
 */
async function trained(
  engine?: typeof runRecalibration,
  options: { overlayMs?: number; now?: () => string } = {},
) {
  const handle = createTestStore({
    minOverlayMs: options.overlayMs ?? 0,
    ...(engine ? { recalibrate: engine } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const planned = allEntries(handle.store.getSnapshot().session!.workout.blocks);
  const db = await handle.store.getDatabase();
  for (const daysAgo of [9, 5]) {
    const when = new Date(Date.parse(TEST_NOW) - daysAgo * 86_400_000).toISOString();
    for (const entry of planned) {
      const working = entry.sets.find((set) => set.kind === 'working');
      if (!working) continue;
      const weight = working.targetWeight ?? null;
      const reps = Math.round((working.targetReps[0] + working.targetReps[1]) / 2);
      await db.put('workouts', {
        ...record(
          daysAgo,
          entry.exerciseId,
          [
            [reps, weight, working.targetRir],
            [reps, weight, working.targetRir],
          ],
          working.targetReps,
          working.targetRir,
        ),
        id: `${entry.exerciseId}-${daysAgo}`,
        startedAt: when,
        completedAt: when,
      });
    }
  }
  await handle.store.hydrate();
  // With that history the plan turns to another day; a chest focus brings the logged lifts back.
  await handle.store.setCoachFocus('chest');
  return handle.store;
}

type Store = Awaited<ReturnType<typeof trained>>;

const entries = (store: Store) => allEntries(store.getSnapshot().session!.workout.blocks);

/** Lifts whose targets the log set, that are not holds: the ones a start is read from. */
function judgeable(store: Store): WorkoutEntry[] {
  return entries(store).filter((entry) => {
    const exercise = getExercise(entry.exerciseId);
    const mode = entry.progression?.mode;
    return (
      exercise &&
      !isHold(exercise) &&
      mode !== undefined &&
      !ESTIMATED_MODES.has(mode) &&
      entry.sets.some((set) => set.kind === 'working')
    );
  });
}

/**
 * Logs a lift's first working set three reps of capacity under what the plan asked: a reserve the
 * day's settings added is not counted against it.
 */
async function fallShort(store: Store, entry: WorkoutEntry) {
  store.skipWarmup(entry.id);
  const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
  const day = Math.max(0, dayAdjust(store.getSnapshot().session!.constraints)?.rir ?? 0);
  const reps = set.targetReps[0] + set.targetRir - day - 3;
  await store.logSet(entry.id, set.index, { weight: set.targetWeight, reps, rir: 0 });
}

/** Logs a lift's next working set as asked. */
async function logAsAsked(store: Store, entryId: string) {
  const session = store.getSnapshot().session!;
  const entry = allEntries(session.workout.blocks).find((candidate) => candidate.id === entryId)!;
  const done = new Set(
    session.completed.sets.filter((set) => set.entryId === entryId).map((set) => set.setIndex),
  );
  const set = entry.sets.find(
    (candidate) => candidate.kind === 'working' && !done.has(candidate.index),
  )!;
  await store.logSet(entryId, set.index, {
    weight: set.targetWeight,
    reps: set.targetReps[0],
    rir: set.targetRir,
  });
}

/** Brings on a hard start: the first two lifts that can be judged both fall well short. */
async function hardStart(store: Store) {
  store.startWorkout();
  const [first, second] = judgeable(store);
  await fallShort(store, first!);
  await fallShort(store, second!);
  expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
  return [first!, second!] as const;
}

/** Working sets and reserve of the lifts with nothing logged, by entry id. */
function notBegun(store: Store, begun: readonly string[]) {
  return new Map(
    entries(store)
      .filter((entry) => !begun.includes(entry.id))
      .map((entry) => {
        const working = entry.sets.filter((set) => set.kind === 'working');
        return [entry.exerciseId, { sets: working.length, rir: working[0]?.targetRir ?? null }];
      }),
  );
}

describe('a bad start carries over (Maintenance 26, item 42)', () => {
  it('eases the lifts still to come after the first two fall well short, and an undo brings the plan back', async () => {
    const store = await trained();
    store.startWorkout();
    const [first, second] = judgeable(store);
    expect(first && second).toBeTruthy();
    const begun = [first!.id, second!.id];
    const before = notBegun(store, begun);

    await fallShort(store, first!);
    expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined();
    await fallShort(store, second!);
    const session = store.getSnapshot().session!;
    expect(session.constraints.badStart).toBe(true);
    const names = [first!, second!]
      .map((entry) => getExercise(entry.exerciseId)!.name)
      .join(' and ');
    expect(session.lastSummary?.headline).toMatch(
      new RegExp(
        `^Eased for a hard start \\(${names} fell well short; fewer sets with an extra rep in reserve\\): `,
      ),
    );
    const after = notBegun(store, begun);
    let cut = 0;
    for (const [exerciseId, was] of before) {
      const now = after.get(exerciseId);
      if (!now) continue;
      // A set fewer where a lift had one to give, and a rep more in reserve up to the limit.
      expect(now.sets).toBeLessThanOrEqual(was.sets);
      if (now.sets < was.sets) cut += 1;
      if (was.rir !== null && now.rir !== null) expect(now.rir).toBeGreaterThanOrEqual(was.rir);
    }
    expect(cut).toBeGreaterThan(0);

    // Undone, the start no longer reads low: the planned sets and effort come back.
    store.undoLastSet();
    await vi.waitFor(() =>
      expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined(),
    );
    expect(store.getSnapshot().session!.lastSummary?.headline).toMatch(
      /^Back to plan \(the planned sets and effort back\): /,
    );
    const restored = notBegun(store, begun);
    for (const [exerciseId, was] of before) {
      const now = restored.get(exerciseId);
      if (now) expect(now).toEqual(was);
    }
  });

  it('a low check-in has already eased the rest: a bad start adds nothing on top', async () => {
    const store = await trained();
    await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 2,
        soreness: 2,
        sleep: 3,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
      },
    });
    store.startWorkout();
    const [first, second] = judgeable(store);
    const begun = [first!.id, second!.id];
    const before = notBegun(store, begun);
    await fallShort(store, first!);
    await fallShort(store, second!);
    const session = store.getSnapshot().session!;
    expect(session.constraints.badStart).toBe(true);
    expect(session.lastSummary?.headline).toMatch(
      // The second lift's own change from the same set is told with it.
      /^A hard start \(.+ fell well short\): your check-in already eased the rest\.( Also from this set: .+)?$/,
    );
    expect(notBegun(store, begun)).toEqual(before);
  });

  it('two reps short on each is ordinary variation: nothing changes', async () => {
    const store = await trained();
    store.startWorkout();
    const [first, second] = judgeable(store);
    for (const entry of [first!, second!]) {
      store.skipWarmup(entry.id);
      const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
      await store.logSet(entry.id, set.index, {
        weight: set.targetWeight,
        reps: set.targetReps[0] + set.targetRir - 2,
        rir: 0,
      });
    }
    expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined();
  });
});

describe('a bad start after the review of item 42', () => {
  it('stays taken back when the lifter undoes its change, while the start reads the same', async () => {
    const store = await trained();
    const [first] = await hardStart(store);
    await store.undoRecalibration();
    expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined();
    await logAsAsked(store, first.id);
    expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined();
    expect(store.getSnapshot().session!.lastSummary?.headline ?? '').not.toMatch(/hard start/);
  });

  it('keeps the ease when the lifter undoes "Back to plan"', async () => {
    const store = await trained();
    const [first] = await hardStart(store);
    store.undoLastSet();
    await vi.waitFor(() =>
      expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined(),
    );
    await store.undoRecalibration();
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
    await logAsAsked(store, first.id);
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
  });

  it('names the hard start when a check-in during the workout feels good: never "full workout kept"', async () => {
    const store = await trained();
    await hardStart(store);
    await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 4,
        soreness: 2,
        sleep: 4,
        motivation: 4,
        jointDiscomfort: [],
        timePressure: false,
      },
    });
    const session = store.getSnapshot().session!;
    expect(session.lastSummary?.headline).toBe(
      'Feeling good: the rest stays eased for the hard start.',
    );
    expect(session.constraints.badStart).toBe(true);
  });

  it('tries a change that could not be made only once for the same reading', async () => {
    const tries: string[] = [];
    const store = await trained((request) => {
      tries.push(request.trigger.type);
      if (request.trigger.type === 'bad-start') throw new Error('the engine failed');
      return runRecalibration(request);
    });
    store.startWorkout();
    const [first, second] = judgeable(store);
    await fallShort(store, first!);
    await fallShort(store, second!);
    expect(tries.filter((type) => type === 'bad-start')).toHaveLength(1);
    await logAsAsked(store, first!.id);
    await logAsAsked(store, second!.id);
    expect(tries.filter((type) => type === 'bad-start')).toHaveLength(1);
  });

  it("tells the same set's own change with the hard start, and takes both back with Undo", async () => {
    const store = await trained();
    store.startWorkout();
    const [first, second] = judgeable(store);
    await fallShort(store, first!);
    const planned = allEntries(store.getSnapshot().session!.workout.blocks)
      .find((entry) => entry.id === second!.id)!
      .sets.map((set) => set.targetWeight);
    await fallShort(store, second!);
    const session = store.getSnapshot().session!;
    expect(session.constraints.badStart).toBe(true);
    const headline = session.lastSummary?.headline ?? '';
    expect(headline).toMatch(/^Eased for a hard start \(/);
    expect(headline).toMatch(/ Also from this set: /);
    await store.undoRecalibration();
    const undone = store.getSnapshot().session!;
    expect(undone.constraints.badStart).toBeUndefined();
    expect(
      allEntries(undone.workout.blocks)
        .find((entry) => entry.id === second!.id)!
        .sets.map((set) => set.targetWeight),
    ).toEqual(planned);
  });

  it('leaves out a lift whose target the lifter set by hand before its first set', async () => {
    const store = await trained();
    store.startWorkout();
    const [first, second] = judgeable(store);
    const set = first!.sets.find((candidate) => candidate.kind === 'working')!;
    await store.recalibrate({
      type: 'target-weight',
      entryId: first!.id,
      weight: Math.max(0, (set.targetWeight ?? 0) - 10),
    });
    const lowered = allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.id === first!.id,
    )!;
    await fallShort(store, lowered);
    expect(store.getSnapshot().session!.completed.sets.some((done) => done.byHand)).toBe(true);
    await fallShort(store, second!);
    expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined();
  });

  it('counts no reserve a low check-in added: two short of the plan is no hard start', async () => {
    const store = await trained();
    await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 2,
        soreness: 2,
        sleep: 3,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
      },
    });
    store.startWorkout();
    const [first, second] = judgeable(store);
    for (const entry of [first!, second!]) {
      store.skipWarmup(entry.id);
      const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
      // Three short of the target as eased, two short of the plan.
      await store.logSet(entry.id, set.index, {
        weight: set.targetWeight,
        reps: set.targetReps[0] + set.targetRir - 3,
        rir: 0,
      });
    }
    expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined();
  });

  it('says the start no longer falls short, not "Back to plan", while a sore check-in still takes a set', async () => {
    const store = await trained();
    await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 3,
        soreness: 4,
        sleep: 3,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
      },
    });
    await hardStart(store);
    store.undoLastSet();
    await vi.waitFor(() =>
      expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined(),
    );
    const headline = store.getSnapshot().session!.lastSummary?.headline ?? '';
    expect(headline).toMatch(/^Your start no longer falls short/);
    expect(headline).toContain("today's other settings stay");
    expect(headline).not.toMatch(/Back to plan/);
  });

  it('leaves out a lift that fell under its floor last time: the store reads the history', async () => {
    const store = await trained();
    const [missed] = judgeable(store);
    const set = missed!.sets.find((candidate) => candidate.kind === 'working')!;
    // Two days ago it fell two reps under its floor.
    const db = await store.getDatabase();
    const when = new Date(Date.parse(TEST_NOW) - 2 * 86_400_000).toISOString();
    await db.put('workouts', {
      ...record(
        2,
        missed!.exerciseId,
        [[set.targetReps[0] - 2, set.targetWeight ?? null, 0]],
        set.targetReps,
        set.targetRir,
      ),
      id: `${missed!.exerciseId}-under`,
      startedAt: when,
      completedAt: when,
    });
    await store.hydrate();
    await store.setCoachFocus('chest');
    store.startWorkout();
    const lifts = judgeable(store);
    const again = lifts.find((entry) => entry.exerciseId === missed!.exerciseId);
    const other = lifts.find((entry) => entry.exerciseId !== missed!.exerciseId);
    expect(again && other).toBeTruthy();
    await fallShort(store, again!);
    await fallShort(store, other!);
    expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined();
  });

  it('leaves the reading as it was when a target is set by hand after the first set', async () => {
    const store = await trained();
    const [first] = await hardStart(store);
    const set = allEntries(store.getSnapshot().session!.workout.blocks)
      .find((entry) => entry.id === first.id)!
      .sets.find((candidate) => candidate.kind === 'working' && candidate.index > 0)!;
    await store.recalibrate({
      type: 'target-weight',
      entryId: first.id,
      weight: Math.max(0, (set.targetWeight ?? 0) - 10),
    });
    await logAsAsked(store, first.id);
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
  });
});

const LOW = {
  energy: 2,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};
const GOOD = { ...LOW, energy: 4, sleep: 4, motivation: 4 };

/** An entry as the session has it now. */
const entryOf = (store: Store, id: string) => entries(store).find((entry) => entry.id === id)!;
/** The reserve the plan itself asks of a lift, before any of the day's settings. */
function planRir(store: Store, entry: WorkoutEntry): number {
  const exercise = getExercise(entry.exerciseId)!;
  const { profile, history } = store.getSnapshot();
  return prescribeFor(exercise, entry.role, profile!, history).rir;
}
/** Logs a lift's first working set `by` reps of capacity under what the plan asked. */
async function shortOfPlan(store: Store, entry: WorkoutEntry, by: number) {
  const current = entryOf(store, entry.id);
  const set = current.sets.find((candidate) => candidate.kind === 'working')!;
  await store.logSet(current.id, set.index, {
    weight: set.targetWeight,
    reps: set.targetReps[0] + planRir(store, current) - by,
    rir: 0,
  });
}

describe('a bad start after the re-check of item 42', () => {
  it("reads the plan's reserve on a lift that kept an earlier check-in's: two short of it is no hard start", async () => {
    const store = await trained();
    await store.recalibrate({ type: 'readiness', readiness: LOW });
    store.startWorkout();
    const [first, second] = judgeable(store);
    // The first lift begun (its ramps skipped) keeps its sets through a good check-in after.
    store.skipWarmup(first!.id);
    await store.recalibrate({ type: 'readiness', readiness: GOOD });
    const kept = entryOf(store, first!.id).sets.find((set) => set.kind === 'working')!;
    expect(kept.targetRir).toBeGreaterThan(planRir(store, entryOf(store, first!.id)));
    await shortOfPlan(store, first!, 2);
    await shortOfPlan(store, second!, 3);
    expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined();
  });

  it("reads the plan's reserve on a lift begun before a low check-in: three short of it is a hard start", async () => {
    const store = await trained();
    store.startWorkout();
    const [first, second] = judgeable(store);
    store.skipWarmup(first!.id);
    await store.recalibrate({ type: 'readiness', readiness: LOW });
    await shortOfPlan(store, first!, 3);
    store.skipWarmup(second!.id);
    await shortOfPlan(store, second!, 3);
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
  });

  it('leaves out lifts whose targets an entered max raised', async () => {
    const store = await trained();
    const raised = judgeable(store)
      .filter((entry) => entry.sets.some((set) => set.kind === 'working' && set.targetWeight))
      .slice(0, 2);
    expect(raised).toHaveLength(2);
    for (const entry of raised) {
      const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
      await store.recordStrengthMax(entry.exerciseId, {
        kind: 'max',
        e1rm: (set.targetWeight as number) * 3,
      });
    }
    store.startWorkout();
    for (const entry of raised) {
      expect(entryOf(store, entry.id).progression?.fromMax).toBe(true);
      store.skipWarmup(entry.id);
      await shortOfPlan(store, entry, 3);
    }
    expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined();
  });

  it('marks a skipped set filled in later by its target then: one set by hand is left out', async () => {
    const store = await trained();
    store.startWorkout();
    const [first, second] = judgeable(store);
    const set = first!.sets.find((candidate) => candidate.kind === 'working')!;
    await store.recalibrate({
      type: 'target-weight',
      entryId: first!.id,
      weight: Math.max(0, (set.targetWeight ?? 0) - 10),
    });
    store.skipWarmup(first!.id);
    store.skipSet(first!.id, set.index);
    await shortOfPlan(store, first!, 3);
    const filled = store
      .getSnapshot()
      .session!.completed.sets.find(
        (done) => done.entryId === first!.id && done.setIndex === set.index,
      );
    expect(filled?.skipped).toBe(false);
    expect(filled?.byHand).toBe(true);
    store.skipWarmup(second!.id);
    await shortOfPlan(store, second!, 3);
    expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined();
  });

  it('tries again in a new session after a change that could not be made', async () => {
    let fail = true;
    const tries: string[] = [];
    const store = await trained((request) => {
      tries.push(request.trigger.type);
      if (fail && request.trigger.type === 'bad-start') throw new Error('the engine failed');
      return runRecalibration(request);
    });
    store.startWorkout();
    let [first, second] = judgeable(store);
    await fallShort(store, first!);
    await fallShort(store, second!);
    expect(tries.filter((type) => type === 'bad-start')).toHaveLength(1);
    expect(store.getSnapshot().session!.startFailed).toMatch(/^low:/);
    store.discardWorkout();
    fail = false;
    expect(store.getSnapshot().session!.startFailed).toBeUndefined();
    store.startWorkout();
    [first, second] = judgeable(store);
    await fallShort(store, first!);
    await fallShort(store, second!);
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
  });

  it('reads the start again as a queued change runs: two quick undos say nothing of a check-in', async () => {
    const store = await trained();
    await hardStart(store);
    store.undoLastSet();
    store.undoLastSet();
    await vi.waitFor(() => expect(store.getSnapshot().calibration.status).toBe('idle'));
    await vi.waitFor(() =>
      expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined(),
    );
    await store.recalibrate({ type: 'readiness', readiness: { ...GOOD, energy: 3 } });
    const words = store
      .getSnapshot()
      .session!.log.map((entry) => entry.headline)
      .join(' | ');
    expect(words).not.toMatch(/your check-in still eases/);
  });

  it('names the hard start when a check-in after a low one feels good: never "nothing left to change"', async () => {
    const store = await trained();
    await store.recalibrate({ type: 'readiness', readiness: LOW });
    await hardStart(store);
    await store.recalibrate({ type: 'readiness', readiness: GOOD });
    const session = store.getSnapshot().session!;
    expect(session.constraints.badStart).toBe(true);
    // The hard start's own ease now stands for the check-in's: said, with what changed (the
    // seventh pass), never "nothing left to change".
    expect(session.lastSummary?.headline).toMatch(
      /^Feeling good \(the rest eased for the hard start\): .*adjusted\.$/,
    );
  });
});

describe('a bad start after the third pass of item 42', () => {
  it("leaves a saved workout's lifts unread: their targets are the day it was saved's", async () => {
    const store = await trained();
    const saved = await store.saveCurrentWorkout('Saved for later');
    store.loadSavedWorkout(saved.id);
    for (const entry of entries(store)) {
      if (entry.progression) expect(entry.progression.saved).toBe(true);
    }
    store.startWorkout();
    const [first, second] = judgeable(store);
    await fallShort(store, first!);
    await fallShort(store, second!);
    expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined();
  });

  it("keeps with each working set the plan's reserve when it was logged", async () => {
    const store = await trained();
    store.startWorkout();
    const [first] = judgeable(store);
    store.skipWarmup(first!.id);
    await logAsAsked(store, first!.id);
    const done = store
      .getSnapshot()
      .session!.completed.sets.find((set) => set.entryId === first!.id && !set.skipped);
    expect(done?.planRir).toBe(planRir(store, entryOf(store, first!.id)));
  });

  it('times a skipped set filled in later by when it was filled in', async () => {
    let clock = Date.parse(TEST_NOW);
    const store = await trained(undefined, { now: () => new Date(clock).toISOString() });
    store.startWorkout();
    const [first] = judgeable(store);
    const set = first!.sets.find((candidate) => candidate.kind === 'working')!;
    store.skipWarmup(first!.id);
    store.skipSet(first!.id, set.index);
    clock += 10 * 60_000;
    await store.logSet(first!.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[0],
      rir: set.targetRir,
    });
    const filled = store
      .getSnapshot()
      .session!.completed.sets.find(
        (done) => done.entryId === first!.id && done.setIndex === set.index,
      );
    expect(filled?.completedAt).toBe(new Date(clock).toISOString());
  });

  it("leaves the same set's failed change in view: the start is read on the next set", async () => {
    const tries: string[] = [];
    const store = await trained((request) => {
      tries.push(request.trigger.type);
      if (request.trigger.type === 'performance') throw new Error('the engine failed');
      return runRecalibration(request);
    });
    store.startWorkout();
    const [first, second] = judgeable(store);
    await fallShort(store, first!);
    await fallShort(store, second!);
    expect(tries).toContain('performance');
    expect(tries).not.toContain('bad-start');
    expect(store.getSnapshot().calibration.status).toBe('error');
  });

  it('makes no change the lifter took back, though one is asked for directly', async () => {
    const store = await trained();
    const [first, second] = await hardStart(store);
    await store.undoRecalibration();
    expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined();
    const result = await store.recalibrate({
      type: 'bad-start',
      low: true,
      lifts: [first.exerciseId, second.exerciseId],
    });
    expect(result).toBeNull();
    expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined();
  });

  it('hands a change that could not be made to no other plan: one discarded meanwhile', async () => {
    const store = await trained(
      (request) => {
        if (request.trigger.type === 'bad-start') throw new Error('the engine failed');
        return runRecalibration(request);
      },
      { overlayMs: 40 },
    );
    store.startWorkout();
    const [first, second] = judgeable(store);
    await fallShort(store, first!);
    const logging = fallShort(store, second!);
    await vi.waitFor(() =>
      expect(store.getSnapshot().calibration.title).toBe('Easing the rest after a hard start'),
    );
    store.discardWorkout();
    await logging;
    expect(store.getSnapshot().session!.status).toBe('preview');
    expect(store.getSnapshot().session!.startFailed).toBeUndefined();
  });

  it("tells the set's own change with the hard start only when nothing ran between them", async () => {
    const store = await trained();
    store.startWorkout();
    const [first, second] = judgeable(store);
    await fallShort(store, first!);
    const logging = fallShort(store, second!);
    const easier = store.recalibrate({ type: 'intensity', direction: 'easier' });
    await Promise.all([logging, easier]);
    const session = store.getSnapshot().session!;
    expect(session.constraints.badStart).toBe(true);
    expect(session.lastSummary?.headline ?? '').not.toMatch(/Also from this set/);
  });
});

describe('a bad start after the fourth pass of item 42', () => {
  it('gives the plan that follows a workout discarded during the change nothing of it', async () => {
    const store = await trained(undefined, { overlayMs: 40 });
    store.startWorkout();
    const [first, second] = judgeable(store);
    await fallShort(store, first!);
    const logging = fallShort(store, second!);
    await vi.waitFor(() =>
      expect(store.getSnapshot().calibration.title).toBe('Easing the rest after a hard start'),
    );
    store.discardWorkout();
    await logging;
    const session = store.getSnapshot().session!;
    expect(session.status).toBe('preview');
    expect(session.constraints.badStart).toBeUndefined();
    expect(session.lastSummary?.headline ?? '').not.toMatch(/hard start/);
  });
});

describe('a bad start after the fifth pass of item 42', () => {
  /** Each lift's working sets: their count, reserve and weights, by entry id. */
  const shape = (store: Store) =>
    new Map(
      entries(store).map((entry) => {
        const working = entry.sets.filter((set) => set.kind === 'working');
        return [
          entry.id,
          {
            exerciseId: entry.exerciseId,
            sets: working.length,
            rir: working.map((set) => set.targetRir),
            weights: working.map((set) => set.targetWeight),
          },
        ] as const;
      }),
    );

  it('eases the lifts still to come where they stand, and gives exactly that back', async () => {
    const store = await trained();
    await store.setDurationChoice(30);
    store.startWorkout();
    const [first, second] = judgeable(store);
    const begun = [first!.id, second!.id];
    const before = shape(store);
    await fallShort(store, first!);
    await fallShort(store, second!);
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
    const eased = shape(store);
    // The same lifts in the same order: nothing picked again, added or taken away.
    expect([...eased.keys()]).toEqual([...before.keys()]);
    for (const [id, was] of before) {
      const now = eased.get(id)!;
      expect(now.exerciseId).toBe(was.exerciseId);
      if (begun.includes(id)) {
        // A lift under way keeps its sets.
        expect(now.sets).toBe(was.sets);
        continue;
      }
      // A set fewer above the floor a check-in keeps (the sixth pass), and a rep more in reserve,
      // never heavier; a hold's seconds stay.
      const role = entries(store).find((entry) => entry.id === id)!.role;
      expect(now.sets).toBe(was.sets > setFloor(role) ? was.sets - 1 : was.sets);
      if (isHold(getExercise(was.exerciseId))) continue;
      expect(now.rir[0]).toBe(Math.min(4, (was.rir[0] ?? 0) + 1));
      now.weights.forEach((weight, at) =>
        expect(weight ?? 0).toBeLessThanOrEqual(was.weights[at] ?? 0),
      );
    }
    // The start no longer falls short: exactly what was taken comes back.
    store.undoLastSet();
    await vi.waitFor(() =>
      expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined(),
    );
    const back = shape(store);
    expect([...back.keys()]).toEqual([...before.keys()]);
    for (const [id, was] of before) {
      if (begun.includes(id)) continue;
      expect(back.get(id)!.sets).toBe(was.sets);
      expect(back.get(id)!.rir).toEqual(was.rir);
      expect(back.get(id)!.weights).toEqual(was.weights);
    }
  });

  it('keeps a weight the lifter set by hand on a lift still to come: a set off, a rep more in reserve', async () => {
    const store = await trained();
    store.startWorkout();
    const [first, second] = judgeable(store);
    const third = entries(store).find(
      (entry) =>
        entry.id !== first!.id &&
        entry.id !== second!.id &&
        entry.sets.filter((set) => set.kind === 'working').length > 1 &&
        entry.sets.some((set) => set.kind === 'working' && (set.targetWeight ?? 0) > 20),
    )!;
    const set = third.sets.find((candidate) => candidate.kind === 'working')!;
    await store.recalibrate({
      type: 'target-weight',
      entryId: third.id,
      weight: (set.targetWeight as number) - 10,
    });
    const handSet = entryOf(store, third.id).sets.filter((done) => done.kind === 'working');
    await fallShort(store, first!);
    await fallShort(store, second!);
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
    const eased = entryOf(store, third.id).sets.filter((done) => done.kind === 'working');
    expect(eased).toHaveLength(handSet.length - 1);
    expect(eased.map((done) => done.targetWeight)).toEqual(
      handSet.slice(0, -1).map((done) => done.targetWeight),
    );
    expect(eased[0]!.targetRir).toBe(handSet[0]!.targetRir + 1);
  });

  it('eases a lift the coach added: the sets it offered kept, a rep more in reserve', async () => {
    const store = await trained();
    store.startWorkout();
    await store.recalibrate({
      type: 'add-exercise',
      exerciseId: 'leg-extension',
      muscle: 'quads',
      sets: 3,
    });
    const added = entries(store).find((entry) => entry.exerciseId === 'leg-extension')!;
    const was = added.sets.filter((set) => set.kind === 'working');
    const [first, second] = judgeable(store);
    await fallShort(store, first!);
    await fallShort(store, second!);
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
    const now = entryOf(store, added.id).sets.filter((set) => set.kind === 'working');
    // The coach's offer is the count it said (the sixth pass), as a count set by hand is.
    expect(now).toHaveLength(was.length);
    now.forEach((set, at) => {
      const asked = was[at]!;
      expect(set.targetRir).toBe(Math.min(4, asked.targetRir + 1));
      expect(set.targetWeight ?? 0).toBeLessThanOrEqual(asked.targetWeight ?? 0);
      if (set.targetWeight === asked.targetWeight) {
        expect(set.targetReps[1]).toBe(asked.targetReps[1] - 1);
      }
    });
  });

  it('keeps a change to a plan not yet started though the plan is made again during it', async () => {
    let clock = Date.parse(TEST_NOW);
    const store = await trained(undefined, {
      overlayMs: 300,
      now: () => new Date(clock).toISOString(),
    });
    const profile = store.getSnapshot().profile!;
    const places = store.getSnapshot().locations;
    const other = places.find((place) => place.id !== profile.currentLocationId)!;
    const changing = store.setDurationChoice(30);
    await vi.waitFor(() => expect(store.getSnapshot().calibration.status).toBe('running'));
    clock += 60_000;
    // A profile saved meanwhile makes the plan's inputs new: Today makes the plan again on its way
    // in, while the change still runs.
    const saving = store.saveProfile({ ...profile, currentLocationId: other.id });
    store.refreshSession();
    await Promise.all([changing, saving]);
    expect(store.getSnapshot().session!.duration).toBe(30);
    // Worked out again on the plan made for the new place (the sixth pass).
    expect(store.getSnapshot().session!.workout.locationId).toBe(other.id);
  });
});

describe('a bad start after the sixth pass of item 42: a plan made again while a change runs', () => {
  it('works the change out again on a plan a pulled workout made again', async () => {
    let clock = Date.parse(TEST_NOW);
    const seen: string[] = [];
    const store = await trained(
      (request) => {
        seen.push(request.workout.generatedAt);
        return runRecalibration(request);
      },
      { overlayMs: 300, now: () => new Date(clock).toISOString() },
    );
    const before = store.getSnapshot().session!;
    const changing = store.setDurationChoice(30);
    await vi.waitFor(() => expect(store.getSnapshot().calibration.status).toBe('running'));
    clock += 60_000;
    // A workout pulled in from another device lands meanwhile: today's plan is made again.
    const db = await store.getDatabase();
    const when = new Date(clock).toISOString();
    const first = allEntries(before.workout.blocks)[0]!;
    await db.put('workouts', {
      ...record(0, first.exerciseId, [[8, 100, 2]]),
      id: 'pulled-in',
      startedAt: when,
      completedAt: when,
    });
    await store.hydrate();
    const remade = store.getSnapshot().session!;
    expect(remade.createdAt).not.toBe(before.createdAt);
    await changing;
    const after = store.getSnapshot().session!;
    expect(after.duration).toBe(30);
    expect(after.createdAt).toBe(remade.createdAt);
    expect(after.baseKey).toBe(remade.baseKey);
    // The change ran on the old plan, then again on the plan made again: its result stands.
    expect(seen).toEqual([before.workout.generatedAt, remade.workout.generatedAt]);
  });

  it('leaves a change aimed at one of its lifts: the plan made again picked them anew', async () => {
    let clock = Date.parse(TEST_NOW);
    const store = await trained(undefined, {
      overlayMs: 300,
      now: () => new Date(clock).toISOString(),
    });
    const before = store.getSnapshot().session!;
    const lift = entries(store)[1]!;
    const skipping = store.skipExercise(lift.id);
    await vi.waitFor(() => expect(store.getSnapshot().calibration.status).toBe('running'));
    clock += 60_000;
    const db = await store.getDatabase();
    const when = new Date(clock).toISOString();
    await db.put('workouts', {
      ...record(0, allEntries(before.workout.blocks)[0]!.exerciseId, [[8, 100, 2]]),
      id: 'pulled-in',
      startedAt: when,
      completedAt: when,
    });
    await store.hydrate();
    const remade = store.getSnapshot().session!;
    expect(remade.createdAt).not.toBe(before.createdAt);
    expect((await skipping).kind).toBe('unchanged');
    expect(store.getSnapshot().session).toBe(remade);
    // Left, it says so (the seventh pass: it was dropped without a word).
    expect(store.getSnapshot().calibration).toMatchObject({
      status: 'error',
      error: "Today's plan was made again while this ran, so nothing changed: try it again.",
    });
  });
});

describe('a bad start after the sixth pass of item 42: a plan made again twice', () => {
  it('works a change out again once only: a plan made again a second time takes nothing', async () => {
    let clock = Date.parse(TEST_NOW);
    const seen: string[] = [];
    let armed = false;
    let remakes = 0;
    const holder: { store?: Store } = {};
    const remake = async () => {
      clock += 60_000;
      const store = holder.store!;
      const db = await store.getDatabase();
      const when = new Date(clock).toISOString();
      await db.put('workouts', {
        ...record(0, 'barbell-row', [[8, 100, 2]]),
        id: `pulled-in-${clock}`,
        startedAt: when,
        completedAt: when,
      });
      await store.hydrate();
    };
    holder.store = await trained(
      (request) => {
        if (armed) {
          seen.push(request.workout.generatedAt);
          // Each run, a workout pulled in makes the plan again while it runs (three at most).
          if (remakes < 3) {
            remakes += 1;
            void remake();
          }
        }
        return runRecalibration(request);
      },
      { overlayMs: 300, now: () => new Date(clock).toISOString() },
    );
    const store = holder.store;
    armed = true;
    await store.setDurationChoice(30);
    await vi.waitFor(() => expect(store.getSnapshot().calibration.status).toBe('error'));
    // Run on the plan, then once on the plan made again; made again a second time, it stops.
    expect(seen).toHaveLength(2);
    expect(store.getSnapshot().session!.duration).toBe('default');
  });
});

describe('a bad start after the sixth pass of item 42: saved copies', () => {
  it("saves the plan under the ease, with no marks: the ease was today's", async () => {
    const store = await trained();
    const [first, second] = await hardStart(store);
    // A lift begun during the ease, then a change: its record kept for good, yet the copy has the plan.
    const under = entries(store).find((entry) => entry.eased?.sets !== undefined)!;
    const underPlan = under.eased!.sets!;
    await logAsAsked(store, under.id);
    await store.recalibrate({ type: 'rest-adjust', entryId: under.id, deltaSeconds: 15 });
    const eased = entries(store).filter((entry) => entry.eased?.sets !== undefined);
    expect(eased.length).toBeGreaterThan(0);
    const saved = await store.saveCurrentWorkout('After a hard start');
    const kept = allEntries(saved.workout.blocks);
    expect(kept.some((entry) => entry.eased)).toBe(false);
    for (const entry of eased) {
      const copy = kept.find((candidate) => candidate.id === entry.id)!;
      // The plan's own sets and reasons, never the hard start's line.
      expect(copy.sets).toEqual(entry.eased!.sets);
      expect(copy.progression?.evidence[0] ?? '').not.toMatch(/^Eased for a hard start/);
    }
    expect(
      kept
        .find((candidate) => candidate.id === under.id)!
        .sets.filter((set) => set.kind === 'working'),
    ).toHaveLength(underPlan.filter((set) => set.kind === 'working').length);
    // The time is the plan's whole, not the minutes left (the eighth pass).
    expect(saved.workout.duration.estimatedMinutes).toBeGreaterThan(
      store.getSnapshot().session!.workout.duration.estimatedMinutes,
    );
    // A lift begun keeps what it was asked.
    for (const begun of [first, second]) {
      expect(kept.find((candidate) => candidate.id === begun.id)!.sets).toEqual(
        entryOf(store, begun.id).sets,
      );
    }
  });
});

describe('a bad start after the fifth pass of item 42, its edges', () => {
  it('keeps a count of sets the lifter set by hand: only its reserve moves', async () => {
    const store = await trained();
    store.startWorkout();
    const [first, second] = judgeable(store);
    const third = entries(store).find(
      (entry) =>
        entry.id !== first!.id &&
        entry.id !== second!.id &&
        entry.sets.filter((set) => set.kind === 'working').length > 1,
    )!;
    await store.recalibrate({ type: 'sets', entryId: third.id, workingDelta: 1 });
    const chosen = entryOf(store, third.id).sets.filter((set) => set.kind === 'working');
    await fallShort(store, first!);
    await fallShort(store, second!);
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
    const eased = entryOf(store, third.id).sets.filter((set) => set.kind === 'working');
    expect(eased).toHaveLength(chosen.length);
    expect(eased[0]!.targetRir).toBe(chosen[0]!.targetRir + 1);
  });

  it("counts a lift's sets as the plan does, a drop set apart", async () => {
    const store = await trained();
    await store.setDurationChoice(45);
    store.startWorkout();
    const [first, second] = judgeable(store);
    await fallShort(store, first!);
    await fallShort(store, second!);
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
    const straight = store
      .getSnapshot()
      .session!.workout.blocks.filter((block) => block.kind === 'straight');
    expect(
      straight.some((block) => block.entries[0]!.sets.some((set) => set.kind === 'drop')),
    ).toBe(true);
    for (const block of straight) {
      expect(block.rounds).toBe(
        block.entries[0]!.sets.filter((set) => set.kind === 'working').length,
      );
    }
  });

  it('gives a workout finished during the change nothing of it', async () => {
    const store = await trained(undefined, { overlayMs: 40 });
    store.startWorkout();
    const [first, second] = judgeable(store);
    await fallShort(store, first!);
    const logging = fallShort(store, second!);
    await vi.waitFor(() =>
      expect(store.getSnapshot().calibration.title).toBe('Easing the rest after a hard start'),
    );
    await store.finishWorkout(null);
    await logging;
    const session = store.getSnapshot().session!;
    expect(session.status).toBe('completed');
    expect(session.constraints.badStart).toBeUndefined();
  });

  it('gives a workout discarded and started again during the change nothing of it', async () => {
    let clock = Date.parse(TEST_NOW);
    const store = await trained(undefined, {
      overlayMs: 40,
      now: () => new Date(clock).toISOString(),
    });
    store.startWorkout();
    const [first, second] = judgeable(store);
    await fallShort(store, first!);
    const logging = fallShort(store, second!);
    await vi.waitFor(() =>
      expect(store.getSnapshot().calibration.title).toBe('Easing the rest after a hard start'),
    );
    clock += 60_000;
    store.discardWorkout();
    store.startWorkout();
    await logging;
    const session = store.getSnapshot().session!;
    expect(session.status).toBe('active');
    expect(session.constraints.badStart).toBeUndefined();
  });
});

describe('a bad start after the seventh pass of item 42: an undo after it', () => {
  it('keeps the ease on a lift begun during it once its set goes, the start no longer short', async () => {
    const store = await trained();
    const [, second] = await hardStart(store);
    const third = entries(store).find((entry) => entry.eased !== undefined)!;
    await logAsAsked(store, third.id);
    // The second lift's set corrected as asked: the start no longer falls short.
    const set = second.sets.find((candidate) => candidate.kind === 'working')!;
    await store.logSet(second.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[1],
      rir: set.targetRir,
    });
    await vi.waitFor(() =>
      expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined(),
    );
    // Under way, the third lift keeps its eased sets.
    const working = () => entryOf(store, third.id).sets.filter((done) => done.kind === 'working');
    expect(working()).toHaveLength(third.sets.filter((done) => done.kind === 'working').length);
    // Its set gone, it keeps the ease for good (the eighth pass): nothing runs, and no later change
    // puts back a plan the others have since passed by.
    const kept = working();
    const log = store.getSnapshot().session!.log.length;
    const logged = store
      .getSnapshot()
      .session!.completed.sets.find((done) => done.entryId === third.id)!;
    store.deleteLoggedSet(third.id, logged.setIndex);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.getSnapshot().session!.log).toHaveLength(log);
    expect(working()).toEqual(kept);
    const other = entries(store).find(
      (entry) =>
        entry.id !== third.id &&
        !store.getSnapshot().session!.completed.sets.some((done) => done.entryId === entry.id),
    )!;
    await store.recalibrate({ type: 'pin', entryId: other.id, pinned: true });
    expect(working()).toEqual(kept);
  });
});

describe('a bad start after the seventh pass of item 42: a reading sent again', () => {
  it('does nothing with a hard start sent again while it is in force', async () => {
    const store = await trained();
    const [first, second] = await hardStart(store);
    const logged = store.getSnapshot().session!.log.length;
    const result = await store.recalibrate({
      type: 'bad-start',
      low: true,
      lifts: [first.exerciseId, second.exerciseId],
    });
    expect(result).toBeNull();
    expect(store.getSnapshot().session!.log).toHaveLength(logged);
  });
});

describe('a set logged and undone before any change takes the plan back (Maintenance 26, the twelfth pass of item 42)', () => {
  for (const undo of ['removed', 'undone'] as const) {
    it(`gives the plan back to a lift whose one set was ${undo} before any change ran`, async () => {
      const store = await trained();
      const [first, second] = await hardStart(store);
      const eased = entries(store).find(
        (entry) =>
          entry.id !== first.id &&
          entry.id !== second.id &&
          entry.eased?.sets !== undefined &&
          entry.sets.filter((set) => set.kind === 'working').length <
            entry.eased.sets.filter((set) => set.kind === 'working').length,
      )!;
      const shown = eased.sets.filter((set) => set.kind === 'working').length;
      await logAsAsked(store, eased.id);
      const set = store.getSnapshot().session!.completed.sets.at(-1)!;
      if (undo === 'removed') store.deleteLoggedSet(eased.id, set.setIndex);
      else store.undoLastSet();
      // The second lift corrected: the start no longer falls short.
      const own = entries(store).find((entry) => entry.id === second.id)!;
      const firstSet = own.sets.find((candidate) => candidate.kind === 'working')!;
      await store.logSet(second.id, firstSet.index, {
        weight: firstSet.targetWeight,
        reps: firstSet.targetReps[0] + firstSet.targetRir,
        rir: 0,
      });
      await vi.waitFor(() =>
        expect(store.getSnapshot().session!.constraints.badStart).toBeUndefined(),
      );
      // Nothing passed its record by: it comes back with the rest.
      const planned = eased.eased!.sets!.filter((candidate) => candidate.kind === 'working').length;
      expect(planned).toBeGreaterThan(shown);
      const after = entries(store).find((entry) => entry.id === eased.id)!;
      expect(after.sets.filter((candidate) => candidate.kind === 'working')).toHaveLength(planned);
    });
  }
});
