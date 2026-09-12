import type { CompletedSet } from '../../engine/recalibration/types';
import type { SetPrescription, WorkoutEntry } from '../../engine/workout/types';

/** "Set 2", "Ramp 1", or "Drop" for a planned set within its exercise. */
export function describeSet(set: SetPrescription, entry: WorkoutEntry): string {
  const sameKind = entry.sets.filter((candidate) => candidate.kind === set.kind);
  const ordinal = sameKind.indexOf(set) + 1;
  if (set.kind === 'warmup') return `Ramp ${ordinal}`;
  if (set.kind === 'drop') return 'Drop';
  return `Set ${ordinal}`;
}

/** "Set 2 of 3", "Ramp 1 of 2", or "Drop set": the one place the current set is named. */
export function describeSetPosition(set: SetPrescription, entry: WorkoutEntry): string {
  const sameKind = entry.sets.filter((candidate) => candidate.kind === set.kind);
  const ordinal = sameKind.indexOf(set) + 1;
  if (set.kind === 'drop') return 'Drop set';
  const noun = set.kind === 'warmup' ? 'Ramp' : 'Set';
  return `${noun} ${ordinal} of ${sameKind.length}`;
}

/** "185 lb × 6 @ RIR 2", "bodyweight × 12", or "skipped". */
export function formatLogged(set: CompletedSet, units: 'lb' | 'kg'): string {
  if (set.skipped) return 'skipped';
  const weight = set.weight === null ? 'bodyweight' : `${set.weight} ${units}`;
  const rir = set.rir === null ? '' : ` @ RIR ${set.rir}`;
  return `${weight} × ${set.reps}${rir}`;
}
