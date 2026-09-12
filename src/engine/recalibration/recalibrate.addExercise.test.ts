import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { MUSCLE_IDS, muscleName } from '../../catalog/muscles/muscles';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries, workingSets } from '../workout/types';
import { accessoryPicker, generateWorkout, pickAccessoryFor } from '../workoutGenerator/generate';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { RecalibrationRequest } from './types';

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
