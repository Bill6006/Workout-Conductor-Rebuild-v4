import { getExercise } from '../../catalog/exercises/catalog';
import {
  isHold,
  type CatalogExercise,
  type TrainingRole,
} from '../../catalog/exercises/exerciseSchema';
import type { StyleId, UnitSystem, UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { fitWeight, nudge, stepFloor, type Loading } from '../loading/loading';
import { resolveStyle } from '../planning/styleAdvice';
import { autoregulate, outcomeFor, type AutoregulationPlan } from '../recalibration/autoregulate';
import {
  MAX_BACK_OFF_DROP,
  type GeneratedWorkout,
  type ProgressionMode,
  type SetPrescription,
} from '../workout/types';
import { HELD_AT_CAP, type NextTarget } from './progression';
import type { Prescription } from './roles';
import { barWeightFor, hasNoLoad } from './startingLoad';

/**
 * Top set plus back-offs (Maintenance 32, the owner's item 11, docs/research/top-set-back-offs.md).
 * A main lift's first working set is a top set in its strength range one rep short of failure; the
 * rest are back-offs at the same reps, 5% lighter, two short. The structure matches straight sets
 * for strength and size in the trials, so it is a choice of how the sets are organised, not a gain;
 * every number below is the research's or the owner's:
 *
 * - On for a main lift (primary strength) under Hybrid, Strength focus and Lean-down; off under
 *   Hypertrophy focus and Undulating (the owner), Light weights and Foundation (the research).
 * - The top set at 1 in reserve, never failure, Lean-down too (the owner); the back-offs at 2.
 * - The drop 5% (the owner), inside Helms et al. 2018's tested 2-6%. When the back-offs miss their
 *   reserve by a rep or more on average two sessions running at the drop in force, the same way,
 *   it moves 4% per rep missed (2% per half a rep of RPE in Helms 2018), within 0-20% (the trials'
 *   range): harder widens it, easier narrows it. Two sessions, as a rating errs by about a rep.
 * - The progression reads the top set alone: a back-off missed never holds back the top set's step,
 *   it widens the drop (the owner).
 * - Straight sets where the load is a guess or eased (a first target, an estimate, a return, a
 *   micro-deload, a reset) or fatigue is high (the research), and, by judgement, where the day
 *   already shapes every set: a deload week, a catch-up or second workout, the lift to push.
 */
export const BACK_OFF = {
  /** The top set's reps in reserve. */
  TOP_RIR: 1,
  /** The back-offs' reps in reserve. */
  BACK_OFF_RIR: 2,
  /** The back-offs' drop from the top set's load, before any session corrects it. */
  DROP: 0.05,
  /** How far the drop moves for each rep of reserve the back-offs miss by, on average. */
  SHIFT_PER_REP: 0.04,
  /** The average miss, in reps of reserve, that moves the drop. */
  MISS_REPS: 1,
  /** Sessions in a row at the drop in force that must miss the same way. */
  SESSIONS: 2,
  /**
   * A lift's sessions since its last top set that it reads its top set through, past its straight
   * days at the back-offs' load among them (the fourth review of round N; the seventh: its own
   * sessions at another range count too): past them with none on its main day, or past them on its
   * main day (the eighth: a lift main once a week and secondary twice left it after one tired main
   * day), it has left the structure (a style, a split or the place changed), and its straight
   * sessions are its own (judgement).
   */
  STRAIGHT_RUN: 2,
} as const;

/** The styles a main lift takes the structure in. */
export const BACK_OFF_STYLES: readonly StyleId[] = ['hybrid', 'strength-focus', 'lean-down'];

/** The modes whose load is a guess or eased: straight sets at that load. */
export const STRAIGHT_MODES: readonly ProgressionMode[] = [
  'start',
  'estimate',
  'return',
  'deload',
  'regress',
];

/** The role of a main lift, the one the structure runs (`backOffsSuit`). */
const MAIN_ROLE: TrainingRole = 'primary-strength';

/**
 * Whether a lift can take the structure today, before its target is read: a main lift with a load
 * (not a hold, nor a move with no weight to take off) in a style that runs it.
 */
export function backOffsSuit(
  exercise: CatalogExercise,
  role: TrainingRole,
  profile: UserProfile,
): boolean {
  return role === MAIN_ROLE && structureRuns(profile) && !isHold(exercise) && !hasNoLoad(exercise);
}

/** Whether the profile's style runs the structure at all: one that does not has left it, every lift. */
export function structureRuns(profile: UserProfile): boolean {
  return BACK_OFF_STYLES.includes(resolveStyle(profile));
}

/**
 * Whether the target leaves the structure on: a load to drop from, read from the log (not a guess
 * or an eased load), one the place can make as asked.
 */
export function targetTakesBackOffs(target: {
  weight: number | null;
  mode: ProgressionMode;
  asked?: unknown;
}): boolean {
  return target.weight !== null && !STRAIGHT_MODES.includes(target.mode) && !target.asked;
}

/** A session's back-offs against their reserve: the mean miss, in reps of reserve, or null. */
export function backOffMiss(
  sets: WorkoutRecord['entries'][number]['sets'],
  /** The load the drop gave them (`backOffAt`); absent on a session saved before, every one read. */
  at?: number,
): number | null {
  const misses = sets.flatMap((set) => {
    if (set.tier !== 'back-off' || !set.completed || set.kind !== 'working') return [];
    if (set.rir === null || typeof set.targetRir !== 'number') return [];
    // Lifted at another load (the follow's step, a weight set by hand), a back-off says how that
    // load felt, not the drop (the ninth review of round N: back-offs a step lighter, rated a rep
    // easier, narrowed the drop to nothing).
    if (at !== undefined && (set.weight === null || Math.abs(set.weight - at) > EPSILON)) return [];
    // A set under its rep floor was harder than any reserve says: each rep short counts as one.
    const short = set.targetReps ? Math.max(0, set.targetReps[0] - set.reps) : 0;
    return [set.rir - short - set.targetRir];
  });
  return misses.length > 0 ? misses.reduce((sum, miss) => sum + miss, 0) / misses.length : null;
}

/**
 * The back-offs' drop for a lift's next session: its last session's on the structure, moved when
 * the last two at that drop both missed the back-offs' reserve the same way by a rep or more.
 */
export function backOffDropFor(exerciseId: string, history: readonly WorkoutRecord[]): number {
  const sessions = [...history]
    .sort((a, b) => (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt))
    .flatMap((record) => {
      const entry = record.entries.find(
        (candidate) =>
          candidate.exerciseId === exerciseId &&
          candidate.backOffDrop !== undefined &&
          candidate.sets.some((set) => set.tier === 'back-off' && set.completed),
      );
      return entry
        ? [{ drop: entry.backOffDrop as number, miss: backOffMiss(entry.sets, entry.backOffAt) }]
        : [];
    })
    .slice(0, BACK_OFF.SESSIONS);
  const [last] = sessions;
  if (!last) return BACK_OFF.DROP;
  const read = sessions.filter((session) => session.drop === last.drop);
  if (read.length < BACK_OFF.SESSIONS) return last.drop;
  const misses = read.map((session) => session.miss);
  if (misses.some((miss) => miss === null || Math.abs(miss) < BACK_OFF.MISS_REPS)) return last.drop;
  const [first, ...rest] = misses as number[];
  if (rest.some((miss) => Math.sign(miss) !== Math.sign(first as number))) return last.drop;
  const mean = (misses as number[]).reduce((sum, miss) => sum + miss, 0) / misses.length;
  // Harder than asked (a miss under zero) widens the drop; easier narrows it.
  const moved = last.drop - mean * BACK_OFF.SHIFT_PER_REP;
  return Math.round(Math.min(MAX_BACK_OFF_DROP, Math.max(0, moved)) * 100) / 100;
}

/**
 * The reserve a lift's effort reads (the day's "harder" or "easier", a check-in), of the sets
 * given: its first back-off's, which carries the day's reserve as a straight set does; else the
 * first set's.
 */
export function effortRir(
  sets: readonly Pick<SetPrescription, 'tier' | 'targetRir'>[],
): number | undefined {
  return (sets.find((set) => set.tier === 'back-off') ?? sets[0])?.targetRir;
}

/**
 * Whether a lift's sets carry a day's reserve: the reserve `effortRir` reads is the day's; a top set
 * alone carries the top set's reserve for the day, which a plain day and a harder one share at its
 * floor of 1 (the first review of round N).
 */
export function carriesDayRir(
  sets: readonly Pick<SetPrescription, 'tier' | 'targetRir'>[],
  dayRir: number,
): boolean {
  const [first] = sets;
  if (first?.tier === 'top' && !sets.some((set) => set.tier === 'back-off')) {
    return first.targetRir === topSetRir(dayRir);
  }
  return effortRir(sets) === dayRir;
}

/**
 * A back-off's reserve, from its top set's and the day's: the gap the day leaves between them, so
 * "harder" takes the back-offs to 1 while the top set stays at 1 (the first review of round N).
 */
export function backOffRir(topRir: number, dayRir: number): number {
  return topRir + (dayRir - topSetRir(dayRir));
}

/**
 * The back-offs' load after a top set done (the second review of round N): the drop off it as
 * lifted, a step up after one clearly easy and down after a grind (the workout's follow, from the
 * reading of the set it was given, or the set's own, read as the workout reads it: a stand-in lifted
 * at the load it stood in for answers to the range asked, `outcomeFor`), never over the top set as
 * lifted: the drop's floor is 0%.
 */
export function backOffLoadAfter(
  top: Pick<SetPrescription, 'targetReps' | 'targetRir' | 'targetWeight' | 'asked'>,
  done: { reps: number; rir: number | null; weight: number | null },
  drop: number,
  options: { step: number; floor: number | null; loading: Loading | null },
  read?: AutoregulationPlan,
): number | null {
  // With no weight logged, the load the top set asks (`topSetLoad`), never a stand-in's.
  const lifted = done.weight ?? topSetLoad(top);
  if (lifted === null) return null;
  const fromTop = backOffLoad(lifted, drop, options);
  // Read as the workout reads it (the fourteenth review of round N: a stand-in lifted at the load
  // it stood in for was read against the reps the stand-in added, and a refit stepped its
  // back-offs down where the workout had not).
  const plan =
    read ??
    autoregulate({
      set: outcomeFor(top, { reps: done.reps, rir: done.rir, weight: lifted }),
      earlier: [],
      step: options.step,
      remaining: 1,
      setNumber: 1,
      units: '',
    });
  // Never under the bar, a top set slipped under it included (the third review of round N).
  const floor = options.floor ?? 0;
  if (plan.kind !== 'weight') return Math.max(floor, Math.min(lifted, fromTop));
  const moved =
    options.loading && options.loading.available !== null
      ? nudge(fromTop, plan.delta > 0 ? 1 : -1, options.loading.available, options.step)
      : Math.round((fromTop + plan.delta) / options.step) * options.step;
  // Never over the top set as lifted, on a weight the place has (the twelfth review of round N: a
  // plate marked missing after it, the step held at its load asked for one the place cannot make),
  // so never under the bar either: the bar is the least weight it has, and the floor of its fit.
  const ceiling = options.loading ? fitWeight(lifted, options.loading, options.floor) : lifted;
  const least = stepFloor(options.step, options.floor, options.loading?.available ?? null);
  return Math.min(ceiling, Math.max(least, moved));
}

/**
 * The load a top set still to come gives its back-offs: the load it asks, the one it stands in for
 * where the weights here make less (`asked`), never the stand-in's (the thirteenth review of round
 * N: back-offs fitted as stand-ins themselves for the top set's load came back at it, under its
 * range). Once it is lifted, the back-offs drop off it as lifted (`backOffLoadAfter`).
 */
export function topSetLoad(top: Pick<SetPrescription, 'targetWeight' | 'asked'>): number | null {
  return top.asked?.weight ?? top.targetWeight;
}

/**
 * A set's own reps on top set plus back-offs: those the plan asked of it where a stand-in for the
 * weights here added reps (`asked`, the twelfth review of round N), else the reps it shows; reps set
 * by hand are the lifter's, and stay (Maintenance 23; the thirteenth review: a refit and the follow
 * gave the back-offs the plan's reps back).
 */
export function ownRepsOf(
  set: Pick<SetPrescription, 'targetReps' | 'asked'>,
  handReps: boolean,
): [number, number] {
  const reps = !handReps && set.asked ? set.asked.reps : set.targetReps;
  return [reps[0], reps[1]];
}

/**
 * What caps a lift's back-offs (the eleventh review of round N): the top set as lifted; one still to
 * come, never logged or its log taken back, as planned; none for a top set skipped, which is no top
 * set lifted. Every replay and follow of the back-offs reads it here.
 */
export function backOffCap(
  top: Pick<SetPrescription, 'targetWeight'>,
  log: { weight?: number | null; skipped?: boolean } | undefined,
): number | null {
  if (!log) return top.targetWeight;
  if (log.skipped) return null;
  return log.weight ?? top.targetWeight;
}

/**
 * A back-off's load after a step from the weight it was lifted at (the eleventh review of round N):
 * never over the cap (`backOffCap`), nor, where the back-offs stand over it at a weight set by hand
 * (`own`), over that weight, so a step up never takes them down; never under the least load a step
 * lands on (`stepFloor`).
 * A back-off lifted over the cap by itself raises nothing (the twelfth review: the ones after it
 * went over the top set).
 */
export function backOffStepped(
  moved: number,
  options: {
    step: number;
    floor: number | null;
    cap: number | null;
    own?: number;
    /** The place's weights: the cap held on one it has (the twelfth review of round N). */
    loading?: Loading | null;
  },
): number {
  const top =
    options.cap === null
      ? Infinity
      : options.loading
        ? fitWeight(options.cap, options.loading, options.floor)
        : options.cap;
  const cap = Math.max(top, options.own ?? -Infinity);
  const least = stepFloor(options.step, options.floor, options.loading?.available ?? null);
  return Math.max(options.floor ?? 0, Math.min(cap, Math.max(least, moved)));
}

/**
 * The load a lift's back-offs still owed are at when it is picked up again (the seventh review of
 * round N: swapped away and back, or home and back, they lost the step a logged back-off gave
 * them): from `base`, the load its top set as lifted gives them, each back-off it logged moving them
 * as its log reads (`autoregulate`, as `backOffLoadAfter` reads the top set's own), a step from the
 * weight it was lifted at (`backOffStepped`: never over the cap the top set gives them, `top`, nor
 * under the bar).
 */
export function owedBackOffLoad(
  sets: readonly SetPrescription[],
  base: number,
  /** A working set's log, or null for one not logged (a skipped set is not logged). */
  logOf: (
    set: SetPrescription,
  ) => { reps: number; rir: number | null; weight: number | null } | null,
  options: {
    step: number;
    floor: number | null;
    loading: Loading | null;
    top: number | null;
    /** A weight the back-offs took by hand (`backOffStepped`). */
    own?: number;
  },
): number {
  return owedBackOffLoads(sets, base, logOf, options).last;
}

/**
 * The loads of a lift's back-offs not logged, each at the load the logs before it give it
 * (`owedBackOffLoad`'s steps, in turn: the thirteenth review of round N, a refit put the load after
 * the last log on every one), and the load after every log (`last`), for sets the lift owes past
 * them.
 */
export function owedBackOffLoads(
  sets: readonly SetPrescription[],
  base: number,
  logOf: (
    set: SetPrescription,
  ) => { reps: number; rir: number | null; weight: number | null } | null,
  options: {
    step: number;
    floor: number | null;
    loading: Loading | null;
    top: number | null;
    own?: number;
  },
): { loads: Map<number, number>; last: number } {
  const floor = options.floor ?? 0;
  let current = base;
  const loads = new Map<number, number>();
  const earlier: ReturnType<typeof outcomeFor>[] = [];
  for (const set of [...sets].sort((a, b) => a.index - b.index)) {
    if (set.kind !== 'working') continue;
    const log = logOf(set);
    if (!log) {
      if (set.tier === 'back-off') loads.set(set.index, current);
      continue;
    }
    // A set logged with no weight is read as lifted at the load it asks, as the workout reads it
    // (`planAfter`; the sixteenth review of round N: read with none, a refit took back the step an
    // easy back-off's follow gave).
    const outcome = outcomeFor(set, {
      ...log,
      weight: log.weight ?? (set.tier === 'top' ? topSetLoad(set) : current),
    });
    if (set.tier === 'back-off') {
      const plan = autoregulate({
        set: outcome,
        earlier,
        step: options.step,
        remaining: 1,
        setNumber: earlier.length + 1,
        units: '',
      });
      if (plan.kind === 'weight') {
        const from = log.weight ?? current;
        const moved =
          options.loading && options.loading.available !== null
            ? nudge(from, plan.delta > 0 ? 1 : -1, options.loading.available, options.step)
            : Math.round((from + plan.delta) / options.step) * options.step;
        current = backOffStepped(moved, {
          step: options.step,
          floor,
          cap: options.top,
          loading: options.loading,
          ...(options.own === undefined ? {} : { own: options.own }),
        });
      }
    }
    earlier.push(outcome);
  }
  return { loads, last: current };
}

/**
 * A lift's back-offs not logged after a back-off's log is taken back (the fourth review of round N):
 * from `base`, the load the top set as it stands gives them, each back-off still logged moves the
 * ones after it as its log did when it was made, a step from the weight it was lifted at, up after
 * one clearly easy and down after a grind (`backOffStepped`: never over the cap the top set gives
 * them, `top`, nor under the bar).
 */
export function backOffsReplayed(
  sets: readonly SetPrescription[],
  base: number,
  /** A back-off still logged: the weight it was lifted at and what its log asked. */
  logOf: (set: SetPrescription) => { weight: number | null; plan: AutoregulationPlan } | null,
  options: {
    step: number;
    floor: number | null;
    loading: Loading | null;
    top: number | null;
    /** A weight the back-offs took by hand (`backOffStepped`). */
    own?: number;
    /** Reps set by hand on the lift (`ownRepsOf`). */
    handReps?: boolean;
  },
): SetPrescription[] {
  const floor = options.floor ?? 0;
  let current = base;
  return sets.map((set) => {
    if (set.tier !== 'back-off') return set;
    const log = logOf(set);
    if (!log) {
      // At the load the drop and the logs give it, at its own reps: a stand-in's load asked and
      // the reps it added give way (the twelfth review of round N), reps set by hand stay.
      const next: SetPrescription = { ...set, targetWeight: current };
      if (set.asked) {
        next.targetReps = ownRepsOf(set, options.handReps === true);
        delete next.asked;
      }
      return next;
    }
    const { plan } = log;
    if (plan.kind === 'weight') {
      const from = log.weight ?? current;
      const moved =
        options.loading && options.loading.available !== null
          ? nudge(from, plan.delta > 0 ? 1 : -1, options.loading.available, options.step)
          : Math.round((from + plan.delta) / options.step) * options.step;
      current = backOffStepped(moved, {
        step: options.step,
        floor,
        cap: options.top,
        loading: options.loading,
        ...(options.own === undefined ? {} : { own: options.own }),
      });
    }
    return set;
  });
}

/** Below this, two loads are the same: the arithmetic's rounding. */
const EPSILON = 1e-6;

/**
 * A back-off's load from its top set's: the drop off it, rounded to the nearest weight the place
 * has, a half step up (the research: "the top set's logged load × 0.95, rounded to the equipment
 * step"; the fifth review of round N: snapped down, 205 gave 190, a 7% drop outside Helms et al.
 * 2018's tested 2-6%). Never under the bar, never over the top set, and, while a drop is in force,
 * under the top set where the place has a weight under it.
 */
export function backOffLoad(
  top: number,
  drop: number,
  options: { step: number; floor: number | null; loading: Loading | null },
): number {
  const exact = top * (1 - drop);
  const under = options.loading
    ? fitWeight(exact, options.loading, options.floor)
    : Math.max(options.floor ?? 0, Math.floor(exact / options.step + EPSILON) * options.step);
  const over = options.loading
    ? nudge(under, 1, options.loading.available, options.loading.step)
    : under + options.step;
  const nearest = over > under && over - exact <= exact - under + EPSILON ? over : under;
  return nearest > top + EPSILON || (drop > 0 && nearest >= top - EPSILON) ? under : nearest;
}

/**
 * The reserve a lift's target is read at on the structure, from the day's: the back-offs take the
 * day's reserve (2 in the styles that run it, more on a day made easier), the top set one rep
 * less, never under its own (a day made harder takes the back-offs to 1, the top set stays at 1).
 */
export function topSetRir(dayRir: number): number {
  return Math.max(BACK_OFF.TOP_RIR, dayRir - (BACK_OFF.BACK_OFF_RIR - BACK_OFF.TOP_RIR));
}

/**
 * Working sets as a top set and back-offs: the first keeps its load, reps and reserve; the rest
 * take the drop from its load, onto a weight the place has and never under the bar, at its reps and
 * the day's reserve (`dayRir`, the reserve the day's prescription asks). A lift cut to one working
 * set keeps it as its top set. A load or reps set by hand stays as it is.
 */
export function withBackOffs(
  sets: readonly SetPrescription[],
  drop: number,
  options: {
    step: number;
    floor: number | null;
    loading: Loading | null;
    manual?: { weight?: boolean; reps?: boolean };
    dayRir?: number;
  },
): SetPrescription[] {
  const working = sets.filter((set) => set.kind === 'working');
  const top = working[0];
  if (!top || top.targetWeight === null) return [...sets];
  const backOff = backOffLoad(top.targetWeight, drop, options);
  const manual = options.manual ?? {};
  return sets.map((set): SetPrescription => {
    if (set === top) return { ...set, tier: 'top' };
    if (set.kind !== 'working') return set;
    const next: SetPrescription = {
      ...set,
      tier: 'back-off',
      ...(manual.weight ? {} : { targetWeight: backOff }),
      ...(manual.reps
        ? {}
        : {
            targetReps: [top.targetReps[0], top.targetReps[1]] as [number, number],
            targetRir: backOffRir(top.targetRir, options.dayRir ?? BACK_OFF.BACK_OFF_RIR),
          }),
    };
    if (!manual.weight) delete next.asked;
    return next;
  });
}

/**
 * A plan made on another day (a saved copy) with each main lift's drop as its sessions have moved
 * it since, and its back-offs that drop off its top set: a copy's old drop never stands for the drop
 * in force (the first review of round N). A weight the back-offs took by hand stays; one on the top
 * set is the top set's, the back-offs following it (the fourth review). A copy's straight sets are
 * the lifter's own: none reads as a day at the back-offs' load.
 */
export function withDropsToday(
  workout: GeneratedWorkout,
  history: readonly WorkoutRecord[],
  loadingOf: (exercise: CatalogExercise) => Loading,
  units: UnitSystem,
): GeneratedWorkout {
  return {
    ...workout,
    blocks: workout.blocks.map((block) => ({
      ...block,
      entries: block.entries.map((saved) => {
        const entry = { ...saved };
        delete entry.atBackOffs;
        const exercise = getExercise(entry.exerciseId);
        if (entry.backOffDrop === undefined || !exercise) return entry;
        const drop = backOffDropFor(entry.exerciseId, history);
        const top = entry.sets.find((set) => set.tier === 'top');
        const from = top ? topSetLoad(top) : null;
        if (from === null) return { ...entry, backOffDrop: drop };
        const loading = loadingOf(exercise);
        const options = { step: loading.step, floor: barWeightFor(exercise, units), loading };
        // A weight set by hand before the top set is the top set's, its back-offs following at the
        // drop (the fourth review of round N: they stayed at the old drop under the new one); a
        // weight the back-offs took by hand after it is theirs (`manual.backOffs`).
        if (entry.manual?.backOffs !== undefined) return { ...entry, backOffDrop: drop };
        const load = backOffLoad(from, drop, options);
        return {
          ...entry,
          backOffDrop: drop,
          sets: entry.sets.map((set) =>
            set.tier === 'back-off' ? { ...set, targetWeight: load } : set,
          ),
        };
      }),
    })),
  };
}

/**
 * Whether a lift has run on top set plus back-offs: a top set of it done. Whether the session its
 * target reads ran so, the target says (`straightAfterTop`): its last session may have skipped the
 * top set, or run at another rep range (the fifth review of round N).
 */
export function ranOnTopSet(exerciseId: string, history: readonly WorkoutRecord[]): boolean {
  return liftSessions(exerciseId, history).some((entry) =>
    entry.sets.some((set) => set.tier === 'top' && set.completed),
  );
}

/** A lift's logged entries with a working set done, newest first. */
function liftSessions(
  exerciseId: string,
  history: readonly WorkoutRecord[],
): WorkoutRecord['entries'] {
  return [...history]
    .sort((a, b) => (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt))
    .flatMap((record) =>
      record.entries.filter(
        (entry) =>
          entry.exerciseId === exerciseId &&
          entry.sets.some((set) => set.kind === 'working' && set.completed),
      ),
    );
}

/**
 * The history a lift's top set reads (the fourth review of round N): its straight days at the
 * back-offs' load (`atBackOffs`) passed over, as its back-offs are, wherever they fall (the sixth
 * review: one between two top sets broke a run of misses), so a lift main one day and secondary
 * another steps its top set from its last top set, and the progression's rules over sessions read
 * its top sets alone. One read at the back-offs' load, one step up, was the top set it lifted last
 * time, every week. Unless the lift has left the structure (`BACK_OFF.STRAIGHT_RUN`): three of its
 * main days since its last top set ran straight, or its last three sessions had none of its main
 * days; then its straight sessions are its own, read as they are (the fifth review: a lift straight
 * every session, the lift to push or a top set the place cannot load, read the same old top set for
 * three weeks), its own sessions at another range among them (the seventh: on Undulating every heavy
 * day passed over the heavy day before, the moderate and light days between them ending each run of
 * such days at one). Its days as a secondary lift never take it out by themselves (the eighth: main
 * once a week and secondary twice, one tired main day took its top set to its straight days' load).
 * In a style that runs no structure, every session counts, main or not (`structureOn` false; the
 * ninth review: after a change to Hypertrophy focus the row's upper days between its pull days held
 * the old load for five sessions). A session saved with no role counts as a main day, as before.
 */
export function pastBackOffDays(
  exerciseId: string,
  history: readonly WorkoutRecord[],
  structureOn: boolean,
): readonly WorkoutRecord[] {
  const newestFirst = [...history].sort((a, b) =>
    (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt),
  );
  let since = 0;
  let mains = 0;
  for (const record of newestFirst) {
    const own = record.entries.filter(
      (entry) =>
        entry.exerciseId === exerciseId &&
        entry.sets.some((set) => set.kind === 'working' && set.completed),
    );
    if (own.length === 0) continue;
    if (own.some((entry) => entry.sets.some((set) => set.tier === 'top' && set.completed))) break;
    since += 1;
    if (own.some((entry) => entry.role === undefined || entry.role === MAIN_ROLE)) mains += 1;
    if (
      mains > BACK_OFF.STRAIGHT_RUN ||
      (since > BACK_OFF.STRAIGHT_RUN && (mains === 0 || !structureOn))
    ) {
      return history;
    }
  }
  return withoutBackOffDays(exerciseId, history);
}

/**
 * A history with a lift's straight days at the back-offs' load passed over wherever they fall: what
 * reads the lift's sessions over weeks for its progress, the coach's stalls, reads its top sets
 * alone, as its target does (the fifth review of round N: a stall came and went with the upper day).
 */
export function withoutBackOffDays(
  exerciseId: string,
  history: readonly WorkoutRecord[],
): readonly WorkoutRecord[] {
  const marked = (entry: WorkoutRecord['entries'][number]) =>
    entry.exerciseId === exerciseId && entry.atBackOffs === true;
  if (!history.some((record) => record.entries.some(marked))) return history;
  return history.map((record) =>
    record.entries.some(marked)
      ? { ...record, entries: record.entries.filter((entry) => !marked(entry)) }
      : record,
  );
}

/**
 * The history a lift's top set reads (`pastBackOffDays`), and when the lift was trained: a break is
 * measured from its sessions, whatever the read passes over (the fifth review of round N: three
 * weeks after its last top set, trained on a straight day eight days before, it read as back from a
 * break; the sixth: so did one whose last top set was skipped, its back-offs done; the seventh: a
 * straight day between two top sets left a break between them).
 */
export function topSetRead(
  exerciseId: string,
  history: readonly WorkoutRecord[],
  profile: UserProfile,
): { history: readonly WorkoutRecord[]; sessionsAt?: readonly string[] } {
  const read = pastBackOffDays(exerciseId, history, structureRuns(profile));
  const times = liftSessionTimes(exerciseId, history);
  return times.length === 0 ? { history: read } : { history: read, sessionsAt: times };
}

/** When a lift's logged sessions with a working set done were, newest first. */
function liftSessionTimes(exerciseId: string, history: readonly WorkoutRecord[]): string[] {
  return history
    .filter((record) =>
      record.entries.some(
        (entry) =>
          entry.exerciseId === exerciseId &&
          entry.sets.some((set) => set.kind === 'working' && set.completed),
      ),
    )
    .map((record) => record.completedAt ?? record.startedAt)
    .sort((a, b) => b.localeCompare(a));
}

/**
 * A main lift's straight target on a day that runs it straight after a session on top set plus
 * back-offs (the second review of round N): its back-offs' load, the drop in force off the load
 * its top set would carry (`top`, read at the top set's reserve), at the day's reserve. The top
 * set's load asked at a straight set's reserve asks more than its reps allow. Null where the last
 * session ran straight, or the lift has no load.
 */
export function straightAfterTop(
  top: NextTarget,
  prescription: Prescription,
  input: {
    exerciseId: string;
    history: readonly WorkoutRecord[];
    load: { step: number; floor: number | null; loading: Loading | null };
    units: UnitSystem;
  },
): NextTarget | null {
  // The session the target was read from ran on the structure (the third review of round N: one
  // whose top set was skipped is no session the target reads).
  const read = input.history.find((record) => record.id === top.reference?.recordId);
  const ran = read?.entries.some(
    (entry) =>
      entry.exerciseId === top.reference?.exerciseId &&
      entry.sets.some((set) => set.tier === 'top' && set.completed),
  );
  // The load the top set would carry, where the place makes less (the third review), at the reps it
  // had before the place pushed them, and none of the place's line (the fourth review: the sets
  // kept the capped top set's extra reps and "Held at the heaviest weight here").
  const from = top.asked?.weight ?? top.weight;
  if (from === null || !ran) return null;
  const drop = backOffDropFor(input.exerciseId, input.history);
  const placeLine = (line: string) =>
    top.asked !== undefined &&
    (line === top.rack?.line || (top.capped !== undefined && line.startsWith(HELD_AT_CAP)));
  // Nothing pushed: the place makes the back-offs' load as asked.
  const rest: NextTarget = { ...top };
  delete rest.asked;
  delete rest.capped;
  delete rest.rack;
  return {
    ...rest,
    weight: backOffLoad(from, drop, input.load),
    // The weight it steps from is the back-offs' load off the top set last lifted, not the top
    // set's own (the sixth review of round N: the coach offered the top set's next load of every
    // straight set).
    ...(typeof top.from === 'number' ? { from: backOffLoad(top.from, drop, input.load) } : {}),
    reps: top.asked?.reps ?? top.reps,
    rir: prescription.rir,
    evidence: [
      ...top.evidence.filter((line) => !placeLine(line)),
      `Straight sets today, at the back-offs' load: ${Math.round(drop * 100)}% under the top set's ${from} ${input.units}.`,
    ],
  };
}

/**
 * A main lift's target and the prescription its sets are built from (Maintenance 32, item 11): on
 * a day that leaves it top set plus back-offs, read at the top set's reserve, with the drop in
 * force; on one that runs it straight after a session on the structure, its back-offs' load
 * (`straightAfterTop`); else the day's own straight target. A load that is a guess or eased keeps
 * its own, straight.
 */
export function mainLiftTarget(input: {
  /**
   * The lift's target read at a prescription, from a history, a break measured from `sessionsAt`
   * where it is given (`topSetRead`).
   */
  read: (
    asked: Prescription,
    history: readonly WorkoutRecord[],
    sessionsAt?: readonly string[],
  ) => NextTarget;
  prescription: Prescription;
  /** The lift and the profile take the structure (`backOffsSuit`). */
  suits: boolean;
  /** The lifter's profile: whether its style runs the structure (`structureRuns`). */
  profile: UserProfile;
  /** The day leaves the lift top set plus back-offs. */
  day: boolean;
  exerciseId: string;
  history: readonly WorkoutRecord[];
  load: { step: number; floor: number | null; loading: Loading | null };
  units: UnitSystem;
}): { target: NextTarget; asked: Prescription; drop?: number; straight?: true } {
  const { read, prescription } = input;
  // Any lift that has run on the structure reads its top set's target too, for straight sets after
  // it (the third review of round N: a lift main one day and secondary the next); whether the
  // session the target reads ran so, `straightAfterTop` asks (the fifth review).
  if (input.suits || ranOnTopSet(input.exerciseId, input.history)) {
    const asked = { ...prescription, rir: topSetRir(prescription.rir) };
    // The top set reads past the lift's straight days at the back-offs' load (the fourth review),
    // a break measured from them (the fifth).
    const past = topSetRead(input.exerciseId, input.history, input.profile);
    const top = read(asked, past.history, past.sessionsAt);
    if (input.suits && input.day && targetTakesBackOffs(top)) {
      return { target: top, asked, drop: backOffDropFor(input.exerciseId, input.history) };
    }
    // A top set the place cannot load as asked takes the back-offs' load too (the third review).
    if (!STRAIGHT_MODES.includes(top.mode)) {
      const straight = straightAfterTop(top, prescription, input);
      if (straight) return { target: straight, asked: prescription, straight: true };
    }
    // Its own straight target reads past those days too (the sixth review: a micro-deload the top
    // set's misses called for was read off the full history, a straight day between breaking the
    // run, and asked the top set's load of every set).
    return {
      target: read(prescription, past.history, past.sessionsAt),
      asked: prescription,
    };
  }
  return { target: read(prescription, input.history), asked: prescription };
}
