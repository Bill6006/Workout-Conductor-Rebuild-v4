import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { barWeightFor } from '../progression/startingLoad';
import { allEntries, workingSets, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from './generate';

const NOW = '2026-09-18T14:00:00.000Z';
const gym = createDefaultLocations({ gymAccess: true }, NOW).find((place) => place.kind === 'gym');
if (!gym) throw new Error('expected a default gym');

function generate(overrides: Partial<UserProfile> = {}) {
  return generateWorkout({
    profile: { ...createDefaultProfile(NOW), ...overrides },
    location: gym,
    history: [],
    now: NOW,
    duration: 'default',
  });
}

function ramps(entry: WorkoutEntry) {
  return entry.sets.filter((set) => set.kind === 'warmup');
}

describe('ramps decided from the whole session', () => {
  it('puts no ramp at the empty bar when the bar is the working weight', () => {
    const workout = generate();
    const first = allEntries(workout.blocks)[0];
    if (!first) throw new Error('expected an anchor');
    const exercise = requireExercise(first.exerciseId);
    expect(workingSets(first)[0]?.targetWeight).toBe(barWeightFor(exercise, 'lb'));
    expect(first.warmupSets).toBe(0);
    expect(ramps(first)).toHaveLength(0);
  });

  it('gives the first heavy compound its full ramp and later exercises on warm muscles at most one, every ramp under its working weight', () => {
    const workout = generate({ bodyweight: 185 });
    const entries = allEntries(workout.blocks);
    const first = entries[0];
    if (!first) throw new Error('expected an anchor');
    expect(first.warmupSets).toBe(2);
    let laterRamps = 0;
    for (const entry of entries) {
      const working = workingSets(entry)[0]?.targetWeight ?? null;
      for (const ramp of ramps(entry)) {
        if (working !== null && ramp.targetWeight !== null) {
          expect(ramp.targetWeight).toBeLessThan(working);
        }
      }
      if (entry !== first) {
        expect(entry.warmupSets).toBeLessThanOrEqual(1);
        laterRamps += entry.warmupSets;
      }
    }
    // The owner's case: a second and third press after the first do not each get a full ramp.
    expect(laterRamps).toBeLessThan(entries.length - 1 + 1);
  });
});
