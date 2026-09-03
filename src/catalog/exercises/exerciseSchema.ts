import { z } from 'zod';
import { ALL_EQUIPMENT_IDS } from '../equipment/equipment';
import { MOVEMENT_PATTERN_IDS } from '../movementPatterns/movementPatterns';
import { MUSCLE_IDS } from '../muscles/muscles';

/**
 * Structured exercise metadata. Every generated workout and alternative list is
 * validated against this metadata, never against names alone.
 */

export const JOINTS = [
  'neck',
  'shoulder',
  'elbow',
  'wrist',
  'lower-back',
  'hip',
  'knee',
  'ankle',
] as const;
export type Joint = (typeof JOINTS)[number];

export const STRESS_LEVELS = ['low', 'moderate', 'high'] as const;
export type StressLevel = (typeof STRESS_LEVELS)[number];

export const DEMAND_LEVELS = ['low', 'medium', 'high'] as const;
export type DemandLevel = (typeof DEMAND_LEVELS)[number];

/** Flags that map directly onto the profile's limitation choices. */
export const LIMITATION_FLAGS = [
  'overhead',
  'behind-neck',
  'dip',
  'wide-grip',
  'barbell-squat',
  'deep-knee-flexion',
  'spinal-loading',
] as const;
export type LimitationFlag = (typeof LIMITATION_FLAGS)[number];

export const STATION_TYPES = [
  'rack',
  'bench-press',
  'bench',
  'cable',
  'machine',
  'pull-up-bar',
  'dip-station',
  'floor',
  'open',
] as const;
export type StationType = (typeof STATION_TYPES)[number];

export const LOAD_TYPES = [
  'barbell',
  'ez-bar',
  'trap-bar',
  'smith',
  'dumbbell-each',
  'kettlebell',
  'stack',
  'band',
  'bodyweight',
] as const;
export type LoadType = (typeof LOAD_TYPES)[number];

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const WARMUP_RAMPS = ['full', 'short', 'none'] as const;
export type WarmupRamp = (typeof WARMUP_RAMPS)[number];

export const TRAINING_ROLES = [
  'primary-strength',
  'secondary-strength',
  'primary-hypertrophy',
  'secondary-hypertrophy',
  'isolation',
  'specialization',
  'corrective',
  'warm-up',
  'finisher',
] as const;
export type TrainingRole = (typeof TRAINING_ROLES)[number];

const suitability = z.number().int().min(0).max(3);
// Up to 120 so timed holds (seconds) fit the same range shape.
const repRange = z.tuple([z.number().int().min(1).max(120), z.number().int().min(1).max(120)]);
const text = z.string().trim().min(1).max(240);

export const ExerciseSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ids are lowercase kebab-case'),
  name: z.string().trim().min(2).max(60),
  aliases: z.array(z.string().trim().min(2).max(60)),
  primaryMuscles: z.array(z.enum(MUSCLE_IDS)).min(1).max(3),
  secondaryMuscles: z.array(z.enum(MUSCLE_IDS)).max(5),
  movementPattern: z.enum(MOVEMENT_PATTERN_IDS),
  compound: z.boolean(),
  unilateral: z.boolean(),
  /** 0 = unsuitable, 3 = ideal, for each training emphasis */
  strengthSuitability: suitability,
  hypertrophySuitability: suitability,
  defaultRole: z.enum(TRAINING_ROLES),
  /** Any-of groups; each group is all-of equipment ids. An empty group means bodyweight. */
  equipment: z.array(z.array(z.enum(ALL_EQUIPMENT_IDS as [string, ...string[]]))).min(1),
  locationSuitability: z.array(z.enum(['home', 'gym', 'travel'])).min(1),
  setupSeconds: z.number().int().min(0).max(300),
  transitionCost: z.number().int().min(0).max(3),
  station: z.enum(STATION_TYPES),
  repRanges: z.object({
    strength: repRange.optional(),
    hypertrophy: repRange,
  }),
  dropSetSafe: z.boolean(),
  supersetFriendly: z.boolean(),
  stabilityDemand: z.enum(DEMAND_LEVELS),
  gripDemand: z.enum(DEMAND_LEVELS),
  jointStress: z.partialRecord(z.enum(JOINTS), z.enum(STRESS_LEVELS)),
  limitationFlags: z.array(z.enum(LIMITATION_FLAGS)),
  substitutions: z.array(z.string()),
  instructions: z.object({
    setup: z.array(text).min(1).max(5),
    execution: z.array(text).min(1).max(6),
    breathing: text,
    mistakes: z.array(text).min(1).max(5),
  }),
  difficulty: z.enum(DIFFICULTIES),
  progressionFamily: z.string().min(1),
  warmup: z.enum(WARMUP_RAMPS),
  load: z.enum(LOAD_TYPES),
  /** Bar weight for Plate Math, in pounds and kilograms, when a bar is involved. */
  barWeight: z.object({ lb: z.number().positive(), kg: z.number().positive() }).optional(),
  mediaId: z.string().min(1),
  /** Production-enabled exercises must have licensed demonstration media. */
  productionEnabled: z.boolean(),
});

export type CatalogExercise = z.infer<typeof ExerciseSchema>;
