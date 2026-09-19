import type {
  ExperienceLevel,
  PainArea,
  PrimaryGoal,
  ProgramStyle,
  RestStyle,
  SecondaryGoal,
  Sex,
  ShoulderLimitation,
  UnitSystem,
  UserProfile,
  Weekday,
} from '../../core/validation/profile';
import type { LocationKind } from '../../core/validation/location';
import { styleChoice } from '../../core/validation/profile';
import { adviseStyle } from '../../engine/planning/styleAdvice';
import { STYLES, STYLE_ORDER } from '../../engine/planning/styles';

export interface LabelledOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export const GOAL_OPTIONS: readonly LabelledOption<PrimaryGoal>[] = [
  {
    value: 'build-muscle',
    label: 'Build muscle',
    description: 'Even volume across every muscle',
  },
  {
    value: 'bigger-arms',
    label: 'Bigger arms',
    description: 'Extra direct biceps and triceps work',
  },
  {
    value: 'bigger-chest',
    label: 'Bigger chest',
    description: 'Pressing and fly volume take priority',
  },
  {
    value: 'overall-size',
    label: 'More overall size',
    description: 'Legs, back, and chest lead',
  },
  {
    value: 'strength',
    label: 'Strength progress',
    description: 'Squats, presses, and pulls lead every session',
  },
];

export const SECONDARY_GOAL_OPTIONS: readonly LabelledOption<SecondaryGoal>[] = [
  ...GOAL_OPTIONS,
  { value: 'none', label: 'No secondary goal' },
];

export const EXPERIENCE_OPTIONS: readonly LabelledOption<ExperienceLevel>[] = [
  { value: 'beginner', label: 'Beginner', description: 'Under a year of consistent lifting' },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: '1 to 4 years, knows the main lifts',
  },
  { value: 'advanced', label: 'Advanced', description: 'Years of progressive training' },
];

/** Auto first, then every style the research tells apart; Auto says what it comes to right now. */
export function styleOptions(
  profile: Pick<UserProfile, 'goals' | 'experience'>,
): LabelledOption<ProgramStyle>[] {
  return [
    {
      value: 'auto',
      label: 'Auto',
      description: `Your goals choose: ${STYLES[adviseStyle(profile).style].name} right now`,
    },
    ...STYLE_ORDER.map((id) => ({
      value: id,
      label: STYLES[id].name,
      description: STYLES[id].line,
    })),
  ];
}

/** "Auto · Hypertrophy focus" under Auto, the style's own name otherwise. */
export function styleLabel(
  profile: Pick<UserProfile, 'programStyle' | 'trainingStyle' | 'goals' | 'experience'>,
): string {
  const choice = styleChoice(profile);
  return choice === 'auto'
    ? `Auto · ${STYLES[adviseStyle(profile).style].name}`
    : STYLES[choice].name;
}

export const REST_STYLE_OPTIONS: readonly LabelledOption<RestStyle>[] = [
  { value: 'short', label: 'Short', description: 'Dense sessions, quicker pace' },
  { value: 'standard', label: 'Standard', description: 'Programmed rests as written' },
  { value: 'long', label: 'Long', description: 'Full recovery between heavy sets' },
];

export const SEX_OPTIONS: readonly LabelledOption<Sex | 'unspecified'>[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

export const UNIT_OPTIONS: readonly LabelledOption<UnitSystem>[] = [
  { value: 'lb', label: 'Pounds (lb)' },
  { value: 'kg', label: 'Kilograms (kg)' },
];

export const WEEKDAY_OPTIONS: readonly LabelledOption<Weekday>[] = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

export const PAIN_AREA_OPTIONS: readonly LabelledOption<PainArea>[] = [
  { value: 'neck', label: 'Neck' },
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'wrist', label: 'Wrist' },
  { value: 'lower-back', label: 'Lower back' },
  { value: 'hip', label: 'Hip' },
  { value: 'knee', label: 'Knee' },
  { value: 'ankle', label: 'Ankle' },
];

export const SHOULDER_LIMITATION_OPTIONS: readonly LabelledOption<ShoulderLimitation>[] = [
  { value: 'avoid-overhead-pressing', label: 'Avoid overhead pressing' },
  { value: 'avoid-behind-neck', label: 'Avoid behind-the-neck moves' },
  { value: 'avoid-dips', label: 'Avoid dips' },
  { value: 'avoid-wide-grip-pressing', label: 'Avoid wide-grip pressing' },
];

export const LOCATION_KIND_OPTIONS: readonly LabelledOption<LocationKind>[] = [
  { value: 'home', label: 'Home' },
  { value: 'gym', label: 'Gym' },
  { value: 'travel', label: 'Travel' },
  { value: 'custom', label: 'Custom' },
];

export const FREQUENCY_OPTIONS: readonly LabelledOption<'2' | '3' | '4' | '5' | '6'>[] = [
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6' },
];

export const DURATION_OPTIONS: readonly LabelledOption<'30' | '45' | '60' | '75' | '90'>[] = [
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
  { value: '75', label: '75 min' },
  { value: '90', label: '90 min' },
];

export function labelFor<T extends string>(
  options: readonly LabelledOption<T>[],
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
