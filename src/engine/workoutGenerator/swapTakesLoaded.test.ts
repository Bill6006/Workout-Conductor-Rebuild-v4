import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { LastingSwap } from '../planning/lastingSwaps';
import { allEntries } from '../workout/types';
import { accessoryPicker, generateWorkout, pickAccessoryFor } from './generate';
import { RECORD_NOW } from '../../test/records';

/**
 * Maintenance 30, the third re-check of round L: a kept swap away from a bodyweight move keeps its
 * loaded versions back too, wherever the move itself is out of the running: the slot's next best when
 * the swap-in is already in today's plan, and the coach's extra work. A loaded version waits until its
 * bodyweight move loads; one swapped away never does.
 */
const BSS = 'bulgarian-split-squat';
const DB_BSS = 'dumbbell-bulgarian-split-squat';
const [home] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
const kept = (to: string): LastingSwap[] => [
  { from: BSS, to, setAt: RECORD_NOW, until: '2026-12-01T00:00:00.000Z' },
];

function lowerAtHome(swaps: LastingSwap[]) {
  const workout = generateWorkout({
    profile,
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

describe('a kept swap away from the split squat, and its loaded version', () => {
  it('no swap, home plans the split squat at bodyweight and the goblet squat', () => {
    const { ids } = lowerAtHome([]);
    expect(ids).toContain('goblet-squat');
    expect(ids).toContain(BSS);
    expect(ids).not.toContain(DB_BSS);
  });

  it('a kept swap to the reverse lunge applies, with no loaded split squat', () => {
    const { ids } = lowerAtHome(kept('reverse-lunge'));
    expect(ids).toContain('reverse-lunge');
    expect(ids).not.toContain(DB_BSS);
  });

  it('does not hand the slot to the loaded split squat when the swap-in is already today’s squat', () => {
    // Swapped to the goblet squat, which home's lower day already has as its squat: the slot
    // takes the next best. Never outgrown, the split squat swapped away for comfort.
    const { ids, reasons } = lowerAtHome(kept('goblet-squat'));
    expect(ids).not.toContain(BSS);
    expect(ids).not.toContain(DB_BSS);
    expect(reasons.join(' ')).not.toContain('Dumbbell Bulgarian Split Squat in place of');
  });

  it('does not offer the loaded split squat as the coach’s extra quad work', () => {
    const plain = accessoryPicker({ profile, location: home!, history: [], now: RECORD_NOW });
    // Baseline: with no swap, the split squat at bodyweight.
    expect(pickAccessoryFor('quads', [], plain)?.id).toBe(BSS);
    const swapped = accessoryPicker({
      profile,
      location: home!,
      history: [],
      now: RECORD_NOW,
      swaps: kept('reverse-lunge'),
    });
    expect(pickAccessoryFor('quads', [], swapped)?.id).not.toBe(DB_BSS);
  });
});
