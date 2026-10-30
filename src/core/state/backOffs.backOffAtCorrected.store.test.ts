import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { backOffDropFor } from '../../engine/progression/backOffs';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The twelfth review of round N. The plan's entry records the drop's load as the top set is logged
 * (`withBackOffAt`, the eleventh pass), but a correction of the top set's log works it out again
 * from the weights the place makes at the correction (`backOffLoadOf` reads the missing plates of
 * that moment). A plate marked missing for a later lift, then a typo in the top set's reps fixed,
 * moves the saved session's `backOffAt` off the load the back-offs were given and lifted at, so the
 * drop's correction and the session's feedback pass over every one of them: the eleventh review's
 * plate-missing finding, through a correction.
 *
 * The rules (docs/reports/maintenance-32.md): the eleventh pass, "the session records the drop's
 * load as the top set is logged (`backOffAt` on the plan's entry), and the saved session keeps it";
 * WorkoutEntry.backOffAt's doc (types.ts): "with the weights the place had as it was lifted (the
 * eleventh review of round N: worked out at the finish, a plate marked missing after moved it)";
 * item 11, "When the back-offs miss their reserve by a rep or more on average two sessions running at
 * the drop in force, the same way, it moves 4% for each rep missed".
 *
 * The value lives on the plan's entry, so whatever puts back an older plan takes it away too: an
 * Undo of a change made before the main lift (offered while every set logged since is in the plan it
 * puts back) restores the entry from before the top set was logged, and the finish works the load
 * out again from the weights it finds.
 *
 * Steps: the main lift planned at 160 × 4-6 at 1, its back-offs 150. The top set lifted as planned
 * (logged as 160 × 4 at 1), every back-off 150 × 5 at 0, two reps harder than asked. The 2.5 lb plates
 * marked missing for a later lift. The top set's reps corrected to what was lifted, 160 × 5 at 1.
 * The workout finished. Or: a set added to another lift first; the main lift lifted the same way;
 * that change undone; the 2.5 lb plates marked missing; the workout finished.
 *
 * What happens on f858500: the record says `backOffAt` 155 (152 onto the plates left), the
 * feedback says nothing of the back-offs' miss, and two sessions like it leave the drop at 5% (13%
 * due); after the Undo the same. On d119260 the finish worked it out the same way, with or without
 * the correction or the Undo (the eleventh review's finding). Synthetic data only.
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
          [5, 155, 2],
          [5, 155, 2],
          [5, 155, 2],
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
  return { store, main };
}

describe('a plate marked missing after the main lift, its recorded drop load replaced first', () => {
  it('a typo in the top set fixed: the record keeps the load the back-offs were given', async () => {
    const { store, main } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    expect(top.targetWeight).toBe(160);
    await store.logSet(main().id, top.index, { weight: 160, reps: 4, rir: 1 });
    const backOffs = main().sets.filter((set) => set.tier === 'back-off');
    expect(backOffs.map((set) => set.targetWeight)).toEqual([150, 150, 150]);
    for (const set of backOffs) {
      await store.logSet(main().id, set.index, { weight: 150, reps: 5, rir: 0 });
    }
    const name = main().exerciseId;
    // A plate missing today, for a later lift; then the top set's reps fixed.
    await store.setMissingPlates([2.5]);
    await store.logSet(main().id, top.index, { weight: 160, reps: 5, rir: 1 });
    const summary = await store.finishWorkout(null);
    const record_ = store.getSnapshot().history.find((each) => each.id === summary.recordId)!;
    const saved = record_.entries.find((entry) => entry.exerciseId === name)!;
    const line = summary.feedback.find((each) => each.includes('160 lb')) ?? '';
    const before = {
      ...record_,
      id: `${record_.id}-before`,
      startedAt: new Date(Date.parse(record_.startedAt) - 2 * DAY).toISOString(),
      completedAt: new Date(
        Date.parse(record_.completedAt ?? record_.startedAt) - 2 * DAY,
      ).toISOString(),
    };
    // On f858500: backOffAt 155, no word on the back-offs, the drop still 5%.
    expect({
      backOffAt: saved.backOffAt,
      line,
      drop: backOffDropFor(name, [before, record_]),
    }).toEqual({
      backOffAt: 150,
      line: expect.stringContaining('the back-offs ran a rep or more harder than asked'),
      drop: 0.13,
    });
  });

  it('an earlier change undone: the record keeps the load the back-offs were given', async () => {
    const { store, main } = await startedMain();
    // A change to another lift before the main lift (the Undo stays offered while the sets logged
    // since are all in the plan it puts back).
    const other = allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.id !== main().id && entry.role !== 'primary-strength',
    )!;
    await store.recalibrate({ type: 'sets', entryId: other.id, workingDelta: 1 });
    const top = main().sets.find((set) => set.tier === 'top')!;
    await store.logSet(main().id, top.index, { weight: 160, reps: 5, rir: 1 });
    for (const set of main().sets.filter((each) => each.tier === 'back-off')) {
      await store.logSet(main().id, set.index, { weight: 150, reps: 5, rir: 0 });
    }
    const name = main().exerciseId;
    await store.undoRecalibration();
    // A plate missing today, for a later lift.
    await store.setMissingPlates([2.5]);
    const summary = await store.finishWorkout(null);
    const record_ = store.getSnapshot().history.find((each) => each.id === summary.recordId)!;
    const saved = record_.entries.find((entry) => entry.exerciseId === name)!;
    const line = summary.feedback.find((each) => each.includes('160 lb')) ?? '';
    // On f858500: the undo puts back the plan's entry from before the top set was logged, its
    // backOffAt with it; the finish works it out again, 155.
    expect({ backOffAt: saved.backOffAt, line }).toEqual({
      backOffAt: 150,
      line: expect.stringContaining('the back-offs ran a rep or more harder than asked'),
    });
  });
});
