import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import { buildSets, prescribe, rampSetsFor } from '../progression/roles';
import type { WorkoutBlock, WorkoutEntry } from '../workout/types';
import {
  DURATION_CHOICES,
  durationLabel,
  estimateWorkout,
  generalWarmupMinutes,
  isDurationChoice,
  resolveTargetMinutes,
} from './duration';

const NOW = '2026-09-03T12:00:00.000Z';
const profile = createDefaultProfile(NOW);

function entry(
  id: string,
  exerciseId: string,
  role: WorkoutEntry['role'],
  warmups = 0,
): WorkoutEntry {
  const exercise = requireExercise(exerciseId);
  const prescription = prescribe(exercise, role, profile);
  return {
    id,
    exerciseId,
    role,
    sets: buildSets(prescription, warmups),
    restSeconds: prescription.restSeconds,
    warmupSets: warmups,
    dropSet: false,
    chosenFor: exercise.primaryMuscles,
    locked: false,
    pinned: false,
  };
}

function straight(item: WorkoutEntry): WorkoutBlock {
  return {
    id: `b-${item.id}`,
    kind: 'straight',
    label: item.exerciseId,
    entries: [item],
    rounds: 3,
    restBetweenRoundsSeconds: item.restSeconds,
  };
}

describe('duration choices', () => {
  it('offers exactly 15, 30, 45, and Default time', () => {
    expect(DURATION_CHOICES).toEqual([15, 30, 45, 'default']);
    expect(isDurationChoice(20)).toBe(false);
    expect(resolveTargetMinutes('default', 62)).toBe(62);
    expect(resolveTargetMinutes(30, 62)).toBe(30);
    expect(durationLabel('default', 62)).toBe('Default: 62 min');
    expect(durationLabel(15, 62)).toBe('15 min');
  });

  it('keeps the general warm-up short on short sessions', () => {
    expect(generalWarmupMinutes(15)).toBeLessThan(generalWarmupMinutes(30));
    expect(generalWarmupMinutes(60)).toBe(5);
  });
});

describe('time estimation', () => {
  it('adds warm-up, work, rest, and setup and grows with sets and rest', () => {
    const bench = entry('e1', 'barbell-bench-press', 'primary-strength', 2);
    const time = estimateWorkout([straight(bench)], 5, requireExercise);
    expect(time.totalMinutes).toBeCloseTo(
      time.warmupMinutes + time.workMinutes + time.restMinutes + time.transitionMinutes,
      1,
    );
    expect(time.warmupMinutes).toBe(5);
    expect(time.totalMinutes).toBeGreaterThan(12);

    const shorter = { ...bench, sets: bench.sets.slice(0, -1) };
    expect(estimateWorkout([straight(shorter)], 5, requireExercise).totalMinutes).toBeLessThan(
      time.totalMinutes,
    );
    const restier = {
      ...bench,
      sets: bench.sets.map((set) => ({ ...set, restSeconds: set.restSeconds + 60 })),
    };
    expect(estimateWorkout([straight(restier)], 5, requireExercise).totalMinutes).toBeGreaterThan(
      time.totalMinutes,
    );
  });

  it('makes a superset cheaper than the same two moves done straight', () => {
    const fly = entry('e1', 'cable-fly', 'isolation');
    const raise = entry('e2', 'lateral-raise', 'isolation');
    const straightTime = estimateWorkout(
      [straight(fly), straight(raise)],
      0,
      requireExercise,
    ).totalMinutes;
    const superset: WorkoutBlock = {
      id: 's',
      kind: 'superset',
      label: 'A1 + A2',
      entries: [fly, raise],
      rounds: 3,
      restBetweenRoundsSeconds: 60,
    };
    const supersetTime = estimateWorkout([superset], 0, requireExercise).totalMinutes;
    expect(supersetTime).toBeLessThan(straightTime);
  });
});

describe('progression roles', () => {
  it('prescribes lower reps and longer rests for strength roles', () => {
    const bench = requireExercise('barbell-bench-press');
    const strength = prescribe(bench, 'primary-strength', profile);
    const hypertrophy = prescribe(bench, 'primary-hypertrophy', profile);
    expect(strength.reps).toEqual([4, 6]);
    expect(hypertrophy.reps).toEqual([6, 10]);
    expect(strength.restSeconds).toBeGreaterThan(hypertrophy.restSeconds);
    expect(strength.rir).toBeGreaterThan(hypertrophy.rir);
    expect(
      prescribe(bench, 'primary-strength', { ...profile, restStyle: 'short' }).restSeconds,
    ).toBeLessThan(strength.restSeconds);
    expect(
      prescribe(bench, 'primary-strength', { ...profile, trainingStyle: 'hypertrophy-focus' }).sets,
    ).toBe(3);
  });

  it('flags ramp sets as warm-up and scales them with the session length', () => {
    const bench = requireExercise('barbell-bench-press');
    expect(rampSetsFor(bench, 'primary-strength', 60)).toBe(2);
    expect(rampSetsFor(bench, 'primary-strength', 30)).toBe(1);
    expect(rampSetsFor(requireExercise('cable-fly'), 'isolation', 60)).toBe(0);
    const sets = buildSets(prescribe(bench, 'primary-strength', profile), 2);
    expect(sets.filter((set) => set.kind === 'warmup')).toHaveLength(2);
    expect(sets.filter((set) => set.kind === 'working')).toHaveLength(4);
    expect(sets[0]?.targetRir).toBe(5);
  });
});
