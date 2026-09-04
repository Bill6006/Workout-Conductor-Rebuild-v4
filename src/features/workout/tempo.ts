import type { CatalogExercise, TrainingRole } from '../../catalog/exercises/exerciseSchema';
import { restCategory } from '../../engine/progression/roles';
import type { SetKind } from '../../engine/workout/types';

/**
 * A one-line tempo guide and a form cue for the set at hand. Tempo follows the
 * set's job (strength, hypertrophy, isolation, ramp, drop) rather than a
 * prescription per exercise, so it reads as guidance and never changes what is
 * logged. The cue is the exercise's own first execution step.
 */

export interface TempoCue {
  /** Eccentric-pause-concentric, X meaning "as fast as you can". */
  tempo: string;
  why: string;
  cue: string | null;
}

export function truncate(text: string, max = 72): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40))}…`;
}

export function tempoCue(role: TrainingRole, kind: SetKind, exercise: CatalogExercise): TempoCue {
  const cue = exercise.instructions.execution[0]
    ? truncate(exercise.instructions.execution[0])
    : null;
  if (kind === 'warmup') {
    return { tempo: '2-0-1', why: 'ramp set: smooth and easy, rehearse the path', cue };
  }
  if (kind === 'drop') {
    return { tempo: '2-0-1', why: 'drop set: clean reps while the load comes down', cue };
  }
  switch (restCategory(role)) {
    case 'strength':
      return { tempo: '2-1-X', why: 'lower for 2, brief pause, drive up as fast as you can', cue };
    case 'hypertrophy':
      return { tempo: '3-0-1', why: 'lower for 3 to load the stretch, up under control', cue };
    default:
      return { tempo: '2-1-2', why: 'lower for 2, squeeze for 1, up for 2', cue };
  }
}
