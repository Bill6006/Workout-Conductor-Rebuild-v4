import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { MUSCLE_IDS, muscleName } from '../../catalog/muscles/muscles';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { DUMBBELLS_KEY } from '../loading/loading';
import { allEntries, workingSets, type WorkoutEntry } from '../workout/types';
import { accessoryPicker, generateWorkout, pickAccessoryFor } from '../workoutGenerator/generate';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { RecalibrationRequest, SessionConstraints } from './types';

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);

describe('add-exercise trigger', () => {
  it('appends two locked sets of the best accessory for a muscle with nothing today', () => {
    const workout = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
    });
    const exercises = allEntries(workout.blocks).map((entry) => requireExercise(entry.exerciseId));
    const covered = new Set(exercises.flatMap((exercise) => exercise.primaryMuscles));
    const muscle =
      MUSCLE_IDS.find((candidate) => candidate === 'lats' && !covered.has(candidate)) ??
      MUSCLE_IDS.find((candidate) => !covered.has(candidate))!;
    const accessory = pickAccessoryFor(
      muscle,
      exercises,
      accessoryPicker({ profile, location: gym, history: [], now: NOW }),
    )!;
    expect(accessory.primaryMuscles).toContain(muscle);

    const request: RecalibrationRequest = {
      trigger: { type: 'add-exercise', exerciseId: accessory.id, muscle, sets: 2 },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile,
      location: gym,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    };
    const result = recalibrate(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const added = allEntries(result.workout.blocks).find(
      (entry) => entry.exerciseId === accessory.id,
    )!;
    const last = result.workout.blocks[result.workout.blocks.length - 1]!;
    expect(last.entries[0]).toBe(added);
    expect(last.kind).toBe('straight');
    expect(workingSets(added).filter((set) => set.kind === 'working')).toHaveLength(2);
    expect(added.warmupSets).toBe(0);
    expect(added.locked).toBe(true);
    expect(added.chosenFor).toEqual([muscle]);
    expect(added.progression?.mode).toBe('start');
    expect(result.summary.headline).toBe(
      `${accessory.name} added: 2 sets for ${muscleName(muscle).toLowerCase()}.`,
    );
    expect(result.workout.duration.estimatedMinutes).toBeGreaterThan(
      workout.duration.estimatedMinutes,
    );
    // Every id stays unique, and adding the same exercise twice is refused.
    const ids = allEntries(result.workout.blocks).map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const again = recalibrate({ ...request, workout: result.workout });
    expect(again.ok).toBe(false);
  });
});

/**
 * Maintenance 24, the owner's item 35: the exercise the coach adds is fitted as the plan fits one,
 * to the weights at the place, a deload week and "Make it harder" or "easier".
 */
describe('the exercise the coach adds', () => {
  const lifter = { ...profile, bodyweight: 185 };
  const places = createDefaultLocations({ gymAccess: true }, NOW);
  const home = places.find((place) => place.id === 'home')!;
  const atGym = places.find((place) => place.id === 'gym')!;
  const lightHome = {
    ...home,
    loading: {
      [DUMBBELLS_KEY]: { kind: 'dumbbells' as const, ranges: [{ from: 5, to: 20, step: 5 }] },
    },
  };

  function add(
    location: LocationProfile,
    constraints: Partial<SessionConstraints> = {},
  ): WorkoutEntry {
    const workout = generateWorkout({
      profile: lifter,
      location,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const result = recalibrate({
      trigger: { type: 'add-exercise', exerciseId: 'dumbbell-row', muscle: 'lats', sets: 2 },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: { ...lifter, currentLocationId: location.id },
      location,
      history: [],
      constraints: { ...emptyConstraints(), ...constraints },
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    return allEntries(result.workout.blocks).find((entry) => entry.exerciseId === 'dumbbell-row')!;
  }
  const first = (entry: WorkoutEntry) => entry.sets.find((set) => set.kind === 'working')!;

  it('takes a weight the light dumbbells make, standing in for the load asked', () => {
    const gymSet = first(add(atGym));
    const homeSet = first(add(lightHome));
    expect(gymSet.targetWeight).toBeGreaterThan(20);
    expect(homeSet.targetWeight).toBe(20);
    expect(homeSet.asked).toEqual({ weight: gymSet.targetWeight, reps: gymSet.targetReps });
  });

  it('takes a deload week: a lighter load and one more rep in reserve', () => {
    const plain = first(add(atGym));
    // One more rep in reserve alone lightens the load a little; the deload week's tenth comes on
    // top of that.
    const easier = first(add(atGym, { intensity: -1 }));
    const entry = add(atGym, {
      deload: { startsAt: '2026-09-07T00:00:00.000Z', endsAt: '2026-09-14T00:00:00.000Z' },
    });
    const deload = first(entry);
    expect(deload.targetRir).toBe(plain.targetRir + 1);
    expect(easier.targetRir).toBe(plain.targetRir + 1);
    expect(deload.targetWeight).toBeLessThan(easier.targetWeight!);
    expect(entry.progression?.evidence).toContain('Deload week: loads 10% lighter.');
    // At the light dumbbells the row holds at 20 lb either way: no word of a lighter load.
    const light = add(lightHome, {
      deload: { startsAt: '2026-09-07T00:00:00.000Z', endsAt: '2026-09-14T00:00:00.000Z' },
    });
    expect(first(light).targetWeight).toBe(20);
    expect(light.progression?.evidence).not.toContain('Deload week: loads 10% lighter.');
  });

  it('takes Make it harder and Make it easier', () => {
    const plain = first(add(atGym)).targetRir;
    expect(first(add(atGym, { intensity: 1 })).targetRir).toBe(plain - 1);
    expect(first(add(atGym, { intensity: -1 })).targetRir).toBe(plain + 1);
  });
});
