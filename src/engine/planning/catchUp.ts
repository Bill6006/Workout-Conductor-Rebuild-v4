import { MUSCLE_IDS, type MuscleId } from '../../catalog/muscles/muscles';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { localDayKey, localWeekday } from '../../core/time/localDate';
import { shortfallOf, type WeekModel } from './weekModel';

/**
 * A catch-up on a day the lifter did not tick, and a second workout on a day already trained
 * (Maintenance 31, the owner's items 12 and 32; the evidence is docs/research/catch-up-and-second-
 * workout.md). Both are built from the week model: only what the week still lacks, each muscle's
 * main lift, a few sets each. What drives results is the weekly sets per muscle, and the first sets
 * for a muscle short of its week are worth the most (Pelland et al. 2026, PMID 41343037).
 */

/** The kinds, one list for the engine and the stored session (never a copy). */
export const CATCH_UP_KINDS = ['catch-up', 'second'] as const;
export type CatchUpKind = (typeof CATCH_UP_KINDS)[number];

/** Why a muscle is in: short of its week, or what is left of today's dose. */
export const CATCH_UP_REASONS = ['behind', 'remainder'] as const;

export interface CatchUpMuscle {
  muscle: MuscleId;
  /** Its working sets today. */
  sets: number;
  /** The fewest reps in reserve its sets are asked for. */
  minRir: number;
  /** Short of its week, or what is left of one session's dose for a muscle trained today. */
  why: (typeof CATCH_UP_REASONS)[number];
}

export interface CatchUpSpec {
  kind: CatchUpKind;
  /** The muscles the session is built from, in the order they lead. */
  muscles: CatchUpMuscle[];
  /** The muscles trained today that sit this one out (a second workout). */
  sitOut: MuscleId[];
}

/** The rule's numbers, each with its basis (docs/research/catch-up-and-second-workout.md). */
export const CATCH_UP = {
  /** Sets per muscle behind: the research's default; any number of 2 or more is supported. */
  SETS: 3,
  /** For a beginner, who takes more damage and recovers more slowly (Newton 2008; Damas 2016). */
  BEGINNER_SETS: 2,
  /** At least two sets an exercise (ACSM 2026, Currier et al., PMID 41843416). */
  MIN_SETS: 2,
  /**
   * The app's 48-hour rule: work near failure leaves a muscle below its best for 24 to 48 hours
   * (Refalo 2023, PMID 36752989; Pareja-Blanco 2020, PMID 30036284), and a hard repeat at 24 hours
   * added damage (Morin 2023). Unchanged by a catch-up (the owner's settled question 3).
   */
  RECENT_DAYS: 2,
  /** No set to failure in a catch-up; a beginner stays two or three short of it. */
  MIN_RIR: 1,
  BEGINNER_MIN_RIR: 2,
  /** A muscle trained today takes only its remainder, three or more short of failure. */
  REMAINDER_RIR: 3,
  /**
   * A catch-up is for a lifter in training: one with a workout in the last two weeks. A new lifter,
   * or one back after a break, has no week to catch up yet and gets the full session on any day
   * (product judgement: catching up restores the week's sets, and there are none to restore).
   */
  ACTIVE_DAYS: 14,
} as const;

/**
 * The least reserve a day off the plan leaves a lift, a catch-up or any second workout: none to
 * failure, a beginner two or three short of it (item 12; the twenty-first review of round M: the
 * floor for a lift for none of the day's muscles gave a beginner one).
 */
export function offPlanFloor(profile: Pick<UserProfile, 'experience'>): number {
  return profile.experience === 'beginner' ? CATCH_UP.BEGINNER_MIN_RIR : CATCH_UP.MIN_RIR;
}

/**
 * The muscles a catch-up or a second workout leaves alone: those trained today that sit out, and
 * every other muscle trained in the last 48 hours that the session is not built for. No lift in it
 * works one of them directly, and the coach offers none for one: work near failure leaves a muscle
 * below its best for 24 to 48 hours, a hard repeat within them adds damage (Morin 2023), and a
 * muscle trained today takes at most what is left of one session's dose. None for the usual plan,
 * a catch-up with nothing behind among it, nor once the full session is taken.
 */
export function restingMuscles(
  spec: CatchUpSpec | null | undefined,
  daysSinceMuscle: Partial<Record<MuscleId, number>>,
): Set<MuscleId> {
  if (!spec || (spec.kind === 'catch-up' && spec.muscles.length === 0)) return new Set();
  const built = new Set(spec.muscles.map((item) => item.muscle));
  return new Set([
    ...spec.sitOut,
    ...MUSCLE_IDS.filter(
      (muscle) =>
        !built.has(muscle) && (daysSinceMuscle[muscle] ?? Infinity) < CATCH_UP.RECENT_DAYS,
    ),
  ]);
}

/**
 * Whether a workout counts as one trained: a set of it done past the warm-ups. One ended with
 * nothing logged is no first workout of the day (the review of round M), nor the session a second
 * workout reads what is left of (the second review).
 */
export function trainedIn(record: Pick<WorkoutRecord, 'entries'>): boolean {
  return record.entries.some((entry) =>
    entry.sets.some((set) => set.completed && set.kind !== 'warmup'),
  );
}

/**
 * Which the day offers: a second workout on a day already trained (a workout begun today is in the
 * log), a catch-up on a day not ticked for a lifter in training, and neither otherwise.
 */
export function catchUpKind(
  profile: Pick<UserProfile, 'schedule'>,
  history: readonly WorkoutRecord[],
  now: string,
): CatchUpKind | null {
  const today = localDayKey(now);
  const trainedToday = history.some(
    (record) =>
      record.startedAt <= now && localDayKey(record.startedAt) === today && trainedIn(record),
  );
  if (trainedToday) return 'second';
  if (profile.schedule.availableDays.includes(localWeekday(now))) return null;
  // A lifter in training has trained in the last two weeks: a workout saved with nothing logged is
  // no training (the twenty-second review of round M: it offered a catch-up after a break).
  const recent = history.some(
    (record) =>
      record.startedAt <= now &&
      Date.parse(now) - Date.parse(record.startedAt) <= CATCH_UP.ACTIVE_DAYS * 86_400_000 &&
      trainedIn(record),
  );
  return recent ? 'catch-up' : null;
}

/**
 * The catch-up or second workout for the week as it stands, or one with no muscles when nothing
 * calls for it. `doseOf` is a muscle's usual sets in one of the plan's sessions: a catch-up never
 * gives a muscle more, and a muscle trained today takes only what is left of it.
 *
 * - A muscle short of its week (the sets done and still planned, under its target) leads, unless it
 *   was trained in the last 48 hours: largest share short first. Its sets: 3, or 2 for a beginner,
 *   never more than it is short nor its usual sets, and never fewer than 2.
 * - On a second workout, a muscle already trained today sits out, or, still short of its week,
 *   takes what is left of one session's dose at 3 or more in reserve. In the usual case, a full
 *   first session, nothing is left. A beginner's always sit out.
 */
export function catchUpSpec(
  week: WeekModel,
  profile: Pick<UserProfile, 'experience'>,
  kind: CatchUpKind,
  doseOf: (muscle: MuscleId) => number,
  /** A muscle's sets in today's own session, for what is left of it; its usual sets otherwise. */
  todayDoseOf: (muscle: MuscleId) => number = doseOf,
): CatchUpSpec {
  const beginner = profile.experience === 'beginner';
  const behind: (CatchUpMuscle & { share: number })[] = [];
  const remainders: (CatchUpMuscle & { share: number })[] = [];
  const sitOut: MuscleId[] = [];
  for (const muscle of MUSCLE_IDS) {
    const state = week.muscles[muscle];
    if (state.target <= 0) continue;
    const short = shortfallOf(state);
    const share = short / state.target;
    const dose = doseOf(muscle);
    // Trained today means sets for it directly; a muscle a lift only touched leads if it is behind
    // (the review of round M: "behind muscles that had no direct sets today").
    if (kind === 'second' && state.todayDirect > 0) {
      const left = Math.floor(Math.min(todayDoseOf(muscle) - state.today, short, CATCH_UP.SETS));
      // Trained in the 48 hours before today as well, it takes nothing more (the 48-hour rule).
      const recent = state.daysBefore !== null && state.daysBefore < CATCH_UP.RECENT_DAYS;
      if (beginner || recent || left < CATCH_UP.MIN_SETS) {
        sitOut.push(muscle);
      } else {
        remainders.push({
          muscle,
          sets: left,
          minRir: CATCH_UP.REMAINDER_RIR,
          why: 'remainder',
          share,
        });
      }
      continue;
    }
    if (state.daysSince !== null && state.daysSince < CATCH_UP.RECENT_DAYS) continue;
    // Never more than its usual sets in one session, today's indirect sets counted at half.
    const sets = Math.floor(
      Math.min(beginner ? CATCH_UP.BEGINNER_SETS : CATCH_UP.SETS, short, dose - state.today),
    );
    if (sets < CATCH_UP.MIN_SETS) continue;
    behind.push({
      muscle,
      sets,
      minRir: offPlanFloor(profile),
      why: 'behind',
      share,
    });
  }
  const order = (a: { share: number; muscle: MuscleId }, b: { share: number; muscle: MuscleId }) =>
    b.share - a.share || MUSCLE_IDS.indexOf(a.muscle) - MUSCLE_IDS.indexOf(b.muscle);
  return {
    kind,
    muscles: [...behind.sort(order), ...remainders.sort(order)].map(
      ({ muscle, sets, minRir, why }) => ({ muscle, sets, minRir, why }),
    ),
    sitOut,
  };
}
