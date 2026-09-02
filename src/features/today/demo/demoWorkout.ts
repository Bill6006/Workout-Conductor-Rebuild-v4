import type { LocationProfile } from '../../../core/validation/location';
import type { UserProfile } from '../../../core/validation/profile';

/**
 * SYNTHETIC DEMO WORKOUT (Phase 1 only).
 *
 * A small deterministic preview so the Today screen feels real before the
 * workout-generation engine (Phase 3) exists. It reads the profile and the
 * current location's equipment, but it is not the engine: no weekly volume,
 * no progression, no time-fitting. Phase 3 deletes this module.
 */

export type DemoRole = 'strength' | 'hypertrophy' | 'isolation';

export interface DemoExercise {
  name: string;
  role: DemoRole;
  muscles: string[];
  equipment: string;
  sets: number;
  reps: string;
  restSeconds: number;
  superset?: 'A1' | 'A2';
  dropSet?: boolean;
}

export interface DemoWorkout {
  synthetic: true;
  title: string;
  focus: string[];
  exercises: DemoExercise[];
  estimatedMinutes: number;
  why: string[];
  compromises: string[];
}

type Tag = 'overhead' | 'dip' | 'barbell-squat' | 'knee-heavy' | 'wide-grip' | 'lower-back';

interface Candidate {
  name: string;
  role: DemoRole;
  muscles: string[];
  equipmentLabel: string;
  /** any-of groups; each group is all-of equipment ids; an empty list means bodyweight */
  requires: string[][];
  tags?: Tag[];
}

type Slot =
  | 'press'
  | 'incline-press'
  | 'pull'
  | 'row'
  | 'squat'
  | 'hinge'
  | 'overhead'
  | 'chest-iso'
  | 'side-delt'
  | 'biceps'
  | 'triceps';

const CANDIDATES: Record<Slot, Candidate[]> = {
  press: [
    {
      name: 'Barbell Bench Press',
      role: 'strength',
      muscles: ['Chest', 'Triceps'],
      equipmentLabel: 'Barbell',
      requires: [
        ['barbell', 'flat-bench'],
        ['barbell', 'adjustable-bench'],
      ],
    },
    {
      name: 'Dumbbell Bench Press',
      role: 'strength',
      muscles: ['Chest', 'Triceps'],
      equipmentLabel: 'Dumbbells',
      requires: [
        ['dumbbells', 'flat-bench'],
        ['dumbbells', 'adjustable-bench'],
        ['adjustable-dumbbells', 'adjustable-bench'],
        ['adjustable-dumbbells', 'flat-bench'],
      ],
    },
    {
      name: 'Machine Chest Press',
      role: 'strength',
      muscles: ['Chest', 'Triceps'],
      equipmentLabel: 'Machine',
      requires: [['chest-press-machine']],
    },
    {
      name: 'Push-Up',
      role: 'strength',
      muscles: ['Chest', 'Triceps'],
      equipmentLabel: 'Bodyweight',
      requires: [[]],
    },
  ],
  'incline-press': [
    {
      name: 'Incline Dumbbell Press',
      role: 'hypertrophy',
      muscles: ['Upper chest', 'Shoulders'],
      equipmentLabel: 'Dumbbells',
      requires: [
        ['dumbbells', 'adjustable-bench'],
        ['adjustable-dumbbells', 'adjustable-bench'],
      ],
    },
    {
      name: 'Incline Barbell Bench Press',
      role: 'hypertrophy',
      muscles: ['Upper chest', 'Shoulders'],
      equipmentLabel: 'Barbell',
      requires: [['barbell', 'adjustable-bench']],
    },
    {
      name: 'Band Incline Press',
      role: 'hypertrophy',
      muscles: ['Upper chest', 'Shoulders'],
      equipmentLabel: 'Bands',
      requires: [['resistance-bands']],
    },
  ],
  pull: [
    {
      name: 'Pull-Up',
      role: 'hypertrophy',
      muscles: ['Lats', 'Biceps'],
      equipmentLabel: 'Pull-up bar',
      requires: [['pull-up-bar']],
    },
    {
      name: 'Lat Pulldown',
      role: 'hypertrophy',
      muscles: ['Lats', 'Biceps'],
      equipmentLabel: 'Cable',
      requires: [['lat-pulldown']],
    },
    {
      name: 'Band Pulldown',
      role: 'hypertrophy',
      muscles: ['Lats', 'Biceps'],
      equipmentLabel: 'Bands',
      requires: [['resistance-bands']],
    },
  ],
  row: [
    {
      name: 'Chest-Supported Row',
      role: 'hypertrophy',
      muscles: ['Upper back', 'Biceps'],
      equipmentLabel: 'Dumbbells',
      requires: [
        ['dumbbells', 'adjustable-bench'],
        ['adjustable-dumbbells', 'adjustable-bench'],
      ],
    },
    {
      name: 'Seated Cable Row',
      role: 'hypertrophy',
      muscles: ['Upper back', 'Biceps'],
      equipmentLabel: 'Cable',
      requires: [['seated-row'], ['cable-station']],
    },
    {
      name: 'Barbell Row',
      role: 'hypertrophy',
      muscles: ['Upper back', 'Biceps'],
      equipmentLabel: 'Barbell',
      requires: [['barbell']],
      tags: ['lower-back'],
    },
    {
      name: 'Dumbbell Row',
      role: 'hypertrophy',
      muscles: ['Upper back', 'Biceps'],
      equipmentLabel: 'Dumbbells',
      requires: [['dumbbells'], ['adjustable-dumbbells']],
    },
    {
      name: 'Band Row',
      role: 'hypertrophy',
      muscles: ['Upper back', 'Biceps'],
      equipmentLabel: 'Bands',
      requires: [['resistance-bands']],
    },
  ],
  squat: [
    {
      name: 'Back Squat',
      role: 'strength',
      muscles: ['Quads', 'Glutes'],
      equipmentLabel: 'Barbell',
      requires: [['barbell', 'squat-rack']],
      tags: ['barbell-squat', 'knee-heavy', 'lower-back'],
    },
    {
      name: 'Hack Squat',
      role: 'strength',
      muscles: ['Quads', 'Glutes'],
      equipmentLabel: 'Machine',
      requires: [['hack-squat']],
      tags: ['knee-heavy'],
    },
    {
      name: 'Leg Press',
      role: 'strength',
      muscles: ['Quads', 'Glutes'],
      equipmentLabel: 'Machine',
      requires: [['leg-press']],
      tags: ['knee-heavy'],
    },
    {
      name: 'Goblet Squat',
      role: 'strength',
      muscles: ['Quads', 'Glutes'],
      equipmentLabel: 'Dumbbell',
      requires: [['dumbbells'], ['adjustable-dumbbells'], ['kettlebells']],
      tags: ['knee-heavy'],
    },
  ],
  hinge: [
    {
      name: 'Romanian Deadlift',
      role: 'hypertrophy',
      muscles: ['Hamstrings', 'Glutes'],
      equipmentLabel: 'Barbell',
      requires: [['barbell']],
      tags: ['lower-back'],
    },
    {
      name: 'Dumbbell Romanian Deadlift',
      role: 'hypertrophy',
      muscles: ['Hamstrings', 'Glutes'],
      equipmentLabel: 'Dumbbells',
      requires: [['dumbbells'], ['adjustable-dumbbells']],
      tags: ['lower-back'],
    },
    {
      name: 'Leg Curl',
      role: 'hypertrophy',
      muscles: ['Hamstrings'],
      equipmentLabel: 'Machine',
      requires: [['leg-curl']],
    },
  ],
  overhead: [
    {
      name: 'Overhead Press',
      role: 'hypertrophy',
      muscles: ['Shoulders', 'Triceps'],
      equipmentLabel: 'Barbell',
      requires: [['barbell']],
      tags: ['overhead'],
    },
    {
      name: 'Dumbbell Shoulder Press',
      role: 'hypertrophy',
      muscles: ['Shoulders', 'Triceps'],
      equipmentLabel: 'Dumbbells',
      requires: [['dumbbells'], ['adjustable-dumbbells']],
      tags: ['overhead'],
    },
  ],
  'chest-iso': [
    {
      name: 'Cable Fly',
      role: 'isolation',
      muscles: ['Chest'],
      equipmentLabel: 'Cable',
      requires: [['cable-station'], ['functional-trainer']],
    },
    {
      name: 'Pec Deck',
      role: 'isolation',
      muscles: ['Chest'],
      equipmentLabel: 'Machine',
      requires: [['pec-deck']],
    },
    {
      name: 'Dumbbell Fly',
      role: 'isolation',
      muscles: ['Chest'],
      equipmentLabel: 'Dumbbells',
      requires: [
        ['dumbbells', 'flat-bench'],
        ['dumbbells', 'adjustable-bench'],
        ['adjustable-dumbbells', 'adjustable-bench'],
      ],
    },
    {
      name: 'Band Fly',
      role: 'isolation',
      muscles: ['Chest'],
      equipmentLabel: 'Bands',
      requires: [['resistance-bands']],
    },
  ],
  'side-delt': [
    {
      name: 'Lateral Raise',
      role: 'isolation',
      muscles: ['Side delts'],
      equipmentLabel: 'Dumbbells',
      requires: [['dumbbells'], ['adjustable-dumbbells']],
    },
    {
      name: 'Cable Lateral Raise',
      role: 'isolation',
      muscles: ['Side delts'],
      equipmentLabel: 'Cable',
      requires: [['cable-station'], ['functional-trainer']],
    },
    {
      name: 'Band Lateral Raise',
      role: 'isolation',
      muscles: ['Side delts'],
      equipmentLabel: 'Bands',
      requires: [['resistance-bands']],
    },
  ],
  biceps: [
    {
      name: 'EZ-Bar Curl',
      role: 'isolation',
      muscles: ['Biceps'],
      equipmentLabel: 'EZ bar',
      requires: [['ez-bar']],
    },
    {
      name: 'Incline Dumbbell Curl',
      role: 'isolation',
      muscles: ['Biceps'],
      equipmentLabel: 'Dumbbells',
      requires: [
        ['dumbbells', 'adjustable-bench'],
        ['adjustable-dumbbells', 'adjustable-bench'],
      ],
    },
    {
      name: 'Dumbbell Curl',
      role: 'isolation',
      muscles: ['Biceps'],
      equipmentLabel: 'Dumbbells',
      requires: [['dumbbells'], ['adjustable-dumbbells']],
    },
    {
      name: 'Cable Curl',
      role: 'isolation',
      muscles: ['Biceps'],
      equipmentLabel: 'Cable',
      requires: [['cable-station']],
    },
    {
      name: 'Band Curl',
      role: 'isolation',
      muscles: ['Biceps'],
      equipmentLabel: 'Bands',
      requires: [['resistance-bands']],
    },
  ],
  triceps: [
    {
      name: 'Cable Triceps Pushdown',
      role: 'isolation',
      muscles: ['Triceps'],
      equipmentLabel: 'Cable',
      requires: [['cable-station'], ['functional-trainer']],
    },
    {
      name: 'Overhead Triceps Extension',
      role: 'isolation',
      muscles: ['Triceps'],
      equipmentLabel: 'Dumbbell',
      requires: [['dumbbells'], ['adjustable-dumbbells']],
      tags: ['overhead'],
    },
    {
      name: 'Skull Crusher',
      role: 'isolation',
      muscles: ['Triceps'],
      equipmentLabel: 'EZ bar',
      requires: [
        ['ez-bar', 'flat-bench'],
        ['ez-bar', 'adjustable-bench'],
      ],
    },
    {
      name: 'Dip',
      role: 'isolation',
      muscles: ['Triceps', 'Chest'],
      equipmentLabel: 'Dip station',
      requires: [['dip-station']],
      tags: ['dip'],
    },
    {
      name: 'Band Triceps Pushdown',
      role: 'isolation',
      muscles: ['Triceps'],
      equipmentLabel: 'Bands',
      requires: [['resistance-bands']],
    },
  ],
};

const TEMPLATES = {
  'chest-arms': {
    title: 'Chest + Arms focus',
    slots: [
      'press',
      'incline-press',
      'row',
      'chest-iso',
      'triceps',
      'biceps',
      'side-delt',
    ] as Slot[],
  },
  'full-body-strength': {
    title: 'Full-body strength',
    slots: ['squat', 'press', 'row', 'hinge', 'overhead', 'biceps', 'triceps'] as Slot[],
  },
  'upper-hypertrophy': {
    title: 'Upper-body hypertrophy',
    slots: ['press', 'pull', 'incline-press', 'row', 'side-delt', 'biceps', 'triceps'] as Slot[],
  },
} as const;

type TemplateKey = keyof typeof TEMPLATES;

const PRESCRIPTIONS: Record<
  DemoRole,
  { sets: number; reps: string; rest: Record<UserProfile['restStyle'], number> }
> = {
  strength: { sets: 4, reps: '4-6', rest: { short: 120, standard: 150, long: 180 } },
  hypertrophy: { sets: 3, reps: '8-12', rest: { short: 60, standard: 90, long: 120 } },
  isolation: { sets: 3, reps: '10-15', rest: { short: 45, standard: 60, long: 90 } },
};

function chooseTemplate(profile: UserProfile): TemplateKey {
  const goals = [profile.goals.primary, profile.goals.secondary];
  if (profile.goals.primary === 'strength' || profile.trainingStyle === 'strength-focus') {
    return 'full-body-strength';
  }
  if (goals.includes('bigger-arms') || goals.includes('bigger-chest')) {
    return 'chest-arms';
  }
  return 'upper-hypertrophy';
}

function hasEquipment(available: ReadonlySet<string>, requires: string[][]): boolean {
  return requires.some((group) => group.every((id) => available.has(id)));
}

function blockedTags(profile: UserProfile): Set<Tag> {
  const blocked = new Set<Tag>();
  if (profile.limitations.avoidBarbellSquats) blocked.add('barbell-squat');
  if (profile.limitations.shoulder.includes('avoid-overhead-pressing')) blocked.add('overhead');
  if (profile.limitations.shoulder.includes('avoid-dips')) blocked.add('dip');
  if (profile.limitations.shoulder.includes('avoid-wide-grip-pressing')) blocked.add('wide-grip');
  if (profile.limitations.painAreas.includes('knee')) blocked.add('knee-heavy');
  if (profile.limitations.painAreas.includes('lower-back')) blocked.add('lower-back');
  return blocked;
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export function buildDemoWorkout(
  profile: UserProfile,
  location: LocationProfile | undefined,
): DemoWorkout {
  const available = new Set(location?.equipment ?? []);
  const disliked = new Set(profile.exercisePreferences.disliked.map(normalize));
  const preferred = new Set(profile.exercisePreferences.preferred.map(normalize));
  const blocked = blockedTags(profile);
  const templateKey = chooseTemplate(profile);
  const template = TEMPLATES[templateKey];
  const compromises: string[] = [];
  const maxExercises = Math.min(
    8,
    Math.max(4, Math.round(profile.schedule.typicalDurationMinutes / 9)),
  );

  const chosen: DemoExercise[] = [];
  for (const slot of template.slots) {
    if (chosen.length >= maxExercises) break;
    const candidates = CANDIDATES[slot];
    const ranked = [...candidates].sort((a, b) => {
      const prefA = preferred.has(normalize(a.name)) ? 1 : 0;
      const prefB = preferred.has(normalize(b.name)) ? 1 : 0;
      return prefB - prefA;
    });
    const pick = ranked.find(
      (candidate) =>
        hasEquipment(available, candidate.requires) &&
        !disliked.has(normalize(candidate.name)) &&
        !(candidate.tags ?? []).some((tag) => blocked.has(tag)),
    );
    if (!pick) {
      const skipped = candidates.find((candidate) =>
        (candidate.tags ?? []).some((tag) => blocked.has(tag)),
      );
      if (skipped) {
        compromises.push(`${skipped.name} left out because of your limitations.`);
      } else if (candidates.some((candidate) => disliked.has(normalize(candidate.name)))) {
        compromises.push(
          `A ${slot.replace('-', ' ')} movement was skipped: the options here are on your disliked list.`,
        );
      } else {
        compromises.push(
          `No ${slot.replace('-', ' ')} option fits ${location?.name ?? 'this location'}'s equipment.`,
        );
      }
      continue;
    }
    const prescription = PRESCRIPTIONS[pick.role];
    chosen.push({
      name: pick.name,
      role: pick.role,
      muscles: pick.muscles,
      equipment: pick.equipmentLabel,
      sets: prescription.sets,
      reps: prescription.reps,
      restSeconds: prescription.rest[profile.restStyle],
    });
  }

  if (profile.techniques.supersets) {
    const isolationIndexes = chosen
      .map((exercise, index) => (exercise.role === 'isolation' ? index : -1))
      .filter((index) => index >= 0);
    if (isolationIndexes.length >= 2) {
      const [first, second] = isolationIndexes.slice(-2) as [number, number];
      const a1 = chosen[first];
      const a2 = chosen[second];
      if (a1 && a2) {
        a1.superset = 'A1';
        a2.superset = 'A2';
        a1.restSeconds = 15;
      }
    }
  }

  if (profile.techniques.dropSets) {
    const target = [...chosen]
      .reverse()
      .find((exercise) => exercise.role === 'isolation' && exercise.superset !== 'A1');
    if (target) target.dropSet = true;
  }

  const workSeconds = chosen.reduce(
    (total, exercise) => total + exercise.sets * (40 + exercise.restSeconds),
    0,
  );
  const estimatedMinutes = Math.round(5 + workSeconds / 60);

  const focus = [...new Set(chosen.flatMap((exercise) => exercise.muscles))].slice(0, 5);

  const why: string[] = [];
  why.push(`Primary goal ${goalPhrase(profile.goals.primary)}: ${templateReason(templateKey)}.`);
  if (profile.goals.secondary !== 'none') {
    why.push(
      `Secondary goal ${goalPhrase(profile.goals.secondary)} keeps direct arm and chest work in.`,
    );
  }
  why.push(`Built for ${location?.name ?? 'your location'} using only the equipment saved there.`);
  if (profile.techniques.supersets && chosen.some((exercise) => exercise.superset)) {
    why.push('Supersets are on, so the last two isolation moves are paired to save time.');
  }
  if (profile.techniques.dropSets && chosen.some((exercise) => exercise.dropSet)) {
    why.push('Drop sets are on, so one isolation move ends with a drop set.');
  }
  why.push(
    `${restLabel(profile.restStyle)} rests, ${profile.schedule.typicalDurationMinutes}-minute typical session.`,
  );

  return {
    synthetic: true,
    title: `${template.title} (demo)`,
    focus,
    exercises: chosen,
    estimatedMinutes,
    why,
    compromises,
  };
}

function goalPhrase(
  goal: UserProfile['goals']['primary'] | UserProfile['goals']['secondary'],
): string {
  switch (goal) {
    case 'build-muscle':
      return 'build muscle';
    case 'bigger-arms':
      return 'bigger arms';
    case 'bigger-chest':
      return 'bigger chest';
    case 'overall-size':
      return 'more overall size';
    case 'strength':
      return 'strength';
    case 'balanced':
      return 'balanced development';
    case 'none':
      return 'none';
  }
}

function templateReason(key: TemplateKey): string {
  switch (key) {
    case 'chest-arms':
      return 'one heavy press first, then chest and arm volume';
    case 'full-body-strength':
      return 'heavy compound lifts first, arms as a finisher';
    case 'upper-hypertrophy':
      return 'a press and a pull first, then upper-body volume';
  }
}

function restLabel(style: UserProfile['restStyle']): string {
  switch (style) {
    case 'short':
      return 'Short';
    case 'standard':
      return 'Standard';
    case 'long':
      return 'Long';
  }
}
