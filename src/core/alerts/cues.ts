/**
 * The last seconds of a rest are counted in: a short tick at three, two and
 * one, and a longer tone at zero. Pure, so the plan can be tested without a
 * speaker.
 */

export const TICK_SECONDS = [3, 2, 1] as const;

/** Cues are laid onto the audio clock a little before the first one is due. */
export const SCHEDULE_AHEAD_SECONDS = 3.6;

export type CueKind = 'tick' | 'done';

export interface Cue {
  kind: CueKind;
  /** How far away the cue is, in seconds. */
  inSeconds: number;
}

/** Every cue still ahead with `remaining` seconds of rest left, soonest first. */
export function cuesAhead(remaining: number): Cue[] {
  if (!Number.isFinite(remaining) || remaining <= 0) return [];
  const cues: Cue[] = [];
  for (const mark of TICK_SECONDS) {
    const inSeconds = remaining - mark;
    if (inSeconds >= 0) cues.push({ kind: 'tick', inSeconds });
  }
  cues.push({ kind: 'done', inSeconds: remaining });
  return cues;
}

/** A workout left alone this long earns a nudge while the app sits in the background. */
export const UNFINISHED_NUDGE_MINUTES = 30;

/** A workout still open after this long is named by the coach the next time the app is opened. */
export const UNFINISHED_STALE_HOURS = 3;
