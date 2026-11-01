import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { prioritiesToday } from '../../engine/workout/todaysPriorities';
import { allEntries } from '../../engine/workout/types';
import { at } from '../../test/clockDays';
import { createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type Weekday } from '../validation/profile';

/**
 * "Priority muscles today" (the owner, 2026-11-01) as a change leaves the plan: a lift skipped takes
 * its muscles off the line and the chips once no lift left trains them. Monday, Tuesday and Thursday,
 * on Monday: the lower day (Maintenance 38's order). Synthetic data only.
 */

const MONDAY = at(7, 9);
const DAYS: Weekday[] = ['mon', 'tue', 'thu'];

async function lowerDay() {
  const handle = createTestStore({ now: () => MONDAY, minOverlayMs: 0 });
  await handle.store.hydrate();
  const profile = createDefaultProfile(MONDAY);
  await handle.store.completeOnboarding(
    {
      ...profile,
      bodyweight: 185,
      schedule: { ...profile.schedule, availableDays: DAYS, weeklyFrequency: DAYS.length },
    },
    createDefaultLocations({ gymAccess: true }, MONDAY),
  );
  return handle.store;
}

describe('today’s priority muscles as a change leaves the plan (the owner, 2026-11-01)', () => {
  it('takes a muscle off once the lifts that train it are skipped', async () => {
    const store = await lowerDay();
    const workout = () => store.getSnapshot().session!.workout;
    const line = () =>
      workout().explanation.reasons.find((reason) => reason.startsWith('Priority muscles today'));
    const chips = () =>
      prioritiesToday(workout().musclePriorities, workout().blocks)
        .slice(0, 4)
        .map((priority) => priority.muscle);
    expect(workout().templateId).toBe('lower');
    expect(line()).toMatch(/^Priority muscles today: Glutes: [^;]+; Hamstrings: [^;]+; Quads: /);
    expect(chips()).toContain('hamstrings');
    const hamstrings = allEntries(workout().blocks)
      .filter((entry) => requireExercise(entry.exerciseId).primaryMuscles.includes('hamstrings'))
      .map((entry) => entry.id);
    expect(hamstrings.length).toBeGreaterThan(0);
    for (const entryId of hamstrings) {
      expect((await store.recalibrate({ type: 'skip', entryId }))?.ok).toBe(true);
    }
    expect(line()).not.toContain('Hamstrings');
    expect(line()).toMatch(/^Priority muscles today: Glutes: [^;]+; Quads: /);
    expect(chips()).not.toContain('hamstrings');
    // The week's ranking itself is kept whole with the plan.
    expect(workout().musclePriorities.map((priority) => priority.muscle)).toContain('hamstrings');
  });
});
