import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { backOffDropFor } from '../../engine/progression/backOffs';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * The eleventh review of round N. A saved session's `backOffAt`, "the load the drop gave its
 * back-offs off the top set as lifted", is worked out when the workout is finished, from the
 * weights the place makes then (`finishWorkout` reads `loadingFor(...)` with the session's missing
 * plates at that moment), not from the weights the back-offs were given and lifted at. A plate
 * marked missing for a later lift moves the drop's load onto another weight, so the back-offs lifted
 * at the drop's own load read as lifted at another load: the drop's correction (`backOffDropFor`)
 * and, since the tenth pass, the session's feedback both pass over every one of them.
 *
 * The rules (docs/reports/maintenance-32.md): the ninth pass, "A saved session keeps the load the
 * drop gave its back-offs off the top set as lifted (`backOffAt`), and the drop's correction reads
 * only back-offs lifted at it"; the tenth, "the feedback reads only back-offs lifted at the drop's
 * load, as the correction does"; item 11, "When the back-offs miss their reserve by a rep or more on
 * average two sessions running at the drop in force, the same way, it moves 4% for each rep missed".
 *
 * Steps: the main lift planned at 160 × 4-6 at 1 (two sessions at 155 before), its back-offs 150 (5%
 * under 160 is 152, the nearest weight the plates make). The top set lifted as planned, every
 * back-off at 150 × 5 at 0, two reps harder than asked. Then the 2.5 lb plates marked missing (for
 * a later lift: "a plate missing today"), and the workout finished.
 *
 * What happens on 905ce7f: the record says `backOffAt` 155 (152 onto the plates left), so none of
 * the three back-offs, lifted at 150, is read: the feedback says nothing of their miss ("Barbell
 * Row: progressed, 155 × 5 became 160 lb × 5."), and two sessions like it never widen the drop (5%
 * still, where 13% is due). Without the plate marked missing: 150, the miss said, 13%. On 480d5a1
 * the record and the drop are the same (the ninth pass's `backOffAt`); its feedback, reading every
 * back-off, says "a second session like it widens their drop", a widening that never comes.
 * Synthetic data only.
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
  const workout = () => store.getSnapshot().session!.workout;
  const main = (): WorkoutEntry =>
    allEntries(workout().blocks).find((entry) => entry.backOffDrop !== undefined)!;
  expect(main()).toBeDefined();
  store.startWorkout();
  return { store, main };
}

describe('a plate marked missing after the main lift, then the workout finished', () => {
  it('the record keeps the load the back-offs were given, and their miss is read', async () => {
    const { store, main } = await startedMain();
    const top = main().sets.find((set) => set.tier === 'top')!;
    expect(top.targetWeight).toBe(160);
    await store.logSet(main().id, top.index, { weight: 160, reps: 5, rir: 1 });
    const backOffs = main().sets.filter((set) => set.tier === 'back-off');
    expect(backOffs.map((set) => set.targetWeight)).toEqual([150, 150, 150]);
    for (const set of backOffs) {
      await store.logSet(main().id, set.index, { weight: 150, reps: 5, rir: 0 });
    }
    const name = main().exerciseId;
    // A plate missing today, for a later lift.
    await store.setMissingPlates([2.5]);
    const summary = await store.finishWorkout(null);
    const record_ = store.getSnapshot().history.find((each) => each.id === summary.recordId)!;
    const saved = record_.entries.find((entry) => entry.exerciseId === name)!;
    const line = summary.feedback.find((each) => each.includes('160 lb')) ?? '';
    // The same session two days before: two sessions running, two reps harder than asked at the
    // drop in force, widen it by 8% (4% a rep), to 13%.
    const before = {
      ...record_,
      id: `${record_.id}-before`,
      startedAt: new Date(Date.parse(record_.startedAt) - 2 * DAY).toISOString(),
      completedAt: new Date(
        Date.parse(record_.completedAt ?? record_.startedAt) - 2 * DAY,
      ).toISOString(),
    };
    // On 905ce7f: backOffAt 155, the line "Barbell Row: progressed, 155 × 5 became 160 lb × 5."
    // with no word on the back-offs, and the drop still 5% after two such sessions.
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
});
