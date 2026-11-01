import { requireExercise } from '../../catalog/exercises/catalog';
import { MUSCLE_IDS, type MuscleId } from '../../catalog/muscles/muscles';
import type { LocationProfile } from '../../core/validation/location';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { addLocalDays, localDayKey, localWeekday } from '../../core/time/localDate';
import type { LearnedResets } from '../learned/resets';
import {
  learnedWindows,
  recoveryWindows,
  tooSoonToday,
  windowsOfEach,
  type RecoveryWindow,
} from '../recovery/recovery';
import { goalWeights, INDIRECT_SET_WEIGHT, weeklyTargets } from '../volume/weeklyVolume';
import { generateWorkout, orderWords, splitFor } from '../workoutGenerator/generate';
import {
  allEntries,
  CATCH_UP_TEMPLATE_IDS,
  type DurationChoice,
  type SplitOrder,
} from '../workout/types';
import { expectedLength } from './expectedLengths';
import { copyOrder, keepingOrder, scheduleOf } from './orderKept';
import type { CoachFocus } from './focus';
import type { LastingSwap } from './lastingSwaps';
import { liftedAsPlanned, plannedWorkouts, type PlannedWorkout } from './weeklyPlan';

/**
 * The split's order across the lifter's days (Maintenance 38). The owner, 2026-10-31: "Use the best
 * available research and Workout Conductor's existing recovery/readiness model to decide
 * automatically. Keep my available training days fixed and reorder the split only when another
 * order is meaningfully better for recovery, performance, frequency, and my goals. If no ordering is
 * clearly better, keep the current split." The evidence: docs/research/split-order.md.
 *
 * - **The days** are the week ahead's, as the plan has them (`plannedWorkouts`): never moved. They
 *   are fixed only where the schedule ticks no more days than its sessions a week; with more, the
 *   lifter picks which to train, and no order is read.
 * - **The sessions** are the rotation's, the same templates in another order.
 * - **An order is read by the "too soon" check** the coach and the schedule card read (Maintenance
 *   33): on each day, a muscle the plan would work hard well inside its window, where its
 *   performance is still down (recovery, performance). The first day after the week, with the
 *   session the rotation gives it, only guards: no order crowds it to spare the week.
 * - **Meaningfully better:** no muscle comes back too soon more often, and at least one less often.
 *   Of several, the one that spares the goal's muscles most (goals), then the one that moves fewest
 *   days.
 * - **Confirmed** on the week built in that order: it must read better too, give every muscle at
 *   least its sessions in the rotation's week (frequency), and no muscle fewer sets where that leaves
 *   it short of its weekly target (goals), or the rotation stands. Each plan adapts to the days
 *   before it, so the same sessions in another order are not always the same sets.
 * - **Held for its week:** once a session of it is trained, the order holds through its days, so each
 *   session it moves is trained on the day it gives it (`heldOrder`).
 * - **The rotation keeps its own days:** a week trained through in an order is read by the rotation
 *   with each session on the day it gave it (`inRotationPlace`, generate.ts), so an order never
 *   changes which sessions the weeks after hold.
 * - **A coach focus holds today's session:** the lifter took it for today.
 */

/** How many of the best orders are built in full to confirm one; the rest are never needed. */
const CONFIRMED_AT_MOST = 3;

export interface SplitOrderInput {
  profile: UserProfile;
  location: LocationProfile | undefined;
  history: readonly WorkoutRecord[];
  now: string;
  resets?: LearnedResets | null;
  focus?: CoachFocus | null;
  swaps?: readonly LastingSwap[];
  /** Today's plan's own length (Maintenance 34): the Default without one. */
  todayLength?: DurationChoice;
}

/** Per muscle, on how many of the days ahead the plan would work it hard well inside its window. */
export type TooSoonDays = Map<MuscleId, number>;

/** An order read: its week, and the first day after it, with the session the rotation gives it. */
export interface OrderRead {
  week: TooSoonDays;
  after: TooSoonDays;
}

const total = (days: TooSoonDays) => [...days.values()].reduce((sum, count) => sum + count, 0);

const noMore = (candidate: TooSoonDays, current: TooSoonDays) =>
  MUSCLE_IDS.every((muscle) => (candidate.get(muscle) ?? 0) <= (current.get(muscle) ?? 0));

/**
 * Meaningfully better: in the week, no muscle too soon more often and at least one less often; and
 * the day after the week no worse for any muscle, so a week is never spared by crowding the next.
 * The day after only guards: its reading rests on the week beginning again, which the rotation may
 * not do.
 */
function better(candidate: OrderRead, current: OrderRead): boolean {
  return (
    noMore(candidate.week, current.week) &&
    total(candidate.week) < total(current.week) &&
    noMore(candidate.after, current.after)
  );
}

/** Every distinct order of these templates, the first `held` kept where they are. */
function* arrangements(templates: readonly string[], held: number): Generator<string[]> {
  const head = templates.slice(0, held);
  const rest = templates.slice(held);
  const counts = new Map<string, number>();
  for (const id of rest) counts.set(id, (counts.get(id) ?? 0) + 1);
  const kinds = [...counts.keys()];
  const chosen: string[] = [];
  function* walk(): Generator<string[]> {
    if (chosen.length === rest.length) {
      yield [...head, ...chosen];
      return;
    }
    for (const id of kinds) {
      const left = counts.get(id) ?? 0;
      if (left === 0) continue;
      counts.set(id, left - 1);
      chosen.push(id);
      yield* walk();
      chosen.pop();
      counts.set(id, left);
    }
  }
  yield* walk();
}

/**
 * Which planned session each day takes in this order: the k-th day of a template takes the k-th
 * session the rotation planned of it.
 */
function sessionsIn(order: readonly string[], templates: readonly string[]): number[] {
  const used = new Map<string, number>();
  return order.map((id) => {
    const nth = used.get(id) ?? 0;
    used.set(id, nth + 1);
    let seen = 0;
    for (let index = 0; index < templates.length; index += 1) {
      if (templates[index] !== id) continue;
      if (seen === nth) return index;
      seen += 1;
    }
    throw new Error(`no session of ${id} left`);
  });
}

const endOf = (window: RecoveryWindow) => Date.parse(window.at) + window.prior * 3_600_000;

/** The first day after the week ahead, and the session the rotation gives it. */
export interface DayAfter {
  date: string;
  workout: PlannedWorkout['workout'];
}

/**
 * The "too soon" days of the planned sessions in this order, each moved with its windows to the day
 * the order gives it (`tooSoonAhead` read without building the week again: its week is the days
 * `tooSoonAhead` finds): the windows that end latest, as `recoveryWindows` keeps them, from the
 * history and the days before. Then the first day after the week, with the session the rotation
 * gives it: the rotation keeps its own place, so that session is the same in every order, and an
 * order that moves the week's sessions round can crowd it (the review: with the lower day moved to
 * Monday, Wednesday's full body came 48 h after it). Read as the week begun again, it was missed.
 */
function estimate(
  sessions: readonly number[],
  planned: readonly PlannedWorkout[],
  own: readonly Map<MuscleId, RecoveryWindow>[],
  base: ReadonlyMap<MuscleId, RecoveryWindow>,
  next: DayAfter,
): OrderRead {
  const latest = new Map(base);
  const read = (into: TooSoonDays, workout: PlannedWorkout['workout'], date: string) => {
    for (const found of tooSoonToday(workout, latest, date)) {
      into.set(found.muscle, (into.get(found.muscle) ?? 0) + 1);
    }
  };
  const week: TooSoonDays = new Map();
  sessions.forEach((session, at) => {
    const date = (planned[at] as PlannedWorkout).date;
    read(week, (planned[session] as PlannedWorkout).workout, date);
    for (const [muscle, window] of own[session] ?? []) {
      const moved = { ...window, at: date };
      const before = latest.get(muscle);
      if (!before || endOf(moved) >= endOf(before)) latest.set(muscle, moved);
    }
  });
  const after: TooSoonDays = new Map();
  read(after, next.workout, next.date);
  return { week, after };
}

/** Per muscle, the week's sessions that give it a direct set, and its sets, a secondary's at half. */
interface WeekWork {
  sessions: Map<MuscleId, number>;
  sets: Map<MuscleId, number>;
}

/** The work a week as planned gives each muscle, counted as the week model counts it. */
function workOf(planned: readonly PlannedWorkout[]): WeekWork {
  const sessions = new Map<MuscleId, number>();
  const sets = new Map<MuscleId, number>();
  const add = (into: Map<MuscleId, number>, muscle: MuscleId, count: number) =>
    into.set(muscle, (into.get(muscle) ?? 0) + count);
  for (const day of planned) {
    const direct = new Set<MuscleId>();
    for (const entry of allEntries(day.workout.blocks)) {
      const working = entry.sets.filter((set) => set.kind === 'working').length;
      if (working === 0) continue;
      const exercise = requireExercise(entry.exerciseId);
      for (const muscle of exercise.primaryMuscles) {
        add(sets, muscle, working);
        direct.add(muscle);
      }
      for (const muscle of exercise.secondaryMuscles) {
        add(sets, muscle, working * INDIRECT_SET_WEIGHT);
      }
    }
    for (const muscle of direct) add(sessions, muscle, 1);
  }
  return { sessions, sets };
}

/**
 * No muscle trained on fewer days than in the rotation's weeks (frequency), and none given fewer
 * sets where that leaves it short of its weekly target (goals; the review: side delts went from two
 * sessions to one, and from 6 sets to 4.5 against a target of 10).
 */
function keeps(
  candidate: WeekWork,
  current: WeekWork,
  targets: Readonly<Record<MuscleId, number>>,
): boolean {
  return MUSCLE_IDS.every((muscle) => {
    const sets = candidate.sets.get(muscle) ?? 0;
    return (
      (candidate.sessions.get(muscle) ?? 0) >= (current.sessions.get(muscle) ?? 0) &&
      (sets >= (current.sets.get(muscle) ?? 0) - 1e-9 || sets >= targets[muscle])
    );
  });
}

/** A catch-up's or a second workout's template takes no place in the split's rotation (round M). */
const OFF_ROTATION: ReadonlySet<string> = new Set(Object.values(CATCH_UP_TEMPLATE_IDS));

/**
 * The order the lifter is training in this week (the review of Maintenance 38): once a session of it
 * is trained, it holds through its days, so each session it moves is trained on the day it gives it.
 * Read afresh each day, an order pushed the same session on again and again (a strength lifter on two
 * days trained no lower day in six weeks). It holds while the split's latest session was trained in
 * it, the schedule is the one it was read for (the re-check: saved on Tuesday for other days, an order
 * held its Thursday upper day and the week had no lower day), and each of its days after that session
 * is still a day the plan has, with the split's session: a day of it gone by untrained is none. Else
 * none, and the next order is read afresh.
 */
function heldOrder(
  profile: UserProfile,
  history: readonly WorkoutRecord[],
  now: string,
  planned: readonly PlannedWorkout[],
): SplitOrder | null {
  const latest = history
    .filter(
      (record) =>
        record.startedAt <= now &&
        !(typeof record.templateId === 'string' && OFF_ROTATION.has(record.templateId)),
    )
    .reduce<WorkoutRecord | null>(
      (last, record) => (!last || record.startedAt >= last.startedAt ? record : last),
      null,
    );
  const order = latest?.splitOrder;
  if (!latest || !order || order.schedule !== scheduleOf(profile)) return null;
  const trained = localDayKey(latest.startedAt);
  const ahead = order.days.filter((day) => day.day > trained);
  if (ahead.length === 0) return null;
  const days = new Set(planned.map((day) => localDayKey(day.date)));
  const split = new Set(splitFor(profile).map((template) => template.id));
  if (ahead.some((day) => !days.has(day.day) || !split.has(day.templateId))) return null;
  return copyOrder(order);
}

/** A week as planned, read as `estimate` reads an order of it, with the day after it. */
export function readWeek(
  planned: readonly PlannedWorkout[],
  history: readonly WorkoutRecord[],
  learned: ReturnType<typeof learnedWindows>,
  next: DayAfter,
): OrderRead {
  const own = windowsOfEach(
    history,
    planned.map((day) => liftedAsPlanned(day.date, day.workout)),
    { learned },
  );
  return estimate(
    planned.map((_, at) => at),
    planned,
    own,
    recoveryWindows(history, { learned }),
    next,
  );
}

/** A planned day as the record it would leave, keeping the order where it gives the day its session. */
const keptRecord = (day: PlannedWorkout, order: SplitOrder | null): WorkoutRecord =>
  keepingOrder(liftedAsPlanned(day.date, day.workout), order);

/**
 * The split's order for the week ahead: the one trained in this week while it holds, else one read
 * afresh where another order of its sessions is meaningfully better for recovery, or null where the
 * rotation's own stands: the days not fixed, fewer than two days to order, or no order better on the
 * week it builds (with nothing too soon, none can be).
 */
export function splitOrder(input: SplitOrderInput): SplitOrder | null {
  const { profile, location, history, now } = input;
  // With more days ticked than sessions a week, the days trained are the lifter's pick, not the
  // first ones ticked the plan reads: an order read there gave Wednesday the upper day Monday had,
  // and the week trained no lower day (the review of Maintenance 38).
  if (profile.schedule.availableDays.length > profile.schedule.weeklyFrequency) return null;
  const resets = input.resets ?? null;
  const todayLength = input.todayLength ?? 'default';
  const options = { focus: input.focus ?? null, swaps: input.swaps ?? [] };
  const planned = plannedWorkouts(profile, location, history, now, resets, todayLength, options);
  // The order trained in this week holds for it: read afresh, it would move a session it moved again.
  const held = heldOrder(profile, history, now, planned);
  if (held) return held;
  const templates = planned.map((day) => day.workout.templateId);
  if (planned.length < 2) return null;
  const learned = learnedWindows(history, resets);
  const own = windowsOfEach(
    history,
    planned.map((day) => liftedAsPlanned(day.date, day.workout)),
    { learned },
  );
  const base = recoveryWindows(history, { learned });
  // The first day after the week, with the session the rotation gives it after the week in this
  // order: in its own days, the rotation's next.
  const date = addLocalDays((planned[0] as PlannedWorkout).date, 7);
  const dayAfter = (week: readonly PlannedWorkout[], order: SplitOrder | null): DayAfter => ({
    date,
    workout: generateWorkout({
      profile,
      location,
      history: [...history, ...week.map((day) => keptRecord(day, order))],
      now: date,
      duration: expectedLength(
        history,
        localWeekday(date),
        now,
        profile.schedule.typicalDurationMinutes,
      ),
      resets,
      constraints: options.swaps.length > 0 ? { swaps: options.swaps } : {},
    }),
  });
  const next = dayAfter(planned, null);
  const current = estimate(
    planned.map((_, at) => at),
    planned,
    own,
    base,
    next,
  );
  const targets = weeklyTargets(profile);
  const work = workOf(planned);
  const weights = goalWeights(profile);
  const weighted = (read: OrderRead) =>
    [...read.week.entries()].reduce((sum, [muscle, count]) => sum + count * weights[muscle], 0);
  // A coach focus holds today's session; the days after it may still move.
  const kept = options.focus && planned[0]?.offset === 0 ? 1 : 0;
  const candidates: { order: string[]; weight: number; moved: number }[] = [];
  for (const order of arrangements(templates, kept)) {
    const days = estimate(sessionsIn(order, templates), planned, own, base, next);
    if (!better(days, current)) continue;
    candidates.push({
      order,
      weight: weighted(days),
      moved: order.filter((id, at) => id !== templates[at]).length,
    });
  }
  candidates.sort((a, b) => a.weight - b.weight || a.moved - b.moved);

  for (const candidate of candidates.slice(0, CONFIRMED_AT_MOST)) {
    const order: SplitOrder = {
      days: planned.map((day, at) => ({
        day: localDayKey(day.date),
        templateId: candidate.order[at] as string,
        was: templates[at] as string,
      })),
      spared: [],
      fewer: [],
    };
    const built = plannedWorkouts(profile, location, history, now, resets, todayLength, {
      ...options,
      order,
    });
    // The week built so reads better, and gives every muscle its sessions and its sets.
    const confirmed = readWeek(built, history, learned, dayAfter(built, order));
    if (!better(confirmed, current) || !keeps(workOf(built), work, targets)) continue;
    // What it spares, the goal's muscles first: those no longer worked hard too soon at all, and
    // those on fewer days (the review: a muscle still too soon on one day was said never to be).
    const after = (muscle: MuscleId) => confirmed.week.get(muscle) ?? 0;
    const before = (muscle: MuscleId) => current.week.get(muscle) ?? 0;
    const byWeight = (a: MuscleId, b: MuscleId) => weights[b] - weights[a];
    return {
      ...order,
      schedule: scheduleOf(profile),
      spared: MUSCLE_IDS.filter((muscle) => before(muscle) > 0 && after(muscle) === 0).sort(
        byWeight,
      ),
      fewer: MUSCLE_IDS.filter(
        (muscle) => after(muscle) > 0 && after(muscle) < before(muscle),
      ).sort(byWeight),
    };
  }
  return null;
}

/**
 * What Plan says of the split's order (Maintenance 38) while a day it moved is still ahead: the
 * muscles it keeps out of their windows, and those it brings back inside them on fewer days. Null
 * where no day of `shown` takes another template.
 */
export function splitOrderLine(
  order: SplitOrder,
  shown: readonly { date: string; templateId: string }[],
): string | null {
  const moved = shown.some((session) =>
    order.days.some(
      (day) =>
        day.day === localDayKey(session.date) &&
        day.templateId !== day.was &&
        day.templateId === session.templateId,
    ),
  );
  const words = moved ? orderWords(order) : null;
  return words ? `In this order ${words}.` : null;
}
