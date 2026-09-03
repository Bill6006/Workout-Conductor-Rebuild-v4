import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { checkWorkoutConflicts, isBlocked } from '../conflicts/conflictEngine';
import { buildConflictContext } from '../conflicts/context';
import { allEntries, workingSets, type DurationChoice } from '../workout/types';
import { generateWorkout } from './generate';

const NOW = '2026-09-03T14:00:00.000Z';
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...createDefaultProfile(NOW), ...overrides };
}

function generate(
  overrides: Partial<UserProfile> = {},
  duration: DurationChoice = 'default',
  location = gym,
  history: WorkoutRecord[] = [],
) {
  return generateWorkout({ profile: profile(overrides), location, history, now: NOW, duration });
}

const names = (workout: ReturnType<typeof generate>) =>
  allEntries(workout.blocks).map((entry) => requireExercise(entry.exerciseId).name);

describe('generateWorkout: default session', () => {
  it('builds a push + arms session for the default profile with the main lift first', () => {
    const workout = generate();
    expect(workout.templateId).toBe('push-arms');
    expect(workout.title).toBe('Push + arms');
    expect(workout.duration).toMatchObject({
      choice: 'default',
      targetMinutes: 60,
      defaultMinutes: 60,
    });
    const first = allEntries(workout.blocks)[0];
    expect(first?.role).toBe('primary-strength');
    expect(requireExercise(first!.exerciseId).compound).toBe(true);
    expect(requireExercise(first!.exerciseId).name).toBe('Barbell Bench Press');
    expect(allEntries(workout.blocks).length).toBeGreaterThanOrEqual(5);
    expect(workout.duration.estimatedMinutes).toBeLessThanOrEqual(61);
    expect(workout.explanation.summary).toContain('Push + arms');
    expect(workout.explanation.reasons.length).toBeGreaterThanOrEqual(4);
    expect(workout.confidence).toBe('low');
  });

  it('uses hybrid prescriptions: strength reps and long rests first, hypertrophy after', () => {
    const workout = generate();
    const [anchor, second] = allEntries(workout.blocks);
    const anchorSet = workingSets(anchor!)[0]!;
    expect(anchorSet.targetReps).toEqual([4, 6]);
    expect(anchorSet.targetRir).toBe(2);
    expect(anchor!.restSeconds).toBeGreaterThanOrEqual(120);
    expect(anchor!.warmupSets).toBe(2);
    expect(anchor!.sets.filter((set) => set.kind === 'warmup')).toHaveLength(2);
    expect(workingSets(anchor!).every((set) => set.kind !== 'warmup')).toBe(true);
    const secondSet = workingSets(second!)[0]!;
    expect(secondSet.targetReps[1]).toBeGreaterThan(anchorSet.targetReps[1]);
    expect(second!.restSeconds).toBeLessThan(anchor!.restSeconds);
  });

  it('pairs isolation moves into two-move superset blocks with one readable row', () => {
    const workout = generate();
    const supersets = workout.blocks.filter((block) => block.kind === 'superset');
    expect(supersets.length).toBeGreaterThanOrEqual(1);
    for (const block of supersets) {
      expect(block.entries).toHaveLength(2);
      expect(block.label).toMatch(/^A1 .+ \+ A2 .+$/);
      const [a, b] = block.entries.map((entry) => requireExercise(entry.exerciseId));
      expect(a!.primaryMuscles.some((muscle) => b!.primaryMuscles.includes(muscle))).toBe(false);
    }
  });

  it('adds exactly one drop set on a safe isolation move only when drop sets are enabled', () => {
    const on = generate();
    const drops = allEntries(on.blocks).filter((entry) => entry.dropSet);
    expect(drops).toHaveLength(1);
    expect(requireExercise(drops[0]!.exerciseId).dropSetSafe).toBe(true);
    expect(drops[0]!.sets.some((set) => set.kind === 'drop')).toBe(true);
    const off = generate({ techniques: { supersets: true, dropSets: false, circuits: false } });
    expect(allEntries(off.blocks).some((entry) => entry.dropSet)).toBe(false);
  });

  it("never returns a blocked selection and only uses the place's equipment", () => {
    for (const location of [gym, home]) {
      const workout = generate({}, 'default', location);
      const exercises = allEntries(workout.blocks).map((entry) =>
        requireExercise(entry.exerciseId),
      );
      expect(
        isBlocked(checkWorkoutConflicts(exercises, buildConflictContext(profile(), location))),
      ).toBe(false);
      const available = new Set(location?.equipment ?? []);
      for (const exercise of exercises) {
        expect(exercise.equipment.some((group) => group.every((id) => available.has(id)))).toBe(
          true,
        );
      }
    }
    expect(names(generate({}, 'default', home))).not.toContain('Barbell Bench Press');
  });

  it('is deterministic for the same inputs', () => {
    expect(generate()).toEqual(generate());
  });
});

describe('generateWorkout: 15 / 30 / 45 / Default', () => {
  it('shrinks the session to each length while keeping the main lift', () => {
    const results = ([15, 30, 45, 'default'] as DurationChoice[]).map((choice) =>
      generate({}, choice),
    );
    const [fifteen, thirty, fortyFive, full] = results;
    for (const workout of results) {
      const anchor = allEntries(workout.blocks)[0];
      expect(anchor?.role).toBe('primary-strength');
      expect(workout.duration.estimatedMinutes).toBeLessThanOrEqual(
        workout.duration.targetMinutes + 1 + workout.duration.overByMinutes,
      );
    }
    expect(fifteen!.duration.targetMinutes).toBe(15);
    expect(fifteen!.blocks.length).toBeLessThanOrEqual(3);
    expect(fifteen!.duration.estimatedMinutes).toBeLessThanOrEqual(17);
    expect(thirty!.blocks.length).toBeLessThanOrEqual(5);
    expect(thirty!.duration.estimatedMinutes).toBeLessThanOrEqual(32);
    expect(fortyFive!.blocks.length).toBeLessThanOrEqual(6);
    expect(fortyFive!.duration.estimatedMinutes).toBeLessThanOrEqual(47);
    expect(fifteen!.duration.estimatedMinutes).toBeLessThan(thirty!.duration.estimatedMinutes);
    expect(thirty!.duration.estimatedMinutes).toBeLessThan(fortyFive!.duration.estimatedMinutes);
    expect(fortyFive!.duration.estimatedMinutes).toBeLessThanOrEqual(
      full!.duration.estimatedMinutes,
    );
    expect(fifteen!.explanation.fittingSteps.length).toBeGreaterThan(0);
    expect(fifteen!.explanation.summary).toContain('fitted to 15 min');
    expect(fifteen!.warmup.generalMinutes).toBeLessThan(full!.warmup.generalMinutes);
  });

  it('keeps a superset in the 15-minute version when supersets are enabled', () => {
    const workout = generate({}, 15);
    expect(workout.blocks.some((block) => block.kind === 'superset')).toBe(true);
    expect(allEntries(workout.blocks).length).toBeLessThanOrEqual(4);
  });

  it('reports when even the leanest plan runs over', () => {
    const workout = generate(
      {
        schedule: {
          weeklyFrequency: 4,
          typicalDurationMinutes: 15,
          availableDays: ['mon', 'tue', 'thu', 'fri'],
        },
      },
      15,
    );
    expect(workout.duration.overByMinutes).toBeGreaterThanOrEqual(0);
    if (workout.duration.overByMinutes > 1) {
      expect(workout.compromises.some((line) => /runs about \d+ min over/.test(line))).toBe(true);
    }
  });
});

describe('generateWorkout: profile and history', () => {
  it('chooses a full-body strength session for a strength goal', () => {
    const workout = generate({ goals: { primary: 'strength', secondary: 'none' } });
    expect(workout.title).toBe('Full body');
    const anchor = requireExercise(allEntries(workout.blocks)[0]!.exerciseId);
    expect(anchor.movementPattern).toBe('squat');
    expect(anchor.name).toBe('Back Squat');
  });

  it('respects limitations and dislikes', () => {
    const workout = generate({
      goals: { primary: 'strength', secondary: 'none' },
      limitations: {
        painAreas: [],
        shoulder: ['avoid-overhead-pressing'],
        avoidBarbellSquats: true,
        notes: '',
      },
      exercisePreferences: { preferred: [], disliked: ['Hack Squat'] },
    });
    const list = names(workout);
    expect(list).not.toContain('Back Squat');
    expect(list).not.toContain('Hack Squat');
    expect(list).not.toContain('Overhead Press');
    expect(list).not.toContain('Dumbbell Shoulder Press');
  });

  it('rotates away from the template trained yesterday and lowers fresh-muscle priority', () => {
    const yesterday = '2026-09-02T14:00:00.000Z';
    const history: WorkoutRecord[] = [
      {
        id: 'w1',
        startedAt: yesterday,
        completedAt: yesterday,
        locationId: 'gym',
        templateId: 'push-arms',
        entries: [
          {
            exerciseId: 'barbell-bench-press',
            sets: [
              { kind: 'working', reps: 5, weight: 185, rir: 2, completed: true },
              { kind: 'working', reps: 5, weight: 185, rir: 1, completed: true },
            ],
          },
          {
            exerciseId: 'cable-fly',
            sets: [{ kind: 'working', reps: 12, weight: 40, rir: 1, completed: true }],
          },
        ],
      },
    ];
    const workout = generate({}, 'default', gym, history);
    expect(workout.templateId).not.toBe('push-arms');
    const chest = workout.musclePriorities.find((priority) => priority.muscle === 'chest');
    const lats = workout.musclePriorities.find((priority) => priority.muscle === 'lats');
    expect(chest!.weight).toBeLessThan(lats!.weight);
    expect(chest!.daysSinceTrained).toBeCloseTo(1, 0);
    expect(workout.confidence).toBe('medium');
  });

  it('runs isolation work as a circuit only when circuits fit the goal and the length', () => {
    const circuits = { supersets: true, dropSets: true, circuits: true };
    const short = generate({ techniques: circuits }, 30);
    expect(short.blocks.some((block) => block.kind === 'circuit')).toBe(true);
    const circuit = short.blocks.find((block) => block.kind === 'circuit')!;
    expect(circuit.entries.length).toBeGreaterThanOrEqual(3);
    expect(circuit.label).toMatch(/^Circuit ×\d: /);
    const full = generate({ techniques: circuits }, 'default');
    expect(full.blocks.some((block) => block.kind === 'circuit')).toBe(false);
    const strength = generate(
      { techniques: circuits, goals: { primary: 'strength', secondary: 'none' } },
      30,
    );
    expect(strength.blocks.some((block) => block.kind === 'circuit')).toBe(false);
  });

  it('applies the rest-time style', () => {
    const short = generate({ restStyle: 'short' });
    const long = generate({ restStyle: 'long' });
    expect(allEntries(short.blocks)[0]!.restSeconds).toBeLessThan(
      allEntries(long.blocks)[0]!.restSeconds,
    );
  });
});
