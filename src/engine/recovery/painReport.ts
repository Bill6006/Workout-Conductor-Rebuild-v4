import { allExercises } from '../../catalog/exercises/catalog';
import type { Joint } from '../../catalog/exercises/exerciseSchema';
import { jointWord } from '../../catalog/exercises/joints';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';

/**
 * Pain the lifter reported when saving a workout, and where. Only the newest
 * saved workout counts, however long ago it was: it is "last time" until the
 * next workout is saved, which answers the question again. A rating that says
 * pain without saying where names nothing, so nothing is guessed from it
 * (Maintenance 20).
 */

export interface PainReport {
  recordId: string;
  joint: Joint;
  /** When the workout was saved: its completion, or its start. */
  at: string;
  title: string;
}

function savedAt(record: WorkoutRecord): string {
  return record.completedAt ?? record.startedAt;
}

export function lastPainReport(history: readonly WorkoutRecord[]): PainReport | null {
  let newest: WorkoutRecord | undefined;
  for (const record of history) {
    if (!newest || Date.parse(savedAt(record)) > Date.parse(savedAt(newest))) newest = record;
  }
  const joint = newest?.rating?.pain ? newest.rating.joint : undefined;
  if (!newest || !joint) return null;
  return { recordId: newest.id, joint, at: savedAt(newest), title: newest.title ?? 'Workout' };
}

/**
 * Joints some exercise loads at moderate or high stress: the only ones the coach can ever flag.
 * Read each time, so an exercise added later counts.
 */
function flaggableJoints(): Set<Joint> {
  const joints = new Set<Joint>();
  for (const exercise of allExercises()) {
    for (const [joint, stress] of Object.entries(exercise.jointStress)) {
      if (stress === 'moderate' || stress === 'high') joints.add(joint as Joint);
    }
  }
  return joints;
}

/** Where a warning came from, for example "Sep 20, Upper body: shoulder". */
export function painSourceLine(report: PainReport): string {
  const date = new Date(report.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${date}, ${report.title}: ${jointWord(report.joint)}`;
}

type Rating = WorkoutRecord['rating'];

/** How a saved rating names its pain: "shoulder pain", "pain" when it did not say where, or null. */
export function ratingPainWords(rating: Rating): string | null {
  if (!rating?.pain) return null;
  return rating.joint ? `${jointWord(rating.joint)} pain` : 'pain';
}

/**
 * The line after a workout that reported pain. It says what the app will do, which is flag the
 * exercises that load that joint, and promises nothing more: a joint no exercise loads (the
 * neck, say) is only noted.
 */
export function painNextLine(rating: Rating): string | null {
  if (!rating?.pain) return null;
  if (!rating.joint) return 'Pain noted.';
  const words = jointWord(rating.joint);
  const named = `${words.charAt(0).toUpperCase()}${words.slice(1)} pain noted`;
  return flaggableJoints().has(rating.joint)
    ? `${named}: next time the coach flags exercises that load it.`
    : `${named}.`;
}
