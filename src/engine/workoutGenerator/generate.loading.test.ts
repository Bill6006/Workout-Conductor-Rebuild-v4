import { afterEach, describe, expect, it } from 'vitest';
import { registerCustomExercises, requireExercise } from '../../catalog/exercises/catalog';
import {
  CustomExerciseSchema,
  customToCatalogExercise,
} from '../../core/validation/customExercise';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { DUMBBELLS_KEY } from '../loading/loading';
import { allEntries } from '../workout/types';
import { generateWorkout } from './generate';

const NOW = '2026-09-18T14:00:00.000Z';
const gym = createDefaultLocations({ gymAccess: true }, NOW).find((place) => place.kind === 'gym');
if (!gym) throw new Error('expected a default gym');

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createDefaultProfile(NOW), bodyweight: 185, ...overrides };
}

afterEach(() => registerCustomExercises([]));

describe('generateWorkout and what the place can load', () => {
  it('fits every target to the place from the first preview, capping at the heaviest pair', () => {
    const place: LocationProfile = {
      ...gym,
      loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 20, step: 5 }] } },
    };
    const workout = generateWorkout({
      profile: profile(),
      location: place,
      history: [],
      now: NOW,
      duration: 'default',
    });
    const handHeld = allEntries(workout.blocks).filter((entry) =>
      ['dumbbell-each', 'kettlebell'].includes(requireExercise(entry.exerciseId).load),
    );
    expect(handHeld.length).toBeGreaterThan(0);
    let capped = 0;
    for (const entry of handHeld) {
      for (const set of entry.sets) {
        if (set.targetWeight === null) continue;
        expect(set.targetWeight).toBeLessThanOrEqual(20);
        expect(set.targetWeight % 5).toBe(0);
      }
      if (entry.progression?.capped) capped += 1;
    }
    expect(capped).toBeGreaterThan(0);
  });

  it('picks a preferred custom machine for its slot, ahead of the catalog favourite', () => {
    const hack = requireExercise('hack-squat');
    registerCustomExercises([
      customToCatalogExercise(
        CustomExerciseSchema.parse({
          id: 'custom-freemotion-squat',
          custom: true,
          name: 'Freemotion Squat',
          primaryMuscles: [...hack.primaryMuscles],
          movementPattern: hack.movementPattern,
          equipment: [['hack-squat']],
          load: 'stack',
          createdAt: NOW,
          updatedAt: NOW,
        }),
      ),
    ]);
    const strength = { goals: { primary: 'strength', secondary: 'none' } } as const;
    const plain = generateWorkout({
      profile: profile(strength),
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
    });
    const names = (workout: typeof plain) =>
      allEntries(workout.blocks).map((entry) => requireExercise(entry.exerciseId).name);
    expect(names(plain)).not.toContain('Freemotion Squat');
    const preferred = generateWorkout({
      profile: profile({
        ...strength,
        exercisePreferences: { preferred: ['Freemotion Squat'], disliked: [] },
      }),
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
    });
    expect(names(preferred)).toContain('Freemotion Squat');
    expect(names(preferred)).not.toContain('Back Squat');
  });
});
