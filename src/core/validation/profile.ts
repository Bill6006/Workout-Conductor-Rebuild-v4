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

export const REST_STYLES = ['short', 'standard', 'long'] as const;
export type RestStyle = (typeof REST_STYLES)[number];

export const UNIT_SYSTEMS = ['lb', 'kg'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

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
  techniques: z.looseObject({
    supersets: z.boolean(),
    dropSets: z.boolean(),
    circuits: z.boolean(),
  }),
  restStyle: z.enum(REST_STYLES),
  units: z.enum(UNIT_SYSTEMS),
  bodyweight: z.number().positive().max(1000).optional(),
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
    techniques: { supersets: true, dropSets: true, circuits: false },
    restStyle: 'standard',
    units: 'lb',
    createdAt: now,
    updatedAt: now,
  };
}

export function parseProfile(raw: unknown): UserProfile {
  return UserProfileSchema.parse(raw);
}

export function isValidProfile(raw: unknown): raw is UserProfile {
  return UserProfileSchema.safeParse(raw).success;
}
