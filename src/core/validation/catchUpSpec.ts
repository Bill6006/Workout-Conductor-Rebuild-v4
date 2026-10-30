import { z } from 'zod';
import { MUSCLE_IDS } from '../../catalog/muscles/muscles';
import { CATCH_UP_KINDS, CATCH_UP_REASONS } from '../../engine/planning/catchUp';

/**
 * A day's catch-up or second workout as stored (Maintenance 31, items 12 and 32): the session's
 * offer, and a saved workout's own (the twenty-third review of round M). It shares the engine's
 * lists; a record that fails to read is dropped by its owner's `.catch`.
 */
export const CatchUpSpecSchema = z.looseObject({
  kind: z.enum(CATCH_UP_KINDS),
  muscles: z.array(
    z.looseObject({
      muscle: z.enum(MUSCLE_IDS),
      sets: z.number().int().min(1).max(10),
      minRir: z.number().min(0).max(5),
      why: z.enum(CATCH_UP_REASONS),
    }),
  ),
  sitOut: z.array(z.enum(MUSCLE_IDS)),
});
