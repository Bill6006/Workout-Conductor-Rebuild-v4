import { z } from 'zod';
import { TRAINING_ROLES } from '../../catalog/exercises/exerciseSchema';
import { MUSCLE_IDS } from '../../catalog/muscles/muscles';
import { PROGRESSION_MODES, type GeneratedWorkout } from './types';

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
  // What a set the weights at the place pushed stands in for (Maintenance 23); advisory, so an
  // unreadable one is dropped, never the workout.
  asked: z
    .object({
      weight: z.number().min(0),
      reps: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    })
    .optional()
    .catch(undefined),
});

// Why a target is what it is: advisory. A note this copy of the app cannot read (one written
// by a newer copy, say) is dropped rather than costing the whole workout.
const EntryProgressionSchema = z.looseObject({
  mode: z.enum(PROGRESSION_MODES),
  evidence: z.array(z.string()),
  sessions: z.number().int().min(0),
  viaFamily: z.boolean(),
  confidence: z.enum(['low', 'medium', 'high']),
  setsAdvice: z.union([z.literal(0), z.literal(1)]),
  capped: z.looseObject({ at: z.number() }).optional(),
  rack: z
    .looseObject({
      asked: z.number(),
      loaded: z.number(),
      extra: z.number().int().min(0),
      line: z.string(),
    })
    .optional()
    .catch(undefined),
  // The weight the target moved from (Maintenance 23), for the step rule in a refit.
  from: z.number().optional().catch(undefined),
  // Steps the session or the lifter's habit moved the target (Maintenance 24), for the coach.
  nudged: z.number().int().optional().catch(undefined),
  // A lift done at bodyweight that fell short of its floor (Maintenance 21).
  short: z
    .looseObject({
      sessions: z.number().int().min(0),
      floor: z.number().int().min(0),
    })
    .optional()
    .catch(undefined),
  // Maintenance 26, the re-check of item 42: the session read missed its floor on its first
  // set, and a target an entered max raised. A hard start reads neither.
  missed: z.boolean().optional().catch(undefined),
  fromMax: z.boolean().optional().catch(undefined),
  // The third pass: a saved workout's targets, from the day it was saved.
  saved: z.boolean().optional().catch(undefined),
  // The fourth pass: a target read from another rep range.
  otherRange: z.boolean().optional().catch(undefined),
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
  standsFor: z.string().optional().catch(undefined),
  progression: EntryProgressionSchema.optional().catch(undefined),
  manual: z
    .looseObject({
      weight: z.boolean().optional(),
      reps: z.boolean().optional(),
      sets: z.boolean().optional(),
      rest: z.boolean().optional(),
    })
    .optional(),
  // Stopped at its logged sets where the place could not equip it, and the working sets it
  // still owed. An unreadable note is dropped rather than costing the whole workout.
  stopped: z
    .looseObject({
      owed: z.number().int().min(0),
      why: z.enum(['place', 'swap', 'skip']).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  // The lift as the plan had it under a hard start's ease (Maintenance 26, the sixth pass of
  // item 42): dropped when unreadable, the lift then kept as it shows.
  eased: z
    .looseObject({
      // The exercise it was for: a mark left on another one is no record of it (the seventh pass).
      exerciseId: z.string().optional().catch(undefined),
      sets: z.array(SetPrescriptionSchema).optional().catch(undefined),
      progression: EntryProgressionSchema.optional().catch(undefined),
      // The lift's own settings with those sets (the ninth pass): dropped when unreadable, the
      // sets then given back alone.
      settings: z
        .looseObject({
          restSeconds: z.number().min(0),
          warmupSets: z.number().int().min(0),
          dropSet: z.boolean(),
          manual: z
            .looseObject({
              weight: z.boolean().optional(),
              reps: z.boolean().optional(),
              sets: z.boolean().optional(),
              rest: z.boolean().optional(),
            })
            .optional(),
          blockRest: z.number().min(0).optional(),
        })
        .optional()
        .catch(undefined),
      // Under way: kept for good (the eighth pass).
      kept: z.boolean().optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
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
