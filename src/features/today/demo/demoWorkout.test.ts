import { describe, expect, it } from 'vitest';
import { createDefaultLocations, createLocation } from '../../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../../core/validation/profile';
import { buildDemoWorkout } from './demoWorkout';

const NOW = '2026-09-02T12:00:00.000Z';
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createDefaultProfile(NOW), ...overrides };
}

describe('buildDemoWorkout', () => {
  it('is deterministic and clearly synthetic', () => {
    const a = buildDemoWorkout(profile(), gym);
    const b = buildDemoWorkout(profile(), gym);
    expect(a).toEqual(b);
    expect(a.synthetic).toBe(true);
    expect(a.title).toMatch(/\(demo\)$/);
    expect(a.exercises.length).toBeGreaterThanOrEqual(4);
    expect(a.estimatedMinutes).toBeGreaterThan(20);
  });

  it('picks the chest and arms template for the default goals', () => {
    const workout = buildDemoWorkout(profile(), gym);
    expect(workout.title).toBe('Chest + Arms focus (demo)');
    expect(workout.exercises[0]?.name).toBe('Barbell Bench Press');
    expect(workout.focus).toContain('Chest');
  });

  it('uses only equipment available at the location', () => {
    const workout = buildDemoWorkout(profile(), home);
    expect(workout.exercises.map((exercise) => exercise.name)).not.toContain('Barbell Bench Press');
    expect(workout.exercises.map((exercise) => exercise.equipment)).not.toContain('Barbell');
    expect(workout.why.join(' ')).toContain('Home');
  });

  it('excludes disliked exercises and prefers preferred ones', () => {
    const disliked = buildDemoWorkout(
      profile({ exercisePreferences: { preferred: [], disliked: ['Barbell Bench Press'] } }),
      gym,
    );
    expect(disliked.exercises[0]?.name).toBe('Dumbbell Bench Press');

    const preferred = buildDemoWorkout(
      profile({ exercisePreferences: { preferred: ['Machine Chest Press'], disliked: [] } }),
      gym,
    );
    expect(preferred.exercises[0]?.name).toBe('Machine Chest Press');
  });

  it('respects barbell-squat and shoulder limitations in the strength template', () => {
    const base = profile({ goals: { primary: 'strength', secondary: 'none' } });
    const withSquat = buildDemoWorkout(base, gym);
    expect(withSquat.title).toBe('Full-body strength (demo)');
    expect(withSquat.exercises[0]?.name).toBe('Back Squat');

    const limited = buildDemoWorkout(
      {
        ...base,
        limitations: {
          painAreas: [],
          shoulder: ['avoid-overhead-pressing'],
          avoidBarbellSquats: true,
          notes: '',
        },
      },
      gym,
    );
    const names = limited.exercises.map((exercise) => exercise.name);
    expect(names).not.toContain('Back Squat');
    expect(names[0]).toBe('Hack Squat');
    expect(names).not.toContain('Overhead Press');
    expect(names).not.toContain('Dumbbell Shoulder Press');
  });

  it('pairs isolation moves when supersets are on and marks one drop set when enabled', () => {
    const on = buildDemoWorkout(profile(), gym);
    expect(
      on.exercises.filter((exercise) => exercise.superset).map((exercise) => exercise.superset),
    ).toEqual(['A1', 'A2']);
    expect(on.exercises.filter((exercise) => exercise.dropSet)).toHaveLength(1);

    const off = buildDemoWorkout(
      profile({ techniques: { supersets: false, dropSets: false, circuits: false } }),
      gym,
    );
    expect(off.exercises.some((exercise) => exercise.superset)).toBe(false);
    expect(off.exercises.some((exercise) => exercise.dropSet)).toBe(false);
  });

  it('shortens the session for a shorter typical duration', () => {
    const long = buildDemoWorkout(profile(), gym);
    const short = buildDemoWorkout(
      profile({
        schedule: {
          weeklyFrequency: 3,
          typicalDurationMinutes: 30,
          availableDays: ['mon', 'wed', 'fri'],
        },
      }),
      gym,
    );
    expect(short.exercises.length).toBeLessThan(long.exercises.length);
    expect(short.estimatedMinutes).toBeLessThan(long.estimatedMinutes);
  });

  it('explains compromises when nothing fits', () => {
    const bare = createLocation(
      { id: 'bare', name: 'Bare room', kind: 'custom', equipment: [] },
      NOW,
    );
    const workout = buildDemoWorkout(profile(), bare);
    expect(workout.exercises.map((exercise) => exercise.name)).toEqual(['Push-Up']);
    expect(workout.compromises.length).toBeGreaterThan(0);
  });
});
