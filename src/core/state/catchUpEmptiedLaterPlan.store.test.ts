import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { dayNoteOf } from '../../features/today/dayNote';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { writeSession } from './session';

/**
 * Eighteenth review of round M, on the seventeenth pass's mark carried through a later plan
 * (`ensureSession`: "The catch-up it emptied before, for the way back"). The report: "the full
 * session taken from a catch-up or second workout the lifter emptied remembers the offer (`emptied`),
 * and the way back to the same offer finds it empty again; a later plan the same day keeps the mark".
 * The rule it serves, from the fourteenth to sixteenth passes: "a catch-up or a second workout
 * emptied stays so through every rebuild", "every other rebuild, and the preview built again for the
 * same offer, keeps a plan the lifter emptied".
 *
 * A later plan the same day (a workout from another device lands, so the plan is made again,
 * `ensureSession`) keeps the emptied catch-up only where the lifter went through the full session:
 * the mark rides on the full session (`keepFull && before.constraints.emptied`), and the way back
 * then finds the catch-up empty (the seventeenth pass's own store test). The catch-up itself,
 * emptied and left on the screen, is laid out again from scratch with every lift the lifter set
 * aside, as if nothing had been skipped: the same offer, the same day, the opposite outcome.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule does
 * not tick, the catch-up for what is behind. The lifter skips each of its lifts: "Not one of your
 * training days: nothing more for today." An old workout from another device lands (twenty days
 * ago, the offer the same) and the store reads the log again: the catch-up is back with all seven
 * lifts, "a 46-minute catch-up for what is behind this week", the skips forgotten.
 *
 * Also fails on 532aba6 (the full session's path did not keep it either then).
 */

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();

async function lifter(changes: Partial<UserProfile> = {}, now: () => string = () => TEST_NOW) {
  const handle = createTestStore({ now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...changes },
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
    id: 'w-bench-monday',
    startedAt: when,
    completedAt: when,
  });
  await handle.store.hydrate();
  return handle;
}

type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;

/** A workout from another device lands, twenty days old: the offer stays the same. */
async function anotherDevice(handle: Handle) {
  const db = await handle.store.getDatabase();
  const when = daysBefore(20);
  await db.put('workouts', {
    ...record(0, 'back-squat', [[5, 200, 2]], [4, 6], 2),
    id: 'w-elsewhere',
    startedAt: when,
    completedAt: when,
  });
  await handle.store.hydrate();
}

describe('a catch-up the lifter emptied, through a later plan the same day', () => {
  it('stays empty where the lifter did not go through the full session', async () => {
    const handle = await lifter();
    expect(session(handle).workout.templateId).toBe('catch-up');
    const offer = session(handle).constraints.catchUp;
    for (const entry of allEntries(session(handle).workout.blocks)) {
      await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
    }
    expect(allEntries(session(handle).workout.blocks)).toEqual([]);
    expect(dayNoteOf(session(handle))?.text).toBe(
      'Not one of your training days: nothing more for today.',
    );
    await anotherDevice(handle);
    // The same offer: the same muscles behind.
    expect(session(handle).constraints.catchUp).toEqual(offer);
    // On 4cb40d7: every lift back, "a 46-minute catch-up for what is behind this week".
    expect(describeWorkout(session(handle).workout), dayNoteOf(session(handle))?.text).toEqual([]);
    expect(dayNoteOf(session(handle))?.text).toBe(
      'Not one of your training days: nothing more for today.',
    );
    // Still the lifter's emptying: a length picked keeps it so.
    await handle.store.recalibrate({ type: 'duration', choice: 30 });
    expect(describeWorkout(session(handle).workout)).toEqual([]);
  });

  it('only the same day: the next day’s catch-up for the same muscles is laid out afresh', async () => {
    // Monday the only day ticked: Wednesday and Thursday offer the same catch-up.
    let now = TEST_NOW;
    const base = createDefaultProfile(TEST_NOW);
    const handle = await lifter(
      { schedule: { ...base.schedule, weeklyFrequency: 1, availableDays: ['mon'] } },
      () => now,
    );
    expect(session(handle).workout.templateId).toBe('catch-up');
    const offer = session(handle).constraints.catchUp;
    for (const entry of allEntries(session(handle).workout.blocks)) {
      await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
    }
    expect(allEntries(session(handle).workout.blocks)).toEqual([]);
    now = new Date(Date.parse(TEST_NOW) + DAY).toISOString();
    handle.store.refreshSession();
    expect(session(handle).constraints.catchUp).toEqual(offer);
    expect(allEntries(session(handle).workout.blocks).length).toBeGreaterThan(0);
  });

  it('a slot the lifter closed was the old plan’s: the preview made again lays it out again', async () => {
    const first = await lifter();
    const today = session(first);
    const [lead] = allEntries(today.workout.blocks);
    expect(lead?.slot).toBe(0);
    // The lead lift left out with nothing to come in, its slot closed, a shorter length picked.
    writeSession(
      {
        ...today,
        duration: 30,
        workout: {
          ...today.workout,
          blocks: today.workout.blocks.filter(
            (block) => !block.entries.some((entry) => entry.id === lead!.id),
          ),
        },
        constraints: { ...today.constraints, closedSlots: [0] },
      },
      first.storage,
    );
    const again = createTestStore({ factory: first.factory, storage: first.storage });
    await again.store.hydrate();
    expect(again.store.getSnapshot().session?.constraints.closedSlots).toEqual([0]);
    // A coach focus makes the preview again, with the day's choices.
    await again.store.setCoachFocus('biceps');
    const made = again.store.getSnapshot().session!;
    expect(made.duration).toBe(30);
    expect(made.constraints.closedSlots).toBeUndefined();
    expect(allEntries(made.workout.blocks).some((entry) => entry.slot === 0)).toBe(true);
  });
});
