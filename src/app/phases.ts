/**
 * The nine execution phases from the Workout Conductor execution plan.
 *
 * CURRENT_PHASE drives the visible build marker and the "arrives in Phase N"
 * labels in the shell. It is mirrored in vite.config.ts and cross-checked by
 * scripts/verify-build.mjs so the two can never drift apart.
 */

export interface PhaseDefinition {
  readonly number: number;
  readonly name: string;
}

export const PHASES: readonly PhaseDefinition[] = [
  { number: 0, name: 'Repository, Live Pages, and Scaffold' },
  { number: 1, name: 'Product Foundation and First Useful Live Preview' },
  { number: 2, name: 'Exercise Catalog, Media, and Conflict Engine' },
  { number: 3, name: 'Workout Generation and Duration Engine' },
  { number: 4, name: 'Central Recalibration Engine' },
  { number: 5, name: 'Active Workout, Logging, and Superset Experience' },
  { number: 6, name: 'Adaptive Coach, Progression, Strategy, and Recovery' },
  { number: 7, name: 'Progress, Plan, Coverage, PRs, and Session Summary' },
  { number: 8, name: 'Data Safety, Optional Migration, PWA, Polish, and Acceptance' },
];

export const CURRENT_PHASE = 3;

/**
 * Gate state of the current phase as shipped in this build.
 * "yellow" means the phase work is complete and awaits the owner's Android review.
 * Only the owner can mark a phase GREEN; the app never claims that itself.
 */
export type PhaseGate = 'in-progress' | 'yellow';

export const CURRENT_PHASE_GATE: PhaseGate = 'yellow';

export function getPhase(number: number): PhaseDefinition {
  const phase = PHASES.find((candidate) => candidate.number === number);
  if (!phase) {
    throw new RangeError(`Unknown phase ${number}`);
  }
  return phase;
}
