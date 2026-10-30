import type { TrainingRole } from '../../catalog/exercises/exerciseSchema';
import { restCategory } from '../../engine/progression/roles';
import type { SetKind, SetTier, WorkoutEntry } from '../../engine/workout/types';

/**
 * Effort (reps in reserve) and rest guidance for the set at hand, each with
 * the evidence behind it. Like tempo, this is shown, never enforced: the
 * targets come from the progression roles and the user logs what happened.
 */

export interface Guidance {
  label: string;
  why: string;
  evidence: string[];
}

export const EFFORT_EVIDENCE = {
  scale:
    'RIR is reps in reserve: how many more clean reps you could have done. The scale tracks true effort well in trained lifters (Zourdos et al., 2016; Helms et al., 2016).',
  strength:
    'Strength gains are the same whether or not a set reaches failure, and stopping 1 to 3 reps short keeps fatigue and injury risk down (Grgic et al., 2022, meta-analysis; Robinson et al., 2024, meta-regression).',
  hypertrophy:
    'Muscle growth improves a little the closer a set gets to failure, so hypertrophy sets stop about one rep short (Robinson et al., 2024; Refalo et al., 2023, meta-analysis).',
  isolation:
    'Isolation moves cost little fatigue, so they can run to one rep short, or to the last clean rep as a finisher (Refalo et al., 2023).',
  ramp: 'Ramp sets are warm-ups: far from failure so they prepare the movement without tiring you, and they never count as working sets.',
  drop: 'A drop set extends the last set with a lighter load to the last clean rep; it adds volume in little time without extra sets (Iversen et al., 2021, review).',
  backOffs:
    "A top set, then lighter sets at the same reps, built strength and size as straight sets did in the closest trials (Fish et al., 2003; Angleri et al., 2017; Lima et al., 2018); the back-offs follow the top set's load, a few percent lighter (Helms et al., 2018).",
} as const;

export const REST_EVIDENCE = {
  strength:
    'Compound strength sets need 2 min or more to recover force between sets; shorter rests cost reps and strength gains (Grgic et al., 2018, review; Schoenfeld et al., 2016).',
  hypertrophy:
    'For growth, rests of about 2 min beat 1 min on compound lifts, and hypertrophy plateaus around 2 min (Schoenfeld et al., 2016; Singer et al., 2024, meta-analysis; Grgic et al., 2017).',
  isolation:
    'Isolation moves recover faster, so 60 to 90 s is enough; short rests suit them and pairings (Grgic et al., 2017; Iversen et al., 2021).',
  fitted:
    'When a session is fitted to less time, rests shorten toward these floors first, because a slightly shorter rest costs less than a missing set (Iversen et al., 2021).',
  style:
    'Your rest style in Settings scales every rest by 0.8, 1, or 1.2; the floors below never move.',
} as const;

export function effortGuidance(
  kind: SetKind,
  targetRir: number,
  role: TrainingRole,
  /** A hold counts seconds, not reps, so there are no reps to keep in reserve. */
  hold = false,
  /** A core stability move is never taken to failure (Maintenance 23). */
  coreStability = false,
  /** The top set or a back-off of a main lift on top set plus back-offs (Maintenance 32, item 11). */
  tier?: SetTier,
): Guidance {
  if (hold) {
    return {
      label: 'Good form',
      why: 'hold the position for the seconds, and stop when it slips',
      evidence: [],
    };
  }
  if (kind === 'warmup') {
    return {
      label: `RIR ${targetRir} · easy`,
      why: 'a warm-up, far from failure, just rehearsing the movement',
      evidence: [EFFORT_EVIDENCE.ramp, EFFORT_EVIDENCE.scale],
    };
  }
  if (kind === 'drop') {
    return {
      label: 'last clean rep',
      why: 'lighter load, run to the last rep you can do with good form',
      evidence: [EFFORT_EVIDENCE.drop, EFFORT_EVIDENCE.scale],
    };
  }
  if (coreStability) {
    return {
      label: `RIR ${targetRir}`,
      why: `stop ${targetRir} clean ${targetRir === 1 ? 'rep' : 'reps'} short, before your form slips`,
      evidence: [EFFORT_EVIDENCE.scale],
    };
  }
  if (tier) {
    return {
      label: `RIR ${targetRir}`,
      why:
        tier === 'top'
          ? `top set: stop ${targetRir} clean ${targetRir === 1 ? 'rep' : 'reps'} short of failure; the back-offs follow it`
          : // After the top set, never "lighter": a drop narrowed to nothing puts a back-off at the
            // top set's load (the fresh review before shipping); "Why this target" gives the load.
            `back-off: after the top set, stop ${targetRir} clean ${targetRir === 1 ? 'rep' : 'reps'} short`,
      evidence: [EFFORT_EVIDENCE.backOffs, EFFORT_EVIDENCE.strength, EFFORT_EVIDENCE.scale],
    };
  }
  switch (restCategory(role)) {
    case 'strength':
      return {
        label: `RIR ${targetRir}`,
        why: `stop ${targetRir} clean ${targetRir === 1 ? 'rep' : 'reps'} short of failure on every working set`,
        evidence: [EFFORT_EVIDENCE.strength, EFFORT_EVIDENCE.scale],
      };
    case 'hypertrophy':
      return {
        label: `RIR ${targetRir}`,
        why: `stop ${targetRir} clean ${targetRir === 1 ? 'rep' : 'reps'} short; close to failure, not at it`,
        evidence: [EFFORT_EVIDENCE.hypertrophy, EFFORT_EVIDENCE.scale],
      };
    default:
      return {
        label: targetRir === 0 ? 'RIR 0 · last clean rep' : `RIR ${targetRir}`,
        why:
          targetRir === 0
            ? 'finisher: run to the last clean rep'
            : `stop ${targetRir} clean ${targetRir === 1 ? 'rep' : 'reps'} short; isolation work can go closer to failure`,
        evidence: [EFFORT_EVIDENCE.isolation, EFFORT_EVIDENCE.scale],
      };
  }
}

function restLabel(seconds: number): string {
  return seconds >= 60 ? `${Math.round((seconds / 60) * 10) / 10} min` : `${seconds} s`;
}

export function restGuidance(role: TrainingRole, restSeconds: number, fitted = false): Guidance {
  const category = restCategory(role);
  const evidence = [
    category === 'strength'
      ? REST_EVIDENCE.strength
      : category === 'hypertrophy'
        ? REST_EVIDENCE.hypertrophy
        : REST_EVIDENCE.isolation,
    ...(fitted ? [REST_EVIDENCE.fitted] : []),
    REST_EVIDENCE.style,
  ];
  const why =
    category === 'strength'
      ? 'full rests so every heavy set gets the same force'
      : category === 'hypertrophy'
        ? 'long enough to keep the reps, short enough to keep the session moving'
        : 'short rests suit isolation work and pairings';
  return { label: `Rest ${restLabel(restSeconds)}`, why, evidence };
}

/**
 * What "Why this target" says of a main lift on top set plus back-offs (Maintenance 32, item 11):
 * its back-offs, and that they follow the top set. Null for a lift on straight sets.
 */
export function backOffNote(entry: WorkoutEntry, units: 'lb' | 'kg'): string | null {
  const backOffs = entry.sets.filter((set) => set.tier === 'back-off');
  const top = entry.sets.find((set) => set.tier === 'top');
  const first = backOffs[0];
  if (!top || !first || entry.backOffDrop === undefined) return null;
  const load = first.targetWeight === null ? '' : ` at ${first.targetWeight} ${units}`;
  const drop = Math.round(entry.backOffDrop * 100);
  // A drop narrowed to nothing, or one the place's weights round back up, is the top set's load,
  // never "0% lighter" (the fresh review before shipping).
  const atTop =
    drop === 0 || (first.targetWeight !== null && first.targetWeight === top.targetWeight);
  const lighter = atTop ? ", the top set's load," : `, ${drop}% lighter`;
  return `Top set, then ${backOffs.length} ${backOffs.length === 1 ? 'back-off' : 'back-offs'}${load}${lighter} at ${first.targetRir} in reserve: they follow the top set as you lift it, and back-offs missed never hold back the top set's next step: they widen the drop.`;
}
