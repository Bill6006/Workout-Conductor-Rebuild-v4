import { getExercise } from '../../catalog/exercises/catalog';
import {
  MUSCLE_IDS,
  muscleGroupOf,
  muscleName,
  type MuscleId,
} from '../../catalog/muscles/muscles';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { MusclePriority } from '../workout/types';

/**
 * Weekly volume, recent exposure, targets, and the muscle priorities that
 * drive generation. Direct sets count 1, indirect (secondary muscle) 0.5.
 */

const DAY_MS = 86_400_000;

export interface MuscleVolume {
  direct: number;
  indirect: number;
}

export type WeeklyVolume = Record<MuscleId, MuscleVolume>;

export interface Exposure {
  /** Days since the muscle was last trained directly; null when never. */
  daysSinceMuscle: Partial<Record<MuscleId, number>>;
  /** Days since each exercise was last performed. */
  daysSinceExercise: Record<string, number>;
  /** Template ids of sessions in the last 14 days, newest first. */
  recentTemplates: string[];
  sessionsLast14Days: number;
}

function emptyVolume(): WeeklyVolume {
  return Object.fromEntries(
    MUSCLE_IDS.map((muscle) => [muscle, { direct: 0, indirect: 0 }]),
  ) as WeeklyVolume;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.max(0, (new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS);
}

export function computeWeeklyVolume(
  history: readonly WorkoutRecord[],
  nowIso: string,
): WeeklyVolume {
  const volume = emptyVolume();
  for (const record of history) {
    const when = record.completedAt ?? record.startedAt;
    if (daysBetween(when, nowIso) > 7) continue;
    for (const logged of record.entries) {
      const exercise = getExercise(logged.exerciseId);
      if (!exercise) continue;
      const sets = logged.sets.filter((set) => set.completed && set.kind !== 'warmup').length;
      for (const muscle of exercise.primaryMuscles) volume[muscle].direct += sets;
      for (const muscle of exercise.secondaryMuscles) volume[muscle].indirect += sets * 0.5;
    }
  }
  return volume;
}

export function computeExposure(history: readonly WorkoutRecord[], nowIso: string): Exposure {
  const daysSinceMuscle: Partial<Record<MuscleId, number>> = {};
  const daysSinceExercise: Record<string, number> = {};
  const recent: { days: number; templateId: string | null }[] = [];
  for (const record of history) {
    const when = record.completedAt ?? record.startedAt;
    const days = daysBetween(when, nowIso);
    if (days <= 14) recent.push({ days, templateId: record.templateId });
    for (const logged of record.entries) {
      const exercise = getExercise(logged.exerciseId);
      if (!exercise) continue;
      if (!logged.sets.some((set) => set.completed && set.kind !== 'warmup')) continue;
      const previous = daysSinceExercise[logged.exerciseId];
      if (previous === undefined || days < previous) daysSinceExercise[logged.exerciseId] = days;
      for (const muscle of exercise.primaryMuscles) {
        const current = daysSinceMuscle[muscle];
        if (current === undefined || days < current) daysSinceMuscle[muscle] = days;
      }
    }
  }
  recent.sort((a, b) => a.days - b.days);
  return {
    daysSinceMuscle,
    daysSinceExercise,
    recentTemplates: recent
      .map((item) => item.templateId)
      .filter((id): id is string => Boolean(id)),
    sessionsLast14Days: recent.length,
  };
}

/** Goal emphasis per muscle: 1.0 is normal, priority muscles go up to 1.6. */
export function goalWeights(profile: UserProfile): Record<MuscleId, number> {
  const weights = Object.fromEntries(MUSCLE_IDS.map((muscle) => [muscle, 1])) as Record<
    MuscleId,
    number
  >;
  const boost = (muscles: MuscleId[], amount: number) => {
    for (const muscle of muscles) weights[muscle] += amount;
  };
  const apply = (
    goal: UserProfile['goals']['primary'] | UserProfile['goals']['secondary'],
    amount: number,
  ) => {
    switch (goal) {
      case 'bigger-arms':
        boost(['biceps', 'triceps', 'forearms'], amount);
        break;
      case 'bigger-chest':
        boost(['chest', 'upper-chest'], amount);
        break;
      case 'overall-size':
        boost(['quads', 'hamstrings', 'glutes', 'lats', 'upper-back'], amount / 3);
        break;
      case 'strength':
        boost(['quads', 'glutes', 'chest', 'upper-back', 'lats'], amount / 2);
        break;
      case 'build-muscle':
      case 'balanced':
      case 'none':
        break;
    }
  };
  apply(profile.goals.primary, 0.6);
  apply(profile.goals.secondary, 0.3);
  // Small muscles that recover fast still deserve a floor, not a spotlight.
  for (const muscle of [
    'calves',
    'forearms',
    'abs',
    'obliques',
    'traps',
    'lower-back',
  ] as MuscleId[]) {
    weights[muscle] = Math.min(weights[muscle], 1.2) * 0.75;
  }
  return weights;
}

/** Weekly direct-set targets: 10 per muscle scaled by goal weight, smaller muscles lower. */
export function weeklyTargets(profile: UserProfile): Record<MuscleId, number> {
  const weights = goalWeights(profile);
  const targets = {} as Record<MuscleId, number>;
  for (const muscle of MUSCLE_IDS) {
    const base =
      muscleGroupOf(muscle) === 'core' || muscle === 'calves' || muscle === 'forearms' ? 6 : 10;
    targets[muscle] = Math.round(base * weights[muscle]);
  }
  return targets;
}

function freshnessFactor(daysSince: number | null): number {
  if (daysSince === null) return 1.1;
  if (daysSince < 1.5) return 0.4;
  if (daysSince < 2.5) return 0.85;
  if (daysSince < 4) return 1;
  return 1.1;
}

export function computeMusclePriorities(
  profile: UserProfile,
  volume: WeeklyVolume,
  exposure: Exposure,
): MusclePriority[] {
  const weights = goalWeights(profile);
  const targets = weeklyTargets(profile);
  return MUSCLE_IDS.map((muscle) => {
    const done = volume[muscle].direct + volume[muscle].indirect;
    const target = targets[muscle];
    const deficit = target > 0 ? Math.max(0, Math.min(1, (target - done) / target)) : 0;
    const daysSince = exposure.daysSinceMuscle[muscle] ?? null;
    const weight = Math.round((weights[muscle] * freshnessFactor(daysSince) + deficit) * 100) / 100;
    const reasons: string[] = [];
    if (weights[muscle] > 1.05) reasons.push('goal priority');
    if (daysSince !== null && daysSince < 1.5) reasons.push('trained in the last day');
    else if (daysSince === null) reasons.push('not trained yet this cycle');
    else if (daysSince >= 4) reasons.push(`${Math.floor(daysSince)} days since trained`);
    if (deficit >= 0.6) reasons.push(`${Math.round(done)} of ${target} weekly sets`);
    return {
      muscle,
      weight,
      reason:
        reasons.length > 0 ? `${muscleName(muscle)}: ${reasons.join(', ')}` : muscleName(muscle),
      weeklySetsDone: Math.round(done * 10) / 10,
      weeklyTarget: target,
      daysSinceTrained: daysSince === null ? null : Math.round(daysSince * 10) / 10,
    };
  }).sort((a, b) => b.weight - a.weight || a.muscle.localeCompare(b.muscle));
}
