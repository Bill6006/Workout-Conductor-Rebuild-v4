import { z } from 'zod';

/**
 * Which kinds of the approved proposal's new coaching the lifter wants (Maintenance 34; the
 * proposal's cooldowns: "you can turn a card type off in Settings"): the "too soon" card, the
 * "longer would help" suggestion and the honest goals-versus-time card. Each on until turned off,
 * kept in the meta store and copied to the cloud like every meta record; a switch that fails to read
 * is on.
 */

export const COACH_SWITCHES_ID = 'coach-switches';

export const CoachSwitchesSchema = z.looseObject({
  id: z.literal(COACH_SWITCHES_ID),
  tooSoon: z.boolean().catch(true).default(true),
  longer: z.boolean().catch(true).default(true),
  goalsTime: z.boolean().catch(true).default(true),
});

export type CoachSwitches = z.infer<typeof CoachSwitchesSchema>;
export type CoachSwitch = 'tooSoon' | 'longer' | 'goalsTime';

export function defaultCoachSwitches(): CoachSwitches {
  return { id: COACH_SWITCHES_ID, tooSoon: true, longer: true, goalsTime: true };
}

/** The switches as stored; one record that does not read at all is none. */
export function parseCoachSwitches(raw: unknown): CoachSwitches | null {
  const result = CoachSwitchesSchema.safeParse(raw);
  return result.success ? result.data : null;
}
