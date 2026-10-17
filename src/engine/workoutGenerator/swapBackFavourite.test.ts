import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { LastingSwap } from '../planning/lastingSwaps';
import { allEntries } from '../workout/types';
import { accessoryPicker, generateWorkout, pickAccessoryFor } from './generate';
import { RECORD_NOW } from '../../test/records';

/**
 * Maintenance 30, the eighth re-check of round L: a kept swap back to the standing calf raise stands
 * for every other loaded calf raise but a favourite. A lifter whose favourite is the leg-press calf
 * raise, and who keeps a swap back from the calf machine, keeps the favourite at the gym, in the plan
 * and the coach's extra work, with no "in place of" line of a swap they never made. The favourite was
 * replaced, the plan saying "the swap you chose to keep". Synthetic data only.
 */
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const base = createDefaultProfile(RECORD_NOW);
const CALF = 'standing-calf-raise';
const MACHINE = 'standing-calf-raise-machine';
const PRESS_CALF = 'leg-press-calf-raise';

const profileWith = (preferred: string[]): UserProfile => ({
  ...base,
  bodyweight: 185,
  exercisePreferences: { ...base.exercisePreferences, preferred },
});
const kept = (from: string, to: string): LastingSwap[] => [
  { from, to, setAt: RECORD_NOW, until: '2026-12-01T00:00:00.000Z' },
];

function lowerAtGym(profile: UserProfile, swaps: LastingSwap[]) {
  const workout = generateWorkout({
    profile,
    location: gym!,
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

/** The coach's extra calf work on an upper day at the gym. */
const coachCalves = (profile: UserProfile, swaps: LastingSwap[]) =>
  pickAccessoryFor(
    'calves',
    ['dumbbell-bench-press', 'lat-pulldown'].map(requireExercise),
    accessoryPicker({ profile, location: gym!, history: [], now: RECORD_NOW, swaps }),
  )?.id;

describe('a favourite loaded calf raise beside a kept swap back from the other one', () => {
  it('a favourite leg-press calf raise is planned and offered (baseline)', () => {
    const favourite = profileWith(['Leg Press Calf Raise']);
    expect(lowerAtGym(favourite, []).ids).toContain(PRESS_CALF);
    expect(coachCalves(favourite, [])).toBe(PRESS_CALF);
  });

  it('a swap back from the calf machine keeps the bodyweight raise with no favourite (baseline)', () => {
    const { ids, reasons } = lowerAtGym(profileWith([]), kept(MACHINE, CALF));
    expect(ids).toContain(CALF);
    expect(reasons).toContain(
      'Standing Calf Raise in place of Leg Press Calf Raise, the swap you chose to keep.',
    );
  });

  it('keeps the favourite leg-press calf raise the lifter never swapped away', () => {
    const favourite = profileWith(['Leg Press Calf Raise']);
    const { ids, reasons } = lowerAtGym(favourite, kept(MACHINE, CALF));
    // Not "Standing Calf Raise in place of Leg Press Calf Raise, the swap you chose to keep."
    expect(ids).toContain(PRESS_CALF);
    expect(reasons.some((line) => line.includes('in place of Leg Press Calf Raise'))).toBe(false);
    expect(coachCalves(favourite, kept(MACHINE, CALF))).toBe(PRESS_CALF);
  });

  it('keeps the favourite calf machine beside a swap back from the leg-press calf raise', () => {
    const favourite = profileWith(['Standing Calf Raise Machine']);
    const { ids } = lowerAtGym(favourite, kept(PRESS_CALF, CALF));
    // Not "Standing Calf Raise in place of Standing Calf Raise Machine, the swap you chose to keep."
    expect(ids).toContain(MACHINE);
  });
});
