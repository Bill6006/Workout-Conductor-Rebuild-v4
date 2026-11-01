import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { requireExercise } from '../../catalog/exercises/catalog';
import { allEntries } from '../../engine/workout/types';
import { at } from '../../test/clockDays';
import { Providers, createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type Weekday } from '../../core/validation/profile';

vi.mock('../library/useCustomMedia', () => ({ useCustomMedia: () => null }));

/**
 * "Priority muscles today" (the owner, 2026-11-01) on Today, under way: every set of the lifts that
 * train the hamstrings skipped once the workout began, nothing of them done, takes the hamstrings
 * off the chips and the line (the review). Monday, Tuesday and Thursday, on Monday: the lower day
 * (Maintenance 38's order). Synthetic data only.
 */

const MONDAY = at(7, 9);
const DAYS: Weekday[] = ['mon', 'tue', 'thu'];

describe('today’s priority muscles under way, on Today', () => {
  it('drops a muscle whose every set was skipped once begun', async () => {
    const { store } = createTestStore({ now: () => MONDAY, minOverlayMs: 0 });
    await store.hydrate();
    const profile = createDefaultProfile(MONDAY);
    await store.completeOnboarding(
      {
        ...profile,
        bodyweight: 185,
        schedule: { ...profile.schedule, availableDays: DAYS, weeklyFrequency: DAYS.length },
      },
      createDefaultLocations({ gymAccess: true }, MONDAY),
    );
    const workout = () => store.getSnapshot().session!.workout;
    expect(workout().templateId).toBe('lower');
    const hamstrings = allEntries(workout().blocks).filter((entry) =>
      requireExercise(entry.exerciseId).primaryMuscles.includes('hamstrings'),
    );
    expect(hamstrings.length).toBeGreaterThan(0);
    store.startWorkout();
    for (const entry of hamstrings) {
      for (const set of entry.sets) store.skipSet(entry.id, set.index);
    }
    // The plan still holds the lifts and their sets: only the log says they were skipped.
    expect(allEntries(workout().blocks).map((entry) => entry.id)).toEqual(
      expect.arrayContaining(hamstrings.map((entry) => entry.id)),
    );
    act(() => {
      window.location.hash = '#/today';
    });
    render(
      <Providers store={store}>
        <App />
      </Providers>,
    );
    const chips = await screen.findByLabelText('Muscle priorities');
    expect(Array.from(chips.children).map((chip) => chip.textContent)).not.toContain('Hamstrings');
    const line = screen.getByText(/^Priority muscles today: /).textContent ?? '';
    expect(line).not.toContain('Hamstrings');
    expect(line).toMatch(/^Priority muscles today: Glutes: [^;]+; Quads: /);
  });
});
