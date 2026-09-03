import { describe, expect, it } from 'vitest';
import { createDefaultLocations, createLocation } from '../../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../../core/validation/profile';
import { buildDemoWorkout } from './demoWorkout';

const NOW = '2026-09-02T12:00:00.000Z';
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createDefaultProfile(NOW), ...overrides };
}

const names = (workout: ReturnType<typeof buildDemoWorkout>) =>
  workout.exercises.map((entry) => entry.exercise.name);

describe('buildDemoWorkout (catalog-backed)', () => {
  it('is deterministic and clearly synthetic', () => {
    const a = buildDemoWorkout(profile(), gym);
    const b = buildDemoWorkout(profile(), gym);
    expect(a).toEqual(b);
    expect(a.synthetic).toBe(true);
    expect(a.title).toMatch(/\(demo\)$/);
    expect(a.exercises.length).toBeGreaterThanOrEqual(4);
    expect(a.estimatedMinutes).toBeGreaterThan(20);
  });

  it('picks the chest and arms template with the best available press first', () => {
    const workout = buildDemoWorkout(profile(), gym);
    expect(workout.title).toBe('Chest + Arms focus (demo)');
    expect(names(workout)[0]).toBe('Barbell Bench Press');
    expect(workout.focus).toContain('Chest');
    expect(workout.exercises[0]?.reps).toBe('4-6');
  });

  it('uses only equipment available at the location', () => {
    const workout = buildDemoWorkout(profile(), home);
    const available = new Set(home?.equipment ?? []);
    for (const entry of workout.exercises) {
      expect(entry.exercise.equipment.some((group) => group.every((id) => available.has(id)))).toBe(
        true,
      );
    }
    expect(names(workout)).not.toContain('Barbell Bench Press');
    expect(workout.why.join(' ')).toContain('Home');
  });

  it('excludes disliked exercises and prefers preferred ones', () => {
    const disliked = buildDemoWorkout(
      profile({ exercisePreferences: { preferred: [], disliked: ['Barbell Bench Press'] } }),
      gym,
    );
    expect(names(disliked)).not.toContain('Barbell Bench Press');
    expect(disliked.exercises[0]?.exercise.movementPattern).toBe('horizontal-push');

    const preferred = buildDemoWorkout(
      profile({ exercisePreferences: { preferred: ['Machine Chest Press'], disliked: [] } }),
      gym,
    );
    expect(names(preferred)[0]).toBe('Machine Chest Press');
  });

  it('respects barbell-squat and shoulder limitations in the strength template', () => {
    const base = profile({ goals: { primary: 'strength', secondary: 'none' } });
    const withSquat = buildDemoWorkout(base, gym);
    expect(withSquat.title).toBe('Full-body strength (demo)');
    expect(names(withSquat)[0]).toBe('Back Squat');

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
    const limitedNames = names(limited);
    expect(limitedNames).not.toContain('Back Squat');
    expect(limitedNames[0]).toBe('Hack Squat');
    expect(limitedNames).not.toContain('Overhead Press');
    expect(limitedNames).not.toContain('Dumbbell Shoulder Press');
    expect(limitedNames).not.toContain('Machine Shoulder Press');
  });

  it('never produces a blocked selection', () => {
    const workout = buildDemoWorkout(profile(), gym);
    const ids = workout.exercises.map((entry) => entry.exercise.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(workout.compromises.every((line) => !/twice|compete/.test(line))).toBe(true);
  });

  it('pairs drop-set-safe isolation moves when supersets are on and marks one drop set', () => {
    const on = buildDemoWorkout(profile(), gym);
    expect(on.exercises.filter((entry) => entry.superset).map((entry) => entry.superset)).toEqual([
      'A1',
      'A2',
    ]);
    const drops = on.exercises.filter((entry) => entry.dropSet);
    expect(drops).toHaveLength(1);
    expect(drops[0]?.exercise.dropSetSafe).toBe(true);

    const off = buildDemoWorkout(
      profile({ techniques: { supersets: false, dropSets: false, circuits: false } }),
      gym,
    );
    expect(off.exercises.some((entry) => entry.superset)).toBe(false);
    expect(off.exercises.some((entry) => entry.dropSet)).toBe(false);
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

  it('explains compromises when almost nothing fits', () => {
    const bare = createLocation(
      { id: 'bare', name: 'Bare room', kind: 'custom', equipment: [] },
      NOW,
    );
    const workout = buildDemoWorkout(profile(), bare);
    expect(names(workout)).toEqual(['Push-Up']);
    expect(workout.compromises.length).toBeGreaterThan(0);
  });
});
