import { requireExercise } from '../../catalog/exercises/catalog';
import type { LoggedExercise, WorkoutRecord } from '../../core/validation/workoutRecord';
import type { CompletedSet } from '../recalibration/types';

/**
 * Personal-record detection from actual completed working sets. Warm-ups never
 * count. The first performance of an exercise is its baseline, not a record.
 * Four kinds: heaviest weight, most reps at a weight, session volume, and the
 * first top-of-range completion at the best load.
 */

export type PersonalRecordKind = 'weight' | 'reps-at-weight' | 'volume' | 'top-of-range';

export interface PersonalRecord {
  /** Records are stored loosely; extra fields from newer builds survive. */
  [extra: string]: unknown;
  exerciseId: string;
  kind: PersonalRecordKind;
  value: number;
  previous: number | null;
  detail: string;
}

interface Baseline {
  sessions: number;
  bestWeight: number | null;
  /** Best reps seen at each weight. */
  repsAtWeight: Map<number, number>;
  bestVolume: number | null;
  /** Weights at which every set already reached the top of the range. */
  topOfRangeAt: Set<number>;
}

function completedWorking(entry: LoggedExercise) {
  return entry.sets.filter((set) => set.kind === 'working' && set.completed);
}

function when(record: WorkoutRecord): string {
  return record.completedAt ?? record.startedAt;
}

function sessionVolume(sets: ReturnType<typeof completedWorking>): number | null {
  if (sets.length === 0 || sets.some((set) => set.weight === null)) return null;
  return sets.reduce((sum, set) => sum + (set.weight as number) * set.reps, 0);
}

function topOfRange(sets: ReturnType<typeof completedWorking>): boolean {
  const withTarget = sets.filter((set) => set.targetReps);
  return (
    withTarget.length > 0 &&
    withTarget.length === sets.length &&
    withTarget.every((set) => set.reps >= (set.targetReps as [number, number])[1])
  );
}

/** Everything an exercise has done in the given records. */
export function baselineFor(exerciseId: string, records: readonly WorkoutRecord[]): Baseline {
  const baseline: Baseline = {
    sessions: 0,
    bestWeight: null,
    repsAtWeight: new Map(),
    bestVolume: null,
    topOfRangeAt: new Set(),
  };
  for (const record of records) {
    for (const entry of record.entries) {
      if (entry.exerciseId !== exerciseId) continue;
      const sets = completedWorking(entry);
      if (sets.length === 0) continue;
      baseline.sessions += 1;
      for (const set of sets) {
        if (set.weight === null) continue;
        if (baseline.bestWeight === null || set.weight > baseline.bestWeight)
          baseline.bestWeight = set.weight;
        const best = baseline.repsAtWeight.get(set.weight) ?? 0;
        if (set.reps > best) baseline.repsAtWeight.set(set.weight, set.reps);
      }
      const volume = sessionVolume(sets);
      if (volume !== null && (baseline.bestVolume === null || volume > baseline.bestVolume))
        baseline.bestVolume = volume;
      if (topOfRange(sets)) {
        const heaviest = Math.max(...sets.map((set) => set.weight ?? 0));
        baseline.topOfRangeAt.add(heaviest);
      }
    }
  }
  return baseline;
}

function unitsLabel(units: string): string {
  return units;
}

/** Records set by one saved workout against everything logged before it. */
export function detectPersonalRecords(
  record: WorkoutRecord,
  history: readonly WorkoutRecord[],
  units = 'lb',
): PersonalRecord[] {
  const prior = history.filter(
    (candidate) => candidate.id !== record.id && when(candidate) <= when(record),
  );
  const found: PersonalRecord[] = [];
  const seen = new Set<string>();
  for (const entry of record.entries) {
    if (seen.has(entry.exerciseId)) continue;
    seen.add(entry.exerciseId);
    const sets = record.entries
      .filter((candidate) => candidate.exerciseId === entry.exerciseId)
      .flatMap(completedWorking);
    if (sets.length === 0) continue;
    const baseline = baselineFor(entry.exerciseId, prior);
    if (baseline.sessions === 0) continue;
    const name = requireExercise(entry.exerciseId).name;
    const u = unitsLabel(units);

    const weights = sets.map((set) => set.weight).filter((w): w is number => w !== null);
    const heaviest = weights.length > 0 ? Math.max(...weights) : null;
    if (heaviest !== null && baseline.bestWeight !== null && heaviest > baseline.bestWeight) {
      found.push({
        exerciseId: entry.exerciseId,
        kind: 'weight',
        value: heaviest,
        previous: baseline.bestWeight,
        detail: `${name}: ${heaviest} ${u} (was ${baseline.bestWeight})`,
      });
    }

    let repRecord: PersonalRecord | null = null;
    for (const set of sets) {
      if (set.weight === null) continue;
      const before = baseline.repsAtWeight.get(set.weight);
      if (before !== undefined && set.reps > before) {
        if (
          !repRecord ||
          set.weight > repRecord.value ||
          (set.weight === repRecord.value && set.reps > (repRecord.previous ?? 0))
        ) {
          repRecord = {
            exerciseId: entry.exerciseId,
            kind: 'reps-at-weight',
            value: set.weight,
            previous: before,
            detail: `${name}: ${set.reps} reps at ${set.weight} ${u} (was ${before})`,
          };
        }
      }
    }
    if (repRecord) found.push(repRecord);

    const volume = sessionVolume(sets);
    if (volume !== null && baseline.bestVolume !== null && volume > baseline.bestVolume) {
      found.push({
        exerciseId: entry.exerciseId,
        kind: 'volume',
        value: volume,
        previous: baseline.bestVolume,
        detail: `${name}: ${volume.toLocaleString()} ${u} session volume (was ${baseline.bestVolume.toLocaleString()})`,
      });
    }

    if (
      heaviest !== null &&
      topOfRange(sets) &&
      baseline.bestWeight !== null &&
      heaviest >= baseline.bestWeight &&
      !baseline.topOfRangeAt.has(heaviest)
    ) {
      found.push({
        exerciseId: entry.exerciseId,
        kind: 'top-of-range',
        value: heaviest,
        previous: null,
        detail: `${name}: top of the range on every set at ${heaviest} ${u}`,
      });
    }
  }
  return found;
}

export interface LiveRecord {
  kind: PersonalRecordKind;
  label: string;
}

/** Compact in-workout feedback: what the logged sets of one exercise have already beaten. */
export function liveSetRecords(
  exerciseId: string,
  logged: readonly CompletedSet[],
  history: readonly WorkoutRecord[],
): LiveRecord[] {
  const baseline = baselineFor(exerciseId, history);
  if (baseline.sessions === 0) return [];
  const sets = logged.filter((set) => set.kind === 'working' && !set.skipped);
  const badges: LiveRecord[] = [];
  const weights = sets.map((set) => set.weight).filter((w): w is number => w !== null);
  if (
    weights.length > 0 &&
    baseline.bestWeight !== null &&
    Math.max(...weights) > baseline.bestWeight
  ) {
    badges.push({ kind: 'weight', label: 'Weight PR' });
  }
  if (
    sets.some((set) => {
      if (set.weight === null) return false;
      const before = baseline.repsAtWeight.get(set.weight);
      return before !== undefined && set.reps > before;
    })
  ) {
    badges.push({ kind: 'reps-at-weight', label: 'Rep PR' });
  }
  return badges;
}

/** All records in the history, newest first, for the Progress tab. */
export function recentPersonalRecords(
  history: readonly WorkoutRecord[],
  limit = 12,
): { record: WorkoutRecord; pr: PersonalRecord }[] {
  return [...history]
    .sort((a, b) => when(b).localeCompare(when(a)))
    .flatMap((record) => (record.prs ?? []).map((pr) => ({ record, pr })))
    .slice(0, limit);
}
