import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allEntries } from '../../engine/workout/types';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Twentieth review of round M, on the eighteenth pass's day's list of lifts swapped away
 * (`swappedAway`) where it meets the store's preview made again (`rebuildPreview`: a coach focus set
 * or cleared, a deload week planned or cancelled, a kept swap stopped, a reset of what the app
 * learned).
 *
 * The rules: "A lift the lifter swaps away stays away for the day (`swappedAway`): no change picks
 * it by itself, as a slot's own pick" (the eighteenth pass); the nineteenth pass held kept swaps to
 * it through "the preview made again"; and `regeneratePreview`'s own doc: "Today's choices hold
 * through it ...: the length, a check-in, the plates missing today, and what was set aside for today
 * ... are applied to the new plan by the engine, as every rebuild applies them."
 *
 * What happens: `rebuildPreview` builds a fresh plan and applies today's choices to it only when one
 * of them is set (`chosen`), and `chosen` does not read `swappedAway`. With a swap the only choice
 * of the day, the fresh plan stands as it is made, without the day's list: the lift swapped away is
 * its slot's own pick again, and the list is gone for every later rebuild that day. With any other
 * choice beside it (a length picked, a skip), the engine applies the list and the lift stays away.
 *
 * Steps (synthetic data only): Monday's bench press in the log; on Wednesday, a day the schedule
 * does not tick, at the gym, the catch-up has the EZ-bar curl. The lifter swaps it for the cable
 * curl (not kept). The coach focus set to the chest: the catch-up has the EZ-bar curl again, and the
 * day's list is empty. With 45 minutes picked before the focus, it stays away.
 *
 * Also fails on 0f8d10f (from the eighteenth pass).
 */

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();

async function lifter() {
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
    id: 'w-bench-monday',
    startedAt: when,
    completedAt: when,
  });
  await handle.store.hydrate();
  return handle;
}

type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;
const ids = (handle: Handle) =>
  allEntries(session(handle).workout.blocks).map((entry) => entry.exerciseId);

async function swapTheCurl(handle: Handle) {
  expect(session(handle).workout.templateId).toBe('catch-up');
  const curl = allEntries(session(handle).workout.blocks).find(
    (entry) => entry.exerciseId === 'ez-bar-curl',
  );
  expect(curl).toBeDefined();
  const swapped = await handle.store.swapExercise(curl!.id, 'cable-curl');
  expect(swapped?.ok).toBe(true);
  expect(session(handle).constraints.swappedAway).toEqual(['ez-bar-curl']);
}

describe('a lift swapped away today, through the preview made again', () => {
  it('stays away with a length picked beside the swap', async () => {
    const handle = await lifter();
    await swapTheCurl(handle);
    await handle.store.setDurationChoice(45);
    await handle.store.setCoachFocus('chest');
    expect(ids(handle)).not.toContain('ez-bar-curl');
    expect(session(handle).constraints.swappedAway).toContain('ez-bar-curl');
  });

  it('stays away with the swap the only choice of the day', async () => {
    const handle = await lifter();
    await swapTheCurl(handle);
    await handle.store.setCoachFocus('chest');
    const plan = describeWorkout(session(handle).workout).join('; ');
    // On 0fe4cb9 and 0f8d10f: "... ez-bar-curl x3 @RIR 1/1/1 ...", and the list empty.
    expect(ids(handle), plan).not.toContain('ez-bar-curl');
    expect(session(handle).constraints.swappedAway ?? []).toContain('ez-bar-curl');
  });

  it('comes back when the lifter stops the swap kept for weeks, as a swap back brings it', async () => {
    const handle = await lifter();
    const curl = allEntries(session(handle).workout.blocks).find(
      (entry) => entry.exerciseId === 'ez-bar-curl',
    );
    expect((await handle.store.swapExercise(curl!.id, 'cable-curl', true))?.ok).toBe(true);
    expect(session(handle).constraints.swappedAway).toEqual(['ez-bar-curl']);
    await handle.store.stopLastingSwap('ez-bar-curl');
    // The plan's own pick back where the plan has it, off the day's list.
    expect(ids(handle)).toContain('ez-bar-curl');
    expect(ids(handle)).not.toContain('cable-curl');
    expect(session(handle).constraints.swappedAway ?? []).toEqual([]);
  });

  it('comes back when the swap is stopped, the day’s other lifts swapped away kept away', async () => {
    const handle = await lifter();
    const plan = () => allEntries(session(handle).workout.blocks);
    const curl = plan().find((entry) => entry.exerciseId === 'ez-bar-curl')!;
    expect((await handle.store.swapExercise(curl.id, 'cable-curl', true))?.ok).toBe(true);
    const raise = plan().find((entry) => entry.exerciseId === 'lateral-raise')!;
    expect((await handle.store.swapExercise(raise.id, 'cable-lateral-raise'))?.ok).toBe(true);
    expect(session(handle).constraints.swappedAway).toEqual(['ez-bar-curl', 'lateral-raise']);
    await handle.store.stopLastingSwap('ez-bar-curl');
    expect(ids(handle)).toContain('ez-bar-curl');
    expect(ids(handle)).not.toContain('lateral-raise');
    expect(session(handle).constraints.swappedAway).toEqual(['lateral-raise']);
  });
});
