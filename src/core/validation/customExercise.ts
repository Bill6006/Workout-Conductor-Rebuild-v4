import { z } from 'zod';
import { ALL_EQUIPMENT_IDS } from '../../catalog/equipment/equipment';
import {
  DEMAND_LEVELS,
  JOINTS,
  LIMITATION_FLAGS,
  STRESS_LEVELS,
  type CatalogExercise,
} from '../../catalog/exercises/exerciseSchema';
import {
  isCompoundPattern,
  MOVEMENT_PATTERN_IDS,
} from '../../catalog/movementPatterns/movementPatterns';
import { MUSCLE_IDS } from '../../catalog/muscles/muscles';

/**
 * User-owned content: custom exercises, custom instructions for catalog
 * exercises, and custom media. All three are backed up and restored with the
 * rest of the user's data, and stay separate from licensed production media.
 */

const isoDate = z.iso.datetime();
const text = z.string().trim().min(1).max(240);

export const CUSTOM_ID_PREFIX = 'custom-';

export const CustomExerciseSchema = z.looseObject({
  id: z.string().regex(/^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/, 'custom ids start with "custom-"'),
  custom: z.literal(true),
  name: z.string().trim().min(2).max(60),
  aliases: z.array(z.string().trim().min(2).max(60)).default([]),
  primaryMuscles: z.array(z.enum(MUSCLE_IDS)).min(1).max(3),
  secondaryMuscles: z.array(z.enum(MUSCLE_IDS)).max(5).default([]),
  movementPattern: z.enum(MOVEMENT_PATTERN_IDS),
  equipment: z.array(z.array(z.enum(ALL_EQUIPMENT_IDS as [string, ...string[]]))).min(1),
  unilateral: z.boolean().default(false),
  strengthSuitability: z.number().int().min(0).max(3).default(1),
  hypertrophySuitability: z.number().int().min(0).max(3).default(2),
  dropSetSafe: z.boolean().default(true),
  supersetFriendly: z.boolean().default(true),
  gripDemand: z.enum(DEMAND_LEVELS).default('low'),
  jointStress: z.partialRecord(z.enum(JOINTS), z.enum(STRESS_LEVELS)).default({}),
  limitationFlags: z.array(z.enum(LIMITATION_FLAGS)).default([]),
  instructions: z
    .object({
      setup: z.array(text).max(5).default([]),
      execution: z.array(text).max(6).default([]),
      breathing: z.string().max(240).default(''),
      mistakes: z.array(text).max(5).default([]),
    })
    .default({ setup: [], execution: [], breathing: '', mistakes: [] }),
  /** Id of a CustomMedia record owned by the user, if any. */
  mediaId: z.string().min(1).nullable().default(null),
  notes: z.string().max(500).default(''),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export type CustomExercise = z.infer<typeof CustomExerciseSchema>;

export const CustomInstructionSchema = z.looseObject({
  /** Same as the catalog exercise id it annotates. */
  id: z.string().min(1),
  exerciseId: z.string().min(1),
  setup: z.array(text).max(5).default([]),
  execution: z.array(text).max(6).default([]),
  cues: z.array(text).max(8).default([]),
  notes: z.string().max(500).default(''),
  updatedAt: isoDate,
});

export type CustomInstruction = z.infer<typeof CustomInstructionSchema>;

export const CUSTOM_MEDIA_MAX_BYTES = 3_000_000;

export const CustomMediaSchema = z.looseObject({
  id: z.string().min(1),
  exerciseId: z.string().min(1),
  kind: z.enum(['image', 'video']),
  mimeType: z.string().regex(/^(image|video)\//),
  sizeBytes: z.number().int().positive().max(CUSTOM_MEDIA_MAX_BYTES),
  /** Stored inline so it survives backup and restore exactly. */
  dataUrl: z.string().startsWith('data:'),
  source: z.literal('user'),
  createdAt: isoDate,
});

export type CustomMedia = z.infer<typeof CustomMediaSchema>;

/** Presents a custom exercise to the engines exactly like a catalog exercise. */
export function customToCatalogExercise(custom: CustomExercise): CatalogExercise {
  const compound = isCompoundPattern(custom.movementPattern);
  return {
    id: custom.id,
    name: custom.name,
    aliases: custom.aliases,
    primaryMuscles: custom.primaryMuscles,
    secondaryMuscles: custom.secondaryMuscles,
    movementPattern: custom.movementPattern,
    compound,
    unilateral: custom.unilateral,
    strengthSuitability: custom.strengthSuitability,
    hypertrophySuitability: custom.hypertrophySuitability,
    defaultRole: compound ? 'secondary-hypertrophy' : 'isolation',
    equipment: custom.equipment,
    locationSuitability: ['home', 'gym', 'travel'],
    setupSeconds: 30,
    transitionCost: 1,
    station: 'open',
    repRanges: compound ? { hypertrophy: [6, 10] } : { hypertrophy: [10, 15] },
    dropSetSafe: custom.dropSetSafe,
    supersetFriendly: custom.supersetFriendly,
    stabilityDemand: 'medium',
    gripDemand: custom.gripDemand,
    jointStress: custom.jointStress,
    limitationFlags: custom.limitationFlags,
    substitutions: [],
    instructions: {
      setup:
        custom.instructions.setup.length > 0
          ? custom.instructions.setup
          : ['Set up the way you practised it.'],
      execution:
        custom.instructions.execution.length > 0
          ? custom.instructions.execution
          : ['Perform with control through a full range.'],
      breathing:
        custom.instructions.breathing ||
        'Inhale and brace before the hard part, exhale through the effort.',
      mistakes:
        custom.instructions.mistakes.length > 0
          ? custom.instructions.mistakes
          : ['Rushing the reps.'],
    },
    difficulty: 'intermediate',
    progressionFamily: custom.id,
    warmup: compound ? 'short' : 'none',
    load: 'dumbbell-each',
    mediaId: custom.mediaId ?? custom.id,
    productionEnabled: false,
  };
}
