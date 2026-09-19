import { z } from 'zod';

/**
 * User profile: goals, schedule, preferences, limitations, techniques, units.
 *
 * Every object is a "loose" object so fields written by a newer app version
 * survive a round trip through an older one (unknown-field preservation).
 * Equipment and locations live in LocationProfile records, never duplicated here.
 */

export const PRIMARY_GOALS = [
  'build-muscle',
  'bigger-arms',
  'bigger-chest',
  'overall-size',
  'strength',
  'balanced',
] as const;
export type PrimaryGoal = (typeof PRIMARY_GOALS)[number];

export const SECONDARY_GOALS = [...PRIMARY_GOALS, 'none'] as const;
export type SecondaryGoal = (typeof SECONDARY_GOALS)[number];

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const TRAINING_STYLES = ['hybrid', 'hypertrophy-focus', 'strength-focus'] as const;
export type TrainingStyle = (typeof TRAINING_STYLES)[number];

/**
 * Everything the Programming style control can hold. A profile syncs between
 * devices, and a copy of the app from before these styles reads `trainingStyle`
 * as a strict list of three, so the newer choices ride in their own optional
 * field (`programStyle`) and `trainingStyle` always keeps a value that older
 * copy can read.
 */
export const PROGRAM_STYLES = [
  'auto',
  'hybrid',
  'hypertrophy-focus',
  'strength-focus',
  'undulating',
  'lean-down',
  'high-rep',
  'foundation',
] as const;
export type ProgramStyle = (typeof PROGRAM_STYLES)[number];
/** A concrete style: what Auto resolves to, and what the engines prescribe from. */
export type StyleId = Exclude<ProgramStyle, 'auto'>;

/** Which way bodyweight is being taken on purpose; it changes what the lifting is for. */
export const BODYWEIGHT_DIRECTIONS = ['lose', 'hold', 'gain'] as const;
export type BodyweightDirection = (typeof BODYWEIGHT_DIRECTIONS)[number];

export const REST_STYLES = ['short', 'standard', 'long'] as const;
export type RestStyle = (typeof REST_STYLES)[number];

export const UNIT_SYSTEMS = ['lb', 'kg'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const PAIN_AREAS = [
  'neck',
  'shoulder',
  'elbow',
  'wrist',
  'lower-back',
  'hip',
  'knee',
  'ankle',
] as const;
export type PainArea = (typeof PAIN_AREAS)[number];

export const SHOULDER_LIMITATIONS = [
  'avoid-overhead-pressing',
  'avoid-behind-neck',
  'avoid-dips',
  'avoid-wide-grip-pressing',
] as const;
export type ShoulderLimitation = (typeof SHOULDER_LIMITATIONS)[number];

export const TYPICAL_DURATIONS = [30, 45, 60, 75, 90] as const;

export const PROFILE_ID = 'current';
export const PROFILE_SCHEMA_VERSION = 1;

const isoDate = z.iso.datetime();
const exerciseName = z.string().trim().min(1).max(60);

export const UserProfileSchema = z.looseObject({
  id: z.literal(PROFILE_ID),
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION),
  goals: z.looseObject({
    primary: z.enum(PRIMARY_GOALS),
    secondary: z.enum(SECONDARY_GOALS),
    /** Optional. A value from a newer copy of the app reads as unset rather than failing the profile. */
    bodyweight: z.enum(BODYWEIGHT_DIRECTIONS).optional().catch(undefined),
  }),
  experience: z.enum(EXPERIENCE_LEVELS),
  schedule: z.looseObject({
    weeklyFrequency: z.number().int().min(1).max(7),
    typicalDurationMinutes: z.number().int().min(15).max(180),
    availableDays: z.array(z.enum(WEEKDAYS)).min(1).max(7),
  }),
  currentLocationId: z.string().min(1),
  exercisePreferences: z.looseObject({
    preferred: z.array(exerciseName).max(40),
    disliked: z.array(exerciseName).max(40),
  }),
  limitations: z.looseObject({
    painAreas: z.array(z.enum(PAIN_AREAS)),
    shoulder: z.array(z.enum(SHOULDER_LIMITATIONS)),
    avoidBarbellSquats: z.boolean(),
    notes: z.string().max(500),
  }),
  trainingStyle: z.enum(TRAINING_STYLES),
  /** The chosen style, Auto included. Absent on profiles from before it: `trainingStyle` stands. */
  programStyle: z.enum(PROGRAM_STYLES).optional().catch(undefined),
  techniques: z.looseObject({
    supersets: z.boolean(),
    dropSets: z.boolean(),
    circuits: z.boolean(),
  }),
  restStyle: z.enum(REST_STYLES),
  units: z.enum(UNIT_SYSTEMS),
  bodyweight: z.number().positive().max(1000).optional(),
  /** Optional and local only: with bodyweight they sharpen the starting weight of a lift with no history. */
  age: z.number().int().min(13).max(100).optional(),
  sex: z.enum(SEXES).optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

/** Plan defaults: Build Muscle first, hybrid hypertrophy + strength, experienced lifter. */
export function createDefaultProfile(now: string, currentLocationId = 'gym'): UserProfile {
  return {
    id: PROFILE_ID,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    goals: { primary: 'build-muscle', secondary: 'bigger-arms' },
    experience: 'intermediate',
    schedule: {
      weeklyFrequency: 4,
      typicalDurationMinutes: 60,
      availableDays: ['mon', 'tue', 'thu', 'fri'],
    },
    currentLocationId,
    exercisePreferences: { preferred: [], disliked: [] },
    limitations: { painAreas: [], shoulder: [], avoidBarbellSquats: false, notes: '' },
    trainingStyle: 'hybrid',
    // The plan's default, written to the newer field too: a profile made from here on has had
    // Auto on offer in setup, so the coach does not raise it again.
    programStyle: 'hybrid',
    techniques: { supersets: true, dropSets: true, circuits: false },
    restStyle: 'standard',
    units: 'lb',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Goals that are no longer offered map onto what they always did in the
 * engines: "Balanced development" added nothing, exactly like "Build
 * muscle", so a stored profile that still says it reads as Build muscle.
 */
export function normalizeGoals(goals: UserProfile['goals']): UserProfile['goals'] {
  const primary: PrimaryGoal = goals.primary === 'balanced' ? 'build-muscle' : goals.primary;
  let secondary: SecondaryGoal = goals.secondary === 'balanced' ? 'none' : goals.secondary;
  if (secondary === primary) secondary = 'none';
  if (primary === goals.primary && secondary === goals.secondary) return goals;
  return { ...goals, primary, secondary };
}

/** The style the lifter chose: the newer field when it is there, the original one otherwise. */
export function styleChoice(
  profile: Pick<UserProfile, 'programStyle' | 'trainingStyle'>,
): ProgramStyle {
  return profile.programStyle ?? profile.trainingStyle;
}

const LEGACY_STYLE: Record<StyleId, TrainingStyle> = {
  hybrid: 'hybrid',
  'hypertrophy-focus': 'hypertrophy-focus',
  'strength-focus': 'strength-focus',
  undulating: 'hybrid',
  'lean-down': 'hybrid',
  'high-rep': 'hypertrophy-focus',
  foundation: 'hypertrophy-focus',
};

/** The nearest style a copy of the app from before the newer ones can read. */
export function legacyStyleFor(style: StyleId): TrainingStyle {
  return LEGACY_STYLE[style];
}

/**
 * Writes a style choice. `resolved` is what the choice comes to right now (the
 * choice itself unless it is Auto), so `trainingStyle` stays the nearest thing
 * an older copy of the app would train by.
 */
export function withStyleChoice(
  profile: UserProfile,
  choice: ProgramStyle,
  resolved: StyleId,
): UserProfile {
  return { ...profile, programStyle: choice, trainingStyle: legacyStyleFor(resolved) };
}

export function normalizeProfile(profile: UserProfile): UserProfile {
  const goals = normalizeGoals(profile.goals);
  return goals === profile.goals ? profile : { ...profile, goals };
}

export function parseProfile(raw: unknown): UserProfile {
  return normalizeProfile(UserProfileSchema.parse(raw));
}

export function isValidProfile(raw: unknown): raw is UserProfile {
  return UserProfileSchema.safeParse(raw).success;
}
