import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { backOffDropFor } from '../../engine/progression/backOffs';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The twelfth review of round N. The coach's deload ("Deload to 125 lb this week", `target-weight`
 * with `deload`), taken on a main lift whose top set was skipped (the coach offers a weight while no
 * set is lifted, a skip included), puts the back-offs at the deload's load but records it as nobody's
 * (`manual.weight` set, `manual.backOffs` left out because of `deload`), and the structure stays on
 * (the deload takes it off only before the top set is done). So every replay of the back-offs reads
 * them as following the top set: an undo of a back-off logged at the deload's load, or a correction
 * of its reps, puts the ones still to come back at the drop off the top set's plan.
 *
 * The rules (docs/reports/maintenance-32.md): the first review's MEDIUM, "the coach's deload of a
 * stalled main lift ('Deload to 170 lb this week') kept a top set one rep short of failure, where
 * every eased load runs straight"; the eighth's MEDIUM, "taking its log back, put the back-offs still
 * to come back at the top set's load, a weight set by hand thrown away" (fixed: "A weight set by hand
 * stays through corrections and logs taken back"); item 11, a weight set once the top set is done:
 * "the back-offs take it".
 *
 * The saved session has no `backOffAt` (no top set lifted), so the drop's correction reads every
 * back-off of it as lifted at the drop: two such sessions with the deload's lighter back-offs rated
 * easy narrow the drop to nothing (the ninth pass: "the drop's correction reads only back-offs lifted
 * at it").
 *
 * Steps: the main lift (barbell row) planned at 140 × 4-6 at 1, back-offs 135. The top set skipped;
 * the coach's deload to 125 taken: back-offs 125. Back-off 1 logged at 125 × 5 at 2, back-off 2 the
 * same, then undone. Or back-off 1's reps corrected, 125 × 6 at 2. Or every back-off lifted at 125 ×
 * 6 at 4 and the workout finished, the same session two days before it.
 *
 * What happens on f858500 (and on d119260): the back-offs still to come at 135 after the undo and
 * after the correction, the deload thrown away; the drop after two such sessions 0%. Synthetic data
 * only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

async function startedMain() {
  const { store } = createTestStore({ now: () => TEST_NOW });
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...everyDay },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await store.getDatabase();
  for (const daysAgo of [7, 3]) {
    for (const exerciseId of ['barbell-bench-press', 'back-squat', 'barbell-row']) {
      const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
      await db.put('workouts', {
        ...record(0, exerciseId, [
          [5, 135, 2],
          [5, 135, 2],
          [5, 135, 2],
        ]),
        id: `w-${exerciseId}-${daysAgo}`,
        startedAt: when,
        completedAt: when,
      });
    }
  }
  await store.hydrate();
  const main = (): WorkoutEntry =>
    allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.exerciseId === 'barbell-row' && !entry.stopped,
    )!;
  expect(main().backOffDrop).toBeDefined();
  store.startWorkout();
  const toCome = () => {
    const done = store.getSnapshot().session!.completed.sets;
    return main()
      .sets.filter(
        (set) =>
          set.kind === 'working' &&
          !done.some((log) => log.entryId === main().id && log.setIndex === set.index),
      )
      .map((set) => set.targetWeight as number);
  };
  return { store, main, toCome };
}

/** The top set skipped, then the coach's deload to 125 taken, back-off 1 logged there. */
async function deloaded() {
  const started = await startedMain();
  const { store, main, toCome } = started;
  const top = main().sets.find((set) => set.tier === 'top')!;
  const [first, second] = main().sets.filter((set) => set.tier === 'back-off');
  expect(top.targetWeight).toBe(140);
  store.skipSet(main().id, top.index);
  // The coach's route step: "Deload to 125 lb this week" (no set lifted, so it is offered).
  await store.recalibrate({ type: 'target-weight', entryId: main().id, weight: 125, deload: true });
  expect(toCome()).toEqual([125, 125, 125]);
  await store.logSet(main().id, first!.index, { weight: 125, reps: 5, rir: 2 });
  return { ...started, first: first!, second: second! };
}

describe('the coach’s deload taken after the main lift’s top set was skipped', () => {
  it('stays through an undo of a back-off logged at it', async () => {
    const { store, main, toCome, second } = await deloaded();
    await store.logSet(main().id, second.index, { weight: 125, reps: 5, rir: 2 });
    store.undoLastSet();
    // On f858500: [135, 135], back at the drop off the top set's plan.
    expect({ afterUndo: toCome() }).toEqual({ afterUndo: [125, 125] });
  });

  it('is no session at the drop for the drop’s correction', async () => {
    const { store, main } = await deloaded();
    for (const set of main().sets.filter((each) => each.tier === 'back-off')) {
      await store.logSet(main().id, set.index, { weight: 125, reps: 6, rir: 4 });
    }
    const summary = await store.finishWorkout(null);
    const saved = store.getSnapshot().history.find((each) => each.id === summary.recordId)!;
    const before = {
      ...saved,
      id: `${saved.id}-before`,
      startedAt: new Date(Date.parse(saved.startedAt) - 2 * DAY).toISOString(),
      completedAt: new Date(
        Date.parse(saved.completedAt ?? saved.startedAt) - 2 * DAY,
      ).toISOString(),
    };
    // Two sessions so: the deload's back-offs, 10 lb under the drop's load, read as at the drop.
    // On f858500: 0, the drop narrowed to nothing (two reps easier than asked, 4% a rep).
    expect({ drop: backOffDropFor('barbell-row', [before, saved]) }).toEqual({ drop: 0.05 });
  });

  it('stays through a correction of a back-off logged at it', async () => {
    const { store, main, toCome, first } = await deloaded();
    await store.logSet(main().id, first.index, { weight: 125, reps: 6, rir: 2 });
    // On f858500: [135, 135].
    expect({ afterCorrection: toCome() }).toEqual({ afterCorrection: [125, 125] });
  });
});
