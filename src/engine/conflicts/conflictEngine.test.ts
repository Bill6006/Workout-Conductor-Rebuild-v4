import { describe, expect, it } from 'vitest';
import { GYM_DEFAULT_EQUIPMENT, HOME_DEFAULT_EQUIPMENT } from '../../catalog/equipment/equipment';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import {
  checkExerciseFit,
  checkSupersetPair,
  checkWorkoutConflicts,
  estimateExerciseMinutes,
  isBlocked,
  type ConflictContext,
} from './conflictEngine';

const NOW = '2026-09-02T12:00:00.000Z';

function context(overrides: Partial<ConflictContext> = {}): ConflictContext {
  return {
    availableEquipment: new Set(GYM_DEFAULT_EQUIPMENT),
    locationName: 'Gym',
    limitations: createDefaultProfile(NOW).limitations,
    ...overrides,
  };
}

const kinds = (conflicts: ReturnType<typeof checkExerciseFit>) =>
  conflicts.map((conflict) => `${conflict.kind}:${conflict.severity}`);

describe('checkExerciseFit', () => {
  it('blocks exercises whose equipment is not at the place', () => {
    const home = context({
      availableEquipment: new Set(HOME_DEFAULT_EQUIPMENT),
      locationName: 'Home',
    });
    expect(kinds(checkExerciseFit(requireExercise('barbell-bench-press'), home))).toEqual([
      'location:block',
    ]);
    expect(checkExerciseFit(requireExercise('dumbbell-bench-press'), home)).toEqual([]);
    expect(
      checkExerciseFit(requireExercise('push-up'), context({ availableEquipment: new Set() })),
    ).toEqual([]);
  });

  it('blocks limitation flags and disliked exercises', () => {
    const limited = context({
      limitations: {
        painAreas: [],
        shoulder: ['avoid-overhead-pressing', 'avoid-dips'],
        avoidBarbellSquats: true,
        notes: '',
      },
    });
    expect(isBlocked(checkExerciseFit(requireExercise('overhead-press'), limited))).toBe(true);
    expect(isBlocked(checkExerciseFit(requireExercise('dip'), limited))).toBe(true);
    expect(isBlocked(checkExerciseFit(requireExercise('back-squat'), limited))).toBe(true);
    expect(isBlocked(checkExerciseFit(requireExercise('hack-squat'), limited))).toBe(false);
    expect(
      isBlocked(
        checkExerciseFit(
          requireExercise('hack-squat'),
          context({ dislikedIds: new Set(['hack-squat']) }),
        ),
      ),
    ).toBe(true);
  });

  it('blocks high stress on a painful joint and warns on moderate stress', () => {
    const knee = context({
      limitations: { painAreas: ['knee'], shoulder: [], avoidBarbellSquats: false, notes: '' },
    });
    expect(isBlocked(checkExerciseFit(requireExercise('back-squat'), knee))).toBe(true);
    expect(kinds(checkExerciseFit(requireExercise('leg-extension'), knee))).toEqual([
      'joint-stress:warn',
    ]);
    const back = context({
      limitations: {
        painAreas: ['lower-back'],
        shoulder: [],
        avoidBarbellSquats: false,
        notes: '',
      },
    });
    expect(isBlocked(checkExerciseFit(requireExercise('deadlift'), back))).toBe(true);
    expect(isBlocked(checkExerciseFit(requireExercise('chest-supported-row'), back))).toBe(false);
  });
});

describe('checkWorkoutConflicts', () => {
  it('blocks duplicates and competing primary-strength lifts of one pattern', () => {
    const dup = checkWorkoutConflicts(
      [requireExercise('lat-pulldown'), requireExercise('lat-pulldown')],
      context(),
    );
    expect(kinds(dup)).toContain('duplicate-exercise:block');
    const competing = checkWorkoutConflicts(
      [requireExercise('barbell-bench-press'), requireExercise('close-grip-bench-press')],
      context(),
    );
    expect(kinds(competing)).toContain('progression-role:block');
  });

  it('warns on pattern overlap, junk volume, recovery, and joint stress', () => {
    const three = checkWorkoutConflicts(
      [
        requireExercise('dumbbell-curl'),
        requireExercise('hammer-curl'),
        requireExercise('cable-curl'),
        requireExercise('ez-bar-curl'),
      ],
      context(),
    );
    expect(kinds(three)).toContain('duplicate-pattern:warn');
    expect(kinds(three)).toContain('muscle-overlap:warn');

    const heavy = checkWorkoutConflicts(
      [requireExercise('deadlift'), requireExercise('romanian-deadlift')],
      context(),
    );
    expect(kinds(heavy)).toContain('recovery:warn');

    const shoulders = checkWorkoutConflicts(
      [requireExercise('dip'), requireExercise('bench-dip')],
      context(),
    );
    expect(kinds(shoulders)).toContain('joint-stress:warn');
  });

  it('warns when the selection cannot fit the time budget', () => {
    const exercises = [
      requireExercise('back-squat'),
      requireExercise('barbell-bench-press'),
      requireExercise('barbell-row'),
    ];
    const planned = exercises.map(() => ({ sets: 4, restSeconds: 150 }));
    const tight = checkWorkoutConflicts(exercises, context({ timeBudgetMinutes: 15 }), planned);
    expect(kinds(tight)).toContain('time:warn');
    const roomy = checkWorkoutConflicts(exercises, context({ timeBudgetMinutes: 90 }), planned);
    expect(kinds(roomy)).not.toContain('time:warn');
  });

  it('accepts a clean selection', () => {
    const clean = checkWorkoutConflicts(
      [
        requireExercise('barbell-bench-press'),
        requireExercise('seated-cable-row'),
        requireExercise('lateral-raise'),
        requireExercise('ez-bar-curl'),
      ],
      context(),
    );
    expect(clean).toEqual([]);
  });
});

describe('checkSupersetPair', () => {
  it('blocks priority lifts, two demanding compounds, and the same exercise twice', () => {
    expect(
      isBlocked(
        checkSupersetPair(requireExercise('deadlift'), requireExercise('lateral-raise'), context()),
      ),
    ).toBe(true);
    expect(
      isBlocked(
        checkSupersetPair(
          requireExercise('leg-press'),
          requireExercise('dumbbell-bench-press'),
          context(),
        ),
      ),
    ).toBe(true);
    expect(
      isBlocked(
        checkSupersetPair(requireExercise('cable-fly'), requireExercise('cable-fly'), context()),
      ),
    ).toBe(true);
  });

  it('warns on grip, station, and joint conflicts but allows the pair', () => {
    const grip = checkSupersetPair(
      requireExercise('dumbbell-row'),
      requireExercise('barbell-shrug'),
      context(),
    );
    expect(kinds(grip)).toContain('grip:warn');
    const station = checkSupersetPair(
      requireExercise('leg-extension'),
      requireExercise('leg-curl'),
      context(),
    );
    expect(kinds(station)).toContain('station:warn');
    expect(isBlocked(station)).toBe(false);
    const clean = checkSupersetPair(
      requireExercise('cable-fly'),
      requireExercise('lateral-raise'),
      context(),
    );
    expect(clean).toEqual([]);
  });
});

describe('estimateExerciseMinutes', () => {
  it('adds setup to the working sets', () => {
    expect(
      estimateExerciseMinutes(requireExercise('push-up'), { sets: 3, restSeconds: 60 }),
    ).toBeCloseTo((10 + 3 * 100) / 60, 5);
  });
});
