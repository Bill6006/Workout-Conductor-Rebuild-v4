import { z } from 'zod';
import { MUSCLE_IDS } from '../../catalog/muscles/muscles';

/**
 * What the lifter answered "Longer would help" with, and the honest goals-versus-time card put away
 * (Maintenance 34), kept in the meta store and copied to the cloud like every meta record. Each part
 * that fails to read is dropped alone, never the rest; an answer this copy cannot read is dropped.
 * The answers' list is stored: never add to it (an older copy must still read every record).
 */

export const TIME_OFFERS_ID = 'time-offers';

/**
 * What an answer said (the owner, 2026-10-31): `longer`, the suggestion taken and trained longer (the
 * time was there); `same`, taken but trained no longer (the time ran short); `not-now`, the shorter
 * session chosen for that occasion.
 */
export const LONGER_ANSWERS = ['longer', 'same', 'not-now'] as const;
export type LongerAnswer = (typeof LONGER_ANSWERS)[number];

const DurationChoiceSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(45),
  z.literal('default'),
]);

const AskedSchema = z.looseObject({
  /** When it was answered, or taken. */
  at: z.iso.datetime(),
  /** The local Monday of its week. */
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The muscles it was for. */
  muscles: z.array(z.enum(MUSCLE_IDS)),
  /** The minutes of today's length then, and of the length offered. */
  from: z.number().min(0),
  to: z.number().min(0),
});

export const TimeAnswerSchema = AskedSchema.extend({ answer: z.enum(LONGER_ANSWERS) });

export const TimeOffersSchema = z.looseObject({
  id: z.literal(TIME_OFFERS_ID),
  /** When the suggestion was on screen, once a day at most: the cooldowns read it. */
  shown: z
    .array(z.iso.datetime().nullable().catch(null))
    .transform((times) => times.filter((at): at is string => at !== null))
    .catch([]),
  answers: z
    .array(TimeAnswerSchema.nullable().catch(null))
    .transform((answers) => answers.filter((answer) => answer !== null))
    .catch([]),
  /** A suggestion taken, waiting for the workout's end to say whether the lifter trained longer. */
  pending: AskedSchema.extend({ choice: DurationChoiceSchema })
    .nullable()
    .catch(null)
    .default(null),
  /** The goals-versus-time card put away: its muscles and the weeks' minutes then. */
  goalsTime: z
    .looseObject({
      at: z.iso.datetime(),
      muscles: z.array(z.enum(MUSCLE_IDS)),
      minutes: z.number().min(0),
    })
    .nullable()
    .optional()
    .catch(undefined),
});

export type TimeAnswer = z.infer<typeof TimeAnswerSchema>;
export type TimeOffers = z.infer<typeof TimeOffersSchema>;

export function emptyTimeOffers(): TimeOffers {
  return { id: TIME_OFFERS_ID, shown: [], answers: [], pending: null };
}

/** The record as stored; one that does not read at all is none, never the store's to overwrite. */
export function parseTimeOffers(raw: unknown): TimeOffers | null {
  const result = TimeOffersSchema.safeParse(raw);
  return result.success ? result.data : null;
}
