import type { WorkoutRecord } from '../../core/validation/workoutRecord';

/**
 * Learning from overrides: when the lifter keeps logging a first working set
 * above or below the suggested load, the next target follows them instead of
 * asking again. Read from saved sets, which keep the target next to the
 * actual load; nothing is stored separately.
 */

export interface OverrideBias {
  /** +1 one step up, -1 one step down, 0 no bias. */
  steps: -1 | 0 | 1;
  above: number;
  below: number;
  compared: number;
  evidence: string | null;
}

export const OVERRIDE_WINDOW = 4;
export const OVERRIDE_MAJORITY = 3;

export function overrideBias(
  history: readonly WorkoutRecord[],
  exerciseId: string,
  step: number,
): OverrideBias {
  const newestFirst = [...history].sort((a, b) =>
    (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt),
  );
  let above = 0;
  let below = 0;
  let compared = 0;
  for (const record of newestFirst) {
    if (compared >= OVERRIDE_WINDOW) break;
    const entry = record.entries.find((candidate) => candidate.exerciseId === exerciseId);
    const first = entry?.sets.find((set) => set.kind === 'working' && set.completed);
    if (!first || first.weight === null || typeof first.targetWeight !== 'number') continue;
    compared += 1;
    if (first.weight >= first.targetWeight + step * 0.5) above += 1;
    else if (first.weight <= first.targetWeight - step * 0.5) below += 1;
  }
  if (above >= OVERRIDE_MAJORITY) {
    return {
      steps: 1,
      above,
      below,
      compared,
      evidence: `You lifted above the suggested load in ${above} of the last ${compared} sessions: the target steps up to meet you.`,
    };
  }
  if (below >= OVERRIDE_MAJORITY) {
    return {
      steps: -1,
      above,
      below,
      compared,
      evidence: `You chose less than the suggested load in ${below} of the last ${compared} sessions: the target steps down to meet you.`,
    };
  }
  return { steps: 0, above, below, compared, evidence: null };
}
