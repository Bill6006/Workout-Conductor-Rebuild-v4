import type { UnitSystem } from '../../core/validation/profile';

/**
 * Maxes the lifter entered by hand, kept in the meta store and backed up.
 * A max is asked for once, on a lift with no history, through one small link
 * on the card; it can be snoozed for a week or declined for good per lift.
 * Once a working set is logged, the running estimate from logged sets takes
 * over and the entered max is only a memory.
 */

export const STRENGTH_MAXES_ID = 'strength-maxes';
export const MAX_PROMPT_SNOOZE_DAYS = 7;
export const LB_PER_KG = 2.2046226218;

const DAY_MS = 86_400_000;

export interface EnteredMax {
  /** Estimated one-rep max in `units` (per hand for dumbbells). */
  e1rm: number;
  units: UnitSystem;
  enteredAt: string;
  /** The set it was derived from, when the lifter gave a set instead of a max. */
  from: { weight: number; reps: number } | null;
}

export interface MaxPromptState {
  /** ISO time the prompt may return; null means never again for this lift. */
  until: string | null;
}

export interface StrengthMaxes {
  id: typeof STRENGTH_MAXES_ID;
  maxes: Record<string, EnteredMax>;
  prompts: Record<string, MaxPromptState>;
}

export type MaxInput =
  { kind: 'max'; e1rm: number } | { kind: 'set'; weight: number; reps: number };

export function emptyMaxes(): StrengthMaxes {
  return { id: STRENGTH_MAXES_ID, maxes: {}, prompts: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a stored record tolerantly: bad entries are dropped, never thrown. */
export function parseStrengthMaxes(raw: unknown): StrengthMaxes {
  const result = emptyMaxes();
  if (!isRecord(raw)) return result;
  if (isRecord(raw.maxes)) {
    for (const [exerciseId, value] of Object.entries(raw.maxes)) {
      if (!isRecord(value)) continue;
      const { e1rm, units, enteredAt, from } = value;
      if (typeof e1rm !== 'number' || !Number.isFinite(e1rm) || e1rm <= 0) continue;
      if (units !== 'lb' && units !== 'kg') continue;
      if (typeof enteredAt !== 'string') continue;
      const set =
        isRecord(from) && typeof from.weight === 'number' && typeof from.reps === 'number'
          ? { weight: from.weight, reps: from.reps }
          : null;
      result.maxes[exerciseId] = { e1rm, units, enteredAt, from: set };
    }
  }
  if (isRecord(raw.prompts)) {
    for (const [exerciseId, value] of Object.entries(raw.prompts)) {
      if (!isRecord(value)) continue;
      if (value.until === null || typeof value.until === 'string') {
        result.prompts[exerciseId] = { until: value.until };
      }
    }
  }
  return result;
}

export function convertWeight(weight: number, from: UnitSystem, to: UnitSystem): number {
  if (from === to) return weight;
  const converted = from === 'kg' ? weight * LB_PER_KG : weight / LB_PER_KG;
  return Math.round(converted * 10) / 10;
}

/** Epley, with reps capped at twelve where the formula stops being useful (same as the progression engine). */
export function maxFromSet(weight: number, reps: number): number {
  return Math.round(weight * (1 + Math.min(Math.max(reps, 1), 12) / 30) * 10) / 10;
}

/** The entered max for a lift in the requested units, or null. */
export function enteredMaxFor(
  maxes: StrengthMaxes,
  exerciseId: string,
  units: UnitSystem,
): number | null {
  const entry = maxes.maxes[exerciseId];
  if (!entry) return null;
  return convertWeight(entry.e1rm, entry.units, units);
}

export function recordMax(
  maxes: StrengthMaxes,
  exerciseId: string,
  input: MaxInput,
  units: UnitSystem,
  now: string,
): StrengthMaxes {
  const e1rm = input.kind === 'max' ? input.e1rm : maxFromSet(input.weight, input.reps);
  if (!Number.isFinite(e1rm) || e1rm <= 0) throw new Error('Enter a weight above zero.');
  const entry: EnteredMax = {
    e1rm: Math.round(e1rm * 10) / 10,
    units,
    enteredAt: now,
    from: input.kind === 'set' ? { weight: input.weight, reps: input.reps } : null,
  };
  const prompts = { ...maxes.prompts };
  delete prompts[exerciseId];
  return { ...maxes, maxes: { ...maxes.maxes, [exerciseId]: entry }, prompts };
}

/** "Not now" keeps the link away for a week; "Don't ask for this lift" keeps it away for good. */
export function snoozeMaxPrompt(
  maxes: StrengthMaxes,
  exerciseId: string,
  now: string,
  forGood: boolean,
): StrengthMaxes {
  const until = forGood
    ? null
    : new Date(Date.parse(now) + MAX_PROMPT_SNOOZE_DAYS * DAY_MS).toISOString();
  return { ...maxes, prompts: { ...maxes.prompts, [exerciseId]: { until } } };
}

/** True while the lift has an entered max or a live snooze. */
export function maxPromptHidden(maxes: StrengthMaxes, exerciseId: string, now: string): boolean {
  if (maxes.maxes[exerciseId]) return true;
  const prompt = maxes.prompts[exerciseId];
  if (!prompt) return false;
  if (prompt.until === null) return true;
  return Date.parse(prompt.until) > Date.parse(now);
}
