import type { CatalogExercise, TrainingRole } from '../../catalog/exercises/exerciseSchema';
import { restCategory } from '../../engine/progression/roles';
import type { SetKind } from '../../engine/workout/types';

/**
 * Tempo guidance for the set at hand, as phases with seconds so a bar can show
 * them in proportion. Tempo follows the set's job (strength, hypertrophy,
 * isolation, ramp, drop), each choice carries the evidence behind it, and it
 * never changes what is logged. Notation is lower-pause-lift-squeeze in
 * seconds; X means as fast as you can.
 */

export type TempoPhaseKey = 'lower' | 'hold' | 'lift' | 'squeeze';

export interface TempoPhase {
  key: TempoPhaseKey;
  /** Seconds the phase takes; a fast lift is modelled as one second for the bar. */
  seconds: number;
  label: string;
  fast?: boolean;
}

export interface TempoCue {
  /** Lower-pause-lift-squeeze, for example 2-1-X-0. */
  tempo: string;
  phases: TempoPhase[];
  totalSeconds: number;
  why: string;
  evidence: string[];
  cue: string | null;
}

export const FAST_LIFT_SECONDS = 1;

export const TEMPO_EVIDENCE = {
  duration:
    'Rep durations from about 0.5 to 8 s build muscle about equally; very slow reps do not (Schoenfeld, Ogborn and Krieger, 2015, meta-analysis).',
  intent:
    'Lifting with maximal intent, even when the bar moves slowly, builds strength and power better than a deliberately slow lift (Behm and Sale, 1993; Wilk, Zajac and Tufano, 2021, review).',
  eccentric:
    'A slower lowering made no clear difference to muscle growth, and gave the same or a little more strength in trained lifters (Amdi and King, 2025, meta-analysis).',
  pause:
    'A brief pause at the bottom removes the bounce so the muscle, not the stretch reflex, moves the load; competition presses are judged the same way (coaching practice rather than a controlled trial).',
  squeeze:
    'A short squeeze at the top with attention on the working muscle raises its activation and, over weeks, its growth (Schoenfeld and Contreras, 2016; Schoenfeld et al., 2018).',
  ramp: 'Ramp sets rehearse the working tempo at light loads: they prepare the movement pattern and never count as work.',
} as const;

function phase(key: TempoPhaseKey, seconds: number, label: string, fast = false): TempoPhase {
  return fast ? { key, seconds: FAST_LIFT_SECONDS, label, fast: true } : { key, seconds, label };
}

export function notation(phases: readonly TempoPhase[]): string {
  return phases.map((item) => (item.fast ? 'X' : String(item.seconds))).join('-');
}

export function truncate(text: string, max = 72): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40))}…`;
}

function build(
  phases: TempoPhase[],
  why: string,
  evidence: string[],
  cue: string | null,
): TempoCue {
  return {
    tempo: notation(phases),
    phases,
    totalSeconds: phases.reduce((sum, item) => sum + item.seconds, 0),
    why,
    evidence,
    cue,
  };
}

export function tempoCue(
  role: TrainingRole,
  kind: SetKind,
  exercise: CatalogExercise,
  options: { capped?: boolean } = {},
): TempoCue {
  const cue = exercise.instructions.execution[0]
    ? truncate(exercise.instructions.execution[0])
    : null;
  const lower = (seconds: number) => phase('lower', seconds, 'Lower');
  const hold = (seconds: number) => phase('hold', seconds, 'Hold');
  const lift = (seconds: number, fast = false) => phase('lift', seconds, 'Lift', fast);
  const squeeze = (seconds: number) => phase('squeeze', seconds, 'Squeeze');

  if (kind === 'warmup') {
    return build(
      [lower(2), hold(0), lift(1), squeeze(0)],
      'ramp set: easy load, rehearse the working tempo',
      [TEMPO_EVIDENCE.ramp, TEMPO_EVIDENCE.duration],
      cue,
    );
  }
  if (kind === 'drop') {
    return build(
      [lower(2), hold(0), lift(1), squeeze(0)],
      'drop set: keep every rep clean while the load comes down',
      [TEMPO_EVIDENCE.duration, TEMPO_EVIDENCE.eccentric],
      cue,
    );
  }
  if (options.capped) {
    // The heaviest weight the place has: a slower lowering and a pause make it heavier per rep.
    // A strength set still drives up as fast as it can (Maintenance 21).
    if (restCategory(role) === 'strength') {
      return build(
        [lower(3), hold(1), lift(1, true), squeeze(0)],
        'at the heaviest weight here: lower for 3, pause 1, drive up as fast as you can',
        [TEMPO_EVIDENCE.eccentric, TEMPO_EVIDENCE.intent, TEMPO_EVIDENCE.pause],
        cue,
      );
    }
    return build(
      [lower(3), hold(1), lift(1), squeeze(0)],
      'at the heaviest weight here: lower for 3, pause 1, make every rep count',
      [TEMPO_EVIDENCE.eccentric, TEMPO_EVIDENCE.pause, TEMPO_EVIDENCE.duration],
      cue,
    );
  }
  switch (restCategory(role)) {
    case 'strength':
      return build(
        [lower(2), hold(1), lift(1, true), squeeze(0)],
        'lower for 2, pause 1 at the bottom, drive up as fast as you can',
        [TEMPO_EVIDENCE.intent, TEMPO_EVIDENCE.pause, TEMPO_EVIDENCE.eccentric],
        cue,
      );
    case 'hypertrophy':
      return build(
        [lower(3), hold(0), lift(1), squeeze(0)],
        'lower for 3 to load the stretch, no pause, up under control',
        [TEMPO_EVIDENCE.eccentric, TEMPO_EVIDENCE.duration],
        cue,
      );
    default:
      return build(
        [lower(2), hold(0), lift(2), squeeze(1)],
        'lower for 2, up for 2, squeeze the muscle for 1 at the top',
        [TEMPO_EVIDENCE.squeeze, TEMPO_EVIDENCE.duration],
        cue,
      );
  }
}
