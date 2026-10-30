import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The sixteenth review of round N, where it meets item 42 (Maintenance 26): the fifteenth pass's
 * `easedBackOffs`. A hard start eases each set of a lift not begun on its own (`easedSet`): "Its
 * reps stay on the load the place makes nearest the plan's own rule for that reserve
 * (`loadAtMoreReserve`), where that load is lighter; otherwise it keeps its load and does a rep
 * fewer". So a set is eased by a lighter load or by a rep fewer, never both. Then the fifteenth pass
 * puts the back-offs at the drop off the top set as eased. Where the top set's ease is a lighter
 * load and a back-off's is a rep fewer (the back-off's load is lighter, so a step is a larger part of
 * it: the bench press planned at 100 × 4-6 at 1, back-offs 95 × 4-6 at 2; the top set eased to 95 ×
 * 4-6 at 2, each back-off on its own to 95 × 3-5 at 3), the back-offs take both: the drop off 95, 90,
 * and the rep fewer, 3-5, under a top set at 4-6. They are eased twice, and stand at fewer reps than
 * the top set. The next refit (the plates saved again, a ramp logged so the lift is fitted in place)
 * gives them the top set's 4-6 (`refitBackOffs`, the fifteenth pass), nothing logged on them between.
 * The same on a rack with no 2.5 lb plates for a top set planned at 205 (eased 195 × 4-6, back-offs
 * 185 × 3-5). With reps set by hand (the rep range set to 4-6 before the start), a back-off's own
 * ease is nothing at all (`easedSet`: reps set by hand keep their reps, and its load is not
 * lightened), so the back-offs take the lighter load at the plan's reserve: 90 × 4-6 at 2, the top
 * set's own reserve, where a set `easedSet` lightens takes the rep more in reserve with it.
 *
 * The rules: the owner's settled answer for item 11, "back-offs 5% lighter than the top set as
 * lifted, same reps"; docs/reports/maintenance-32.md, the fifteenth pass: "A hard start eases a
 * lift's back-offs off its top set as eased, each a rep more in reserve" and "A refit under a top set
 * still to come gives its back-offs the top set's own reps"; the twelfth: "The back-offs take one
 * rule wherever their load is worked out ... at their own reps"; `easedSet`'s own words, above.
 *
 * Steps: Hybrid, five days a week; the bench press's last two sessions straight at 95 × 5 at 2 (or
 * 200, the gym's 2.5 lb plates marked missing), the EZ-bar curl's and the cable pushdown's at their
 * own loads. The push day: the bench press planned at 100 × 4-6 at 1, back-offs 3 × 95 × 4-6 at 2.
 * Or the rep range set to 4-6 by hand before the start. The curl's and the pushdown's first sets
 * logged well short (3 reps at 0): a hard start eases the bench press, not begun. Then a ramp of it
 * logged and the plates saved again.
 *
 * What happens at 604fba7: the eased bench press shows "top 95 × 4-6 at 2, back-off 90 × 3-5 at 3,
 * back-off 90 × 3-5 at 3"; after the ramp and the plates saved again, its back-offs are 90 × 4-6 at
 * 3; with reps set by hand, "back-off 90 × 4-6 at 2". At 14d2e62 (the previous head) every test
 * fails too: the back-offs eased set by set to 95 × 3-5 at 3, the top set's own load at fewer reps,
 * and the refit then takes them to 90 × 3-5; with reps set by hand, 95 × 4-6 at 2, not eased at all.
 * Synthetic data only.
 *
 * The fix (the sixteenth pass): a hard start's back-offs are the plan's own, eased once: the drop
 * off the top set as eased, at its reps, a rep more in reserve (`easedBackOffs`).
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

async function easedForAHardStart(benchLoad: number, missing: number[], handReps = false) {
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
      [BENCH, benchLoad],
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
  if (missing.length > 0) await store.setMissingPlates(missing);
  const entries = () => allEntries(store.getSnapshot().session!.workout.blocks);
  const bench = (): WorkoutEntry =>
    entries().find((entry) => entry.exerciseId === BENCH && !entry.stopped)!;
  /** Each working set: its tier, load, reps and reserve. */
  const working = () =>
    bench()
      .sets.filter((set) => set.kind === 'working')
      .map(
        (set) =>
          `${set.tier} ${set.targetWeight} × ${set.targetReps[0]}-${set.targetReps[1]} at ${set.targetRir}`,
      )
      .join(', ');
  if (handReps) await store.recalibrate({ type: 'rep-range', entryId: bench().id, reps: [4, 6] });
  const planned = working();
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
  return { store, bench, working, planned, later };
}

const CASES: [string, number, number[], string, string][] = [
  [
    'the bench press planned at 100',
    95,
    [],
    'top 100 × 4-6 at 1, back-off 95 × 4-6 at 2, back-off 95 × 4-6 at 2, back-off 95 × 4-6 at 2',
    'top 95 × 4-6 at 2, back-off 90 × 4-6 at 3, back-off 90 × 4-6 at 3',
  ],
  [
    'the bench press planned at 205, no 2.5 lb plates',
    200,
    [2.5],
    'top 205 × 4-6 at 1, back-off 195 × 4-6 at 2, back-off 195 × 4-6 at 2, back-off 195 × 4-6 at 2',
    'top 195 × 4-6 at 2, back-off 185 × 4-6 at 3, back-off 185 × 4-6 at 3',
  ],
];

describe('a hard start easing a main lift with reps set by hand, its top set to a lighter load', () => {
  it('gives the back-offs the rep more in reserve their lighter load leaves', async () => {
    const started = await easedForAHardStart(95, [], true);
    expect(started.planned).toBe(
      'top 100 × 4-6 at 1, back-off 95 × 4-6 at 2, back-off 95 × 4-6 at 2, back-off 95 × 4-6 at 2',
    );
    // At 604fba7: back-offs 90 × 4-6 at 2, the eased top set's reserve.
    expect(started.working()).toBe(
      'top 95 × 4-6 at 2, back-off 90 × 4-6 at 3, back-off 90 × 4-6 at 3',
    );
  });
});

describe('a hard start easing a main lift whose top set eases to a lighter load', () => {
  it.each(CASES)(
    '%s: its back-offs at the top set’s reps, a rep more in reserve',
    async (_, load, missing, planned, eased) => {
      const started = await easedForAHardStart(load, missing);
      expect(started.planned).toBe(planned);
      // At 604fba7: back-offs 90 × 3-5 at 3 (185 × 3-5 at 3): lighter and a rep fewer.
      expect(started.working()).toBe(eased);
    },
  );

  it.each(CASES)('%s: leaves nothing for the next refit to move', async (_, load, missing) => {
    const { store, bench, working, later } = await easedForAHardStart(load, missing);
    const ramp = bench().sets.find((set) => set.kind === 'warmup')!;
    later();
    await store.logSet(bench().id, ramp.index, { weight: ramp.targetWeight, reps: 5, rir: 5 });
    const shown = working();
    await store.setMissingPlates(missing);
    // At 604fba7: 3-5 shown, 4-6 after the refit, nothing logged on the back-offs.
    expect(working()).toBe(shown);
  });
});
