import { z } from 'zod';
import { TRAINING_ROLES } from '../../catalog/exercises/exerciseSchema';
import { MUSCLE_IDS } from '../../catalog/muscles/muscles';
import type { GeneratedWorkout } from './types';

/**
 * Zod schemas for the generated workout, used only where a workout crosses a
 * storage boundary (the persisted session). Loose objects keep fields a newer
 * build may add; the closed sets (roles, muscles, kinds) stay strict so a
 * corrupt value can never reach the screen.
 */

export const SetPrescriptionSchema = z.looseObject({
  index: z.number().int().min(0),
  kind: z.enum(['warmup', 'working', 'drop']),
  targetReps: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  targetRir: z.number().min(0).max(10),
  targetWeight: z.number().min(0).nullable(),
  restSeconds: z.number().min(0),
});

export const WorkoutEntrySchema = z.looseObject({
  id: z.string().min(1),
  exerciseId: z.string().min(1),
  role: z.enum(TRAINING_ROLES),
  sets: z.array(SetPrescriptionSchema),
  restSeconds: z.number().min(0),
  warmupSets: z.number().int().min(0),
  dropSet: z.boolean(),
  chosenFor: z.array(z.enum(MUSCLE_IDS)),
  locked: z.boolean(),
  pinned: z.boolean(),
  slot: z.number().int().min(0).optional(),
  replacedFrom: z.string().optional(),
  progression: z
    .looseObject({
      mode: z.enum(['start', 'double', 'weight', 'reps', 'sets', 'maintain', 'deload', 'regress']),
      evidence: z.array(z.string()),
      sessions: z.number().int().min(0),
      viaFamily: z.boolean(),
      confidence: z.enum(['low', 'medium', 'high']),
      setsAdvice: z.union([z.literal(0), z.literal(1)]),
    })
    .optional(),
  manual: z
    .looseObject({
      weight: z.boolean().optional(),
      reps: z.boolean().optional(),
      sets: z.boolean().optional(),
      rest: z.boolean().optional(),
    })
    .optional(),
});

export const WorkoutBlockSchema = z.looseObject({
  id: z.string().min(1),
  kind: z.enum(['straight', 'superset', 'circuit']),
  label: z.string(),
  entries: z.array(WorkoutEntrySchema).min(1),
  rounds: z.number().int().min(0),
  restBetweenRoundsSeconds: z.number().min(0),
});

const DurationChoiceSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(45),
  z.literal('default'),
]);

export const GeneratedWorkoutSchema = z.looseObject({
  id: z.string().min(1),
  templateId: z.string().min(1),
  title: z.string().min(1),
  goal: z.string(),
  generatedAt: z.iso.datetime(),
  locationId: z.string().nullable(),
  duration: z.looseObject({
    choice: DurationChoiceSchema,
    targetMinutes: z.number(),
    defaultMinutes: z.number(),
    estimatedMinutes: z.number(),
    overByMinutes: z.number(),
  }),
  musclePriorities: z.array(
    z.looseObject({
      muscle: z.enum(MUSCLE_IDS),
      weight: z.number(),
      reason: z.string(),
      weeklySetsDone: z.number(),
      weeklyTarget: z.number(),
      daysSinceTrained: z.number().nullable(),
    }),
  ),
  blocks: z.array(WorkoutBlockSchema),
  warmup: z.looseObject({
    generalMinutes: z.number(),
    rampEntryIds: z.array(z.string()),
    note: z.string(),
  }),
  explanation: z.looseObject({
    summary: z.string(),
    reasons: z.array(z.string()),
    fittingSteps: z.array(z.string()),
    time: z.looseObject({
      warmupMinutes: z.number(),
      workMinutes: z.number(),
      restMinutes: z.number(),
      transitionMinutes: z.number(),
      totalMinutes: z.number(),
    }),
  }),
  confidence: z.enum(['high', 'medium', 'low']),
  compromises: z.array(z.string()),
  recalibration: z.looseObject({
    version: z.number().int().min(1),
    lastTrigger: z.string().nullable(),
  }),
});

/** The parsed shape is structurally the engine's GeneratedWorkout. */
export function parseGeneratedWorkout(value: unknown): GeneratedWorkout | null {
  const result = GeneratedWorkoutSchema.safeParse(value);
  return result.success ? (result.data as GeneratedWorkout) : null;
}
