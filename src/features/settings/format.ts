import type { RestoreCounts } from '../../core/backup/backup';

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

export function describeCounts(counts: RestoreCounts): string {
  return [
    `${counts.workouts} workouts`,
    `${counts.locations} places`,
    `${counts.customInstructions} notes`,
    `${counts.customExercises} custom exercises`,
    `${counts.customMedia} demonstrations`,
    `${counts.savedWorkouts} saved workouts`,
  ].join(', ');
}
