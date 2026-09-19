import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { emptyMaxes, recordMax } from '../progression/maxes';
import { record } from '../../test/records';
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

  it('on a lift with logged sets moves the target toward a newer, higher max and says so', () => {
    const history = [
      record(3, 'barbell-bench-press', [
        [5, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
      ]),
    ];
    const lifter = { ...profile, bodyweight: 185 };
    const workout = generateWorkout({
      profile: lifter,
      location: gym,
      history,
      now: NOW,
      duration: 'default',
    });
    const bench = allEntries(workout.blocks).find(
      (entry) => entry.exerciseId === 'barbell-bench-press',
    );
    if (!bench) throw new Error('expected the bench in the plan');
    const before = bench.sets.find((set) => set.kind === 'working')?.targetWeight ?? 0;
    const run = (e1rm: number) =>
      recalibrate({
        trigger: { type: 'max', exerciseId: 'barbell-bench-press' },
        workout,
        completed: emptyCompleted(),
        lockedEntryIds: [],
        currentEntryId: null,
        duration: 'default',
        profile: lifter,
        location: gym,
        history,
        constraints: emptyConstraints(),
        reason: 'test',
        timestamp: NOW,
        maxes: recordMax(emptyMaxes(), 'barbell-bench-press', { kind: 'max', e1rm }, 'lb', NOW),
      });
    const raised = run(275);
    expect(raised.ok).toBe(true);
    if (!raised.ok) return;
    expect(raised.summary.headline).toBe('Barbell Bench Press: the target moved toward your max.');
    const after = allEntries(raised.workout.blocks)
      .find((entry) => entry.id === bench.id)
      ?.sets.find((set) => set.kind === 'working')?.targetWeight;
    expect(after ?? 0).toBeGreaterThan(before);
    expect(after ?? 0).toBeLessThanOrEqual(before + 10);

    const modest = run(230);
    expect(modest.ok).toBe(true);
    if (!modest.ok) return;
    expect(modest.summary.headline).toBe(
      'Max saved. Your logged sets already put Barbell Bench Press at this target.',
    );
  });
});
