import { addLocalDays, localDayKey } from '../../core/time/localDate';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { Readiness } from '../recalibration/types';
import { RULES } from '../rules/ruleTable';

/**
 * Today's check-in read as the readiness model has it (Maintenance 33, the owner's decision 1 on
 * docs/proposals/week-model-readiness-time.md; docs/research/readiness-and-soreness.md): energy,
 * sleep and motivation against the lifter's own baseline. They act only when two or more are clearly
 * worse, or one is extreme (two short nights running), and then they lower what the app expects of
 * the day's first sets, never the plan (Saw 2016, 26423706; Craven 2022, 35708888). Soreness alone
 * never counts (Nosaka 2002, 12453160). Illness is a gate of its own (`ILLNESSES`).
 */

/** The check-in's items read against the lifter's own; soreness is not one of them. */
export const CHECK_IN_ITEMS = ['energy', 'sleep', 'motivation'] as const;
export type CheckInItem = (typeof CHECK_IN_ITEMS)[number];

/**
 * The illness gate's answers, as stored on a check-in (the stored schemas share this list): symptoms
 * above the neck only (trainable, every set at 2 or more in reserve), or a fever or symptoms all
 * over (no session today). No answer is no illness.
 */
export const ILLNESSES = ['head', 'body'] as const;
export type Illness = (typeof ILLNESSES)[number];

/** Soreness at its worst on the check-in ("Wrecked"): a line on the day, never a change. */
export const WRECKED = 5;

/** The check-in's rest day: a fever or aches all over are no day to train (Weidner 1997). */
export const REST_TODAY =
  'Fever or aches all over: rest today, and train again once they have gone.';

/**
 * The pain gate, exercise by exercise (Maintenance 33, proposal part 2;
 * docs/research/readiness-and-soreness.md): sharp, sudden or rising pain stops that exercise, and
 * "Hurts, protect it" brings pain-free work in its place; known pain at 5/10 or less that settles by
 * the next morning is trainable (Thomeé 1997; Silbernagel 2007). Said beside the button (the first
 * review of Maintenance 33: the gate was nowhere said).
 */
export const PAIN_GATE_LINE =
  'Sharp, sudden or rising pain: stop and protect it. Known pain at 5 out of 10 or less that settles by the next morning is fine to train with.';

const ITEM_WORDS: Record<CheckInItem, string> = {
  energy: 'energy',
  sleep: 'sleep',
  motivation: 'motivation',
};

export interface CheckInRead {
  /** The items clearly worse than the lifter's own. */
  worse: CheckInItem[];
  /** The extreme one alone acts on, in words, or null. */
  extreme: string | null;
  /** What the app expects of the day's first sets is a step lower. */
  lowered: boolean;
  /** Whose baseline: the lifter's own saved check-ins, or the scale's middle. */
  baseline: 'own' | 'scale';
  /** Soreness at its worst: the first work set decides, a swap a tap away. */
  wrecked: boolean;
  /** The illness answer, if any. */
  illness: Illness | null;
}

/** A check-in's illness, read tolerantly: anything but a known answer is none. */
export function illnessOf(readiness: { illness?: unknown } | null | undefined): Illness | null {
  const value = readiness?.illness;
  return typeof value === 'string' && (ILLNESSES as readonly string[]).includes(value)
    ? (value as Illness)
    : null;
}

const DAY_MS = 86_400_000;

/**
 * Saved records with each check-in told counted once (the fifth review of Maintenance 33: a check-in
 * holds for every plan of its day and is saved with each workout of it, so told once on a day of two
 * workouts it was read as two). The records that share the time it was told are one check-in, the
 * first of them standing for it; one saved with no such time is its own.
 */
export function oncePerCheckIn<T extends Pick<WorkoutRecord, 'checkInAt'>>(
  records: readonly T[],
): T[] {
  const told = new Set<string>();
  return records.filter((record) => {
    if (record.checkInAt === undefined) return true;
    if (told.has(record.checkInAt)) return false;
    told.add(record.checkInAt);
    return true;
  });
}

/** The saved check-ins of the four weeks before today, newest first, each told once. */
function savedCheckIns(history: readonly WorkoutRecord[], nowIso: string) {
  const today = localDayKey(nowIso);
  const now = Date.parse(nowIso);
  return oncePerCheckIn(
    [...history]
      .filter(
        (record) =>
          record.readiness !== null &&
          localDayKey(record.startedAt) !== today &&
          Date.parse(record.startedAt) <= now &&
          now - Date.parse(record.startedAt) <= RULES.baselineDays.value * DAY_MS,
      )
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  ).map((record) => ({ at: record.startedAt, readiness: record.readiness as Readiness }));
}

/** Words for the items clearly worse: "energy and sleep under your usual". */
export function worseWords(read: Pick<CheckInRead, 'worse' | 'extreme' | 'baseline'>): string {
  if (read.extreme) return read.extreme;
  const names = read.worse.map((item) => ITEM_WORDS[item]);
  const list =
    names.length <= 1
      ? (names[0] ?? '')
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] as string}`;
  return read.baseline === 'own' ? `${list} under your usual` : `${list} low`;
}

/**
 * Today's check-in read against the lifter's own: the mean and spread of each item over the saved
 * check-ins of the four weeks before today, five or more of them; with fewer, the scale's middle
 * (3) and a spread of a point. An item is clearly worse a spread under its mean or more, never less
 * than a point.
 */
export function readCheckIn(
  readiness: Readiness | null,
  history: readonly WorkoutRecord[],
  nowIso: string,
): CheckInRead {
  const illness = illnessOf(readiness as { illness?: unknown } | null);
  if (!readiness) {
    return { worse: [], extreme: null, lowered: false, baseline: 'scale', wrecked: false, illness };
  }
  const saved = savedCheckIns(history, nowIso);
  const own = saved.length >= RULES.baselineLeast.value;
  const worse = CHECK_IN_ITEMS.filter((item) => {
    const values = saved.map((entry) => entry.readiness[item]).filter(Number.isFinite);
    const mean = own ? values.reduce((sum, value) => sum + value, 0) / values.length : 3;
    const spread = own
      ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
      : 1;
    return readiness[item] <= mean - Math.max(1, spread * RULES.worseSpread.value);
  });
  // Two short nights running: today's sleep and the night before's, from the check-in saved on the
  // day before (8112265, 29422383).
  const yesterday = localDayKey(addLocalDays(nowIso, -1));
  const nightBefore = saved.find((entry) => localDayKey(entry.at) === yesterday);
  const extreme =
    readiness.sleep <= RULES.extremeSleep.value &&
    nightBefore !== undefined &&
    nightBefore.readiness.sleep <= RULES.extremeSleep.value
      ? 'two short nights running'
      : null;
  return {
    worse,
    extreme,
    lowered: worse.length >= RULES.worseItems.value || extreme !== null,
    baseline: own ? 'own' : 'scale',
    wrecked: readiness.soreness >= WRECKED,
    illness,
  };
}
