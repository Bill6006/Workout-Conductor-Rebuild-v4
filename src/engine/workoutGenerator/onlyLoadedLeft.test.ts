import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { LastingSwap } from '../planning/lastingSwaps';
import { allEntries } from '../workout/types';
import { generateWorkout } from './generate';
import { RECORD_NOW } from '../../test/records';

/**
 * Maintenance 30, the fourth re-check of round L: a loaded version waits until its bodyweight move
 * loads, wherever that move is (swapped away, disliked, or in another slot), as no candidate at all.
 * It was a 40-point shift: where the other lunges were ruled out, the loaded version was the slot's
 * only candidate and was planned anyway, its bodyweight move never outgrown. Now the slot is as
 * before round L: empty when every lunge is ruled out, or the plan's own pick where a kept swap
 * cannot apply ("a kept swap applies where it fits, and never empties a slot").
 */
const [home] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const base = createDefaultProfile(RECORD_NOW, 'home');

function lowerAtHome(changes: Partial<UserProfile>, swaps: LastingSwap[] = []) {
  const workout = generateWorkout({
    profile: { ...base, bodyweight: 185, ...changes },
    location: home!,
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

const sore = { limitations: { ...base.limitations, painAreas: ['knee' as const] } };
const dislikes = (names: string[]) => ({
  exercisePreferences: { ...base.exercisePreferences, disliked: names },
});

describe('a loaded version that would be the slot’s only candidate', () => {
  it('keeps the reverse lunge at bodyweight for a sore knee, its loaded one waiting', () => {
    const { ids } = lowerAtHome(sore);
    expect(ids).toContain('reverse-lunge');
    expect(ids).not.toContain('dumbbell-reverse-lunge');
  });

  it('never plans the dumbbell reverse lunge for a sore knee whose lifter dislikes the reverse lunge', () => {
    // A sore knee rules out both split squats; the reverse lunge and the step-up are disliked.
    // Never outgrown (no history at all), the reverse lunge's loaded version should wait.
    const { ids } = lowerAtHome({ ...sore, ...dislikes(['Reverse Lunge', 'Step-Up']) });
    // Not "Dumbbell Reverse Lunge puts moderate stress on the knee you flagged."
    expect(ids).not.toContain('dumbbell-reverse-lunge');
  });

  it('never plans the dumbbell split squat for a lifter who dislikes every bodyweight lunge', () => {
    const { ids } = lowerAtHome(dislikes(['Bulgarian Split Squat', 'Reverse Lunge', 'Step-Up']));
    // The lunge slot stays empty, as before round L.
    expect(ids).not.toContain('dumbbell-bulgarian-split-squat');
    expect(ids).not.toContain('dumbbell-reverse-lunge');
  });

  it('keeps the loaded split squat out of the slot of a kept swap away from the split squat', () => {
    // The third re-check's case (swapped to the goblet squat, already home's squat), with the
    // other lunges disliked: the slot's next best is the loaded split squat alone.
    const swaps: LastingSwap[] = [
      {
        from: 'bulgarian-split-squat',
        to: 'goblet-squat',
        setAt: RECORD_NOW,
        until: '2026-12-01T00:00:00.000Z',
      },
    ];
    const { ids, reasons } = lowerAtHome(dislikes(['Reverse Lunge', 'Step-Up']), swaps);
    // The plan's own pick (the split squat) stays, as before round L, as nothing else fits.
    expect(ids).toContain('bulgarian-split-squat');
    expect(ids).not.toContain('dumbbell-bulgarian-split-squat');
    expect(ids).not.toContain('dumbbell-reverse-lunge');
    expect(reasons.join(' ')).not.toContain('Dumbbell Bulgarian Split Squat in place of');
  });
});
