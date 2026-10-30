import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The fifteenth review of round N, where it meets item 42 (Maintenance 26). A hard start eases a
 * main lift not begun set by set: each set a rep more in reserve, at the load the place makes
 * nearest the plan's own rule for that reserve (`easedSet`, `loadAtMoreReserve`), so the top set
 * 155 × 4-6 at 1 goes to 150 at 2 and each back-off 145 × 4-6 at 2 to 140 at 3. The fourteenth pass
 * has an Undo replay every lift with a drop (`undoRecalibration`: `entry.backOffDrop !== undefined`),
 * a lift with no log at all included, and the replay puts its back-offs at the drop off the top set
 * as it stands (`backOffsAsLogged`): 5% under 150 is 142.5, the nearest weight 145. So an Undo of any
 * change made since, to another lift, moves the eased bench press's back-offs from 140 to 145, and
 * the next refit (the plates saved again) puts them back at 140, nothing logged between. At 9e9078e
 * the Undo replayed only a lift with a log or a recorded drop load, and left the bench press as it
 * was. The root is older: the ease puts the back-offs where the drop off the eased top set does not
 * (140 under 150, where 5% under 150 is 145), so once the eased top set is lifted as asked (no
 * follow: no step, the load it asks) the back-offs stay at 140 until any replay, a refit included,
 * puts them at 145 (both heads).
 *
 * The rules (docs/reports/maintenance-32.md): the thirteenth pass, an Undo "takes back a change and
 * never a log made since"; the fourteenth, "An Undo puts every lift's back-offs where its logs as
 * they stand put them" (a lift with no log: where the plan has them); the twelfth, "The back-offs
 * take one rule wherever their load is worked out"; the Undo's own words, "Restored the previous
 * workout."
 *
 * Steps: Hybrid, five days a week; the bench press's last two sessions straight at 150 × 5 at 2, the
 * EZ-bar curl's and the cable pushdown's at their own loads. The push day: the bench press planned
 * at 155 × 4-6 at 1, back-offs 3 × 145 at 2. The curl's and the pushdown's first sets logged well
 * short (3 reps at 0): a hard start eases the bench press, not begun, to 150 at 2 and 2 × 140 at 3.
 * Another lift pinned, and the pin undone. Or: a ramp of the bench press logged and its top set
 * lifted as asked, 150 × 5 at 2; the plates saved again.
 *
 * What happens at 1fcd67a: the bench press's back-offs at 145 after the Undo, 140 again after the
 * plates are saved again. At 9e9078e (the previous head): 140 throughout, so the first two tests are
 * a regression of the fourteenth pass. The third (the top set lifted as asked) fails at both heads:
 * 140 shown, 145 after the refit. Synthetic data only.
 *
 * The fix (the fifteenth pass): a lift eased for a hard start has its back-offs drop off the top set
 * as eased, each a rep more in reserve (`easedBackOffs`): 145 at 3 under the top set's 150, where
 * every replay puts them. The setup's line on the ease reads so.
 */

const DAY = 86_400_000;
const BENCH = 'barbell-bench-press';
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};
const ACCESSORIES: [string, number, [number, number]][] = [
  ['leg-curl', 40, [10, 15]],
  ['leg-extension', 50, [10, 15]],
  ['ez-bar-curl', 35, [8, 12]],
  ['cable-triceps-pushdown', 30, [10, 15]],
];

async function easedForAHardStart() {
  // A clock a minute on for each set logged, so the hard start reads the sets in the order done.
  let clock = Date.parse(TEST_NOW);
  const { store } = createTestStore({ now: () => new Date(clock).toISOString() });
  const later = () => {
    clock += 60_000;
  };
  await store.hydrate();
  await store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...everyDay },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await store.getDatabase();
  for (const daysAgo of [7, 3]) {
    const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
    const at = { startedAt: when, completedAt: when };
    for (const [exerciseId, load] of [
      [BENCH, 150],
      ['back-squat', 135],
      ['barbell-row', 135],
    ] as const) {
      await db.put('workouts', {
        ...record(0, exerciseId, [
          [5, load, 2],
          [5, load, 2],
          [5, load, 2],
        ]),
        id: `w-${exerciseId}-${daysAgo}`,
        ...at,
      });
    }
    for (const [exerciseId, load, range] of ACCESSORIES) {
      await db.put('workouts', {
        ...record(
          0,
          exerciseId,
          [
            [12, load, 1],
            [12, load, 1],
            [12, load, 1],
          ],
          range,
          1,
        ),
        id: `w-${exerciseId}-${daysAgo}`,
        ...at,
      });
    }
  }
  await store.hydrate();
  const entries = () => allEntries(store.getSnapshot().session!.workout.blocks);
  const bench = (): WorkoutEntry =>
    entries().find((entry) => entry.exerciseId === BENCH && !entry.stopped)!;
  /** Each working set: its tier, load and reserve. */
  const working = () =>
    bench()
      .sets.filter((set) => set.kind === 'working')
      .map((set) => `${set.tier} ${set.targetWeight} at ${set.targetRir}`)
      .join(', ');
  expect(working()).toBe('top 155 at 1, back-off 145 at 2, back-off 145 at 2, back-off 145 at 2');
  store.startWorkout();
  const judged = entries().filter((entry) =>
    ['ez-bar-curl', 'cable-triceps-pushdown'].includes(entry.exerciseId),
  );
  expect(judged).toHaveLength(2);
  for (const entry of judged) {
    const set = entry.sets.find((one) => one.kind === 'working')!;
    later();
    await store.logSet(entry.id, set.index, { weight: set.targetWeight, reps: 3, rir: 0 });
  }
  expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
  // Since the fifteenth pass, the back-offs drop off the top set as eased (`easedBackOffs`): 5%
  // under 150 is 142.5, the nearest weight 145. At 1fcd67a: 140, eased set by set.
  expect(working()).toBe('top 150 at 2, back-off 145 at 3, back-off 145 at 3');
  const other = entries().find(
    (entry) => entry.id !== bench().id && !judged.includes(entry) && !entry.stopped,
  )!;
  return { store, bench, working, other, later };
}

describe('an Undo of a change to another lift, a main lift eased for a hard start', () => {
  it('leaves the eased lift’s back-offs where the plan has them', async () => {
    const { store, working, other } = await easedForAHardStart();
    const shown = working();
    await store.recalibrate({ type: 'pin', entryId: other.id, pinned: true });
    await store.undoRecalibration();
    // At 1fcd67a: the back-offs at 145, 3 in reserve.
    expect(working()).toBe(shown);
  });

  it('agrees with the next refit', async () => {
    const { store, working, other } = await easedForAHardStart();
    await store.recalibrate({ type: 'pin', entryId: other.id, pinned: true });
    await store.undoRecalibration();
    const afterUndo = working();
    await store.setMissingPlates([]);
    // At 1fcd67a: 145 after the Undo, 140 after the refit, nothing logged on the bench press.
    expect(afterUndo).toBe(working());
  });
});

describe('a main lift eased for a hard start, its top set lifted as asked', () => {
  it('has its back-offs where the next refit puts them (both heads)', async () => {
    const { store, bench, working, later } = await easedForAHardStart();
    const ramp = bench().sets.find((set) => set.kind === 'warmup')!;
    later();
    await store.logSet(bench().id, ramp.index, { weight: ramp.targetWeight, reps: 5, rir: 5 });
    const top = bench().sets.find((set) => set.tier === 'top')!;
    later();
    await store.logSet(bench().id, top.index, { weight: 150, reps: 5, rir: 2 });
    // As asked: no step, so no follow; the hard start still reads.
    expect(store.getSnapshot().session!.constraints.badStart).toBe(true);
    const shown = working();
    await store.setMissingPlates([]);
    // At 1fcd67a and at 9e9078e: 140 shown, 145 after the refit (the drop off 150 as lifted).
    expect(shown).toBe(working());
  });
});
