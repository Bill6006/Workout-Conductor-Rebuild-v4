import { getExercise } from '../../catalog/exercises/catalog';
import { isHold, type CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import type { UnitSystem, UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { estimateFromOtherLifts } from './crossEstimate';
import { maxFromSet, type StrengthMaxes } from './maxes';
import { performanceHistory } from './progression';
import {
  barWeightFor,
  convertEstimate,
  estimateStartingMax,
  hasNoLoad,
  loadClass,
  loggedLoad,
  LOWER_BODY,
} from './startingLoad';

/**
 * Numbers that look like slips (Maintenance 26, the owner's item 40, docs/research/slip-checks.md).
 * A typed number far past anything real is questioned once before it steers a target: the lifter
 * keeps it with one tap or changes it. A lower weight or max is never questioned (it is plausible
 * after a break and only ever makes targets lighter), unless no bar lift can be that light.
 */

export interface SlipQuestion {
  /** What was typed: a weight (a set's, or a max), its reps, or a bodyweight. */
  field: 'weight' | 'reps' | 'bodyweight';
  /** Why it looks like a slip, in a sentence. */
  text: string;
}

/** A typed max past this share of the lift's own best (its sets, or the max entered) is questioned. */
export const SLIP_OVER_HISTORY = 1.5;
/** With none, past this share of the estimate from the lifter's own sets on related lifts ... */
export const SLIP_OVER_FAMILY = 2.5;
/**
 * ... or of the starting estimate from the body, rougher and low by design: ordinary first sets of
 * beginners read up to about 3.2 times it (the third pass of item 40), and a typing slip of a
 * cautious first set from about 3.6 (the fourth pass).
 */
export const SLIP_OVER_BODY = 3.5;
/** Reps are questioned past this many times the top of the range ... */
export const SLIP_REPS_FACTOR = 3;
/** ... and at least this many over it. */
export const SLIP_REPS_OVER = 15;
/** A bodyweight that moves by more than this share of the saved one is questioned. */
export const SLIP_BODYWEIGHT_CHANGE = 0.25;

/**
 * Weights past what almost anyone loads: a bar or a machine, a sled (plate-loaded leg presses and
 * hack squats go far past a stack), and one dumbbell or kettlebell, or weight added to the body.
 */
const CEILINGS: Record<UnitSystem, { heavy: number; sled: number; each: number }> = {
  lb: { heavy: 1000, sled: 2000, each: 250 },
  kg: { heavy: 450, sled: 900, each: 115 },
};

const SLEDS = new Set(['leg-press', 'hack-squat']);

/** A bodyweight's range: 30 to 300 kg. */
const BODYWEIGHT_RANGE: Record<UnitSystem, [number, number]> = {
  lb: [66, 660],
  kg: [30, 300],
};

function shown(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * A set as the lifter would say it: "185 lb × 5", "40 lb per hand × 8", "25 lb added × 8", and a
 * hold by its load alone ("30 lb per hand"): its seconds are no reps.
 */
function setText(exercise: CatalogExercise, weight: number, reps: number, units: UnitSystem) {
  const perHand = loadClass(exercise.load) === 'each' ? ' per hand' : '';
  if (isHold(exercise)) return `${shown(weight)} ${units}${perHand}`;
  if (hasNoLoad(exercise)) {
    return weight > 0 ? `${shown(weight)} ${units} added × ${reps}` : `${reps} reps at bodyweight`;
  }
  return `${shown(weight)} ${units}${perHand} × ${reps}`;
}

/** A set's weight and reps, as logged or as typed. */
export interface SetReading {
  weight: number | null;
  reps: number;
  /** A working set (the default): only these say what the lift can do. A ramp's weight counts as lifted. */
  working?: boolean;
}

/**
 * What a set says the lift can do, compared like for like: the estimated max of a lift (Epley,
 * every rep up to thirty, as the max sheet reads); the load alone for a hold, whose seconds are no
 * reps; and for a lift with no load the whole weight moved, the body and what is added to it
 * (the review of item 40: an added 180 lb read alone looked like a light set). Null where it
 * cannot be read: a lift with no load and no bodyweight saved.
 */
function readingOf(
  exercise: CatalogExercise,
  set: SetReading,
  bodyweight: number | undefined,
): number | null {
  if (isHold(exercise)) {
    const load = loggedLoad(exercise, set.weight);
    return load !== null && load > 0 ? load : null;
  }
  if (hasNoLoad(exercise)) {
    if (bodyweight === undefined || !(bodyweight > 0)) return null;
    return maxFromSet(bodyweight + Math.max(0, set.weight ?? 0), set.reps);
  }
  const load = loggedLoad(exercise, set.weight);
  return load !== null && load > 0 ? maxFromSet(load, set.reps) : null;
}

export interface LoggedBest {
  /** What the best set says (`readingOf`): an estimated max, or a hold's load. */
  e1rm: number;
  weight: number;
  reps: number;
}

/**
 * The best the lift's own working sets show: its history and, given them, today's sets so far
 * (the review of item 40: a heavier set kept today was asked about again on every later set).
 * A set of a lift is read as the max sheet reads one, every rep up to thirty, and a typed set is
 * read alike, so like is compared with like (the third pass of item 40: a long set was dropped;
 * the fourth: read at twenty against a set read at thirty, a real set was asked about); a hold is
 * read by its load. Null with none.
 */
export function bestLoggedMax(
  history: readonly WorkoutRecord[],
  exercise: CatalogExercise,
  options: { today?: readonly SetReading[]; bodyweight?: number } = {},
): LoggedBest | null {
  let best: LoggedBest | null = null;
  const read = (set: SetReading) => {
    if (set.reps < 1) return;
    const value = readingOf(exercise, set, options.bodyweight);
    if (value === null) return;
    if (!best || value > best.e1rm) best = { e1rm: value, weight: set.weight ?? 0, reps: set.reps };
  };
  for (const record of history) {
    for (const entry of record.entries) {
      if (entry.exerciseId !== exercise.id) continue;
      for (const set of entry.sets) {
        if (set.kind !== 'working' || !set.completed) continue;
        read({ weight: set.weight, reps: set.reps });
      }
    }
  }
  for (const set of options.today ?? []) if (set.working !== false) read(set);
  return best;
}

/** Whether the lift's own logged sets (its history, or today's) include this weight or lighter. */
function loggedAsLight(
  history: readonly WorkoutRecord[],
  exercise: CatalogExercise,
  today: readonly SetReading[],
  weight: number,
): boolean {
  const light = (logged: number | null) => logged !== null && logged > 0 && logged <= weight + 1e-6;
  if (today.some((set) => light(set.weight))) return true;
  return history.some((record) =>
    record.entries.some(
      (entry) =>
        entry.exerciseId === exercise.id &&
        entry.sets.some((set) => set.completed && light(set.weight)),
    ),
  );
}

/**
 * Whether the lift's own logged sets include this weight or heavier: today's, and its history's
 * (at this place only, given one). A weight lifted before was kept once, or was plausible: what it
 * weighs alone is not asked about again (the third pass of item 40: a kept number was asked about
 * at the first set of every session).
 */
function loggedAsHeavy(
  history: readonly WorkoutRecord[],
  exercise: CatalogExercise,
  today: readonly SetReading[],
  weight: number,
  place?: string | null,
): boolean {
  const heavy = (logged: number | null) => logged !== null && logged > 0 && logged >= weight - 1e-6;
  if (today.some((set) => heavy(set.weight))) return true;
  return history.some(
    (record) =>
      (place === undefined || record.locationId === place) &&
      record.entries.some(
        (entry) =>
          entry.exerciseId === exercise.id &&
          entry.sets.some((set) => set.completed && heavy(set.weight)),
      ),
  );
}

/**
 * The best estimate the lift's family gives, converted to this lift by their reference ratios,
 * when the lift has no sets of its own (the review of item 40). Null with none, and for a hold. A
 * family lift with no load of its own (a push-up, a band row) says nothing of a load: what it
 * logs is weight added or a band, not a max (the re-check).
 */
function familyMax(history: readonly WorkoutRecord[], exercise: CatalogExercise): number | null {
  if (isHold(exercise) || hasNoLoad(exercise)) return null;
  let best: number | null = null;
  for (const point of performanceHistory(history, exercise)) {
    const from = getExercise(point.exerciseId);
    if (!point.viaFamily || point.e1rm === null || !from || hasNoLoad(from)) continue;
    const converted = convertEstimate(point.e1rm, from, exercise).e1rm;
    if (best === null || converted > best) best = converted;
  }
  return best;
}

export interface WeightSlipInput {
  exercise: CatalogExercise;
  /** The weight typed: a set's load (with its reps), or a one-rep max (`max`). */
  weight: number;
  reps: number;
  max?: boolean;
  units: UnitSystem;
  history: readonly WorkoutRecord[];
  /** Today's sets of the lift so far, read with its history. */
  today?: readonly SetReading[];
  /** The max the lifter entered for the lift, in these units: their own word, as a set is. */
  saved?: number | null;
  profile?: Pick<UserProfile, 'bodyweight' | 'experience' | 'sex' | 'age' | 'units'> | null;
  /** The heaviest the place records for this lift (a set only), when it records one. */
  heaviest?: number | null;
  /** The place the set is logged at: the lift's sets logged there say what it can make. */
  place?: string | null;
  /**
   * The set being corrected, as it was logged: kept once, or plausible, it may spare a question,
   * but it is no evidence of the lift's best (the fourth pass of item 40: 6 corrected to 65 was
   * held to the 6).
   */
  editing?: SetReading | null;
  /** The set's own target weight, as the app set it: no estimate questions what the app asks. */
  target?: number | null;
  /**
   * The time it is read at, and the maxes entered for other lifts: with the history they say what
   * the lifter's other lifts suggest, as a lift's first target reads them (the seventh pass).
   */
  now?: string;
  maxes?: StrengthMaxes | null;
}

function ceilingFor(exercise: CatalogExercise, units: UnitSystem): number {
  // Weight added to the body, on any lift done at bodyweight (a step-up, a bench dip too): the
  // catalog adds it with dumbbells (the fourth pass of item 40).
  if (hasNoLoad(exercise)) return CEILINGS[units].each;
  const kind = loadClass(exercise.load);
  if (kind === 'stack' && exercise.equipment.flat().some((id) => SLEDS.has(id))) {
    return CEILINGS[units].sled;
  }
  return CEILINGS[units][kind === 'bar' || kind === 'stack' ? 'heavy' : 'each'];
}

/** Whether a typed weight, or the max it implies, looks like a slip; null when it is plausible. */
export function weightSlip(input: WeightSlipInput): SlipQuestion | null {
  const { exercise, weight, units } = input;
  if (!(weight > 0)) return null;
  const name = exercise.name;
  const hold = isHold(exercise);
  const noLoad = hasNoLoad(exercise);
  const max = input.max === true && !hold && !noLoad;
  const perHand = loadClass(exercise.load) === 'each' ? ' per hand' : '';
  const added = noLoad ? ' added' : '';
  const typed = `${max ? 'A max of ' : ''}${shown(weight)} ${units}${perHand}${added}`;
  const today = input.today ?? [];
  // The set being corrected spares the checks below at its own weight only (fewer reps, its
  // reserve): a kept 1850 corrected to 1350 is asked about as any 1350 is (the fifth pass).
  const editing = input.editing ?? null;
  const sameWeight =
    editing !== null && editing.weight !== null && Math.abs(editing.weight - weight) < 1e-6;
  const kept = editing && sameWeight ? [...today, editing] : today;
  // A weight the lift has lifted (today, or before) was kept once, or was plausible: what it
  // weighs alone is not asked about again (the third pass of item 40).
  const lifted = loggedAsHeavy(input.history, exercise, kept, weight);
  const ceiling = ceilingFor(exercise, units);
  if (!lifted && weight > ceiling) {
    return {
      field: 'weight',
      text: `${typed} is more than ${ceiling} ${units}: more than almost anyone loads on ${name}.`,
    };
  }
  // No bar lift is lighter than its empty bar: "13" for 135 (the review of item 40), on any set of
  // the day. A lighter bar of the lifter's own (a fixed barbell, a 15 kg bar) is asked about once:
  // logged that light, it is not asked again (the re-check).
  const bar = barWeightFor(exercise, units);
  if (
    bar !== null &&
    weight < bar - 1e-6 &&
    !loggedAsLight(input.history, exercise, kept, weight)
  ) {
    return {
      field: 'weight',
      text: `${typed} is less than the empty bar (${shown(bar)} ${units}) for ${name}.`,
    };
  }
  // A set today as heavy or heavier, of as many reps or more, says all this one does: it was kept,
  // or was plausible (a max is one rep). A weight alone covers nothing more: 155 lifted for 6
  // today does not make 155 for 30 plausible (the third pass of item 40).
  const reps = max ? 1 : Math.max(1, input.reps);
  const covered = kept.some(
    (set) => set.weight !== null && set.weight >= weight - 1e-6 && (hold || set.reps >= reps),
  );
  if (covered) return null;
  if (
    !max &&
    typeof input.heaviest === 'number' &&
    weight > input.heaviest + 1e-6 &&
    !loggedAsHeavy(input.history, exercise, kept, weight, input.place)
  ) {
    return {
      field: 'weight',
      text: `${typed} is more than the weights here make for ${name} (up to ${shown(input.heaviest)} ${units}${perHand}).`,
    };
  }
  // A bodyweight kept out of the range reads nothing: no estimate, and no weight added to the body
  // judged with it (the eighth and ninth passes: "about 2 lb", and 20 lb added as heavy as 18 lb).
  const [lightest, heaviest] = BODYWEIGHT_RANGE[input.profile?.units ?? units];
  const plausible =
    input.profile?.bodyweight !== undefined &&
    input.profile.bodyweight >= lightest &&
    input.profile.bodyweight <= heaviest;
  const bodyweight = plausible ? input.profile?.bodyweight : undefined;
  // As much again as the lifter weighs, added to the body: their bodyweight in the wrong dial. Not
  // on the lower body, where a trained lifter adds that much (the third pass of item 40).
  if (
    noLoad &&
    !LOWER_BODY.has(exercise.movementPattern) &&
    !lifted &&
    bodyweight !== undefined &&
    bodyweight > 0 &&
    weight >= bodyweight
  ) {
    return {
      field: 'weight',
      text: `${typed} is as much as you weigh (${shown(bodyweight)} ${units}): far more than almost anyone adds on ${name}.`,
    };
  }
  const implied = max
    ? weight
    : readingOf(exercise, { weight, reps: Math.max(1, input.reps) }, bodyweight);
  if (implied === null) return null;
  // A correction is spared up to one and a half times the set it corrects, as a set is by the
  // lift's best: a kept set corrected by a rep or a step is not asked about again, and one logged a
  // digit short and corrected is judged as if typed new (the fifth pass).
  const corrected =
    editing && !max
      ? readingOf(exercise, { ...editing, reps: Math.max(1, editing.reps) }, bodyweight)
      : null;
  if (corrected !== null && implied <= corrected * SLIP_OVER_HISTORY) return null;
  const what = max ? typed : setText(exercise, weight, input.reps, units);
  // The lift's own evidence first: its sets (today's too) and the max the lifter entered.
  const best = bestLoggedMax(input.history, exercise, {
    today,
    ...(bodyweight !== undefined ? { bodyweight } : {}),
  });
  const saved = hold || noLoad ? 0 : (input.saved ?? 0);
  const own = Math.max(best?.e1rm ?? 0, saved);
  if (own > 0) {
    if (implied <= own * SLIP_OVER_HISTORY) return null;
    const why =
      best && best.e1rm >= saved
        ? `${hold ? 'heaviest' : 'best'} ${setText(exercise, best.weight, best.reps, units)}`
        : `the max you saved, ${shown(saved)} ${units}${perHand}`;
    return {
      field: 'weight',
      text: `${what} is far above anything logged for ${name} (${why}).`,
    };
  }
  // Then an estimate, whichever allows more: the family's at two and a half times, the other
  // lifts' and the body's at three and a half, as the lift's first target reads them (other lifts,
  // then the body: the seventh pass found a tenfold slip of a target the other lifts set logged
  // unasked with no bodyweight saved). Both of those read the reference ratios between lifts. A
  // light day on a related lift says nothing of how strong the lifter is (the re-check), and the
  // body's estimate is low by design (the third and fourth passes). No estimate questions what the
  // app itself asks: the empty bar, or the set's own target, read alike, which never goes under the
  // bar or a load step (the fifth pass: the prefilled first target was asked about).
  if (bar !== null && weight <= bar + 1e-6) return null;
  const family = familyMax(input.history, exercise) ?? 0;
  // As a ceiling: each other lift at its best, an entered max where it is higher (the eighth pass:
  // a light day on the bench made a real first leg press look like a slip). The ceiling weighs the
  // lifts together, so a max entered never lowers it: the higher of it with and without the maxes
  // (the eleventh pass: a fresh max over a lift's old logs did).
  const ceilingWith = (maxes: StrengthMaxes | null) =>
    input.now
      ? (estimateFromOtherLifts(exercise, input.history, input.now, units, maxes, true)?.e1rm ?? 0)
      : 0;
  const others = Math.max(ceilingWith(input.maxes ?? null), input.maxes ? ceilingWith(null) : 0);
  const body =
    input.profile && plausible ? (estimateStartingMax(exercise, input.profile)?.e1rm ?? 0) : 0;
  const asked =
    typeof input.target === 'number' && input.target > 0
      ? (readingOf(exercise, { weight: input.target, reps: Math.max(1, input.reps) }, bodyweight) ??
        0)
      : 0;
  // An estimate that rounds to nothing is none (the seventh pass: "a max of about 0 lb").
  const estimates = [
    { estimate: family, limit: family * SLIP_OVER_FAMILY, from: 'your related lifts' },
    { estimate: others, limit: others * SLIP_OVER_BODY, from: 'your other lifts' },
    { estimate: body, limit: body * SLIP_OVER_BODY, from: 'your bodyweight and experience' },
  ].filter((one) => Math.round(one.estimate) > 0);
  // With no estimate there is nothing to compare with: the target only raises a limit an estimate
  // set (the sixth pass: with no bodyweight saved, the target alone asked about "about 0 lb").
  const most = estimates.reduce<(typeof estimates)[number] | null>(
    (best, one) => (best === null || one.limit > best.limit ? one : best),
    null,
  );
  if (most === null) return null;
  const limit = Math.max(most.limit, asked * SLIP_OVER_BODY);
  if (implied <= limit) return null;
  const about = `${hold ? 'about' : 'a max of about'} ${Math.round(most.estimate)} ${units}${perHand}`;
  return {
    field: 'weight',
    text: `${what} is far above what ${most.from} suggest for ${name} (${about}).`,
  };
}

/**
 * Whether typed reps look like a slip: past three times the top of the range, and fifteen over it.
 * Reps the lift has logged before (today or in its history) are no slip: a lifter who does sixty
 * calf raises is asked once (the re-check of item 40).
 */
export function repsSlip(
  reps: number,
  range: readonly [number, number],
  logged: readonly number[] = [],
): SlipQuestion | null {
  const top = range[1];
  if (!(top > 0) || logged.some((done) => done >= reps)) return null;
  const limit = Math.max(top * SLIP_REPS_FACTOR, top + SLIP_REPS_OVER);
  return reps > limit
    ? { field: 'reps', text: `${reps} reps is far past the target of ${range[0]}-${top}.` }
    : null;
}

/** Whether a typed bodyweight looks like a slip: out of range, or a quarter away from the saved one. */
export function bodyweightSlip(
  next: number,
  saved: number | undefined,
  units: UnitSystem,
  // Setup saves only at Finish: the bodyweight there was entered, not saved (the sixth pass).
  entered = false,
  /**
   * The one confirmed as it was, when in other units: named so, with `saved` its conversion (the
   * seventh pass: "your saved bodyweight (83.9 kg)" named a number never saved).
   */
  as?: { value: number; units: UnitSystem },
): SlipQuestion | null {
  if (!(next > 0)) return null;
  const [low, high] = BODYWEIGHT_RANGE[units];
  if (next < low || next > high) {
    return {
      field: 'bodyweight',
      text: `${shown(next)} ${units} is outside a bodyweight's usual range (${low} to ${high} ${units}).`,
    };
  }
  // A saved bodyweight out of the range is itself the slip: correcting it is no question (the
  // third pass of item 40: 18 lb saved made 180 the question).
  if (
    saved !== undefined &&
    saved >= low &&
    saved <= high &&
    Math.abs(next - saved) > saved * SLIP_BODYWEIGHT_CHANGE
  ) {
    return {
      field: 'bodyweight',
      text: `${shown(next)} ${units} is far from ${entered ? 'the bodyweight you entered' : 'your saved bodyweight'} (${as && as.units !== units ? `${shown(as.value)} ${as.units}, about ${shown(saved)} ${units}` : `${shown(saved)} ${units}`}).`,
    };
  }
  return null;
}
