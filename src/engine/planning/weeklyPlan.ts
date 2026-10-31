import { requireExercise } from '../../catalog/exercises/catalog';
import { MUSCLE_IDS, muscleName, type MuscleId } from '../../catalog/muscles/muscles';
import type { LocationProfile } from '../../core/validation/location';
import type { UserProfile, Weekday } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { addLocalDays, localDayKey, localWeekday } from '../../core/time/localDate';
import type { LearnedResets } from '../learned/resets';
import {
  hoursSince,
  learnedWindows,
  recoveryWindows,
  tooSoonToday,
  type RecoveryContext,
} from '../recovery/recovery';
import { computeExposure } from '../volume/weeklyVolume';
import { allEntries, pushMarkOf, type DurationChoice } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { expectedLength } from './expectedLengths';

/**
 * Weekly planning: the upcoming sessions the generator would produce on the
 * user's available days, rotated as if each one were logged, plus a recovery
 * balance per muscle. Pure and cheap; nothing is stored.
 */

export interface PlannedSession {
  date: string;
  weekday: Weekday;
  label: string;
  templateId: string;
  title: string;
  focus: MuscleId[];
  /** Every muscle the session trains directly. */
  muscles: MuscleId[];
  today: boolean;
}

function dayLabel(iso: string, today: boolean): string {
  if (today) return 'Today';
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function syntheticRecord(
  date: string,
  workout: ReturnType<typeof generateWorkout>,
): WorkoutRecord {
  return {
    id: `planned-${date}`,
    startedAt: date,
    completedAt: date,
    locationId: workout.locationId,
    templateId: workout.templateId,
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    // What its time fit cut: the plans after it spare those muscles (Maintenance 34).
    ...(workout.fitCut ? { fitCut: [...workout.fitCut] } : {}),
    entries: allEntries(workout.blocks).map((entry) => ({
      exerciseId: entry.exerciseId,
      // The week's extra exposure of a lift to push counts as one in the days after it (item 44).
      ...(pushMarkOf(entry) ? { push: pushMarkOf(entry) } : {}),
      sets: entry.sets
        .filter((set) => set.kind === 'working')
        .map((set) => ({
          kind: 'working' as const,
          reps: set.targetReps[0],
          weight: null,
          rir: null,
          completed: true,
        })),
    })),
  };
}

/** A day of the week ahead as the plan would build it, at the length the lifter trains it. */
export interface PlannedWorkout {
  date: string;
  weekday: Weekday;
  /** Days from today: 0 is today. */
  offset: number;
  workout: ReturnType<typeof generateWorkout>;
}

/**
 * The sessions of the week ahead as the plan would build them (the days ticked from today, up to
 * the sessions a week), each built on the ones before it.
 */
export function plannedWorkouts(
  profile: UserProfile,
  location: LocationProfile | undefined,
  history: readonly WorkoutRecord[],
  now: string,
  resets: LearnedResets | null = null,
  /** Today's plan's own length (Maintenance 34): the Default without one. */
  todayLength: DurationChoice = 'default',
): PlannedWorkout[] {
  const available = new Set(profile.schedule.availableDays);
  // The device's day: a workout counts on the day it began (Maintenance 28, item 1).
  const trainedToday = history.some((record) => localDayKey(record.startedAt) === localDayKey(now));
  const planned: PlannedWorkout[] = [];
  let simulated: WorkoutRecord[] = [...history];
  for (
    let offset = 0;
    offset < 7 && planned.length < profile.schedule.weeklyFrequency;
    offset += 1
  ) {
    const date = addLocalDays(now, offset);
    const weekday = localWeekday(date);
    if (!available.has(weekday)) continue;
    if (offset === 0 && trainedToday) continue;
    // At the length the lifter trains that weekday (Maintenance 34, the approved proposal: "the week
    // ahead, and the coach's 'a later session will cover it' check, use your expected length for
    // each day instead of Default"); today's at its own.
    const workout = generateWorkout({
      profile,
      location,
      history: simulated,
      now: date,
      duration:
        offset === 0
          ? todayLength
          : expectedLength(history, weekday, now, profile.schedule.typicalDurationMinutes),
      resets,
    });
    planned.push({ date, weekday, offset, workout });
    simulated = [...simulated, syntheticRecord(date, workout)];
  }
  return planned;
}

/** The next planned sessions from today across the coming week. */
export function planWeek(
  profile: UserProfile,
  location: LocationProfile | undefined,
  history: readonly WorkoutRecord[],
  now: string,
  /** What the lifter reset (Maintenance 27, item 47): the week reads as today's plan does. */
  resets: LearnedResets | null = null,
  /**
   * Today's plan's own length (Maintenance 34; the review: the Plan screen's Today ran at the
   * Default while today's plan ran at 15 minutes): the Default without one.
   */
  todayLength: DurationChoice = 'default',
): PlannedSession[] {
  const sessions: PlannedSession[] = [];
  for (const { date, weekday, offset, workout } of plannedWorkouts(
    profile,
    location,
    history,
    now,
    resets,
    todayLength,
  )) {
    const counts = new Map<MuscleId, number>();
    for (const entry of allEntries(workout.blocks)) {
      for (const muscle of entry.chosenFor) counts.set(muscle, (counts.get(muscle) ?? 0) + 1);
    }
    const focus = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([muscle]) => muscle);
    const muscles = [
      ...new Set(
        allEntries(workout.blocks).flatMap(
          (entry) => requireExercise(entry.exerciseId).primaryMuscles,
        ),
      ),
    ];
    sessions.push({
      date,
      weekday,
      label: dayLabel(date, offset === 0),
      templateId: workout.templateId,
      title: workout.title,
      focus,
      muscles,
      today: offset === 0,
    });
  }
  return sessions;
}

/**
 * The days of the week ahead whose plan would work a muscle hard well inside its window (Maintenance
 * 33, the "too soon" check, `tooSoonToday`): the windows from the history and the planned days
 * before it, each lifted at its targets' reserve, moved by what the lifter's own sessions taught
 * (the planned days teach nothing). The schedule card reads the same check.
 */
export function tooSoonAhead(
  planned: readonly PlannedWorkout[],
  history: readonly WorkoutRecord[],
  resets: LearnedResets | null = null,
): { weekday: Weekday; muscles: MuscleId[] }[] {
  const found: { weekday: Weekday; muscles: MuscleId[] }[] = [];
  const learned = learnedWindows(history, resets);
  let past: readonly WorkoutRecord[] = history;
  for (const day of planned) {
    const windows = recoveryWindows(past, { now: day.date, learned });
    const soon = tooSoonToday(day.workout, windows, day.date);
    if (soon.length > 0)
      found.push({ weekday: day.weekday, muscles: soon.map((item) => item.muscle) });
    past = [...past, liftedAsPlanned(day.date, day.workout)];
  }
  return found;
}

/** A planned day as the record it would leave, every working set at its target's reserve. */
function liftedAsPlanned(date: string, workout: ReturnType<typeof generateWorkout>): WorkoutRecord {
  const record = syntheticRecord(date, workout);
  return {
    ...record,
    entries: allEntries(workout.blocks).map((entry) => ({
      exerciseId: entry.exerciseId,
      sets: entry.sets
        .filter((set) => set.kind === 'working')
        .map((set) => ({
          kind: 'working' as const,
          reps: set.targetReps[0],
          weight: null,
          rir: set.targetRir,
          completed: true,
        })),
    })),
  };
}

export type RecoveryState = 'recovering' | 'ready' | 'fresh';

export interface RecoveryBalanceRow {
  muscle: MuscleId;
  name: string;
  daysSince: number | null;
  /** Hours its window still runs, while it is recovering (Maintenance 33). */
  hoursLeft: number | null;
  state: RecoveryState;
}

/**
 * Which muscles are still recovering, ready or fresh (Maintenance 33, `recoveryWindows`): recovering
 * while inside the window its last hard work set, ready once past it within four days of training,
 * fresh after that or with nothing logged. Light work sets no window: a muscle trained lightly is
 * ready.
 */
export function recoveryBalance(
  history: readonly WorkoutRecord[],
  now: string,
  context: Omit<RecoveryContext, 'now'> = {},
): RecoveryBalanceRow[] {
  const exposure = computeExposure(history, now);
  const windows = recoveryWindows(history, { ...context, now });
  return MUSCLE_IDS.map((muscle) => {
    const days = exposure.daysSinceMuscle[muscle] ?? null;
    const window = windows.get(muscle);
    const left = window ? window.hours - hoursSince(window, now) : 0;
    const state: RecoveryState =
      left > 0 ? 'recovering' : days === null || days >= 4 ? 'fresh' : 'ready';
    return {
      muscle,
      name: muscleName(muscle),
      daysSince: days === null ? null : Math.round(days * 10) / 10,
      hoursLeft: left > 0 ? Math.ceil(left) : null,
      state,
    };
  }).sort((a, b) => (a.daysSince ?? 99) - (b.daysSince ?? 99) || a.name.localeCompare(b.name));
}

export function describeFocus(focus: readonly MuscleId[]): string {
  return focus.map(muscleName).join(', ');
}

export function exerciseNameOf(id: string): string {
  return requireExercise(id).name;
}
