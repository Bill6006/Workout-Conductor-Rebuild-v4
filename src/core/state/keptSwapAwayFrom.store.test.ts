import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { allExercises, requireExercise } from '../../catalog/exercises/catalog';
import { allEntries, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Nineteenth review of round M, on the eighteenth pass's `awayIds` in the generator. The report: "A
 * lift the lifter swaps away stays away for the day (`swappedAway`): no change picks it by itself, as
 * a slot's own pick, a lasting swap's swap-in, the lift to push or the day's extra". A swap kept for
 * four weeks (Maintenance 22, `swapExercise`): "the exercise swapped in is used for the next few
 * weeks wherever the plan would pick the one it replaces".
 *
 * A swap the lifter keeps is also a swap made today, so the lift it replaces is swapped away today
 * too. The generator leaves the lifts swapped away out of the slot's own pick before it reads the
 * kept swaps (`natural` excludes `away`, and only a natural pick in `swappedOut` gives way to its
 * swap-in), so wherever the plan is laid out again the same day, the slot takes its next best, a
 * lift the lifter never chose, in place of the one the lifter chose to keep. Before the eighteenth
 * pass the own pick gave way to the kept swap's swap-in.
 *
 * Steps (synthetic data only):
 * - Monday's bench press in the log; on Wednesday, a day the schedule does not tick, the catch-up has
 *   the EZ-bar curl. The lifter swaps it for the cable curl and keeps the swap for four weeks. Full
 *   session: the pull day has the dumbbell curl where the EZ-bar curl goes, not the cable curl
 *   ("Cable Curl in place of EZ-Bar Curl, the swap you chose to keep" is gone). Catch-up instead:
 *   the catch-up has the dumbbell curl too.
 * - Monday's row in the log; on Thursday, a day the schedule ticks, the upper day leads with the
 *   bench press. The lifter picks 45 minutes, swaps the bench press for the dumbbell bench press and
 *   keeps the swap, then sets a coach focus (the preview made again, today's choices kept): the
 *   close-grip bench press leads, the kept swap and its line gone.
 * - In the generator: a kept swap of the bench press for the dumbbell bench press, the bench press
 *   swapped away today, plans the close-grip bench press.
 *
 * Passes on 4cb40d7.
 */

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();
const ids = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).map((entry) => entry.exerciseId);

/** A lifter with one workout two days before `at`: Wednesday by default, a day not ticked. */
async function lifterWith(exerciseId: string, at: string = TEST_NOW) {
  const handle = createTestStore({ now: () => at });
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
      exerciseId,
      [
        [10, 100, 2],
        [10, 100, 2],
        [10, 100, 2],
      ],
      [8, 12],
      2,
    ),
    id: `w-${exerciseId}-monday`,
    startedAt: when,
    completedAt: when,
  });
  await handle.store.hydrate();
  return handle;
}

describe('a swap kept for four weeks, made today', () => {
  it('stands where the plan is laid out again the same day: the full session and the way back', async () => {
    const { store } = await lifterWith('barbell-bench-press');
    const session = () => store.getSnapshot().session!;
    expect(session().workout.templateId).toBe('catch-up');
    const curl = allEntries(session().workout.blocks).find(
      (entry) => entry.exerciseId === 'ez-bar-curl',
    );
    expect(curl).toBeDefined();
    const swapped = await store.swapExercise(curl!.id, 'cable-curl', true);
    expect(swapped?.ok).toBe(true);
    expect(store.getSnapshot().lastingSwaps.map((swap) => [swap.from, swap.to])).toEqual([
      ['ez-bar-curl', 'cable-curl'],
    ]);
    const steps: string[] = [describeWorkout(session().workout).join('; ')];
    await store.setFullSession(true);
    steps.push(`full: ${describeWorkout(session().workout).join('; ')}`);
    expect(session().workout.templateId).toBe('pull-arms');
    // On 0f8d10f: the dumbbell curl in the EZ-bar curl's place, the kept swap passed over.
    expect(ids(session().workout), steps.join(' | ')).toContain('cable-curl');
    expect(session().workout.explanation.reasons).toContain(
      'Cable Curl in place of EZ-Bar Curl, the swap you chose to keep.',
    );
    await store.setFullSession(false);
    steps.push(`back: ${describeWorkout(session().workout).join('; ')}`);
    expect(session().workout.templateId).toBe('catch-up');
    // On 0f8d10f: the dumbbell curl in the catch-up too.
    expect(ids(session().workout), steps.join(' | ')).toContain('cable-curl');
  });

  it('stands through the preview made again on a day the schedule ticks', async () => {
    const thursday = new Date(Date.parse(TEST_NOW) + DAY).toISOString();
    const { store } = await lifterWith('barbell-row', thursday);
    const session = () => store.getSnapshot().session!;
    expect(session().constraints.catchUp).toBeUndefined();
    await store.setDurationChoice(45);
    const [lead] = allEntries(session().workout.blocks);
    expect(lead?.exerciseId).toBe('barbell-bench-press');
    const swapped = await store.swapExercise(lead!.id, 'dumbbell-bench-press', true);
    expect(swapped?.ok).toBe(true);
    await store.setCoachFocus('biceps');
    const steps = describeWorkout(session().workout).join('; ');
    // On 0f8d10f: the close-grip bench press leads.
    expect(ids(session().workout)[0], steps).toBe('dumbbell-bench-press');
    expect(session().workout.explanation.reasons).toContain(
      'Dumbbell Bench Press in place of Barbell Bench Press, the swap you chose to keep.',
    );
  });

  it('the generator puts the kept swap in for a lift swapped away today', () => {
    const swaps = [
      { from: 'barbell-bench-press', to: 'dumbbell-bench-press', setAt: at(1), until: at(30) },
    ];
    const plan = (awayIds: string[]) =>
      generateWorkout({
        profile: profileOf(),
        location: gym,
        history: [session(at(3, 18), [['barbell-row', 3]])],
        now: at(8, 18),
        duration: 'default',
        constraints: { templateId: 'push-arms', swaps, awayIds },
      });
    expect(ids(plan([]))[0]).toBe('dumbbell-bench-press');
    // On 0f8d10f: the close-grip bench press.
    expect(ids(plan(['barbell-bench-press']))[0]).toBe('dumbbell-bench-press');
  });

  it('brings no lift swapped away today back by itself where its kept swap cannot join', () => {
    // The kept swap's swap-in swapped away today too, and every other lift for the slot set aside:
    // the plan's own pick stays only where the lifter did not swap it away today.
    const swaps = [
      { from: 'barbell-bench-press', to: 'dumbbell-bench-press', setAt: at(1), until: at(30) },
    ];
    const pattern = requireExercise('barbell-bench-press').movementPattern;
    const others = allExercises()
      .filter((one) => one.movementPattern === pattern)
      .map((one) => one.id)
      .filter((id) => id !== 'barbell-bench-press' && id !== 'dumbbell-bench-press');
    const plan = (awayIds: string[]) =>
      ids(
        generateWorkout({
          profile: profileOf(),
          location: gym,
          history: [session(at(3, 18), [['barbell-row', 3]])],
          now: at(8, 18),
          duration: 'default',
          constraints: {
            templateId: 'push-arms',
            swaps,
            awayIds,
            excludeExerciseIds: others,
          },
        }),
      );
    // A kept swap never empties a slot: the plan's own pick stays.
    expect(plan(['dumbbell-bench-press'])).toContain('barbell-bench-press');
    // Swapped away today itself, it stays away.
    expect(plan(['dumbbell-bench-press', 'barbell-bench-press'])).not.toContain(
      'barbell-bench-press',
    );
  });
});
