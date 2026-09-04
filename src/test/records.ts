import type { WorkoutRecord } from '../core/validation/workoutRecord';

export const RECORD_NOW = '2026-09-10T12:00:00.000Z';

export type SetSpec = [reps: number, weight: number | null, rir: number | null];

/** A saved workout with one exercise and completed working sets, `daysAgo` before RECORD_NOW. */
export function record(
  daysAgo: number,
  exerciseId: string,
  sets: SetSpec[],
  target: [number, number] = [4, 6],
  targetRir = 2,
  extra: Partial<WorkoutRecord> = {},
): WorkoutRecord {
  const when = new Date(Date.parse(RECORD_NOW) - daysAgo * 86_400_000).toISOString();
  return {
    id: `w-${exerciseId}-${daysAgo}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: 'push-arms',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId,
        plannedSets: sets.length,
        sets: sets.map(([reps, weight, rir], index) => ({
          kind: 'working' as const,
          reps,
          weight,
          rir,
          completed: true,
          setIndex: index,
          targetReps: target,
          targetRir,
        })),
      },
    ],
    ...extra,
  };
}
