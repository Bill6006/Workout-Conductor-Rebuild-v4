import type { WorkoutRecord } from '../../core/validation/workoutRecord';

export interface PreviousPerformance {
  date: string;
  weight: number | null;
  reps: number;
  rir: number | null;
  sets: number;
}

/** The best completed working set of the most recent session that included the exercise. */
export function previousPerformance(
  history: readonly WorkoutRecord[],
  exerciseId: string,
): PreviousPerformance | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const record = history[index];
    if (!record) continue;
    const entry = record.entries.find((candidate) => candidate.exerciseId === exerciseId);
    if (!entry) continue;
    const working = entry.sets.filter((set) => set.kind === 'working' && set.completed);
    if (working.length === 0) continue;
    const best = [...working].sort(
      (a, b) => (b.weight ?? 0) * b.reps - (a.weight ?? 0) * a.reps || b.reps - a.reps,
    )[0];
    if (!best) continue;
    return {
      date: record.completedAt ?? record.startedAt,
      weight: best.weight,
      reps: best.reps,
      rir: best.rir,
      sets: working.length,
    };
  }
  return null;
}
