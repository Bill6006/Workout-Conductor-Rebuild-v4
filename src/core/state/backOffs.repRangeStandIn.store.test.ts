import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The thirteenth review of round N. A rep range set by hand (`rep-range`) sets the reps of every
 * working set still to come, then runs `refitEntry` for the note by the target. Since the twelfth
 * pass, a lift whose top set is done has its back-offs still to come re-derived there
 * (`refitBackOffs`), and a back-off that stood in for a load (`asked`) took the reps of the load it
 * stood in for: the reps the lifter had just set were thrown away on those back-offs, and the lift
 * was marked as having reps set by hand while its back-offs showed the plan's.
 *
 * The rules: Maintenance 23, "Reps set by hand are the lifter's: they stay, and only the load is
 * fitted" (refitStarted's doc); the rep-range trigger sets "the remaining sets" (its headline,
 * "4-6 reps for the remaining sets"); the twelfth pass's refit, "a stand-in's load asked and added
 * reps given back", is for reps a refit added, not for reps set by hand.
 *
 * Steps: the main lift (barbell row) planned at 160 × 4-6 at 1, back-offs 150 (both need a 2.5 lb
 * plate). A ramp done; the 2.5 lb plates marked missing: the top set fitted as a stand-in (a load
 * asked), the back-offs at the drop off the load it asks, onto the weights here, standing in for
 * nothing (the thirteenth pass's fix: at 85ee7b6 they stood in for a load too). The top set lifted
 * as shown. Then the rep range set to 8-10 for the remaining sets; or the rep range set before the
 * top set, which is then lifted at another load than shown.
 *
 * What happens at 85ee7b6: the back-offs still to come at 4-6 (the reps of the load asked), the
 * lift marked with reps set by hand. On 5762c00 they take 8-10. Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

async function startedMain(load: number) {
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
          [5, load, 2],
          [5, load, 2],
          [5, load, 2],
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
      (entry) => entry.backOffDrop !== undefined,
    )!;
  expect(main()).toBeDefined();
  store.startWorkout();
  const backOffsToCome = () => {
    const done = store.getSnapshot().session!.completed.sets;
    return main().sets.filter(
      (set) =>
        set.tier === 'back-off' &&
        !done.some((log) => log.entryId === main().id && log.setIndex === set.index),
    );
  };
  const shown = () =>
    backOffsToCome().map(
      (set) => `${set.targetWeight} × ${set.targetReps.join('-')}${set.asked ? ' asked' : ''}`,
    );
  return { store, main, shown, backOffsToCome };
}

describe('a rep range set by hand after the top set, the back-offs standing in for a load', () => {
  it('stays on the back-offs still to come', async () => {
    const { store, main, shown, backOffsToCome } = await startedMain(155);
    const top = main().sets.find((set) => set.tier === 'top')!;
    const warmup = main().sets.find((set) => set.kind === 'warmup')!;
    expect(top.targetWeight).toBe(160);
    await store.logSet(main().id, warmup.index, {
      weight: warmup.targetWeight,
      reps: 5,
      rir: null,
    });
    await store.setMissingPlates([2.5]);
    const fitted = main().sets.find((set) => set.index === top.index)!;
    expect(fitted.asked?.weight).toBe(160);
    expect(shown().some((line) => line.endsWith('asked'))).toBe(false);
    // The top set lifted as shown, on target.
    await store.logSet(main().id, top.index, {
      weight: fitted.targetWeight,
      reps: fitted.targetReps[0] + 1,
      rir: 1,
    });
    expect(backOffsToCome()).toHaveLength(3);
    await store.recalibrate({ type: 'rep-range', entryId: main().id, reps: [8, 10] });
    expect(main().manual?.reps).toBe(true);
    // At 85ee7b6: "145 × 4-6" three times, the reps of the load the refit had them stand in for.
    const reps = backOffsToCome().map((set) => set.targetReps.join('-'));
    expect({ reps }, shown().join('; ')).toEqual({ reps: ['8-10', '8-10', '8-10'] });
  });

  it('stays through the follow of the top set (set before it, `backOffsReplayed`)', async () => {
    const { store, main, shown, backOffsToCome } = await startedMain(155);
    const top = main().sets.find((set) => set.tier === 'top')!;
    const warmup = main().sets.find((set) => set.kind === 'warmup')!;
    await store.logSet(main().id, warmup.index, {
      weight: warmup.targetWeight,
      reps: 5,
      rir: null,
    });
    await store.setMissingPlates([2.5]);
    expect(main().sets.find((set) => set.index === top.index)?.asked?.weight).toBe(160);
    expect(shown().some((line) => line.endsWith('asked'))).toBe(false);
    // Every set still to come at 8-10, the top set too.
    await store.recalibrate({ type: 'rep-range', entryId: main().id, reps: [8, 10] });
    expect(main().sets.find((set) => set.index === top.index)?.targetReps).toEqual([8, 10]);
    expect(backOffsToCome().map((set) => set.targetReps.join('-'))).toEqual([
      '8-10',
      '8-10',
      '8-10',
    ]);
    // The top set lifted at 8 reps, at another load than shown: its back-offs follow it.
    await store.logSet(main().id, top.index, { weight: 145, reps: 8, rir: 1 });
    // At 85ee7b6: "135 × 4-6" three times: the follow's replay gave them the reps of the load they
    // stood in for, the lifter's 8-10 (the top set's own, as lifted) thrown away.
    const reps = backOffsToCome().map((set) => set.targetReps.join('-'));
    expect({ reps }, shown().join('; ')).toEqual({ reps: ['8-10', '8-10', '8-10'] });
  });
});
