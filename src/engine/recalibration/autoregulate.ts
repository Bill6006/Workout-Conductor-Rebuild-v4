import type { SetPrescription } from '../workout/types';

/**
 * In-session autoregulation: what the sets still to come should do after the
 * set just logged, read from its reps, its reps in reserve, and the earlier
 * sets of the same exercise this session. The decision is pure; the store
 * turns it into a performance recalibration of that exercise's remaining sets
 * only, and the summary line says why.
 */

export interface LoggedSetOutcome {
  reps: number;
  rir: number | null;
  weight: number | null;
  targetReps: [number, number];
  targetRir: number;
}

export interface AutoregulationInput {
  /** The set just logged, with its prescription. */
  set: LoggedSetOutcome;
  /** Earlier completed working sets of the same exercise this session, oldest first. */
  earlier: readonly LoggedSetOutcome[];
  /** Load step for this exercise in the profile's unit. */
  step: number;
  /** Working sets of the exercise still to come. */
  remaining: number;
  setNumber: number;
  units: string;
}

export type AutoregulationPlan =
  | { kind: 'none'; reason: string }
  | { kind: 'weight'; delta: number; reason: string }
  | { kind: 'reps'; shift: 2 | -2; reason: string };

export const FAR_FROM_TARGET_REPS = 3;

function nextSets(remaining: number, verb: [string, string]): string {
  return remaining === 1 ? `the next set ${verb[0]}` : `the next ${remaining} sets ${verb[1]}`;
}

export function autoregulate(input: AutoregulationInput): AutoregulationPlan {
  const { set, earlier, step, remaining, setNumber, units } = input;
  const [min, max] = set.targetReps;
  const hasWeight = set.weight !== null;
  const reserve = set.rir;
  if (remaining <= 0) return { kind: 'none', reason: 'No sets left to adjust.' };

  const overTop = set.reps >= max;
  const clearlyEasy = overTop && reserve !== null && reserve >= set.targetRir + 2;
  const farOver = set.reps >= max + FAR_FROM_TARGET_REPS;
  const previous = earlier[earlier.length - 1];
  const twoOver =
    overTop &&
    previous !== undefined &&
    previous.reps >= previous.targetReps[1] &&
    (reserve === null || reserve >= set.targetRir);

  if (clearlyEasy || farOver || twoOver) {
    const why = clearlyEasy
      ? `Set ${setNumber}: ${set.reps} reps with ${reserve} in reserve against a target of ${set.targetRir}`
      : farOver
        ? `Set ${setNumber}: ${set.reps} reps, well past the ${min}-${max} target`
        : `Sets ${setNumber - 1} and ${setNumber} both cleared the top of the range`;
    if (hasWeight) {
      return {
        kind: 'weight',
        delta: step,
        reason: `${why}: ${nextSets(remaining, ['goes', 'go'])} up ${step} ${units}.`,
      };
    }
    return {
      kind: 'reps',
      shift: 2,
      reason: `${why}: aim two reps higher on ${nextSets(remaining, ['', '']).trim()}.`,
    };
  }

  const underFloor = set.reps < min;
  const grind = underFloor && reserve !== null && reserve <= 0;
  const farUnder = set.reps <= min - FAR_FROM_TARGET_REPS;
  if (grind || farUnder) {
    const why = grind
      ? `Set ${setNumber}: ${set.reps} reps with nothing in reserve, under the ${min} floor`
      : `Set ${setNumber}: ${set.reps} reps, well under the ${min}-${max} target`;
    if (hasWeight) {
      return {
        kind: 'weight',
        delta: -step,
        reason: `${why}: ${nextSets(remaining, ['comes', 'come'])} down ${step} ${units} so the reps come back.`,
      };
    }
    return {
      kind: 'reps',
      shift: -2,
      reason: `${why}: aim two reps lower on ${nextSets(remaining, ['', '']).trim()}.`,
    };
  }

  return {
    kind: 'none',
    reason: `Set ${setNumber}: ${set.reps} reps${reserve === null ? '' : ` with ${reserve} in reserve`} is on target; nothing changes.`,
  };
}

/** The prescription part of a logged set, from the workout's set list. */
export function outcomeFor(
  prescription: Pick<SetPrescription, 'targetReps' | 'targetRir'>,
  actual: { reps: number; rir: number | null; weight: number | null },
): LoggedSetOutcome {
  return {
    reps: actual.reps,
    rir: actual.rir,
    weight: actual.weight,
    targetReps: prescription.targetReps,
    targetRir: prescription.targetRir,
  };
}
