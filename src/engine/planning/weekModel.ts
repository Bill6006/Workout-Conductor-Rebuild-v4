import { getExercise } from '../../catalog/exercises/catalog';
import { MUSCLE_IDS, type MuscleId } from '../../catalog/muscles/muscles';
import { addLocalDays, localDayKey, localWeekKey, localWeekday } from '../../core/time/localDate';
import type { LocationProfile } from '../../core/validation/location';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { LearnedResets } from '../learned/resets';
import { INDIRECT_SET_WEIGHT, computeExposure, weeklyTargets } from '../volume/weeklyVolume';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';

/**
 * The week model (Maintenance 31, docs/proposals/week-model-readiness-time.md part 1): one picture
 * of the lifter's Monday-to-Sunday week on this device, per muscle, that the catch-up and the second
 * workout of a day read (items 12 and 32), and the later rounds build on. Weekly sets per muscle are
 * what drive results; spreading them over the week hardly matters for size (Schoenfeld, Grgic and
 * Krieger 2019, PMID 30558493; Pelland et al. 2026, PMID 41343037). A set counts once for each of
 * its exercise's primary muscles and half for each secondary one (Pelland et al. 2026), as the
 * weekly volume does.
 */

export interface MuscleWeek {
  /** Sets done this week so far, today's included. */
  done: number;
  /** Of those, today's, a secondary muscle's at half. */
  today: number;
  /** Today's direct sets: a muscle with none was not trained today (the review of round M). */
  todayDirect: number;
  /** Sets the week's sessions still to come deliver, at Default length. */
  planned: number;
  /** The goal's weekly sets for the muscle. */
  target: number;
  /** Days since the muscle was last trained directly, as elapsed time; null when never. */
  daysSince: number | null;
  /** The same, leaving today's workouts out: the 48 hours before today (the review of round M). */
  daysBefore: number | null;
}

export interface WeekModel {
  /** The Monday that starts this week on the device, `YYYY-MM-DD`. */
  week: string;
  /** The sessions still to come this week that `planned` reads. */
  sessionsAhead: number;
  /** Whether a workout was begun today. */
  trainedToday: boolean;
  muscles: Record<MuscleId, MuscleWeek>;
}

/** The sets the week will hold for a muscle: done, and planned on the days to come. */
export const projectedSets = (muscle: MuscleWeek): number => muscle.done + muscle.planned;

/** How far the week falls short of the muscle's target, with the days to come; never below 0. */
export const shortfallOf = (muscle: MuscleWeek): number =>
  Math.max(0, muscle.target - projectedSets(muscle));

function emptyWeek(targets: Record<MuscleId, number>): Record<MuscleId, MuscleWeek> {
  return Object.fromEntries(
    MUSCLE_IDS.map((muscle) => [
      muscle,
      {
        done: 0,
        today: 0,
        todayDirect: 0,
        planned: 0,
        target: targets[muscle],
        daysSince: null,
        daysBefore: null,
      },
    ]),
  ) as Record<MuscleId, MuscleWeek>;
}

/** Adds an exercise's sets to its muscles: a primary muscle's in full, a secondary one's at half. */
function credit(
  muscles: Record<MuscleId, MuscleWeek>,
  exerciseId: string,
  sets: number,
  field: 'done' | 'today' | 'planned',
): void {
  const exercise = getExercise(exerciseId);
  if (!exercise || sets <= 0) return;
  for (const muscle of exercise.primaryMuscles) {
    muscles[muscle][field] += sets;
    if (field === 'today') muscles[muscle].todayDirect += sets;
  }
  for (const muscle of exercise.secondaryMuscles) {
    muscles[muscle][field] += sets * INDIRECT_SET_WEIGHT;
  }
}

/** A planned session as the record it would leave: its working sets, done at the bottom of range. */
function plannedRecord(date: string, workout: GeneratedWorkout): WorkoutRecord {
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

/**
 * The days still to come this week that hold a session: the ticked days after today, and today
 * when it is ticked and nothing was begun yet. With more days ticked than sessions a week, only as
 * many as the week has left (the sessions a week less the days trained so far).
 */
function daysAhead(profile: UserProfile, now: string, trainedDays: number, trainedToday: boolean) {
  const available = new Set(profile.schedule.availableDays);
  const week = localWeekKey(now);
  const days: string[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addLocalDays(now, offset);
    if (localWeekKey(date) !== week) break;
    if (offset === 0 && trainedToday) continue;
    if (available.has(localWeekday(date))) days.push(date);
  }
  const capped = available.size > profile.schedule.weeklyFrequency;
  const left = Math.max(0, profile.schedule.weeklyFrequency - trainedDays);
  return capped ? days.slice(0, left) : days;
}

export function weekModel(input: {
  profile: UserProfile;
  location: LocationProfile | undefined;
  history: readonly WorkoutRecord[];
  now: string;
  /** What the lifter reset (Maintenance 27, item 47): the week reads as today's plan does. */
  resets?: LearnedResets | null;
}): WeekModel {
  const { profile, location, history, now } = input;
  const week = localWeekKey(now);
  const today = localDayKey(now);
  const muscles = emptyWeek(weeklyTargets(profile));
  const trained = new Set<string>();
  for (const record of history) {
    if (record.startedAt > now || localWeekKey(record.startedAt) !== week) continue;
    const day = localDayKey(record.startedAt);
    for (const entry of record.entries) {
      const sets = entry.sets.filter((set) => set.completed && set.kind !== 'warmup').length;
      if (sets === 0) continue;
      trained.add(day);
      credit(muscles, entry.exerciseId, sets, 'done');
      if (day === today) credit(muscles, entry.exerciseId, sets, 'today');
    }
  }
  const exposure = computeExposure(history, now);
  const earlier = computeExposure(
    history.filter((record) => localDayKey(record.startedAt) !== today),
    now,
  );
  for (const muscle of MUSCLE_IDS) {
    muscles[muscle].daysSince = exposure.daysSinceMuscle[muscle] ?? null;
    muscles[muscle].daysBefore = earlier.daysSinceMuscle[muscle] ?? null;
  }
  const trainedToday = trained.has(today);
  const ahead = daysAhead(profile, now, trained.size, trainedToday);
  // Each session to come, as the plan would build it after the ones before it.
  let simulated: WorkoutRecord[] = [...history];
  for (const date of ahead) {
    const workout = generateWorkout({
      profile,
      location,
      history: simulated,
      now: date,
      duration: 'default',
      resets: input.resets ?? null,
    });
    for (const entry of allEntries(workout.blocks)) {
      credit(
        muscles,
        entry.exerciseId,
        entry.sets.filter((set) => set.kind === 'working').length,
        'planned',
      );
    }
    simulated = [...simulated, plannedRecord(date, workout)];
  }
  return { week, sessionsAhead: ahead.length, trainedToday, muscles };
}
