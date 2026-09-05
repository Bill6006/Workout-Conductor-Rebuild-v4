import type { UserProfile } from '../../core/validation/profile';

/**
 * Coaching policy by training experience. The same evidence produces
 * different coaching: a beginner is told why load goes up, an advanced lifter
 * is not told the obvious and gets terser cards, and load moves only after
 * more proof. The policy never changes what is logged or applies anything.
 */

export type ExperienceLevel = UserProfile['experience'];

export interface CoachingPolicy {
  level: ExperienceLevel;
  /** Explain: full reasons and a footer; brief: two lines, no footer, no all-clear card. */
  tone: 'explain' | 'brief';
  whyLines: number;
  /** Show the "follow today's plan" card when nothing outranks the plan. */
  showClearCard: boolean;
  /** Hide signals that only restate a target the lifter already knows how to read. */
  hideObvious: boolean;
  /** Strength roles: clean sessions (floor cleared with reps in reserve) before load moves. */
  cleanSessionsToProgress: number;
  /** Double progression: sessions at the top of the range before load moves. */
  topSessionsToProgress: number;
  /** How far under the prescribed RIR still counts as reps in reserve. */
  reserveTolerance: number;
  /** Exposures without a better estimated max before a lift counts as stalled. */
  stallExposures: number;
  /** Exposures a route step gets before the next step is offered. */
  exposuresPerRouteStep: number;
}

const POLICIES: Record<ExperienceLevel, CoachingPolicy> = {
  beginner: {
    level: 'beginner',
    tone: 'explain',
    whyLines: 3,
    showClearCard: true,
    hideObvious: false,
    cleanSessionsToProgress: 1,
    topSessionsToProgress: 1,
    reserveTolerance: 0.5,
    stallExposures: 3,
    exposuresPerRouteStep: 2,
  },
  intermediate: {
    level: 'intermediate',
    tone: 'brief',
    whyLines: 2,
    showClearCard: false,
    hideObvious: true,
    cleanSessionsToProgress: 1,
    topSessionsToProgress: 1,
    reserveTolerance: 0.5,
    stallExposures: 4,
    exposuresPerRouteStep: 2,
  },
  advanced: {
    level: 'advanced',
    tone: 'brief',
    whyLines: 2,
    showClearCard: false,
    hideObvious: true,
    cleanSessionsToProgress: 2,
    topSessionsToProgress: 2,
    reserveTolerance: 0,
    stallExposures: 4,
    exposuresPerRouteStep: 2,
  },
};

export function coachingPolicy(experience: ExperienceLevel | null | undefined): CoachingPolicy {
  return POLICIES[experience ?? 'intermediate'] ?? POLICIES.intermediate;
}

export function policyLabel(policy: CoachingPolicy): string {
  return policy.level.charAt(0).toUpperCase() + policy.level.slice(1);
}
