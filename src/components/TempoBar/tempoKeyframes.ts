import type { TempoPhase } from '../../features/workout/tempo';

/**
 * Pure keyframe maths for the tempo bar: where the fill is through one rep
 * and when each phase is active, as offsets from 0 to 1.
 */

export interface FillKeyframe extends Keyframe {
  width: string;
  offset: number;
}

export interface PhaseWindow {
  key: TempoPhase['key'];
  start: number;
  end: number;
}

function secondsOf(phases: readonly TempoPhase[], key: TempoPhase['key']): number {
  return phases.find((phase) => phase.key === key)?.seconds ?? 0;
}

/**
 * The fill mirrors where the weight is: full at the top, empty at the bottom.
 * One cycle lowers at the lowering pace, holds at the bottom, lifts at the
 * lifting pace, then holds at the top for the squeeze, and repeats.
 */
export function fillKeyframes(phases: readonly TempoPhase[]): FillKeyframe[] {
  const lower = secondsOf(phases, 'lower');
  const hold = secondsOf(phases, 'hold');
  const lift = secondsOf(phases, 'lift');
  const squeeze = secondsOf(phases, 'squeeze');
  const total = lower + hold + lift + squeeze;
  if (total <= 0) return [];
  const at = (seconds: number) => Math.min(1, Math.round((seconds / total) * 1000) / 1000);
  return [
    { width: '100%', offset: 0 },
    { width: '0%', offset: at(lower) },
    { width: '0%', offset: at(lower + hold) },
    { width: '100%', offset: at(lower + hold + lift) },
    { width: '100%', offset: 1 },
  ];
}

/** When each phase is active within one cycle, as offsets from 0 to 1. */
export function phaseWindows(phases: readonly TempoPhase[]): PhaseWindow[] {
  const total = phases.reduce((sum, phase) => sum + phase.seconds, 0);
  if (total <= 0) return [];
  let elapsed = 0;
  const windows: PhaseWindow[] = [];
  for (const key of ['lower', 'hold', 'lift', 'squeeze'] as const) {
    const seconds = secondsOf(phases, key);
    if (seconds <= 0) continue;
    const start = Math.round((elapsed / total) * 1000) / 1000;
    elapsed += seconds;
    windows.push({ key, start, end: Math.min(1, Math.round((elapsed / total) * 1000) / 1000) });
  }
  return windows;
}
