import { describe, expect, it } from 'vitest';
import { ALL_EQUIPMENT_IDS } from '../equipment/equipment';
import { MOVEMENT_PATTERN_IDS } from '../movementPatterns/movementPatterns';
import { MUSCLE_GROUPS } from '../muscles/muscles';
import {
  EXERCISES,
  exerciseEquipmentLabel,
  findExerciseByName,
  getExercise,
  normalizeExerciseName,
  primaryMuscleGroups,
  resolveExerciseIds,
  searchExercises,
} from './catalog';
import { ExerciseSchema } from './exerciseSchema';
import { hasProductionMedia } from '../media/mediaManifest';

describe('exercise catalog integrity', () => {
  it('is a strong catalog with unique ids', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(80);
    expect(new Set(EXERCISES.map((exercise) => exercise.id)).size).toBe(EXERCISES.length);
  });

  it('validates every entry against the schema', () => {
    for (const exercise of EXERCISES) {
      const result = ExerciseSchema.safeParse(exercise);
      expect(result.success, `${exercise.id}: ${result.success ? '' : result.error.message}`).toBe(
        true,
      );
    }
  });

  it('never lets a name or alias point at two exercises', () => {
    const seen = new Map<string, string>();
    for (const exercise of EXERCISES) {
      for (const label of [exercise.name, ...exercise.aliases]) {
        const key = normalizeExerciseName(label);
        expect(
          seen.get(key) ?? exercise.id,
          `"${label}" is shared by ${seen.get(key)} and ${exercise.id}`,
        ).toBe(exercise.id);
        seen.set(key, exercise.id);
      }
    }
  });

  it('only references known equipment and existing substitutions', () => {
    const ids = new Set(EXERCISES.map((exercise) => exercise.id));
    for (const exercise of EXERCISES) {
      for (const group of exercise.equipment) {
        for (const id of group) expect(ALL_EQUIPMENT_IDS).toContain(id);
      }
      for (const substitute of exercise.substitutions) {
        expect(ids.has(substitute), `${exercise.id} -> ${substitute}`).toBe(true);
        expect(substitute).not.toBe(exercise.id);
      }
    }
  });

  it('covers every movement pattern and muscle group', () => {
    for (const pattern of MOVEMENT_PATTERN_IDS) {
      expect(
        EXERCISES.some((exercise) => exercise.movementPattern === pattern),
        pattern,
      ).toBe(true);
    }
    for (const group of MUSCLE_GROUPS) {
      expect(
        EXERCISES.filter((exercise) => primaryMuscleGroups(exercise).includes(group)).length,
        group,
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it('includes bodyweight, band, dumbbell, cable, machine, and barbell options', () => {
    const firstEquipment = EXERCISES.map((exercise) => exercise.equipment[0]?.[0] ?? 'bodyweight');
    for (const kind of [
      'bodyweight',
      'resistance-bands',
      'dumbbells',
      'cable-station',
      'leg-press',
      'barbell',
    ]) {
      expect(firstEquipment).toContain(kind);
    }
  });

  it('marks an exercise production-ready exactly when it has a licensed demonstration of its own', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.productionEnabled, exercise.id).toBe(hasProductionMedia(exercise));
    }
    expect(EXERCISES.filter((exercise) => exercise.productionEnabled)).toHaveLength(72);
  });

  // Maintenance 25, item 7: short, plain How-to text, the owner's lengths.
  it('keeps every How to to setup, two to four steps, the cues that matter and what to avoid', () => {
    for (const exercise of EXERCISES) {
      const { setup, execution, cues, mistakes, range } = exercise.instructions;
      expect(setup.length, exercise.id).toBeGreaterThanOrEqual(1);
      expect(setup.length, exercise.id).toBeLessThanOrEqual(3);
      expect(execution.length, exercise.id).toBeGreaterThanOrEqual(2);
      expect(execution.length, exercise.id).toBeLessThanOrEqual(4);
      expect(cues.length, exercise.id).toBeGreaterThanOrEqual(1);
      expect(cues.length, exercise.id).toBeLessThanOrEqual(3);
      expect(mistakes.length, exercise.id).toBeGreaterThanOrEqual(1);
      expect(mistakes.length, exercise.id).toBeLessThanOrEqual(3);
      for (const line of [
        ...setup,
        ...execution,
        ...cues,
        ...mistakes,
        ...(range ? [range] : []),
      ]) {
        // A line is a plain sentence a beginner reads between sets, no shorthand: a helper, not
        // a spotter, and the bar put back, not racked (the ninth and tenth reviews).
        expect(line.length, `${exercise.id}: ${line}`).toBeLessThanOrEqual(120);
        expect(line, exercise.id).not.toMatch(
          /\b(RIR|RPE|ROM|ATG|TUT|eccentric|concentric|scapula|spotter|rack the bar)\b/i,
        );
      }
    }
  });

  it('carries the metadata later phases need', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.progressionFamily.length).toBeGreaterThan(0);
      expect(['full', 'short', 'none']).toContain(exercise.warmup);
      expect(typeof exercise.dropSetSafe).toBe('boolean');
      expect(typeof exercise.supersetFriendly).toBe('boolean');
      if (['barbell', 'ez-bar', 'trap-bar', 'smith'].includes(exercise.load)) {
        expect(
          exercise.barWeight,
          `${exercise.id} needs a bar weight for Plate Math`,
        ).toBeDefined();
      }
    }
    expect(getExercise('back-squat')?.limitationFlags).toContain('barbell-squat');
    expect(getExercise('deadlift')?.supersetFriendly).toBe(false);
    expect(getExercise('barbell-bench-press')?.dropSetSafe).toBe(false);
    expect(getExercise('cable-fly')?.dropSetSafe).toBe(true);
  });
});

describe('catalog lookups', () => {
  it('resolves names and aliases case-insensitively', () => {
    expect(findExerciseByName('Bench Press')?.id).toBe('barbell-bench-press');
    expect(findExerciseByName('ohp')?.id).toBe('overhead-press');
    expect(findExerciseByName('  rdl ')?.id).toBe('romanian-deadlift');
    expect(findExerciseByName('Hoverboard Press')).toBeUndefined();
    expect([...resolveExerciseIds(['Pull-Up', 'nonsense', 'chin up'])]).toEqual([
      'pull-up',
      'chin-up',
    ]);
  });

  it('searches by text and muscle group', () => {
    const curls = searchExercises({ query: 'curl' });
    expect(curls.length).toBeGreaterThanOrEqual(6);
    expect(
      curls.every(
        (exercise) => /curl/i.test(exercise.name) || /curl/i.test(exercise.aliases.join(' ')),
      ),
    ).toBe(true);
    const legs = searchExercises({ muscleGroup: 'legs' });
    expect(legs.every((exercise) => primaryMuscleGroups(exercise).includes('legs'))).toBe(true);
    expect(searchExercises({ query: 'lats', muscleGroup: 'back' }).length).toBeGreaterThan(0);
  });

  it('labels equipment for what is available', () => {
    const bench = getExercise('dumbbell-bench-press');
    expect(bench).toBeDefined();
    if (!bench) return;
    expect(
      exerciseEquipmentLabel(bench, new Set(['adjustable-dumbbells', 'adjustable-bench'])),
    ).toBe('Adjustable dumbbells + Adjustable bench');
    expect(exerciseEquipmentLabel(getExercise('push-up')!)).toBe('Bodyweight');
  });
});
