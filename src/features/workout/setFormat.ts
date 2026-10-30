import type { CompletedSet } from '../../engine/recalibration/types';
import { amountText, holdById } from '../../engine/workout/setText';
import type { SetPrescription, WorkoutEntry } from '../../engine/workout/types';

/** A lift's back-offs (Maintenance 32, item 11), in order. */
function backOffsOf(entry: WorkoutEntry): SetPrescription[] {
  return entry.sets.filter((candidate) => candidate.tier === 'back-off');
}

/** "Set 2", "Ramp 1", "Drop", "Top set" or "Back-off 2" for a planned set within its exercise. */
export function describeSet(set: SetPrescription, entry: WorkoutEntry): string {
  const sameKind = entry.sets.filter((candidate) => candidate.kind === set.kind);
  const ordinal = sameKind.indexOf(set) + 1;
  if (set.kind === 'warmup') return `Ramp ${ordinal}`;
  if (set.kind === 'drop') return 'Drop';
  if (set.tier === 'top') return 'Top set';
  if (set.tier === 'back-off') return `Back-off ${backOffsOf(entry).indexOf(set) + 1}`;
  return `Set ${ordinal}`;
}

/** "Sets 2-4" or "Ramps 1-2" for a run of like sets; one set reads as `describeSet` does. */
export function describeSetRange(
  first: SetPrescription,
  last: SetPrescription,
  entry: WorkoutEntry,
): string {
  if (first === last || first.kind === 'drop' || first.tier === 'top') {
    return describeSet(first, entry);
  }
  if (first.tier === 'back-off') {
    const backOffs = backOffsOf(entry);
    return `Back-offs ${backOffs.indexOf(first) + 1}\u2013${backOffs.indexOf(last) + 1}`;
  }
  const sameKind = entry.sets.filter((candidate) => candidate.kind === first.kind);
  const from = sameKind.indexOf(first) + 1;
  const to = sameKind.indexOf(last) + 1;
  return `${first.kind === 'warmup' ? 'Ramps' : 'Sets'} ${from}\u2013${to}`;
}

/**
 * "Set 2 of 3", "Ramp 1 of 2", "Drop set", "Top set" or "Back-off 1 of 3": the one place the
 * current set is named.
 */
export function describeSetPosition(set: SetPrescription, entry: WorkoutEntry): string {
  const sameKind = entry.sets.filter((candidate) => candidate.kind === set.kind);
  const ordinal = sameKind.indexOf(set) + 1;
  if (set.kind === 'drop') return 'Drop set';
  if (set.tier === 'top') return 'Top set';
  if (set.tier === 'back-off') {
    const backOffs = backOffsOf(entry);
    return `Back-off ${backOffs.indexOf(set) + 1} of ${backOffs.length}`;
  }
  const noun = set.kind === 'warmup' ? 'Ramp' : 'Set';
  return `${noun} ${ordinal} of ${sameKind.length}`;
}

/** "185 lb × 6 @ RIR 2", "bodyweight × 12", "45 s" or "50 lb × 30 s" for a hold, or "skipped". */
export function formatLogged(set: CompletedSet, units: 'lb' | 'kg'): string {
  if (set.skipped) return 'skipped';
  const hold = holdById(set.exerciseId);
  if (hold && set.weight === null) return amountText(set.reps, true);
  const weight = set.weight === null ? 'bodyweight' : `${set.weight} ${units}`;
  const rir = set.rir === null || hold ? '' : ` @ RIR ${set.rir}`;
  return `${weight} × ${amountText(set.reps, hold)}${rir}`;
}
