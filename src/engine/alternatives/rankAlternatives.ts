import { allExercises, exerciseEquipmentLabel } from '../../catalog/exercises/catalog';
import type { CatalogExercise, Joint, StressLevel } from '../../catalog/exercises/exerciseSchema';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { movementPatternName } from '../../catalog/movementPatterns/movementPatterns';
import { muscleName } from '../../catalog/muscles/muscles';
import {
  checkExerciseFit,
  checkSupersetPair,
  estimateExerciseMinutes,
  isBlocked,
  type ConflictContext,
} from '../conflicts/conflictEngine';

/**
 * Alternative ranking foundation. Ranks catalog exercises that could replace
 * one exercise without touching the rest of the workout. Later phases add
 * previous-performance and fatigue signals through `RankingSignals`.
 */

export interface RankingSignals {
  /** Ids the user prefers; small boost. */
  preferredIds?: ReadonlySet<string>;
  /** Ids the user has performed before; progression continuity boost. */
  familiarIds?: ReadonlySet<string>;
  /** When and how each familiar exercise was last done. */
  lastPerformance?: ReadonlyMap<string, { daysAgo: number; line: string }>;
  /** How loaded each muscle already is this week. */
  muscleLoad?: Readonly<Record<MuscleId, 'behind' | 'open' | 'covered'>>;
  /** Joints reported painful in this session; high stress excludes, moderate costs. */
  sessionPainJoints?: ReadonlySet<Joint>;
  /** The coach route for the current lift is at its variation step. */
  routeWantsVariation?: boolean;
}

export interface AlternativeRequest {
  current: CatalogExercise;
  context: ConflictContext;
  /** The other exercises staying in the workout. */
  otherExercises?: readonly CatalogExercise[];
  /** The superset partner of the current exercise, when it is in one. */
  supersetPartner?: CatalogExercise;
  /** Minutes left for this slot; candidates that cannot fit are excluded. */
  remainingMinutes?: number;
  plannedSets?: { sets: number; restSeconds: number };
  /** The current exercise is planned as a drop set. */
  dropSetPlanned?: boolean;
  signals?: RankingSignals;
  catalog?: readonly CatalogExercise[];
  limit?: number;
}

export interface AlternativeCandidate {
  exercise: CatalogExercise;
  /** 0-100 */
  score: number;
  primaryReason: string;
  /** The two strongest reasons for the rank and, when one weighs, the strongest against. */
  reasons: string[];
  keyDifference: string;
  equipment: string;
  setupSeconds: number;
  preservesProgression: boolean;
  supersetImpact: 'none' | 'changes' | 'breaks';
  warnings: string[];
}

export interface AlternativeResult {
  candidates: AlternativeCandidate[];
  /** Why nothing qualified, when the list is empty. */
  emptyReason: string | null;
}

const STRESS_RANK: Record<StressLevel, number> = { low: 0, moderate: 1, high: 2 };

const GENERIC_REASONS = new Set([
  'same primary muscles',
  'same movement pattern',
  'similar strength and hypertrophy role',
  'similar stimulus',
]);

function overlapRatio(a: readonly string[], b: readonly string[]): number {
  const setB = new Set(b);
  const shared = a.filter((item) => setB.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : shared / union;
}

function keyDifference(current: CatalogExercise, candidate: CatalogExercise): string {
  if (candidate.movementPattern !== current.movementPattern) {
    return `${movementPatternName(candidate.movementPattern)} instead of ${movementPatternName(current.movementPattern).toLowerCase()}`;
  }
  if (candidate.load !== current.load) {
    return `${loadLabel(candidate.load)} instead of ${loadLabel(current.load).toLowerCase()}`;
  }
  if (candidate.unilateral !== current.unilateral) {
    return candidate.unilateral ? 'One side at a time' : 'Both sides together';
  }
  if (candidate.compound !== current.compound) {
    return candidate.compound ? 'Compound instead of isolation' : 'Isolation instead of compound';
  }
  const newMuscle = candidate.primaryMuscles.find(
    (muscle) => !current.primaryMuscles.includes(muscle),
  );
  if (newMuscle) return `Adds ${muscleName(newMuscle).toLowerCase()} emphasis`;
  return 'Same pattern with a different setup';
}

function loadLabel(load: CatalogExercise['load']): string {
  switch (load) {
    case 'barbell':
      return 'Barbell';
    case 'ez-bar':
      return 'EZ bar';
    case 'trap-bar':
      return 'Trap bar';
    case 'smith':
      return 'Smith machine';
    case 'dumbbell-each':
      return 'Dumbbells';
    case 'kettlebell':
      return 'Kettlebell';
    case 'stack':
      return 'Machine or cable';
    case 'band':
      return 'Bands';
    case 'bodyweight':
      return 'Bodyweight';
  }
}

export function rankAlternatives(request: AlternativeRequest): AlternativeResult {
  const { current, context } = request;
  const catalog = request.catalog ?? allExercises();
  const others = request.otherExercises ?? [];
  const otherIds = new Set(others.map((exercise) => exercise.id));
  const otherPatterns = new Set(others.map((exercise) => exercise.movementPattern));
  const limit = request.limit ?? 8;
  const planned = request.plannedSets ?? { sets: 3, restSeconds: 90 };
  const pain = new Set(context.limitations.painAreas);

  const candidates: AlternativeCandidate[] = [];
  let excludedForFit = 0;

  for (const candidate of catalog) {
    if (candidate.id === current.id || otherIds.has(candidate.id)) continue;

    const fit = checkExerciseFit(candidate, context);
    if (isBlocked(fit)) {
      excludedForFit += 1;
      continue;
    }
    if (
      request.remainingMinutes !== undefined &&
      estimateExerciseMinutes(candidate, planned) > request.remainingMinutes + 0.5
    ) {
      continue;
    }
    if (
      request.supersetPartner &&
      isBlocked(checkSupersetPair(candidate, request.supersetPartner, context))
    ) {
      continue;
    }

    const muscleOverlap = overlapRatio(candidate.primaryMuscles, current.primaryMuscles);
    if (muscleOverlap === 0) continue; // wrong primary muscle
    const sessionPain = request.signals?.sessionPainJoints;
    if (sessionPain && [...sessionPain].some((joint) => candidate.jointStress[joint] === 'high')) {
      excludedForFit += 1;
      continue;
    }

    const contributions: [number, string][] = [];
    contributions.push([Math.round(30 * muscleOverlap), 'same primary muscles']);
    if (candidate.movementPattern === current.movementPattern)
      contributions.push([20, 'same movement pattern']);
    const roleDistance =
      Math.abs(candidate.strengthSuitability - current.strengthSuitability) +
      Math.abs(candidate.hypertrophySuitability - current.hypertrophySuitability);
    contributions.push([
      Math.max(0, 15 - 5 * roleDistance),
      'similar strength and hypertrophy role',
    ]);
    if (candidate.compound === current.compound) contributions.push([5, 'similar stimulus']);
    if (candidate.progressionFamily === current.progressionFamily)
      contributions.push([10, 'keeps progression history']);
    if (request.signals?.preferredIds?.has(candidate.id))
      contributions.push([10, 'one of your preferred exercises']);
    const last = request.signals?.lastPerformance?.get(candidate.id);
    if (last) {
      contributions.push([last.daysAgo <= 30 ? 9 : 5, last.line]);
    } else if (request.signals?.familiarIds?.has(candidate.id)) {
      contributions.push([5, 'you have done it before']);
    }
    const loads = request.signals?.muscleLoad;
    if (loads) {
      const added = candidate.primaryMuscles.find(
        (muscle) => !current.primaryMuscles.includes(muscle) && loads[muscle] === 'behind',
      );
      if (added)
        contributions.push([
          6,
          `adds ${muscleName(added).toLowerCase()}, behind its weekly target`,
        ]);
      else if (candidate.primaryMuscles.every((muscle) => loads[muscle] === 'covered')) {
        contributions.push([
          -5,
          `${muscleName(candidate.primaryMuscles[0] as MuscleId).toLowerCase()} is well covered this week`,
        ]);
      }
    }
    if (sessionPain) {
      for (const joint of sessionPain) {
        if (candidate.jointStress[joint] === 'moderate')
          contributions.push([
            -12,
            `moderate stress on your ${joint.replace('-', ' ')}, which hurts today`,
          ]);
      }
    }
    if (request.signals?.routeWantsVariation) {
      const variation =
        candidate.movementPattern === current.movementPattern &&
        (candidate.progressionFamily !== current.progressionFamily ||
          candidate.load !== current.load);
      if (variation)
        contributions.push([8, 'a variation for the stalled lift, as the coach route asked']);
      else if (candidate.progressionFamily === current.progressionFamily)
        contributions.push([-4, 'too close to the stalled lift to count as a variation']);
    }
    if (current.substitutions.includes(candidate.id))
      contributions.push([8, 'listed substitution']);
    if (request.dropSetPlanned && candidate.dropSetSafe)
      contributions.push([5, 'safe for a drop set']);
    contributions.push([-Math.min(10, Math.round(candidate.setupSeconds / 12)), 'setup time']);
    if (
      otherPatterns.has(candidate.movementPattern) &&
      candidate.movementPattern !== current.movementPattern
    ) {
      contributions.push([-8, 'overlaps another exercise in the workout']);
    }

    const warnings = fit
      .filter((conflict) => conflict.severity === 'warn')
      .map((conflict) => conflict.message);
    for (const [joint, level] of Object.entries(candidate.jointStress) as [Joint, StressLevel][]) {
      if (pain.has(joint) && STRESS_RANK[level] === 1)
        contributions.push([-10, 'moderate stress on a flagged joint']);
    }

    let supersetImpact: AlternativeCandidate['supersetImpact'] = 'none';
    if (request.supersetPartner) {
      const pairConflicts = checkSupersetPair(candidate, request.supersetPartner, context);
      const pairWarnings = pairConflicts.filter((conflict) => conflict.severity === 'warn');
      if (candidate.gripDemand === 'high' && request.supersetPartner.gripDemand === 'high')
        contributions.push([-8, 'grip conflict with the superset partner']);
      supersetImpact =
        pairWarnings.length > 0 ? 'changes' : candidate.supersetFriendly ? 'none' : 'breaks';
      if (supersetImpact === 'changes')
        warnings.push(...pairWarnings.map((conflict) => conflict.message));
      if (candidate.supersetFriendly) contributions.push([5, 'keeps the superset']);
    }

    const score = Math.max(
      0,
      Math.min(
        100,
        contributions.reduce((sum, [points]) => sum + points, 0),
      ),
    );
    const positives = contributions.filter(([points]) => points > 0).sort((a, b) => b[0] - a[0]);
    const negatives = contributions.filter(([points]) => points <= -5).sort((a, b) => a[0] - b[0]);
    // The specific reasons (history, load, route, preference) come first; the generic
    // baseline (same muscles, same pattern) fills in only when nothing specific applies.
    const specific = positives.filter(([, reason]) => !GENERIC_REASONS.has(reason));
    const generic = positives.filter(([, reason]) => GENERIC_REASONS.has(reason));
    const reasons = [
      ...[...specific, ...generic].slice(0, 2).map(([, reason]) => reason),
      ...negatives.slice(0, 1).map(([, reason]) => reason),
    ];
    const primaryReason = positives[0]?.[1] ?? 'fits your equipment';

    candidates.push({
      exercise: candidate,
      score,
      primaryReason,
      reasons: reasons.length > 0 ? reasons : [primaryReason],
      keyDifference: keyDifference(current, candidate),
      equipment: exerciseEquipmentLabel(candidate, context.availableEquipment),
      setupSeconds: candidate.setupSeconds,
      preservesProgression: candidate.progressionFamily === current.progressionFamily,
      supersetImpact,
      warnings: [...new Set(warnings)],
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name));

  return {
    candidates: candidates.slice(0, limit),
    emptyReason:
      candidates.length > 0
        ? null
        : excludedForFit > 0
          ? `No safe alternative fits ${context.locationName ?? 'this place'} and your limitations.`
          : 'No exercise in the catalog trains the same muscles.',
  };
}
