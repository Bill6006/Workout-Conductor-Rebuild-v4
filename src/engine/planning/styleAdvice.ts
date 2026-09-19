import {
  styleChoice,
  type PrimaryGoal,
  type SecondaryGoal,
  type StyleId,
  type UserProfile,
} from '../../core/validation/profile';
import type { StallDiagnosis } from '../strategy/plateau';
import type { SourceId } from './styles';

/**
 * Which programming style fits the lifter, from what the profile already says
 * about them: experience, which way bodyweight is going, and the goals. The
 * rules run in a fixed order and each one names its reason and its sources, so
 * the answer can be read and argued with. It reads settings only, never the
 * training log: an automatic choice that moved with every good or bad week
 * would change the plan under the lifter's feet. What the log has to say (a
 * run of stalled lifts) comes through the coach as an offer with a tap.
 */

export interface StyleAdvice {
  style: StyleId;
  /** What about the lifter decided it, in plain sentences. */
  reasons: string[];
  /** The studies the deciding rule rests on. */
  sources: SourceId[];
  /** A setting that would change the answer, when there is one worth naming. */
  hint: string | null;
}

const SIZE_GOALS: ReadonlySet<PrimaryGoal | SecondaryGoal> = new Set([
  'build-muscle',
  'bigger-arms',
  'bigger-chest',
  'overall-size',
  'balanced',
]);

type AdviceProfile = Pick<UserProfile, 'goals' | 'experience'>;

export function adviseStyle(profile: AdviceProfile): StyleAdvice {
  const { goals, experience } = profile;
  const losing = goals.bodyweight === 'lose';

  if (experience === 'beginner') {
    return {
      style: 'foundation',
      reasons: [
        'Under a year of consistent lifting: small doses at moderate loads build the fastest, and the lifts themselves are still being learned.',
        ...(losing
          ? ['Losing fat does not change that: the plan holds and the diet does the rest.']
          : []),
      ],
      sources: ['dose2003', 'acsm2009', 'failure2023'],
      hint: 'Set your experience to Intermediate once the main lifts feel practised.',
    };
  }

  if (losing) {
    return {
      style: 'lean-down',
      reasons: [
        'You are losing fat, so the lifting has one job: keep the muscle and strength you have while the diet takes the fat.',
        'The heavy lift stays heavy, the sets stay where they are, and nothing is taken to failure.',
      ],
      sources: ['deficit2022', 'deficitVolume2023', 'retain2011'],
      hint: 'Turn Losing fat off in Goals when the diet ends.',
    };
  }

  const strength = goals.primary === 'strength' || goals.secondary === 'strength';
  const size = SIZE_GOALS.has(goals.primary) || SIZE_GOALS.has(goals.secondary);

  if (strength && size) {
    return {
      style: 'hybrid',
      reasons: [
        'You want strength and size. Strength needs heavy loads on the lift done first; size needs weekly sets at any load. Each session does both.',
      ],
      sources: ['acsm2026', 'order2021', 'load2017'],
      hint: null,
    };
  }
  if (strength) {
    return {
      style: 'strength-focus',
      reasons: [
        'Strength progress is your only goal: heavy loads, the lifts that matter first, and long rests are what move a max.',
      ],
      sources: ['load2017', 'load2021', 'rest2018', 'order2021'],
      hint: null,
    };
  }
  return {
    style: 'hypertrophy-focus',
    reasons: [
      'Your goals are about size. Size follows weekly sets, not how heavy the sets are, so the time goes to volume at moderate loads.',
    ],
    sources: ['volume2017', 'load2017', 'frequency2016'],
    hint: 'Add Strength progress as a goal if you also want your heaviest lifts to climb.',
  };
}

/** The concrete style the engines prescribe from: the lifter's pick, or what Auto comes to. */
export function resolveStyle(
  profile: Pick<UserProfile, 'programStyle' | 'trainingStyle' | 'goals' | 'experience'>,
): StyleId {
  const choice = styleChoice(profile);
  return choice === 'auto' ? adviseStyle(profile).style : choice;
}

/**
 * Lean-down and Foundation take nothing to failure, so neither plans a drop
 * set nor is offered one: stopping short costs no muscle (Refalo et al., 2023),
 * and both lifters have a reason to spare the recovery.
 */
export function allowsFailure(style: StyleId): boolean {
  return style !== 'lean-down' && style !== 'foundation';
}

export function isAutoStyle(profile: Pick<UserProfile, 'programStyle' | 'trainingStyle'>): boolean {
  return styleChoice(profile) === 'auto';
}

/** Stalled lifts it takes before rotating the rep range is worth offering. */
export const UNDULATING_STALLS = 2;

/**
 * The one thing the training log can say about style: two or more lifts stuck
 * at a fixed rep range, under a style that holds the range fixed, for a lifter
 * past the beginner stage. That is the case the undulating research speaks to.
 */
export function undulatingCase(
  profile: Pick<UserProfile, 'programStyle' | 'trainingStyle' | 'goals' | 'experience'>,
  stalls: readonly StallDiagnosis[],
): StallDiagnosis[] {
  if (profile.experience === 'beginner') return [];
  const style = resolveStyle(profile);
  if (style !== 'hybrid' && style !== 'strength-focus') return [];
  const stuck = stalls.filter((stall) => stall.kind === 'stalled-at-effort');
  return stuck.length >= UNDULATING_STALLS ? stuck : [];
}
