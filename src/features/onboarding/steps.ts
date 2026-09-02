import type { ProfileDraft } from '../profile/draft';

export const ONBOARDING_STEPS = [
  {
    id: 'goals',
    title: 'What are you training for?',
    subtitle: 'The conductor programs around your goals. Build Muscle is the default.',
  },
  {
    id: 'schedule',
    title: 'How often, and how long?',
    subtitle: 'Sessions per week, your typical length, and the days that work.',
  },
  {
    id: 'places',
    title: 'Where do you train?',
    subtitle: 'Home equipment and gym access. You can add travel or custom places later.',
  },
  {
    id: 'exercises',
    title: 'Exercises you love or avoid',
    subtitle: 'Preferred moves get priority. Disliked moves never appear.',
  },
  {
    id: 'limitations',
    title: 'Anything to work around?',
    subtitle: 'Pain and movement limits shape every workout and every alternative.',
  },
  {
    id: 'style',
    title: 'Style and techniques',
    subtitle: 'Hybrid strength + hypertrophy is the default. Techniques stay optional.',
  },
  {
    id: 'units',
    title: 'Units and bodyweight',
    subtitle: 'Bodyweight is optional and only used for bodyweight-based targets.',
  },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]['id'];

export const STEP_COUNT = ONBOARDING_STEPS.length;

export function stepIndex(id: OnboardingStepId): number {
  return ONBOARDING_STEPS.findIndex((step) => step.id === id);
}

/** Returns human-readable problems that block moving past a step. */
export function validateStep(id: OnboardingStepId, draft: ProfileDraft): string[] {
  const problems: string[] = [];
  const { profile } = draft;
  switch (id) {
    case 'schedule': {
      const days = profile.schedule.availableDays.length;
      if (days === 0) problems.push('Pick at least one training day.');
      if (profile.schedule.weeklyFrequency > days && days > 0) {
        problems.push(
          `You chose ${profile.schedule.weeklyFrequency} sessions but only ${days} available day${days === 1 ? '' : 's'}.`,
        );
      }
      break;
    }
    case 'places': {
      const home = draft.locations.find((location) => location.id === 'home');
      const gym = draft.locations.find((location) => location.id === 'gym');
      if (!gym && home && home.equipment.length === 0) {
        problems.push(
          'Without gym access, add at least one piece of home equipment (bodyweight-only support arrives with the catalog).',
        );
      }
      break;
    }
    case 'units': {
      if (
        profile.bodyweight !== undefined &&
        !(profile.bodyweight > 0 && profile.bodyweight <= 1000)
      ) {
        problems.push('Bodyweight must be a positive number.');
      }
      break;
    }
    default:
      break;
  }
  return problems;
}

export function validateAll(draft: ProfileDraft): string[] {
  return ONBOARDING_STEPS.flatMap((step) => validateStep(step.id, draft));
}
