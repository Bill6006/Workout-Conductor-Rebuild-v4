import { requireExercise } from '../../catalog/exercises/catalog';
import { MUSCLE_IDS, muscleName, type MuscleId } from '../../catalog/muscles/muscles';
import type { LocationProfile } from '../../core/validation/location';
import type { UserProfile, Weekday } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { computeExposure } from '../volume/weeklyVolume';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';

/**
 * Weekly planning: the upcoming sessions the generator would produce on the
 * user's available days, rotated as if each one were logged, plus a recovery
 * balance per muscle. Pure and cheap; nothing is stored.
 */

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_MS = 86_400_000;

export interface PlannedSession {
  date: string;
  weekday: Weekday;
  label: string;
  templateId: string;
  title: string;
  focus: MuscleId[];
  today: boolean;
}

function weekdayOf(iso: string): Weekday {
  return WEEKDAYS[(new Date(iso).getUTCDay() + 6) % 7] as Weekday;
}

function dayLabel(iso: string, today: boolean): string {
  if (today) return 'Today';
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function syntheticRecord(date: string, workout: ReturnType<typeof generateWorkout>): WorkoutRecord {
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
    entries: allEntries(workout.blocks).map((entry) => ({
      exerciseId: entry.exerciseId,
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

/** The next planned sessions from today across the coming week. */
export function planWeek(
  profile: UserProfile,
  location: LocationProfile | undefined,
  history: readonly WorkoutRecord[],
  now: string,
): PlannedSession[] {
  const available = new Set(profile.schedule.availableDays);
  const trainedToday = history.some(
    (record) => (record.completedAt ?? record.startedAt).slice(0, 10) === now.slice(0, 10),
  );
  const sessions: PlannedSession[] = [];
  let simulated: WorkoutRecord[] = [...history];
  for (
    let offset = 0;
    offset < 7 && sessions.length < profile.schedule.weeklyFrequency;
    offset += 1
  ) {
    const date = new Date(Date.parse(now) + offset * DAY_MS).toISOString();
    const weekday = weekdayOf(date);
    if (!available.has(weekday)) continue;
    if (offset === 0 && trainedToday) continue;
    const workout = generateWorkout({
      profile,
      location,
      history: simulated,
      now: date,
      duration: 'default',
    });
    const counts = new Map<MuscleId, number>();
    for (const entry of allEntries(workout.blocks)) {
      for (const muscle of entry.chosenFor) counts.set(muscle, (counts.get(muscle) ?? 0) + 1);
    }
    const focus = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([muscle]) => muscle);
    sessions.push({
      date,
      weekday,
      label: dayLabel(date, offset === 0),
      templateId: workout.templateId,
      title: workout.title,
      focus,
      today: offset === 0,
    });
    simulated = [...simulated, syntheticRecord(date, workout)];
  }
  return sessions;
}

export type RecoveryState = 'recovering' | 'ready' | 'fresh';

export interface RecoveryBalanceRow {
  muscle: MuscleId;
  name: string;
  daysSince: number | null;
  state: RecoveryState;
}

/** Which muscles are still recovering (under 2 days), ready (2 to 4), or fresh. */
export function recoveryBalance(
  history: readonly WorkoutRecord[],
  now: string,
): RecoveryBalanceRow[] {
  const exposure = computeExposure(history, now);
  return MUSCLE_IDS.map((muscle) => {
    const days = exposure.daysSinceMuscle[muscle] ?? null;
    const state: RecoveryState =
      days === null || days >= 4 ? 'fresh' : days < 2 ? 'recovering' : 'ready';
    return {
      muscle,
      name: muscleName(muscle),
      daysSince: days === null ? null : Math.round(days * 10) / 10,
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
