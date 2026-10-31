import { z } from 'zod';
import { FILLED, type Filled } from '../../engine/readiness/lifeMirror';

/**
 * Item 48: whether Workout Conductor reads Life Mirror's daily check-in (the owner, 2026-10-31: "keep
 * it OFF until explicitly enabled"). Off until the lifter turns it on in Settings, kept in the meta
 * store and copied to the cloud like every meta record; a switch that fails to read is off.
 */

export const LIFE_MIRROR_LINK_ID = 'life-mirror-link';

export const LifeMirrorLinkSchema = z.looseObject({
  id: z.literal(LIFE_MIRROR_LINK_ID),
  on: z.boolean().catch(false).default(false),
});

export type LifeMirrorLink = z.infer<typeof LifeMirrorLinkSchema>;

export function defaultLifeMirrorLink(): LifeMirrorLink {
  return { id: LIFE_MIRROR_LINK_ID, on: false };
}

/**
 * Where each value of a check-in came from (item 48): each time read alone, one that does not read
 * dropped, and a value this copy does not know left out, never the rest (the review of item 48).
 */
export const FromLifeMirrorSchema = z
  .record(z.string(), z.unknown())
  .transform((sources) => {
    const kept: Partial<Record<Filled, string>> = {};
    for (const field of FILLED) {
      const at = sources[field];
      if (typeof at === 'string' && z.iso.datetime().safeParse(at).success) kept[field] = at;
    }
    return Object.keys(kept).length > 0 ? kept : undefined;
  })
  .optional()
  .catch(undefined);

/** The switch as stored; one record that does not read at all is none. */
export function parseLifeMirrorLink(raw: unknown): LifeMirrorLink | null {
  const result = LifeMirrorLinkSchema.safeParse(raw);
  return result.success ? result.data : null;
}
