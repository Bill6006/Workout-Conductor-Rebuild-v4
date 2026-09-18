import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { emptyMaxes, recordMax } from '../progression/maxes';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';

const NOW = '2026-09-18T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const gym = createDefaultLocations({ gymAccess: true }, NOW).find((place) => place.kind === 'gym');
if (!gym) throw new Error('expected a default gym');

describe('a max entered by hand', () => {
  it('sets the first target of every other lift never logged through the cross-exercise estimate', () => {
    const workout = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
    });
    const maxes = recordMax(
      emptyMaxes(),
      'barbell-bench-press',
      { kind: 'set', weight: 185, reps: 5 },
      'lb',
      NOW,
    );
    const result = recalibrate({
      trigger: { type: 'max', exerciseId: 'barbell-bench-press' },
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
      maxes,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.headline).toBe('First target for Barbell Bench Press set from your max.');
    const fromBench = allEntries(result.workout.blocks).filter((entry) =>
      entry.progression?.evidence[0]?.startsWith(
        'From your Barbell Bench Press (about 216 lb max)',
      ),
    );
    expect(fromBench.length).toBeGreaterThan(0);
    for (const entry of fromBench) {
      expect(requireExercise(entry.exerciseId).id).not.toBe('barbell-bench-press');
      expect(entry.sets.find((set) => set.kind === 'working')?.targetWeight).not.toBeNull();
    }
    expect(result.summary.details.join(' ')).toMatch(/other lifts? never logged take/);
  });
});
