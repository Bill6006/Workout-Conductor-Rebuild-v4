import type { CloudClient } from './model';

/**
 * Item 48: Life Mirror's daily check-in, read from the shared cloud database, read-only
 * (docs/proposals/item-48-life-mirror-check-in.md; the owner, 2026-10-31: "read only the approved
 * daily check-in signals ... never read unrelated/private Life Mirror content").
 *
 * Only the approved readings leave the database: the query takes each one out of the row's body
 * itself, so Life Mirror's notes, its extras and every other answer stay where they are. Nothing
 * here writes, and nothing read is cached, logged or synced: the caller keeps the numbers it uses.
 */

export const LIFE_MIRROR_APP = 'life-mirror';
export const LIFE_MIRROR_STORE = 'checkins';

/**
 * The readings Workout Conductor may use (the approved proposal, part 3): energy, the night's hours
 * and quality, stress, mood, and motivation, each a whole number 1 to 5 from low to high of the
 * thing it names (stress 5 is "Crushing", the worst).
 */
export const LIFE_MIRROR_READINGS = [
  'energy',
  'mood',
  'stress',
  'sleepHours',
  'sleepQuality',
  'motivation',
] as const;
export type LifeMirrorReading = (typeof LIFE_MIRROR_READINGS)[number];

/** Life Mirror's blocks of the day: morning 04:00-11:59, afternoon to 16:59, evening to 03:59. */
export const LIFE_MIRROR_BLOCKS = ['morning', 'afternoon', 'evening'] as const;
export type LifeMirrorBlockName = (typeof LIFE_MIRROR_BLOCKS)[number];

/** Each reading's column in the query: plain names, never the body's own keys. */
const COLUMN: Record<LifeMirrorReading, string> = {
  energy: 'energy',
  mood: 'mood',
  stress: 'stress',
  sleepHours: 'sleep_hours',
  sleepQuality: 'sleep_quality',
  motivation: 'motivation',
};

/** The day's check-ins, each reading taken out of its body in the database; nothing else of it. */
export const LIFE_MIRROR_QUERY = `SELECT updated_at, json_extract(body, '$.block') AS block, json_extract(body, '$.completedAt') AS completed_at, json_extract(body, '$.updatedAt') AS body_updated_at, ${LIFE_MIRROR_READINGS.map((reading) => `json_extract(body, '$.answers.${reading}') AS ${COLUMN[reading]}`).join(', ')} FROM records WHERE app = ? AND store = ? AND deleted = 0 AND day = ? AND json_valid(body)`;

/** One block's check-in, as much of it as Workout Conductor may use. */
export interface LifeMirrorBlock {
  block: LifeMirrorBlockName;
  /** When it was told: when it was completed, else when it last changed. */
  at: string;
  /** The readings it holds, each a whole number 1 to 5; any other value is none. */
  readings: Partial<Record<LifeMirrorReading, number>>;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const isoOf = (value: unknown): string | null =>
  typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value)) ? value : null;

/**
 * The day's check-ins (`day`, Life Mirror's local date), one a block, the later where a block has
 * two (the proposal: duplicate rows are possible). A row that does not read is none: this never
 * throws on what it reads, and a failed query is the caller's to treat as nothing.
 */
export async function readLifeMirrorDay(
  client: CloudClient,
  day: string,
): Promise<LifeMirrorBlock[]> {
  const result = await client.execute({
    sql: LIFE_MIRROR_QUERY,
    args: [LIFE_MIRROR_APP, LIFE_MIRROR_STORE, day],
  });
  const kept = new Map<LifeMirrorBlockName, LifeMirrorBlock & { changed: string }>();
  for (const row of result.rows) {
    const block = row.block;
    if (!LIFE_MIRROR_BLOCKS.includes(block as LifeMirrorBlockName)) continue;
    const changed = isoOf(row.body_updated_at) ?? isoOf(row.updated_at);
    if (changed === null) continue;
    const readings: Partial<Record<LifeMirrorReading, number>> = {};
    for (const reading of LIFE_MIRROR_READINGS) {
      const value = row[COLUMN[reading]];
      if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5) {
        readings[reading] = value;
      }
    }
    const name = block as LifeMirrorBlockName;
    const before = kept.get(name);
    if (before && before.changed >= changed) continue;
    kept.set(name, { block: name, at: isoOf(row.completed_at) ?? changed, readings, changed });
  }
  return [...kept.values()].map(({ block, at, readings }) => ({ block, at, readings }));
}
