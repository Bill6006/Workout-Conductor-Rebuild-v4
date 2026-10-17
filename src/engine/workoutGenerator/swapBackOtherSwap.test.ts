import { afterEach, describe, expect, it } from 'vitest';
import { GYM_DEFAULT_EQUIPMENT } from '../../catalog/equipment/equipment';
import { registerCustomExercises, requireExercise } from '../../catalog/exercises/catalog';
import {
  CustomExerciseSchema,
  customToCatalogExercise,
} from '../../core/validation/customExercise';
import { createLocation, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import type { LastingSwap } from '../planning/lastingSwaps';
import { allEntries } from '../workout/types';
import { accessoryPicker, generateWorkout, pickAccessoryFor } from './generate';
import { RECORD_NOW, record } from '../../test/records';

/**
 * Maintenance 30, the eighth re-check of round L: the swaps the lifter keeps come first, and a kept
 * swap back covers the other loaded calf raise wherever the lifter's own swap of it cannot apply.
 * With a swap back from the leg-press calf raise and the calf machine kept for a Smith calf raise of
 * the lifter's own, a gym without a Smith machine keeps the bodyweight raise for both: the coach's
 * extra calf work named the calf machine, and where it was the plan's own calf raise the plan planned
 * it, "bodyweight is too light". Where the Smith calf raise fits, the lifter's own swap applies.
 * Synthetic data only.
 */
afterEach(() => registerCustomExercises([]));

const CALF = 'standing-calf-raise';
const MACHINE = 'standing-calf-raise-machine';
const PRESS_CALF = 'leg-press-calf-raise';
const SMITH_CALF = 'custom-smith-calf-raise';
const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
/** Kept: the leg-press calf raise back to bodyweight, and the calf machine for a Smith calf raise. */
const swaps: LastingSwap[] = [
  [PRESS_CALF, CALF],
  [MACHINE, SMITH_CALF],
].map(([from, to]) => ({
  from: from!,
  to: to!,
  setAt: RECORD_NOW,
  until: '2026-12-01T00:00:00.000Z',
}));

/** A gym without some of the default gym's equipment. */
const gymWithout = (id: string, name: string, missing: string[]): LocationProfile =>
  createLocation(
    {
      id,
      name,
      kind: 'gym',
      equipment: GYM_DEFAULT_EQUIPMENT.filter((item) => !missing.includes(item)),
    },
    RECORD_NOW,
  );
/** No Smith machine, so the Smith calf raise does not fit. */
const gymB = gymWithout('gym-b', 'Gym B', ['smith-machine']);
/** No Smith machine and no leg press: the calf machine is the plan's own calf raise. */
const gymC = gymWithout('gym-c', 'Gym C', ['smith-machine', 'leg-press']);

function registerSmithCalfRaise(...others: ReturnType<typeof customToCatalogExercise>[]) {
  registerCustomExercises([
    ...others,
    customToCatalogExercise(
      CustomExerciseSchema.parse({
        id: SMITH_CALF,
        custom: true,
        name: 'Smith Calf Raise',
        primaryMuscles: ['calves'],
        movementPattern: 'calf-raise',
        equipment: [['smith-machine']],
        createdAt: RECORD_NOW,
        updatedAt: RECORD_NOW,
      }),
    ),
  ]);
}

function lower(place: LocationProfile) {
  const workout = generateWorkout({
    profile,
    location: place,
    history: [],
    now: RECORD_NOW,
    duration: 'default',
    constraints: { templateId: 'lower', swaps },
  });
  return {
    ids: allEntries(workout.blocks).map((entry) => entry.exerciseId),
    reasons: workout.explanation.reasons,
  };
}

/** The coach's extra calf work on an upper day there. */
const coachCalves = (place: LocationProfile) =>
  pickAccessoryFor(
    'calves',
    ['dumbbell-bench-press', 'lat-pulldown'].map(requireExercise),
    accessoryPicker({ profile, location: place, history: [], now: RECORD_NOW, swaps }),
  )?.id;

describe('a kept swap of a loaded calf raise beside a swap back from the other', () => {
  /** Kept: the calf machine back to bodyweight, and the leg-press calf raise for the Smith one. */
  const ownFirst: LastingSwap[] = [
    [MACHINE, CALF],
    [PRESS_CALF, SMITH_CALF],
  ].map(([from, to]) => ({
    from: from!,
    to: to!,
    setAt: RECORD_NOW,
    until: '2026-12-01T00:00:00.000Z',
  }));
  const lowerWith = (place: LocationProfile, history: WorkoutRecord[] = []) =>
    allEntries(
      generateWorkout({
        profile,
        location: place,
        history,
        now: RECORD_NOW,
        duration: 'default',
        constraints: { templateId: 'lower', swaps: ownFirst },
      }).blocks,
    ).map((entry) => entry.exerciseId);

  it('applies the lifter’s own swap where its exercise fits', () => {
    registerSmithCalfRaise();
    const ids = lowerWith(gymWithout('gym-a', 'Gym A', []));
    expect(ids).toContain(SMITH_CALF);
    expect(ids).not.toContain(PRESS_CALF);
  });

  it('keeps the bodyweight raise for it where its exercise does not fit', () => {
    registerSmithCalfRaise();
    const ids = lowerWith(gymB);
    expect(ids).toContain(CALF);
    expect(ids).not.toContain(PRESS_CALF);
  });

  it('puts the bodyweight raise in there, never the next calf raise there is', () => {
    // A seated calf raise of the lifter's own ranks above the bodyweight raise done yesterday.
    registerSmithCalfRaise(
      customToCatalogExercise(
        CustomExerciseSchema.parse({
          id: 'custom-seated-calf-raise',
          custom: true,
          name: 'Seated Calf Raise',
          primaryMuscles: ['calves'],
          movementPattern: 'calf-raise',
          equipment: [['leg-press']],
          load: 'stack',
          strengthSuitability: 0,
          hypertrophySuitability: 3,
          createdAt: RECORD_NOW,
          updatedAt: RECORD_NOW,
        }),
      ),
    );
    const yesterday = record(1, CALF, [[16, null, 2]], [12, 20], 2);
    const ids = lowerWith(gymB, [yesterday]);
    expect(ids).toContain(CALF);
    expect(ids).not.toContain('custom-seated-calf-raise');
  });
});

describe('a swap back beside a kept swap from the other loaded version that does not fit here', () => {
  it('the lower day at Gym B keeps the bodyweight raise for the leg-press one (baseline)', () => {
    registerSmithCalfRaise();
    const { ids, reasons } = lower(gymB);
    expect(ids).toContain(CALF);
    expect(reasons).toContain(
      'Standing Calf Raise in place of Leg Press Calf Raise, the swap you chose to keep.',
    );
  });

  it('the coach’s extra calf work at Gym B never names the calf machine', () => {
    registerSmithCalfRaise();
    // Not the calf machine: swapped away from, and a loaded calf raise beside a swap back.
    expect(coachCalves(gymB)).toBe(CALF);
  });

  it('the lower day at Gym C keeps the bodyweight raise for the calf machine too', () => {
    registerSmithCalfRaise();
    const { ids, reasons } = lower(gymC);
    // Not "Standing Calf Raise Machine in place of the Standing Calf Raise: on two legs,
    // bodyweight is too light for its reps."
    expect(ids).toContain(CALF);
    expect(ids).not.toContain(MACHINE);
    expect(reasons.some((line) => line.startsWith('Standing Calf Raise Machine in place of'))).toBe(
      false,
    );
  });
});
