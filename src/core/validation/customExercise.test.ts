import { describe, expect, it } from 'vitest';
import { ExerciseSchema } from '../../catalog/exercises/exerciseSchema';
import {
  CUSTOM_MEDIA_MAX_BYTES,
  CustomExerciseSchema,
  CustomInstructionSchema,
  CustomMediaSchema,
  customToCatalogExercise,
} from './customExercise';

const NOW = '2026-09-02T12:00:00.000Z';

const minimal = {
  id: 'custom-landmine-press',
  custom: true as const,
  name: 'Landmine Press',
  primaryMuscles: ['upper-chest', 'front-delts'],
  movementPattern: 'incline-push',
  equipment: [['barbell']],
  createdAt: NOW,
  updatedAt: NOW,
};

describe('custom content schemas', () => {
  it('fills defaults for a minimal custom exercise', () => {
    const parsed = CustomExerciseSchema.parse(minimal);
    expect(parsed.aliases).toEqual([]);
    expect(parsed.dropSetSafe).toBe(true);
    expect(parsed.jointStress).toEqual({});
    expect(parsed.mediaId).toBeNull();
    expect(parsed.instructions.setup).toEqual([]);
  });

  it('rejects ids without the custom prefix and unknown muscles', () => {
    expect(CustomExerciseSchema.safeParse({ ...minimal, id: 'landmine-press' }).success).toBe(
      false,
    );
    expect(CustomExerciseSchema.safeParse({ ...minimal, primaryMuscles: ['pecs'] }).success).toBe(
      false,
    );
  });

  it('presents a custom exercise to the engines as a valid catalog exercise', () => {
    const catalog = customToCatalogExercise(CustomExerciseSchema.parse(minimal));
    expect(ExerciseSchema.safeParse(catalog).success).toBe(true);
    expect(catalog.compound).toBe(true);
    expect(catalog.progressionFamily).toBe('custom-landmine-press');
    expect(catalog.productionEnabled).toBe(false);
  });

  it('validates custom instructions and size-capped custom media', () => {
    expect(
      CustomInstructionSchema.parse({
        id: 'barbell-curl',
        exerciseId: 'barbell-curl',
        cues: ['Elbows still'],
        updatedAt: NOW,
      }).cues,
    ).toEqual(['Elbows still']);
    const media = {
      id: 'm1',
      exerciseId: 'custom-landmine-press',
      kind: 'image',
      mimeType: 'image/png',
      sizeBytes: 1200,
      dataUrl: 'data:image/png;base64,AAAA',
      source: 'user',
      createdAt: NOW,
    };
    expect(CustomMediaSchema.safeParse(media).success).toBe(true);
    expect(
      CustomMediaSchema.safeParse({ ...media, sizeBytes: CUSTOM_MEDIA_MAX_BYTES + 1 }).success,
    ).toBe(false);
    expect(
      CustomMediaSchema.safeParse({ ...media, dataUrl: 'https://example.invalid/x.png' }).success,
    ).toBe(false);
    expect(CustomMediaSchema.safeParse({ ...media, source: 'scraped' }).success).toBe(false);
  });
});
