import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Fifteenth review of round M. The fourteenth pass keeps a catch-up the lifter emptied empty at the
 * top of every rebuild (`rebuild`: no entries, and the day's offer as the request now holds it has
 * muscles). That includes a save that changes the day's offer, which since the third review builds
 * the new plan whole (`scopeFor`: `offerChanged`). TEST_NOW is a Wednesday, a day the default
 * schedule (Monday, Tuesday, Thursday, Friday) does not tick, and Monday's bench press makes this a
 * lifter in training: the catch-up is for the upper body. The lifter skips its seven lifts ("Not one
 * of your training days: nothing more for today."), then saves a schedule of Monday and Tuesday:
 * with Thursday and Friday gone, the legs are behind too, and the day offers a new catch-up with the
 * quads, hamstrings, glutes and calves in it, none of whose lifts was set aside. The plan stays the
 * old empty one, and Today says there is nothing more for today. Synthetic data only.
 */

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();

async function mondayBench() {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  const when = daysBefore(2);
  await db.put('workouts', {
    ...record(
      0,
      'barbell-bench-press',
      [
        [10, 100, 2],
        [10, 100, 2],
        [10, 100, 2],
      ],
      [8, 12],
      2,
    ),
    id: 'w-monday',
    startedAt: when,
    completedAt: when,
  });
  await handle.store.hydrate();
  return handle;
}

describe('a save that changes the day’s offer builds the new catch-up whole, emptied or not', () => {
  it('the upper-body catch-up skipped whole, then Thursday and Friday unticked: the legs are behind', async () => {
    const handle = await mondayBench();
    const session = () => handle.store.getSnapshot().session!;
    expect(session().workout.templateId).toBe('catch-up');
    const before = new Set(session().constraints.catchUp!.muscles.map((item) => item.muscle));
    expect(before.has('quads')).toBe(false);
    for (const entry of allEntries(session().workout.blocks)) {
      await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
    }
    expect(allEntries(session().workout.blocks)).toEqual([]);
    expect(dayNoteOf(session(), false)?.text).toBe(
      'Not one of your training days: nothing more for today.',
    );
    const skipped = new Set(session().constraints.avoidExerciseIds);

    const profile = handle.store.getSnapshot().profile!;
    await handle.store.saveProfile({
      ...profile,
      schedule: { ...profile.schedule, availableDays: ['mon', 'tue'], weeklyFrequency: 2 },
    });
    const today = session();
    const offer = today.constraints.catchUp!;
    // A new offer: the legs are behind now, still a catch-up on a day not ticked.
    const added = offer.muscles.map((item) => item.muscle).filter((muscle) => !before.has(muscle));
    expect(added).toEqual(expect.arrayContaining(['quads', 'hamstrings', 'glutes', 'calves']));
    const note = dayNoteOf(today, false);
    const lifts = describeWorkout(today.workout);
    const detail = `${JSON.stringify(note)} | ${lifts.join('; ')} | set aside: ${[...skipped].join(', ')}`;
    // Built whole, it has a lift for the muscles newly behind, none of whose lifts was set aside.
    // On 3290cd8: no lift at all, and "Not one of your training days: nothing more for today."
    const forNew = allEntries(today.workout.blocks).filter((entry) =>
      requireExercise(entry.exerciseId).primaryMuscles.some((muscle) => added.includes(muscle)),
    );
    expect(forNew.length, detail).toBeGreaterThan(0);
    expect(note?.text, detail).not.toMatch(/nothing more for today/);
  });
});
