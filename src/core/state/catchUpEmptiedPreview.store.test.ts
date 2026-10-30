import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Sixteenth review of round M. A catch-up left with no lift by the lifter's changes has nothing
 * more for today "through any rebuild around it". The store builds today's preview again for a
 * coach focus set or cleared, a deload week planned, a lasting swap stopped, a learned value reset
 * (`rebuildPreview`): a fresh plan, then today's choices put back by a length change. The fresh plan
 * has its lifts again, so nothing of the engine's guard for an emptied plan (`rebuild`) applies, and
 * the generator builds the catch-up whole without the lifts set aside: any other lift for the same
 * muscles comes in. (The fifteenth pass's own test of this path, "Hurts" at home, has no other
 * hamstrings lift there to come in.)
 *
 * TEST_NOW is a Wednesday, not ticked, and Monday's bench press makes this a lifter in training: the
 * catch-up is for the upper body. The lifter skips every lift ("Not one of your training days:
 * nothing more for today."), then sets a coach focus: the catch-up is back, with lifts none of
 * which the lifter skipped. Synthetic data only.
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

describe('a catch-up the lifter emptied stays so when the store builds the preview again', () => {
  it('every lift skipped, then a coach focus set', async () => {
    const handle = await mondayBench();
    const session = () => handle.store.getSnapshot().session!;
    expect(session().workout.templateId).toBe('catch-up');
    for (const entry of allEntries(session().workout.blocks)) {
      await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
    }
    expect(allEntries(session().workout.blocks)).toEqual([]);
    expect(dayNoteOf(session(), false)?.text).toBe(
      'Not one of your training days: nothing more for today.',
    );
    const skipped = new Set(session().constraints.avoidExerciseIds);

    await handle.store.setCoachFocus('side-delts');
    const today = session();
    const note = dayNoteOf(today, false);
    const detail = `${JSON.stringify(note)} | ${describeWorkout(today.workout).join('; ')} | set aside: ${[...skipped].join(', ')}`;
    // On 89dfb39 (and 3290cd8): the catch-up again, its lifts other lifts for the same muscles.
    expect(today.constraints.catchUp?.muscles.length ?? 0, detail).toBeGreaterThan(0);
    expect(
      allEntries(today.workout.blocks).map((entry) => entry.exerciseId),
      detail,
    ).toEqual([]);
    expect(note?.text, detail).toBe('Not one of your training days: nothing more for today.');
  });
});
