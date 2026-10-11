import { allExercises, getExercise } from '../../catalog/exercises/catalog';
import { isHold, type CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import type { MuscleId } from '../../catalog/muscles/muscles';
import {
  addLocalDays,
  localDaysBetween,
  localWeekKey,
  localWeekday,
} from '../../core/time/localDate';
import type { UnitSystem, UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { convertWeight } from '../progression/maxes';
import { INDIRECT_SET_WEIGHT } from '../volume/weeklyVolume';
import { resolveStyle } from './styleAdvice';

/**
 * A lift to push (Maintenance 27, the owner's item 44, docs/research/push-lift.md): one main lift
 * and a target max. It gets an extra weekly exposure, leads every session it is in, and the other
 * work for its muscles holds. Every number here is from the research doc:
 *
 * - One more exposure a week while the lift has fewer than three, never more than three (two from
 *   age 60): the largest step is from one to two, with no detectable gain past about three
 *   (Pelland et al. 2026; Kneffel et al. 2021 for older adults).
 * - The extra exposure: two to three sets in the style's strength range, never to failure (ACSM
 *   2026; Robinson et al. 2024; Morán-Navarro et al. 2017).
 * - At least two days after the lift's last session (48 hours), three after one of five or more
 *   sets or one taken to failure (72; Morán-Navarro 2017; Raastad and Hallén 2000; Bartolomei et
 *   al. 2017), counted on the device's calendar from the day each workout began, so Monday,
 *   Wednesday and Friday at the same hour are two days apart whatever the clock says (the review);
 *   and not the day before a session that has the lift's own place: the extra waits rather than
 *   crowd it.
 * - Six to nine weekly sets of the lift, never over ten (Ralston et al. 2017; Enes et al. 2024):
 *   with an extra exposure in its week, each of its sessions takes at most three sets, and the
 *   extra takes two once the week has six, so most of the extra's sets come from its other days.
 *   Lean-down adds none: two a session (Roth et al. 2023).
 * - The extra never takes one of its muscles over twenty sets in any seven days, where the
 *   evidence for more turns mixed (Baz-Valle et al. 2022): the days before it as logged, and the
 *   sessions the schedule has in the six days after it as the plan would build them (the review).
 *   On the extra's day, sets of an isolation lift for it come off first, down to one (Spiering et
 *   al. 2021: one set keeps what was built), then the extra's own, down to two. An extra that
 *   would still take a muscle over twenty waits.
 */
export const PUSH_LIFT = {
  /** Exposures a week the push never goes past, and from what age two. */
  MAX_EXPOSURES: 3,
  MAX_EXPOSURES_OLDER: 2,
  OLDER_AGE: 60,
  /** A same-family lift counts half an exposure (Pelland 2026's fractional count). */
  VARIATION_SHARE: 0.5,
  /** Calendar days after the lift's last session before the extra exposure (48 hours). */
  SPACING_DAYS: 2,
  /** After a session of this many working sets, or one taken to failure: three days (72 hours). */
  HEAVY_SETS: 5,
  SPACING_DAYS_HEAVY: 3,
  /** Days before the lift takes its own place again: the day after its last session, it gives way. */
  NATURAL_DAYS: 2,
  /** The extra exposure's sets, and two once the week holds six or more, or under Lean-down. */
  EXTRA_SETS: 3,
  EXTRA_SETS_FEWER: 2,
  FEWER_FROM: 6,
  /** With an extra in its week, each session of the lift takes at most this many sets. */
  SESSION_SETS: 3,
  /** Under Lean-down, which adds no sets: two a session. */
  LEAN_SETS: 2,
  /** The most sets of the lift any week holds. */
  MAX_WEEK_SETS: 10,
  /**
   * The extra exposure waits when the next session comes sooner than this many days and has a
   * place for the lift: the lift trains there, and the extra would crowd it.
   */
  NEXT_SESSION_DAYS: 2,
  /** Reps in reserve the lift keeps at least, in every session of the push: never to failure. */
  MIN_RIR: 1,
  /** The weekly sets the extra never takes one of its muscles past. */
  CAP_SETS: 20,
  /** The fewest working sets an isolation lift keeps when the cap takes sets off it. */
  ISOLATION_FLOOR: 1,
} as const;

export type PushLift = NonNullable<UserProfile['pushLift']>;

/**
 * A lift a push can be on: a main multi-joint lift, with a strength range and a load the app
 * records, so its max can be read (Grgic et al. 2018: frequency's effect on strength was in
 * multi-joint lifts).
 */
export function canPush(exercise: CatalogExercise): boolean {
  return (
    exercise.compound &&
    exercise.repRanges.strength !== undefined &&
    exercise.strengthSuitability >= 2 &&
    exercise.load !== 'bodyweight' &&
    exercise.load !== 'band' &&
    !isHold(exercise)
  );
}

/** Every lift a push can be on, by name. */
export function pushableLifts(): CatalogExercise[] {
  return allExercises()
    .filter(canPush)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The profile's push, when it names a lift a push can be on. */
export function activePush(
  profile: Pick<UserProfile, 'pushLift'> | null | undefined,
): { push: PushLift; exercise: CatalogExercise } | null {
  const push = profile?.pushLift;
  if (!push) return null;
  const exercise = getExercise(push.exerciseId);
  return exercise && canPush(exercise) ? { push, exercise } : null;
}

/** One session of the lift: when, its working sets, whether one went to failure, and its mark. */
export interface PushExposure {
  at: string;
  sets: number;
  failure: boolean;
  extra: boolean;
}

/** The day a workout counts on: the one it began (one finished after midnight is its start's). */
const dayOf = (record: WorkoutRecord) => record.startedAt;

/** The sessions with a completed working set of the lift, oldest first. */
export function exposuresOf(history: readonly WorkoutRecord[], exerciseId: string): PushExposure[] {
  const out: PushExposure[] = [];
  for (const record of history) {
    const entries = record.entries.filter((entry) => entry.exerciseId === exerciseId);
    const working = entries.flatMap((entry) =>
      entry.sets.filter((set) => set.kind === 'working' && set.completed),
    );
    if (working.length === 0) continue;
    out.push({
      at: dayOf(record),
      sets: working.length,
      failure: working.some((set) => set.rir === 0),
      extra: entries.some((entry) => entry.push === 'extra'),
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** The lift's last seven days, and its calendar week. */
export interface PushWeek {
  /** Sessions of the lift itself in the last seven days. */
  exact: number;
  /** Those, and half for each other session with a lift of its family. */
  fractional: number;
  /** Extra exposures among them. */
  extras: number;
  /** Extra exposures in this calendar week (Monday to Sunday, on the device). */
  extrasThisWeek: number;
  /** The plan's own sessions of the lift a week, from the last fourteen days (extras aside). */
  ownPerWeek: number;
  /** Its working sets in the last seven days. */
  sets: number;
  /** Its last session, at any time before now. */
  last: PushExposure | null;
  /** Calendar days since it: 0 today, 1 yesterday. */
  daysSince: number | null;
}

export function pushWeek(
  history: readonly WorkoutRecord[],
  exercise: CatalogExercise,
  now: string,
): PushWeek {
  const at = Date.parse(now);
  // Seven days is today and the six calendar days before it, on the device (the review of item 44).
  const back = (iso: string) => localDaysBetween(iso, now);
  const before = exposuresOf(history, exercise.id).filter((one) => Date.parse(one.at) <= at);
  const week = before.filter((one) => back(one.at) < 7);
  const family = history.filter((record) => {
    if (Date.parse(dayOf(record)) > at || back(dayOf(record)) >= 7) return false;
    if (record.entries.some((entry) => entry.exerciseId === exercise.id)) return false;
    return record.entries.some(
      (entry) =>
        getExercise(entry.exerciseId)?.progressionFamily === exercise.progressionFamily &&
        entry.sets.some((set) => set.kind === 'working' && set.completed),
    );
  }).length;
  const thisWeek = localWeekKey(now);
  const own = before.filter((one) => !one.extra && back(one.at) < 14);
  const last = before.at(-1) ?? null;
  return {
    exact: week.length,
    fractional: week.length + PUSH_LIFT.VARIATION_SHARE * family,
    extras: week.filter((one) => one.extra).length,
    extrasThisWeek: before.filter((one) => one.extra && localWeekKey(one.at) === thisWeek).length,
    ownPerWeek: own.length / 2,
    sets: week.reduce((sum, one) => sum + one.sets, 0),
    last,
    daysSince: last ? back(last.at) : null,
  };
}

/** Today for the push: whether the lift takes its own place, and the extra exposure if due. */
export interface PushDay {
  exercise: CatalogExercise;
  push: PushLift;
  /**
   * The lift may take a place the plan has for it today. When not, it gives the place up: the
   * slot takes another lift, so the push never adds a session the week has no room for.
   */
  natural: boolean;
  /** The most working sets it takes in that place today (the plan's own when fewer). */
  naturalSets: number;
  /** The extra exposure's working sets, when one is due today. */
  extraSets: number | null;
  /** Why no extra today, when none is due. */
  noExtra: string | null;
  week: PushWeek;
}

/** The most sessions of the lift in a week, by age. */
export function maxExposures(profile: Pick<UserProfile, 'age'>): number {
  return (profile.age ?? 0) >= PUSH_LIFT.OLDER_AGE
    ? PUSH_LIFT.MAX_EXPOSURES_OLDER
    : PUSH_LIFT.MAX_EXPOSURES;
}

/**
 * The push today, or null with no push or in a deload week: the deload applies to the lift as to
 * the rest, so the push pauses.
 */
export function pushDay(input: {
  profile: UserProfile;
  history: readonly WorkoutRecord[];
  now: string;
  deload: boolean;
}): PushDay | null {
  const active = activePush(input.profile);
  if (!active || input.deload) return null;
  const { push, exercise } = active;
  const week = pushWeek(input.history, exercise, input.now);
  const lean = resolveStyle(input.profile) === 'lean-down';
  const most = maxExposures(input.profile);
  const since = week.daysSince;
  // Its own place too keeps to the week's most sessions, and gives way the day after the lift.
  const natural = week.exact < most && (since === null || since >= PUSH_LIFT.NATURAL_DAYS);
  // A week that has the extra, or three sessions with today's: each session of the lift takes at
  // most three sets, two under Lean-down. Any week holds no more than ten.
  const shared = week.extras > 0 || week.exact + 1 >= PUSH_LIFT.MAX_EXPOSURES;
  const room = Math.max(PUSH_LIFT.LEAN_SETS, PUSH_LIFT.MAX_WEEK_SETS - week.sets);
  const naturalSets = shared
    ? Math.min(lean ? PUSH_LIFT.LEAN_SETS : PUSH_LIFT.SESSION_SETS, room)
    : room;

  const spacing =
    week.last && (week.last.sets >= PUSH_LIFT.HEAVY_SETS || week.last.failure)
      ? PUSH_LIFT.SPACING_DAYS_HEAVY
      : PUSH_LIFT.SPACING_DAYS;
  const wanted =
    lean || week.sets >= PUSH_LIFT.FEWER_FROM ? PUSH_LIFT.EXTRA_SETS_FEWER : PUSH_LIFT.EXTRA_SETS;
  const sets = Math.min(wanted, PUSH_LIFT.MAX_WEEK_SETS - week.sets);
  // One more session a week while the plan gives the lift fewer than three of its own: a lift it
  // already trains about three times a week takes none, which would only crowd its own sessions.
  const noExtra =
    week.extrasThisWeek > 0
      ? 'this week already had its extra session'
      : week.ownPerWeek > most - 1
        ? `the plan already gives it about ${Math.round(week.ownPerWeek)} sessions a week`
        : week.exact >= most || week.fractional >= most
          ? `it had ${week.exact} ${week.exact === 1 ? 'session' : 'sessions'} in the last seven days`
          : since !== null && since < spacing
            ? `its last session was ${since === 0 ? 'today' : since === 1 ? 'yesterday' : `${since} days ago`}, and it takes ${spacing} days between sessions`
            : sets < PUSH_LIFT.EXTRA_SETS_FEWER
              ? `its last seven days already hold ${week.sets} sets`
              : null;
  return {
    exercise,
    push,
    natural,
    naturalSets,
    extraSets: noExtra === null ? sets : null,
    noExtra,
    week,
  };
}

/**
 * Days from today to the next session as the schedule has it: the next of a fixed week's days,
 * or with more days open than sessions, the week shared out evenly.
 */
export function daysToNextSession(profile: Pick<UserProfile, 'schedule'>, now: string): number {
  const { availableDays, weeklyFrequency } = profile.schedule;
  if (availableDays.length > weeklyFrequency) return 7 / weeklyFrequency;
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    if (availableDays.includes(localWeekday(addLocalDays(now, ahead)))) return ahead;
  }
  return 7;
}

/**
 * The days ahead, within `within`, on which the schedule has a session: a fixed week's own days, or
 * with more days open than sessions, the week shared out evenly (as `daysToNextSession` reads it).
 */
export function sessionDaysAhead(
  profile: Pick<UserProfile, 'schedule'>,
  now: string,
  within = 6,
): number[] {
  const { availableDays, weeklyFrequency } = profile.schedule;
  if (availableDays.length > weeklyFrequency) {
    const every = 7 / weeklyFrequency;
    const out: number[] = [];
    for (let at = every; Math.round(at) <= within; at += every) out.push(Math.round(at));
    return [...new Set(out)];
  }
  const out: number[] = [];
  for (let ahead = 1; ahead <= within; ahead += 1) {
    if (availableDays.includes(localWeekday(addLocalDays(now, ahead)))) out.push(ahead);
  }
  return out;
}

/** Reps in reserve for a set of the lift while it is pushed: never to failure. */
export function pushRir(rir: number): number {
  return Math.max(PUSH_LIFT.MIN_RIR, rir);
}

/** The push's target in the lifter's units, as the plan says it. */
export function pushTargetText(push: PushLift, units: UnitSystem): string {
  return `${Math.round(convertWeight(push.target, push.units, units))} ${units}`;
}

const EXTRA_TAIL = ', heavy and short of failure (Pelland et al. 2026).';
/** Under Light weights the extra is in its own longer range: short of failure, not heavy. */
const EXTRA_TAIL_LIGHT = ', short of failure (Pelland et al. 2026).';
const LEAD_TAIL = ' goes first, where a lift gains most (Nunes et al. 2021).';

/**
 * The plan's line on the lift to push: it leads while it comes first; moved later by hand it is
 * still the lift pushed, and the line says so, as the main lift's does (Maintenance 25).
 */
export function pushLine(
  name: string,
  target: string,
  extra: boolean,
  leads: boolean,
  heavy = true,
): string {
  if (extra) {
    return `${name} ${leads ? 'leads:' : 'is'} the week's extra session of the lift you are pushing to ${target}${heavy ? EXTRA_TAIL : EXTRA_TAIL_LIGHT}`;
  }
  return leads
    ? `${name} leads: the lift you are pushing to ${target}${LEAD_TAIL}`
    : `${name} is the lift you are pushing to ${target}.`;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PUSH_LINES: { pattern: RegExp; extra: boolean; heavy?: boolean }[] = [
  {
    pattern: new RegExp(
      `^(.+?) (?:leads:|is) the week's extra session of the lift you are pushing to (.+?)${escape(EXTRA_TAIL)}$`,
    ),
    extra: true,
  },
  {
    pattern: new RegExp(
      `^(.+?) (?:leads:|is) the week's extra session of the lift you are pushing to (.+?)${escape(EXTRA_TAIL_LIGHT)}$`,
    ),
    extra: true,
    heavy: false,
  },
  {
    pattern: new RegExp(`^(.+?) leads: the lift you are pushing to (.+?)${escape(LEAD_TAIL)}$`),
    extra: false,
  },
  { pattern: /^(.+?) is the lift you are pushing to (.+?)\.$/, extra: false },
];

/** The lift, target and kind a push line names, or null for any other line. */
export function parsePushLine(
  line: string,
): { name: string; target: string; extra: boolean; heavy: boolean } | null {
  for (const { pattern, extra, heavy } of PUSH_LINES) {
    const match = pattern.exec(line);
    if (match) {
      return { name: match[1] as string, target: match[2] as string, extra, heavy: heavy ?? true };
    }
  }
  return null;
}

/** A lift's work in today's plan, as the cap counts it. */
export interface PlannedWork {
  id: string;
  exerciseId: string;
  workingSets: number;
  /** Drop sets after them: sets in the week as the log counts them, never trimmed here. */
  dropSets?: number;
  /** Whether its sets may come off: an isolation lift the lifter did not pick, nothing logged. */
  trimmable: boolean;
}

/**
 * A muscle's sets in planned work, a drop set counted as the log and the week's volume count it
 * (the review of item 44): a primary muscle's set counts 1, others half.
 */
function muscleIn(
  work: readonly { exerciseId: string; workingSets: number; dropSets?: number }[],
  muscle: MuscleId,
) {
  return work.reduce((sum, one) => {
    const exercise = getExercise(one.exerciseId);
    if (!exercise) return sum;
    const sets = one.workingSets + (one.dropSets ?? 0);
    if (exercise.primaryMuscles.includes(muscle)) return sum + sets;
    return exercise.secondaryMuscles.includes(muscle) ? sum + sets * INDIRECT_SET_WEIGHT : sum;
  }, 0);
}

/**
 * A muscle's logged sets from `daysBack` calendar days before now to now, as the device counts
 * days: a primary muscle's set counts 1, others half.
 */
function muscleSince(
  history: readonly WorkoutRecord[],
  muscle: MuscleId,
  now: string,
  daysBack: number,
): number {
  const at = Date.parse(now);
  let sets = 0;
  for (const record of history) {
    const back = localDaysBetween(dayOf(record), now);
    if (Date.parse(dayOf(record)) > at || back < 0 || back > daysBack) continue;
    for (const entry of record.entries) {
      const exercise = getExercise(entry.exerciseId);
      if (!exercise) continue;
      const count = entry.sets.filter((set) => set.completed && set.kind !== 'warmup').length;
      if (exercise.primaryMuscles.includes(muscle)) sets += count;
      else if (exercise.secondaryMuscles.includes(muscle)) sets += count * INDIRECT_SET_WEIGHT;
    }
  }
  return sets;
}

/** What the cap does to the extra exposure's day. */
export interface PushCap {
  /** Working sets that come off, by entry: isolation lifts for the muscles, then the extra. */
  trims: Map<string, number>;
  /** Muscles the extra would still take further over their cap: with any, the extra waits. */
  over: MuscleId[];
}

/** A session the schedule has ahead of the extra's day, as the plan would build it. */
export interface WorkAhead {
  /** Calendar days after today, one to six. */
  day: number;
  work: readonly { exerciseId: string; workingSets: number; dropSets?: number }[];
}

/**
 * On the extra exposure's day, keeping the lift's muscles under `CAP_SETS` in every seven days the
 * extra is in: the logged days before it and the sessions `ahead` of it (the review of item 44).
 * Sets come off an isolation lift for the muscle first, down to one each, then off the extra
 * itself, down to two, never more than the extra adds. A muscle the extra would still take over
 * the cap is named, and the extra waits.
 */
export function pushCap(input: {
  lift: CatalogExercise;
  extraId: string;
  extraSets: number;
  planned: readonly PlannedWork[];
  history: readonly WorkoutRecord[];
  now: string;
  ahead?: readonly WorkAhead[];
}): PushCap {
  const trims = new Map<string, number>();
  const over: MuscleId[] = [];
  const planned = input.planned.some((work) => work.id === input.extraId)
    ? input.planned
    : [
        ...input.planned,
        {
          id: input.extraId,
          exerciseId: input.lift.id,
          workingSets: input.extraSets,
          trimmable: false,
        },
      ];
  const setsLeft = new Map(planned.map((work) => [work.id, work.workingSets]));
  const take = (id: string) => {
    setsLeft.set(id, (setsLeft.get(id) ?? 0) - 1);
    trims.set(id, (trims.get(id) ?? 0) + 1);
  };
  for (const muscle of input.lift.primaryMuscles) {
    const today = planned.reduce((sum, work) => {
      const exercise = getExercise(work.exerciseId);
      if (!exercise) return sum;
      const sets = (setsLeft.get(work.id) ?? 0) + (work.dropSets ?? 0);
      if (exercise.primaryMuscles.includes(muscle)) return sum + sets;
      return exercise.secondaryMuscles.includes(muscle) ? sum + sets * INDIRECT_SET_WEIGHT : sum;
    }, 0);
    const cap = PUSH_LIFT.CAP_SETS;
    // Every seven days with today in them: the days before as logged, the sessions after as
    // planned. Today's sets are in each, so the fullest of the rest decides.
    const around = Math.max(
      ...Array.from(
        { length: 7 },
        (_, after) =>
          muscleSince(input.history, muscle, input.now, 6 - after) +
          (input.ahead ?? [])
            .filter((session) => session.day <= after)
            .reduce((sum, session) => sum + muscleIn(session.work, muscle), 0),
      ),
    );
    // What the extra adds to this muscle that has not already been given back.
    const given = trims.get(input.extraId) ?? 0;
    let excess = Math.min(input.extraSets - given, around + today - cap);
    if (excess <= 0) continue;
    const isolation = planned.filter((work) => {
      const exercise = getExercise(work.exerciseId);
      return (
        work.trimmable &&
        work.id !== input.extraId &&
        exercise !== undefined &&
        !exercise.compound &&
        exercise.primaryMuscles.includes(muscle)
      );
    });
    let progress = true;
    while (excess > 0 && progress) {
      progress = false;
      for (const work of isolation) {
        if (excess <= 0) break;
        if ((setsLeft.get(work.id) ?? 0) <= PUSH_LIFT.ISOLATION_FLOOR) continue;
        take(work.id);
        excess -= 1;
        progress = true;
      }
    }
    while (excess > 0 && (setsLeft.get(input.extraId) ?? 0) > PUSH_LIFT.EXTRA_SETS_FEWER) {
      take(input.extraId);
      excess -= 1;
    }
    if (excess > 0) over.push(muscle);
  }
  return { trims, over };
}
