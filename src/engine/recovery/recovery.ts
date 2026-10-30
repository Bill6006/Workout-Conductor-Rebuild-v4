import { getExercise } from '../../catalog/exercises/catalog';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import { MUSCLE_IDS, type MuscleId } from '../../catalog/muscles/muscles';
import { addLocalDays, localDayKey } from '../../core/time/localDate';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { LearnedResets } from '../learned/resets';
import { illnessOf, readCheckIn } from '../readiness/checkIn';
import { LOWER_BODY } from '../progression/startingLoad';
import type { Readiness } from '../recalibration/types';
import { RULES } from '../rules/ruleTable';
import { allEntries, isStopped, type GeneratedWorkout } from '../workout/types';
import { againstEarlier, askedRead, type AskedRead, type AskedSet } from './againstAsked';

/**
 * Recovery judged per muscle (Maintenance 33, docs/research/recovery-time-course.md): a window from
 * a muscle's last hard work, a starting estimate keyed to how close its sets went to failure and to
 * the body region, lengthened by a large dose, a new lift and long-length work, moved by what the
 * lifter's own sessions teach within bounds, and for every muscle lengthened by a short night or a
 * run of hard days with energy low. Fatigue stays in the trained muscles (Behm 2021, 33818751), so
 * consecutive days are no problem in themselves; the windows are estimates, never a rule that blocks
 * a session. Every number is the sourced table's (`RULES`).
 */
export const RECOVERY = {
  HARD_RIR: RULES.hardRir.value,
  EASY_HOURS: RULES.easyHours.value,
  MID_HOURS: { upper: RULES.midHoursUpper.value, lower: RULES.midHoursLower.value },
  FAILURE_HOURS: { upper: RULES.failureHoursUpper.value, lower: RULES.failureHoursLower.value },
  LONG_SET_REPS: RULES.longSetReps.value,
  BIG_DOSE_SETS: RULES.bigDoseSets.value,
  BIG_DOSE_HOURS: RULES.bigDoseHours.value,
  CAP_HOURS: { upper: RULES.capHoursUpper.value, lower: RULES.capHoursLower.value },
  NEW_LIFT_DAYS: RULES.newLiftDays.value,
  BACK_AFTER_DAYS: RULES.backAfterDays.value,
  NEW_LIFT_HOURS: RULES.newLiftHours.value,
  LONG_LENGTH_HOURS: RULES.longLengthHours.value,
  SYNERGIST_WEIGHT: RULES.synergistWeight.value,
  SHORT_NIGHT_HOURS: RULES.shortNightHours.value,
  SHORT_NIGHT_SLEEP: RULES.shortNightSleep.value,
  HARD_DAYS_RUN: RULES.hardDaysRun.value,
} as const;

/** What a learned window rests on and how far it may move (`RULES`). */
export const LEARNING = {
  LEAST: RULES.learnLeast.value,
  SAME: RULES.learnSame.value,
  SLOWER: RULES.learnSlower.value,
  STEP_HOURS: RULES.learnStep.value,
  LEAST_HOURS: RULES.learnLeastHours.value,
  MOST_HOURS: RULES.learnMostHours.value,
  LEAST_SHARE: RULES.learnLeastShare.value,
  MOST_SHARE: RULES.learnMostShare.value,
} as const;

/** What reads a set as a max: its reps and reserve read well (`RULES`). */
export const FIRST_SET = {
  DROP: RULES.firstSetDrop.value,
  READ_REPS: RULES.firstSetReps.value,
  READ_RIR: RULES.firstSetRir.value,
  RESTED_LEAST: RULES.restedLeast.value,
  RESTED_MOST: RULES.restedMost.value,
} as const;

/**
 * Lifts that load a muscle at long lengths or stress the lowering (direction research: 11194107,
 * 20852880): the Romanian deadlift, the deep fly, the overhead extension, and by the same reading
 * the incline curl, each with every implement the catalog has for it that loads the long length
 * (the second review of Maintenance 33: the dumbbell Romanian deadlift and the cable overhead
 * extension were missed; the third: the cable fly). A band's pull falls toward the stretch, so the
 * band fly loads the long length little, and a pec deck's cam sets how much of its load reaches the
 * stretch: neither is one (judgement).
 */
export const LONG_LENGTH_LIFTS: ReadonlySet<string> = new Set([
  'romanian-deadlift',
  'dumbbell-romanian-deadlift',
  'dumbbell-fly',
  'cable-fly',
  'overhead-triceps-extension',
  'cable-overhead-triceps-extension',
  'incline-dumbbell-curl',
]);

/** A muscle's window from its last hard work. */
export interface RecoveryWindow {
  muscle: MuscleId;
  /** When that work was done (the session's end, else its start). */
  at: string;
  /** How long the window runs, in hours. */
  hours: number;
  /** The starting estimate it came from, before what the lifter's sessions taught. */
  prior: number;
  /** What set it, in words. */
  reasons: string[];
}

/** What a muscle's own sessions taught of its window (`learnedWindows`). */
export interface LearnedWindow {
  muscle: MuscleId;
  /** Hours the window moves: half a day shorter, longer, or none yet. */
  shift: number;
  /** Sessions read: hard work back inside the window before, and after it. */
  early: number;
  rested: number;
}

/** What else the windows read. */
export interface RecoveryContext {
  /** Today's check-in: a short night lengthens every window. */
  readiness?: Pick<Readiness, 'sleep'> | null;
  /** Today's energy clearly low against the lifter's own (`readCheckIn`). */
  lowEnergy?: boolean;
  /** Now: a run of hard days ends today or yesterday. */
  now?: string;
  /** What the lifter reset: the learned windows read only what was logged after. */
  resets?: Pick<LearnedResets, 'recovery'> | null;
  /** What the lifter's sessions taught, read once by a caller that reads the windows often. */
  learned?: ReadonlyMap<MuscleId, LearnedWindow>;
}

/**
 * The day's context for the windows (Maintenance 33): today's check-in (a short night; energy
 * clearly low against the lifter's own, `readCheckIn`), the time, and what the lifter reset. Every
 * reader of today's windows reads the day so (the first review of Maintenance 33: the Plan screen
 * forgot the resets, the hard start the check-in; the second: the completion forgot the check-in,
 * and the Plan screen read yesterday's as today's). A check-in is the day's its session was made on
 * (`madeAt`, given by a reader that may hold an earlier day's session): one from an earlier day is
 * none of today's.
 */
/**
 * The check-in that is the day's (`dayRecovery`): the one of a session made today, or told with no
 * session's day to read; one from an earlier day's session is none of today's.
 */
export function checkInOfDay<T extends object>(
  readiness: T | null | undefined,
  madeAt: string | null | undefined,
  now: string,
): T | null {
  const today = !madeAt || localDayKey(madeAt) === localDayKey(now);
  return today ? (readiness ?? null) : null;
}

export function dayRecovery(input: {
  readiness: Readiness | null | undefined;
  /** When the session the check-in belongs to was made; absent, the check-in is today's. */
  madeAt?: string | null;
  history: readonly WorkoutRecord[];
  now: string;
  resets: Pick<LearnedResets, 'recovery'> | null | undefined;
}): RecoveryContext {
  const readiness = checkInOfDay(input.readiness, input.madeAt, input.now);
  return {
    readiness,
    lowEnergy: readCheckIn(readiness, input.history, input.now).worse.includes('energy'),
    now: input.now,
    resets: input.resets ?? null,
  };
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const whenOf = (record: WorkoutRecord) => record.completedAt ?? record.startedAt;

/** Whether a lift is lower-body compound work: a compound lift of a lower-body movement. */
function lowerCompound(exercise: CatalogExercise): boolean {
  return exercise.compound && LOWER_BODY.has(exercise.movementPattern);
}

type LoggedSet = WorkoutRecord['entries'][number]['sets'][number];

/**
 * A set's reserve as it ended: a reserve check taken on to failure (item 43) ended at none, whatever
 * its stop read (the second review of Maintenance 33: it set its muscle's window as a set short of
 * failure); else as logged, or, where none was logged, as its target asked.
 */
function reserveOf(set: LoggedSet): number | null {
  if (set.reserveCheck && !set.reserveCheck.stopped) return 0;
  if (typeof set.rir === 'number') return set.rir;
  return typeof set.targetRir === 'number' ? set.targetRir : null;
}

/** A completed working set this close to failure or closer. */
function isHard(set: LoggedSet): boolean {
  const rir = reserveOf(set);
  return set.kind === 'working' && set.completed && rir !== null && rir <= RECOVERY.HARD_RIR;
}

/**
 * Each muscle's window from its last hard work as a prime mover, in the records given (newest
 * counted), moved by what its own sessions taught, with today's whole-body layer on every window.
 */
export function recoveryWindows(
  history: readonly WorkoutRecord[],
  context: RecoveryContext = {},
): Map<MuscleId, RecoveryWindow> {
  const index = exposureIndex(history);
  const learned = context.learned ?? learnedWindows(history, context.resets ?? null);
  const layer = wholeBodyLayer(history, context);
  const windows = new Map<MuscleId, RecoveryWindow>();
  for (const muscle of MUSCLE_IDS) {
    const newest = (index.windows.get(muscle) ?? []).at(-1);
    if (newest) {
      const window = { ...newest.window, reasons: [...newest.window.reasons] };
      const shift = learned.get(muscle)?.shift ?? 0;
      if (shift !== 0) {
        const hours = withinBounds(window.prior + shift, window.prior);
        if (hours !== window.hours) {
          window.reasons.push(
            `your own sessions: ${Math.abs(hours - window.hours)} h ${hours < window.hours ? 'less' : 'more'}`,
          );
          window.hours = hours;
        }
      }
      if (layer) {
        window.hours += RECOVERY.SHORT_NIGHT_HOURS;
        window.reasons.push(`${layer}: ${RECOVERY.SHORT_NIGHT_HOURS} h more`);
      }
      windows.set(muscle, window);
    }
  }
  return windows;
}

/** A learned window within its bounds: 12 to 96 hours, and half to half again its estimate. */
function withinBounds(hours: number, prior: number): number {
  const least = Math.max(LEARNING.LEAST_HOURS, prior * LEARNING.LEAST_SHARE);
  const most = Math.min(LEARNING.MOST_HOURS, prior * LEARNING.MOST_SHARE);
  return Math.min(Math.max(hours, Math.min(least, prior)), Math.max(most, prior));
}

/**
 * The whole-body layer's reason today, or null (recovery-time-course.md: short sleep, or several
 * hard days in a row with recovery felt low, slow every muscle): a short night on today's check-in,
 * or three or more days running with hard sets, to today or yesterday, with today's energy low.
 */
function wholeBodyLayer(
  history: readonly WorkoutRecord[],
  context: RecoveryContext,
): string | null {
  const readiness = context.readiness ?? null;
  if (readiness !== null && readiness.sleep <= RECOVERY.SHORT_NIGHT_SLEEP) return 'a short night';
  if (!context.lowEnergy || !context.now) return null;
  const hardDays = new Set(
    history
      .filter((record) => record.entries.some((entry) => entry.sets.some(isHard)))
      .map((record) => localDayKey(record.startedAt)),
  );
  const dayBefore = (key: string) =>
    localDayKey(addLocalDays(new Date(`${key}T12:00:00`).toISOString(), -1));
  let cursor = localDayKey(context.now);
  if (!hardDays.has(cursor)) cursor = dayBefore(cursor);
  let run = 0;
  while (hardDays.has(cursor)) {
    run += 1;
    cursor = dayBefore(cursor);
  }
  return run >= RECOVERY.HARD_DAYS_RUN ? `${run} hard days running, energy low today` : null;
}

/** The window one session's hard work sets for a muscle, or null where it had none as a prime mover. */
function windowFrom(
  record: WorkoutRecord,
  muscle: MuscleId,
  lifts: LiftTimes,
): RecoveryWindow | null {
  let hardest: { rir: number; reps: number } | null = null;
  let dose = 0;
  let lower = false;
  let longLength = false;
  let newLift: string | null = null;
  for (const entry of record.entries) {
    const exercise = getExercise(entry.exerciseId);
    if (!exercise) continue;
    const prime = exercise.primaryMuscles.includes(muscle);
    const weight = prime
      ? 1
      : exercise.secondaryMuscles.includes(muscle)
        ? RECOVERY.SYNERGIST_WEIGHT
        : 0;
    if (weight === 0) continue;
    const hard = entry.sets.filter(isHard);
    if (hard.length === 0) continue;
    dose += hard.length * weight;
    if (!prime) continue;
    if (lowerCompound(exercise)) lower = true;
    if (LONG_LENGTH_LIFTS.has(exercise.id)) longLength = true;
    if (newLift === null && isNewTo(exercise.id, record, lifts)) newLift = exercise.name;
    for (const set of hard) {
      const rir = reserveOf(set) as number;
      if (
        hardest === null ||
        rir < hardest.rir ||
        (rir === hardest.rir && set.reps > hardest.reps)
      ) {
        hardest = { rir, reps: set.reps };
      }
    }
  }
  if (hardest === null) return null;
  const region = lower ? 'lower' : 'upper';
  const reasons: string[] = [];
  const failure = hardest.rir === 0 || (hardest.rir <= 1 && hardest.reps >= RECOVERY.LONG_SET_REPS);
  let hours: number = failure
    ? RECOVERY.FAILURE_HOURS[region]
    : hardest.rir <= 2
      ? RECOVERY.MID_HOURS[region]
      : RECOVERY.EASY_HOURS;
  reasons.push(
    failure
      ? `a set to failure or near it: ${hours} h`
      : hardest.rir <= 2
        ? `sets ${hardest.rir === 1 ? 'one rep' : 'two reps'} short of failure: ${hours} h`
        : `sets three or more reps short of failure: ${hours} h`,
  );
  if (dose >= RECOVERY.BIG_DOSE_SETS) {
    const capped = Math.min(RECOVERY.CAP_HOURS[region], hours + RECOVERY.BIG_DOSE_HOURS);
    if (capped > hours) reasons.push(`${Math.round(dose)} hard sets: ${capped - hours} h more`);
    hours = Math.max(hours, capped);
  }
  if (newLift !== null) {
    hours += RECOVERY.NEW_LIFT_HOURS;
    reasons.push(`${newLift} is new to you: ${RECOVERY.NEW_LIFT_HOURS} h more`);
  }
  if (longLength) {
    hours += RECOVERY.LONG_LENGTH_HOURS;
    reasons.push(`work at long lengths: ${RECOVERY.LONG_LENGTH_HOURS} h more`);
  }
  return { muscle, at: whenOf(record), hours, prior: hours, reasons };
}

/** When a history's lifts were done, read once (`isNewTo`). */
interface LiftTimes {
  /** The history's first session, as a time. */
  earliest: number;
  /** Each lift's sessions with a completed working set, as times, oldest first. */
  times: Map<string, number[]>;
}

function liftTimesOf(records: readonly WorkoutRecord[]): LiftTimes {
  let earliest = Infinity;
  const times = new Map<string, number[]>();
  for (const record of records) {
    const at = Date.parse(whenOf(record));
    if (Number.isNaN(at)) continue;
    earliest = Math.min(earliest, at);
    const done = new Set<string>();
    for (const entry of record.entries) {
      if (done.has(entry.exerciseId)) continue;
      if (!entry.sets.some((set) => set.kind === 'working' && set.completed)) continue;
      done.add(entry.exerciseId);
      times.set(entry.exerciseId, [...(times.get(entry.exerciseId) ?? []), at]);
    }
  }
  for (const list of times.values()) list.sort((a, b) => a - b);
  return { earliest, times };
}

/** How many of the times, oldest first, fall before `at`. */
function countBefore(times: readonly number[], at: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((times[middle] as number) < at) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Whether a lift was new to the lifter in this session: in its first three weeks, as far as the log
 * can tell (it reaches three weeks back before the session, so a lifter new to the app is not read as
 * new to every lift), or back after six months away.
 */
function isNewTo(exerciseId: string, record: WorkoutRecord, lifts: LiftTimes): boolean {
  const at = Date.parse(whenOf(record));
  const known = lifts.earliest <= at - RECOVERY.NEW_LIFT_DAYS * DAY_MS;
  const times = lifts.times.get(exerciseId) ?? [];
  const before = countBefore(times, at);
  if (before === 0) return known;
  if (at - (times[before - 1] as number) >= RECOVERY.BACK_AFTER_DAYS * DAY_MS) return true;
  return known && at - (times[0] as number) < RECOVERY.NEW_LIFT_DAYS * DAY_MS;
}

/** Hours since a window's work, at `nowIso`. */
export function hoursSince(window: RecoveryWindow, nowIso: string): number {
  return (Date.parse(nowIso) - Date.parse(window.at)) / HOUR_MS;
}

/** A max from a load, reps and reserve: load × (1 + (reps + reserve) / 30). */
const withReserve = (weight: number, reps: number, rir: number) => weight * (1 + (reps + rir) / 30);

/**
 * A set read as a max: load × (1 + (reps + reserve) / 30), for a set with a load, of 12 reps or
 * fewer, 3 or fewer in reserve (the reps and reserve read well: 34542869); null otherwise.
 */
export function setMax(set: {
  reps: number;
  weight: number | null;
  rir: number | null;
}): number | null {
  if (set.weight === null || set.weight <= 0 || set.rir === null) return null;
  if (set.reps < 1 || set.reps > FIRST_SET.READ_REPS || set.rir > FIRST_SET.READ_RIR) return null;
  return withReserve(set.weight, set.reps, set.rir);
}

/**
 * A first set read as a max and against what it asked (`againstAsked`), or null where it does not
 * read as a max: what every first set is set against the lift's rested sessions by.
 */
export function readFirstSet(set: AskedSet & { weight: number | null }): AskedRead | null {
  const max = setMax(set);
  return max === null ? null : askedRead(set, max, withReserve);
}

/** One session's first working set of a lift read so, or null. */
function firstSetReadIn(record: WorkoutRecord, exerciseId: string): AskedRead | null {
  for (const entry of record.entries) {
    if (entry.exerciseId !== exerciseId) continue;
    const first = entry.sets.find((set) => set.kind === 'working' && set.completed);
    return first ? readFirstSet(first) : null;
  }
  return null;
}

/** A record read on a day the body was off: illness, or a short night (the learning skips it). */
function offDay(record: WorkoutRecord): boolean {
  const readiness = record.readiness;
  if (!readiness) return false;
  return illnessOf(readiness) !== null || readiness.sleep <= RECOVERY.SHORT_NIGHT_SLEEP;
}

/** A lift's first working set in a session read so, on a day the body was not off. */
interface FirstRead {
  record: WorkoutRecord;
  /** When the session began, as a time. */
  start: number;
  read: AskedRead;
  /** Whether each of the lift's prime movers was rested then, read when first asked. */
  rested?: boolean;
}

/**
 * A history read once: its records oldest first, each muscle's windows from them in order, and
 * what the readings of it found, kept for as long as the history is (the coach reads it each minute).
 */
interface ExposureIndex {
  records: WorkoutRecord[];
  /** Each window with its work's time. */
  windows: Map<MuscleId, { record: WorkoutRecord; window: RecoveryWindow; time: number }[]>;
  /** Each lift's first sets read, in the records' order (`restedReads`). */
  firsts: Map<string, FirstRead[]>;
  /** The rested sessions' first sets read, by lift and time. */
  rested: Map<string, readonly AskedRead[]>;
  /** What each muscle's sessions taught, by the reset read after (`learnedWindows`). */
  learned: Map<string, ReadonlyMap<MuscleId, LearnedWindow>>;
  /** What the history held when read: an array grown in place is read again. */
  signature: string;
}

const indexes = new WeakMap<readonly WorkoutRecord[], ExposureIndex>();

const signatureOf = (history: readonly WorkoutRecord[]) =>
  `${history.length}|${history[0]?.id ?? ''}|${history.at(-1)?.id ?? ''}`;

/** The history's index, read once for each history (the store keeps one array until it changes). */
function exposureIndex(history: readonly WorkoutRecord[]): ExposureIndex {
  const cached = indexes.get(history);
  if (cached && cached.signature === signatureOf(history)) return cached;
  const records = [...history].sort((a, b) => whenOf(a).localeCompare(whenOf(b)));
  const lifts = liftTimesOf(records);
  const windows: ExposureIndex['windows'] = new Map();
  for (const muscle of MUSCLE_IDS) {
    const list: { record: WorkoutRecord; window: RecoveryWindow; time: number }[] = [];
    for (const record of records) {
      const window = windowFrom(record, muscle, lifts);
      if (window) list.push({ record, window, time: Date.parse(window.at) });
    }
    windows.set(muscle, list);
  }
  const firsts = new Map<string, FirstRead[]>();
  for (const record of records) {
    if (offDay(record)) continue;
    for (const exerciseId of new Set(record.entries.map((entry) => entry.exerciseId))) {
      const read = firstSetReadIn(record, exerciseId);
      if (read === null) continue;
      const first = { record, start: Date.parse(record.startedAt), read };
      firsts.set(exerciseId, [...(firsts.get(exerciseId) ?? []), first]);
    }
  }
  const index: ExposureIndex = {
    records,
    windows,
    firsts,
    rested: new Map(),
    learned: new Map(),
    signature: signatureOf(history),
  };
  indexes.set(history, index);
  return index;
}

/**
 * Whether each of a lift's prime movers was outside its window when a session began: the windows
 * the sessions before it set, as estimated then.
 */
function restedAt(exercise: CatalogExercise, record: WorkoutRecord, index: ExposureIndex): boolean {
  const start = Date.parse(record.startedAt);
  for (const muscle of exercise.primaryMuscles) {
    let last: { window: RecoveryWindow; time: number } | null = null;
    for (const item of index.windows.get(muscle) ?? []) {
      if (item.time >= start) break;
      last = item;
    }
    if (last && (start - last.time) / HOUR_MS < last.window.prior) return false;
  }
  return true;
}

/**
 * A lift's rested sessions before a time: its first working set read in its last five sessions at
 * most with every prime mover rested, and no illness or short night.
 */
function restedReads(
  exerciseId: string,
  history: readonly WorkoutRecord[],
  before: string,
): readonly AskedRead[] {
  const exercise = getExercise(exerciseId);
  if (!exercise) return [];
  const index = exposureIndex(history);
  const key = `${exerciseId}|${before}`;
  const kept = index.rested.get(key);
  if (kept !== undefined) return kept;
  const until = Date.parse(before);
  const found: AskedRead[] = [];
  const reads = index.firsts.get(exerciseId) ?? [];
  for (let at = reads.length - 1; at >= 0; at -= 1) {
    if (found.length >= FIRST_SET.RESTED_MOST) break;
    const first = reads[at] as FirstRead;
    if (first.start >= until) continue;
    first.rested ??= restedAt(exercise, first.record, index);
    if (first.rested) found.push(first.read);
  }
  index.rested.set(key, found);
  return found;
}

/**
 * A first set against the lift's rested sessions before a time (proposal part 2: "your first
 * working set against your recent sessions"): the median of how it did against each, each set read
 * against what it asked (`againstAsked`), so 0.92 is 8% under. Null with fewer than three to read
 * it against.
 */
export function againstRested(
  read: AskedRead,
  exerciseId: string,
  history: readonly WorkoutRecord[],
  before: string,
): number | null {
  const shares = restedReads(exerciseId, history, before)
    .map((earlier) => againstEarlier(read, earlier))
    .filter((share): share is number => share !== null)
    .sort((a, b) => a - b);
  if (shares.length < FIRST_SET.RESTED_LEAST) return null;
  const middle = Math.floor(shares.length / 2);
  return shares.length % 2 === 1
    ? (shares[middle] as number)
    : ((shares[middle - 1] as number) + (shares[middle] as number)) / 2;
}

/**
 * What each muscle's own sessions teach of its window (recovery-time-course.md, "Learning R",
 * modelled on Bayesian individualisation, 27967274): each session with hard work for it as a prime
 * mover is early (back inside the window the session before set) or rested, and its lifts' first
 * sets are read against each lift's rested sessions (`againstRested`), each against what it asked,
 * so a day the plan asked less (a deload, a lift later in the session) lifted as asked teaches
 * nothing slower. After five of each: early sessions within 2% of the rested ones, half a day
 * shorter; 5% or more under them, half a day longer. Days ill or after a short night are left out,
 * and so is what came before a reset of the learned windows.
 */
export function learnedWindows(
  history: readonly WorkoutRecord[],
  resets: Pick<LearnedResets, 'recovery'> | null = null,
): ReadonlyMap<MuscleId, LearnedWindow> {
  const from = resets?.recovery ? Date.parse(resets.recovery) : -Infinity;
  const index = exposureIndex(history);
  const kept = index.learned.get(resets?.recovery ?? '');
  if (kept) return kept;
  const learned = new Map<MuscleId, LearnedWindow>();
  for (const muscle of MUSCLE_IDS) {
    const early: number[] = [];
    const rested: number[] = [];
    let previous: RecoveryWindow | null = null;
    for (const { record, window } of index.windows.get(muscle) ?? []) {
      const last = previous;
      previous = window;
      if (last === null || Date.parse(record.startedAt) < from || offDay(record)) continue;
      const ratios = record.entries.flatMap((entry) => {
        const exercise = getExercise(entry.exerciseId);
        if (!exercise?.primaryMuscles.includes(muscle) || !entry.sets.some(isHard)) return [];
        const read = firstSetReadIn(record, entry.exerciseId);
        const share =
          read === null ? null : againstRested(read, entry.exerciseId, history, record.startedAt);
        return share === null ? [] : [share];
      });
      if (ratios.length === 0) continue;
      const ratio = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
      const gap = (Date.parse(record.startedAt) - Date.parse(last.at)) / HOUR_MS;
      (gap < last.prior ? early : rested).push(ratio);
    }
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    let shift = 0;
    if (early.length >= LEARNING.LEAST && rested.length >= LEARNING.LEAST) {
      const fell = (mean(rested) - mean(early)) / mean(rested);
      if (fell <= LEARNING.SAME) shift = -LEARNING.STEP_HOURS;
      else if (fell >= LEARNING.SLOWER) shift = LEARNING.STEP_HOURS;
    }
    if (early.length > 0 || rested.length > 0) {
      learned.set(muscle, { muscle, shift, early: early.length, rested: rested.length });
    }
  }
  index.learned.set(resets?.recovery ?? '', learned);
  return learned;
}

/** Of a window's own share still to run: "well inside" it is under three quarters (`RULES`). */
export const TOO_SOON_SHARE = RULES.tooSoonShare.value;

/** A muscle today's plan works hard well inside its window. */
export interface TooSoon {
  muscle: MuscleId;
  /** Hours since its last hard work, and its window. */
  hours: number;
  window: number;
  /** The plan's lifts still to do that work it directly. */
  entryIds: string[];
}

/**
 * The muscles today's plan works hard well inside their windows ("too soon", the owner's decision:
 * a warning with a lighter option a tap away, never a block). Hard work for a muscle: a set planned
 * to failure, or three or more working sets at two in reserve or closer, by lifts that work it
 * directly. Light work is never flagged (34350481, 11834116).
 */
export function tooSoonToday(
  workout: GeneratedWorkout,
  windows: ReadonlyMap<MuscleId, RecoveryWindow>,
  nowIso: string,
): TooSoon[] {
  const found: TooSoon[] = [];
  for (const [muscle, window] of windows) {
    const lifts = allEntries(workout.blocks).filter(
      (entry) =>
        !isStopped(entry) &&
        (getExercise(entry.exerciseId)?.primaryMuscles.includes(muscle) ?? false),
    );
    const working = lifts.flatMap((entry) => entry.sets.filter((set) => set.kind === 'working'));
    const hard =
      working.some((set) => set.targetRir === 0) ||
      working.filter((set) => set.targetRir <= 2).length >= 3;
    if (!hard) continue;
    const since = hoursSince(window, nowIso);
    if (since < 0 || since >= TOO_SOON_SHARE * window.hours) continue;
    found.push({
      muscle,
      hours: Math.round(since),
      window: window.hours,
      entryIds: lifts.map((entry) => entry.id),
    });
  }
  return found;
}
