import type { LifeMirrorBlock, LifeMirrorReading } from '../../core/cloud/lifeMirror';

/**
 * Item 48: what Life Mirror's check-in fills in on today's check-in (the approved proposal, part 3):
 * energy from today's latest check-in, the night (hours and quality) and motivation from this
 * morning's only, stress and mood from today's latest. Soreness, pain and joints, illness and time
 * today are never Life Mirror's to say: Workout Conductor always asks them.
 */

/** The values Life Mirror can fill in, each with the time of the check-in it came from. */
export const FILLED = ['energy', 'sleep', 'motivation', 'stress', 'mood'] as const;
export type Filled = (typeof FILLED)[number];

export interface FilledValue {
  /** On the check-in's own scale, 1 to 5 (stress 5 the worst). */
  value: number;
  /** When Life Mirror's check-in was told. */
  at: string;
}

export type LifeMirrorPrefill = Partial<Record<Filled, FilledValue>>;

/**
 * Life Mirror's night on this app's sleep scale (docs/research/readiness-and-soreness.md, item 48):
 * the hours carry it (under 5 h Poor, 5-6 Short, 6-7 Okay, 7 or more Good; Craven 2022, 35708888:
 * the cost of a short night is in its hours, and past 7 more adds little, Life Mirror's own "good"
 * being toward 7 to 8); Great only for a deep night of 7 or more, and a broken or rough night a
 * step lower (judgement). With the hours not asked, the quality alone; with neither, none.
 */
export function sleepFrom(hours?: number, quality?: number): number | undefined {
  if (hours === undefined) return quality;
  const step = Math.min(hours, 4) + (hours >= 4 && quality === 5 ? 1 : 0);
  return quality !== undefined && quality <= 2 ? Math.max(1, step - 1) : step;
}

/** The value one reading gives from the latest of these blocks that holds it. */
function latest(
  blocks: readonly LifeMirrorBlock[],
  reading: LifeMirrorReading,
): FilledValue | undefined {
  const holding = blocks
    .filter((block) => block.readings[reading] !== undefined)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return holding ? { value: holding.readings[reading]!, at: holding.at } : undefined;
}

/** What today's check-ins fill in, or null where they fill in nothing. */
export function lifeMirrorPrefill(blocks: readonly LifeMirrorBlock[]): LifeMirrorPrefill | null {
  const morning = blocks.filter((block) => block.block === 'morning');
  const sleep = morning[0]
    ? sleepFrom(morning[0].readings.sleepHours, morning[0].readings.sleepQuality)
    : undefined;
  const filled: LifeMirrorPrefill = {
    ...(latest(blocks, 'energy') ? { energy: latest(blocks, 'energy')! } : {}),
    ...(sleep !== undefined ? { sleep: { value: sleep, at: morning[0]!.at } } : {}),
    ...(latest(morning, 'motivation') ? { motivation: latest(morning, 'motivation')! } : {}),
    ...(latest(blocks, 'stress') ? { stress: latest(blocks, 'stress')! } : {}),
    ...(latest(blocks, 'mood') ? { mood: latest(blocks, 'mood')! } : {}),
  };
  return Object.keys(filled).length > 0 ? filled : null;
}
