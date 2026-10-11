/**
 * When the lifter reset each thing the app learned (Maintenance 27, the owner's item 47), kept in
 * the meta store and backed up like the rest. A reset never deletes a logged set: each learner
 * reads only what was logged after its own reset, so a reset is undone by nothing and costs no
 * history.
 */

export const LEARNED_RESETS_ID = 'learned-resets';

/** The learned values a reset applies to: how well reps in reserve are judged (item 43), each
 * lift's own curve (item 41), the habit of lifting above or below the suggested weight, and pain
 * patterns (item 45). */
export const LEARNED_KINDS = ['reserve', 'curves', 'habit', 'pain'] as const;
export type LearnedKind = (typeof LEARNED_KINDS)[number];

/**
 * The record: a reset time per kind, and any field a newer copy of the app wrote, kept as it was so
 * a reset made here never writes it away (the review of item 47).
 */
export type LearnedResets = { id: typeof LEARNED_RESETS_ID } & Partial<
  Record<LearnedKind, string>
> &
  Record<string, unknown>;

export function emptyResets(): LearnedResets {
  return { id: LEARNED_RESETS_ID };
}

/**
 * Reads a stored record tolerantly: a time that does not read is dropped, never the rest, and a
 * field this copy does not know is kept as it was.
 */
export function parseResets(raw: unknown): LearnedResets {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyResets();
  const resets: LearnedResets = { ...(raw as Record<string, unknown>), id: LEARNED_RESETS_ID };
  for (const kind of LEARNED_KINDS) {
    const value = resets[kind];
    if (value !== undefined && !(typeof value === 'string' && Number.isFinite(Date.parse(value)))) {
      delete resets[kind];
    }
  }
  return resets;
}

/** The resets with one learned value reset now. */
export function withReset(resets: LearnedResets, kind: LearnedKind, now: string): LearnedResets {
  return { ...resets, [kind]: now };
}

/**
 * Two records as one: every field either holds, and each kind's later reset (the record saved and
 * the one shown can differ when a sync brought a reset while another was made here).
 */
export function mergeResets(saved: LearnedResets, shown: LearnedResets): LearnedResets {
  // A field this copy never writes is the saved one's: what is shown can be older (the re-check).
  const merged: LearnedResets = { ...shown, ...saved, id: LEARNED_RESETS_ID };
  for (const kind of LEARNED_KINDS) {
    const a = saved[kind];
    const b = shown[kind];
    if (a !== undefined && b !== undefined) merged[kind] = Date.parse(a) >= Date.parse(b) ? a : b;
  }
  return merged;
}
