import { z } from 'zod';
import { MUSCLE_IDS } from '../../catalog/muscles/muscles';

/**
 * The split's order as it is stored (Maintenance 38): with today's plan, and with a workout trained in
 * it, whose week it holds (`heldOrder`). A field it gains later is optional; one this copy cannot read
 * drops the whole order, never what holds it.
 */
export const SplitOrderSchema = z.looseObject({
  days: z.array(
    z.looseObject({
      day: z.string().min(1),
      templateId: z.string().min(1),
      was: z.string().min(1),
    }),
  ),
  spared: z.array(z.enum(MUSCLE_IDS)),
  fewer: z.array(z.enum(MUSCLE_IDS)),
  // The re-check of the review: the schedule it was read for; one that does not read is none, and
  // the order is never held.
  schedule: z.string().optional().catch(undefined),
});
