import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 32, the owner's item 11, in the completion (the second review of round N): "Next
 * time" reads a main lift's target as the next plan will, at the top set's reserve, so a session
 * lifted as asked names the load the next top set steps up to. TEST_NOW is a Wednesday, a day the
 * schedule ticks. Synthetic data only.
 */

const DAY = 86_400_000;
const schedule = createDefaultProfile(TEST_NOW).schedule;
const everyDay: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], weeklyFrequency: 5 },
  programStyle: 'hybrid',
};

describe('the completion’s next target for a main lift on top set plus back-offs, the second review of round N', () => {
  it('names the load the next plan gives its top set after a session lifted as asked', async () => {
    const handle = createTestStore({ now: () => TEST_NOW });
    const { store } = handle;
    await store.hydrate();
    const locations = createDefaultLocations({ gymAccess: true }, TEST_NOW);
    await store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...everyDay },
      locations,
    );
    const db = await store.getDatabase();
    for (const daysAgo of [7, 3]) {
      for (const exerciseId of ['barbell-bench-press', 'back-squat', 'barbell-row']) {
        const when = new Date(Date.parse(TEST_NOW) - daysAgo * DAY).toISOString();
        await db.put('workouts', {
          ...record(0, exerciseId, [
            [5, 135, 2],
            [5, 135, 2],
            [5, 135, 2],
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
    const templateId = workout().templateId;
    const exerciseId = main().exerciseId;
    const name = requireExercise(exerciseId).name;
    store.startWorkout();
    // Every working set of the main lift as asked: the top set 5 reps at 1 in reserve, the
    // back-offs 5 reps at 2.
    for (const set of main().sets.filter((candidate) => candidate.kind === 'working')) {
      await store.logSet(main().id, set.index, {
        weight: set.targetWeight,
        reps: 5,
        rir: set.targetRir,
      });
    }
    await store.finishWorkout(null);
    const line = store
      .getSnapshot()
      .session!.completion!.nextTargets.find((target) => target.startsWith(`${name}:`));
    expect(line).toBeDefined();
    // The next plan for the same day's template, two days on.
    const state = store.getSnapshot();
    const next = generateWorkout({
      profile: state.profile!,
      location: locations.find((place) => place.kind === 'gym')!,
      history: state.readHistory,
      now: new Date(Date.parse(TEST_NOW) + 2 * DAY).toISOString(),
      duration: 'default',
      constraints: { templateId },
    });
    const top = allEntries(next.blocks)
      .find((entry) => entry.exerciseId === exerciseId)
      ?.sets.find((set) => set.tier === 'top');
    expect(top?.targetWeight).toBeDefined();
    // "Next time" names the load the next plan's top set has.
    expect(line).toContain(`${name}: ${top!.targetWeight} lb`);
  });
});
