import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { allEntries } from '../workout/types';
import { generateWorkout } from './generate';

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);

describe('coach focus in the generator', () => {
  it('tips the template toward the focus muscle, trains it, and says so', () => {
    const plain = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
    });
    const focused = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { focusMuscle: 'lats' },
    });
    expect(plain.templateId).toBe('push-arms');
    expect(focused.templateId).not.toBe('push-arms');
    expect(
      allEntries(focused.blocks).some((entry) =>
        requireExercise(entry.exerciseId).primaryMuscles.includes('lats'),
      ),
    ).toBe(true);
    expect(focused.explanation.reasons.join(' ')).toMatch(/Lats lead today: your coach focus\./);
    expect(plain.explanation.reasons.join(' ')).not.toMatch(/coach focus/);
  });
});
