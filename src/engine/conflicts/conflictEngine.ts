import type {
  CatalogExercise,
  Joint,
  LimitationFlag,
  StressLevel,
} from '../../catalog/exercises/exerciseSchema';
import { movementPatternName } from '../../catalog/movementPatterns/movementPatterns';
import { muscleName } from '../../catalog/muscles/muscles';
import type { UserProfile } from '../../core/validation/profile';

/**
 * The one reusable conflict engine. Every generated workout, superset pairing,
 * and alternative list is validated here using structured metadata, never by
 * exercise names.
 */

export type ConflictKind =
  | 'duplicate-exercise'
  | 'duplicate-pattern'
  | 'muscle-overlap'
  | 'joint-stress'
  | 'grip'
  | 'equipment'
  | 'station'
  | 'superset'
  | 'recovery'
  | 'time'
  | 'limitation'
  | 'location'
  | 'progression-role';

export type ConflictSeverity = 'block' | 'warn';

export interface Conflict {
  kind: ConflictKind;
  severity: ConflictSeverity;
  exerciseIds: string[];
  message: string;
}

export interface ConflictContext {
  availableEquipment: ReadonlySet<string>;
  locationName?: string;
  limitations: UserProfile['limitations'];
  /** Catalog ids the user marked as disliked. */
  dislikedIds?: ReadonlySet<string>;
  /** Optional time budget for the whole selection, in minutes. */
  timeBudgetMinutes?: number;
}

export interface PlannedSets {
  sets: number;
  restSeconds: number;
}

const STRESS_RANK: Record<StressLevel, number> = { low: 0, moderate: 1, high: 2 };
const WORK_SECONDS_PER_SET = 40;

export function hasSeverity(conflicts: readonly Conflict[], severity: ConflictSeverity): boolean {
  return conflicts.some((conflict) => conflict.severity === severity);
}

export function isBlocked(conflicts: readonly Conflict[]): boolean {
  return hasSeverity(conflicts, 'block');
}

/** Flags the profile forbids outright. */
export function blockedFlags(limitations: UserProfile['limitations']): Set<LimitationFlag> {
  const blocked = new Set<LimitationFlag>();
  if (limitations.avoidBarbellSquats) blocked.add('barbell-squat');
  if (limitations.shoulder.includes('avoid-overhead-pressing')) blocked.add('overhead');
  if (limitations.shoulder.includes('avoid-behind-neck')) blocked.add('behind-neck');
  if (limitations.shoulder.includes('avoid-dips')) blocked.add('dip');
  if (limitations.shoulder.includes('avoid-wide-grip-pressing')) blocked.add('wide-grip');
  if (limitations.painAreas.includes('knee')) blocked.add('deep-knee-flexion');
  if (limitations.painAreas.includes('lower-back')) blocked.add('spinal-loading');
  return blocked;
}

export function equipmentAvailable(
  exercise: CatalogExercise,
  available: ReadonlySet<string>,
): boolean {
  return exercise.equipment.some((group) => group.every((id) => available.has(id)));
}

/** Estimated minutes for one exercise including setup. */
export function estimateExerciseMinutes(exercise: CatalogExercise, planned: PlannedSets): number {
  const seconds =
    exercise.setupSeconds + planned.sets * (WORK_SECONDS_PER_SET + planned.restSeconds);
  return seconds / 60;
}

/** Whether one exercise fits the user and the place, independent of the rest of the workout. */
export function checkExerciseFit(exercise: CatalogExercise, context: ConflictContext): Conflict[] {
  const conflicts: Conflict[] = [];

  if (!equipmentAvailable(exercise, context.availableEquipment)) {
    conflicts.push({
      kind: context.locationName ? 'location' : 'equipment',
      severity: 'block',
      exerciseIds: [exercise.id],
      message: `${exercise.name} needs equipment that is not available${context.locationName ? ` at ${context.locationName}` : ''}.`,
    });
  }

  const blocked = blockedFlags(context.limitations);
  for (const flag of exercise.limitationFlags) {
    if (blocked.has(flag)) {
      conflicts.push({
        kind: 'limitation',
        severity: 'block',
        exerciseIds: [exercise.id],
        message: `${exercise.name} is excluded by your limitations (${flag.replace(/-/g, ' ')}).`,
      });
    }
  }

  for (const joint of context.limitations.painAreas) {
    const stress = exercise.jointStress[joint];
    if (!stress) continue;
    if (stress === 'high') {
      conflicts.push({
        kind: 'joint-stress',
        severity: 'block',
        exerciseIds: [exercise.id],
        message: `${exercise.name} puts high stress on the ${joint.replace('-', ' ')} you flagged.`,
      });
    } else if (stress === 'moderate') {
      conflicts.push({
        kind: 'joint-stress',
        severity: 'warn',
        exerciseIds: [exercise.id],
        message: `${exercise.name} puts moderate stress on the ${joint.replace('-', ' ')} you flagged.`,
      });
    }
  }

  if (context.dislikedIds?.has(exercise.id)) {
    conflicts.push({
      kind: 'limitation',
      severity: 'block',
      exerciseIds: [exercise.id],
      message: `${exercise.name} is on your disliked list.`,
    });
  }

  return dedupe(conflicts);
}

/** Conflicts across a whole selection: duplicates, overlap, stress, recovery, roles, time. */
export function checkWorkoutConflicts(
  exercises: readonly CatalogExercise[],
  context: ConflictContext,
  planned?: readonly PlannedSets[],
): Conflict[] {
  const conflicts: Conflict[] = exercises.flatMap((exercise) =>
    checkExerciseFit(exercise, context),
  );

  const seen = new Map<string, number>();
  exercises.forEach((exercise, index) => {
    const first = seen.get(exercise.id);
    if (first !== undefined) {
      conflicts.push({
        kind: 'duplicate-exercise',
        severity: 'block',
        exerciseIds: [exercise.id],
        message: `${exercise.name} appears twice.`,
      });
    } else {
      seen.set(exercise.id, index);
    }
  });

  const byPattern = groupBy(exercises, (exercise) => exercise.movementPattern);
  for (const [pattern, group] of byPattern) {
    if (group.length >= 3) {
      conflicts.push({
        kind: 'duplicate-pattern',
        severity: 'warn',
        exerciseIds: group.map((exercise) => exercise.id),
        message: `${group.length} ${movementPatternName(pattern).toLowerCase()} movements in one session is a lot of overlap.`,
      });
    }
    const strengthLeads = group.filter(
      (exercise) => exercise.compound && exercise.strengthSuitability === 3,
    );
    if (strengthLeads.length >= 2) {
      conflicts.push({
        kind: 'progression-role',
        severity: 'block',
        exerciseIds: strengthLeads.map((exercise) => exercise.id),
        message: `Two primary-strength ${movementPatternName(pattern).toLowerCase()} lifts compete for the same progression.`,
      });
    }
  }

  const byPrimaryMuscle = new Map<string, CatalogExercise[]>();
  for (const exercise of exercises) {
    for (const muscle of exercise.primaryMuscles) {
      byPrimaryMuscle.set(muscle, [...(byPrimaryMuscle.get(muscle) ?? []), exercise]);
    }
  }
  for (const [muscle, group] of byPrimaryMuscle) {
    if (group.length >= 4) {
      conflicts.push({
        kind: 'muscle-overlap',
        severity: 'warn',
        exerciseIds: group.map((exercise) => exercise.id),
        message: `${group.length} exercises target ${muscleName(muscle as CatalogExercise['primaryMuscles'][number]).toLowerCase()} directly; some of that is junk volume.`,
      });
    }
    const heavy = group.filter(
      (exercise) => exercise.compound && exercise.strengthSuitability === 3,
    );
    if (heavy.length >= 2) {
      conflicts.push({
        kind: 'recovery',
        severity: 'warn',
        exerciseIds: heavy.map((exercise) => exercise.id),
        message: `Two heavy compounds load ${muscleName(muscle as CatalogExercise['primaryMuscles'][number]).toLowerCase()}; recovery will suffer.`,
      });
    }
  }

  const stressByJoint = new Map<Joint, CatalogExercise[]>();
  for (const exercise of exercises) {
    for (const [joint, level] of Object.entries(exercise.jointStress) as [Joint, StressLevel][]) {
      if (STRESS_RANK[level] >= 2) {
        stressByJoint.set(joint, [...(stressByJoint.get(joint) ?? []), exercise]);
      }
    }
  }
  for (const [joint, group] of stressByJoint) {
    if (group.length >= 2) {
      conflicts.push({
        kind: 'joint-stress',
        severity: 'warn',
        exerciseIds: group.map((exercise) => exercise.id),
        message: `${group.length} exercises put high stress on the ${joint.replace('-', ' ')}.`,
      });
    }
  }

  if (context.timeBudgetMinutes !== undefined && planned) {
    const total = exercises.reduce(
      (sum, exercise, index) =>
        sum + estimateExerciseMinutes(exercise, planned[index] ?? { sets: 3, restSeconds: 90 }),
      0,
    );
    if (total > context.timeBudgetMinutes * 1.1) {
      conflicts.push({
        kind: 'time',
        severity: 'warn',
        exerciseIds: exercises.map((exercise) => exercise.id),
        message: `About ${Math.round(total)} min of work does not fit ${context.timeBudgetMinutes} min.`,
      });
    }
  }

  return dedupe(conflicts);
}

/** Whether two exercises can be paired as one superset block. */
export function checkSupersetPair(
  first: CatalogExercise,
  second: CatalogExercise,
  context: ConflictContext,
): Conflict[] {
  const conflicts: Conflict[] = [];
  const ids = [first.id, second.id];

  if (first.id === second.id) {
    conflicts.push({
      kind: 'duplicate-exercise',
      severity: 'block',
      exerciseIds: ids,
      message: 'A superset needs two different exercises.',
    });
  }
  if (!first.supersetFriendly || !second.supersetFriendly) {
    const culprit = !first.supersetFriendly ? first : second;
    conflicts.push({
      kind: 'superset',
      severity: 'block',
      exerciseIds: ids,
      message: `${culprit.name} is a priority lift that should not be paired.`,
    });
  }
  if (
    first.compound &&
    second.compound &&
    first.strengthSuitability >= 2 &&
    second.strengthSuitability >= 2
  ) {
    conflicts.push({
      kind: 'superset',
      severity: 'block',
      exerciseIds: ids,
      message: 'Two demanding compounds should not share a superset.',
    });
  }
  if (first.gripDemand === 'high' && second.gripDemand === 'high') {
    conflicts.push({
      kind: 'grip',
      severity: 'warn',
      exerciseIds: ids,
      message: 'Both moves are grip-heavy; grip will limit the second one.',
    });
  }
  const scarce: CatalogExercise['station'][] = [
    'rack',
    'bench-press',
    'cable',
    'machine',
    'pull-up-bar',
    'dip-station',
  ];
  if (
    first.station === second.station &&
    scarce.includes(first.station) &&
    first.station !== 'cable'
  ) {
    conflicts.push({
      kind: 'station',
      severity: 'warn',
      exerciseIds: ids,
      message: `Both moves need the same ${first.station.replace('-', ' ')} station.`,
    });
  }
  if (first.transitionCost + second.transitionCost >= 4) {
    conflicts.push({
      kind: 'station',
      severity: 'warn',
      exerciseIds: ids,
      message: 'Switching between these setups costs too much time for a superset.',
    });
  }
  for (const [joint, level] of Object.entries(first.jointStress) as [Joint, StressLevel][]) {
    if (STRESS_RANK[level] >= 2 && STRESS_RANK[second.jointStress[joint] ?? 'low'] >= 2) {
      conflicts.push({
        kind: 'joint-stress',
        severity: 'warn',
        exerciseIds: ids,
        message: `Both moves stress the ${joint.replace('-', ' ')} heavily.`,
      });
    }
  }
  const sharedPrimary = first.primaryMuscles.filter((muscle) =>
    second.primaryMuscles.includes(muscle),
  );
  if (sharedPrimary.length > 0 && first.compound && second.compound) {
    conflicts.push({
      kind: 'muscle-overlap',
      severity: 'warn',
      exerciseIds: ids,
      message: `Both compounds hit ${sharedPrimary.map((muscle) => muscleName(muscle).toLowerCase()).join(' and ')}; the second will be compromised.`,
    });
  }

  conflicts.push(...checkExerciseFit(first, context), ...checkExerciseFit(second, context));
  return dedupe(conflicts);
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}

function dedupe(conflicts: Conflict[]): Conflict[] {
  const seen = new Set<string>();
  return conflicts.filter((conflict) => {
    const key = `${conflict.kind}|${conflict.severity}|${conflict.exerciseIds.join(',')}|${conflict.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
