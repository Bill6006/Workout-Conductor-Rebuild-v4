import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { generateWorkout } from '../workoutGenerator/generate';
import { composeSummary, countChanges, describeCounts, diffWorkouts } from './diff';
import { TRIGGER_REGISTRY, describeTrigger, triggerTitle } from './triggers';
import type { TriggerType } from './types';

const NOW = '2026-09-03T14:00:00.000Z';
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const profile = createDefaultProfile(NOW);

describe('trigger registry', () => {
  it('covers every trigger with a label, a scope, and what the engine evaluates', () => {
    const types = Object.keys(TRIGGER_REGISTRY) as TriggerType[];
    expect(types).toHaveLength(25);
    for (const type of types) {
      const definition = TRIGGER_REGISTRY[type];
      expect(definition.label.length).toBeGreaterThan(0);
      expect(['local', 'partial', 'full']).toContain(definition.scope);
      expect(definition.evaluating.length).toBeGreaterThan(0);
    }
  });

  it('describes triggers in plain words for the overlay', () => {
    expect(triggerTitle({ type: 'duration', choice: 15 })).toBe(
      'Fitting the session to 15 minutes',
    );
    expect(triggerTitle({ type: 'duration', choice: 'default' })).toBe(
      'Rebuilding your workout at Default time',
    );
    expect(triggerTitle({ type: 'location' }, { locationName: 'Gym' })).toBe('Rebuilding for Gym');
    expect(triggerTitle({ type: 'pain', entryId: 'e1', joint: 'lower-back' })).toBe(
      'Protecting your lower back',
    );
    expect(
      triggerTitle({ type: 'equipment-busy', entryId: 'e1' }, { equipment: 'cable station' }),
    ).toBe('Working around a busy cable station');
    const described = describeTrigger({ type: 'technique', technique: 'supersets' });
    expect(described).toMatchObject({
      title: 'Re-pairing exercises',
      label: 'Techniques',
      scope: 'full',
    });
    expect(described.evaluating).toContain('Ranking superset opportunities');
  });
});

describe('change summary', () => {
  it('counts removed, added, replaced rows, supersets, and trimmed sets', () => {
    const full = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
    });
    const short = generateWorkout({ profile, location: gym, history: [], now: NOW, duration: 15 });
    const changes = diffWorkouts(full, short);
    const counts = countChanges(full, short, changes);
    expect(counts.removed).toBeGreaterThanOrEqual(2);
    expect(counts.added).toBe(0);
    expect(counts.replaced).toBe(0);
    const summary = composeSummary({
      prefix: 'Recalibrated to 15 min',
      previous: full,
      next: short,
      changes,
    });
    expect(summary.headline).toMatch(/^Recalibrated to 15 min: \d+ exercises removed/);
    expect(summary.details.some((line) => line.startsWith('Left out '))).toBe(true);
    expect(describeCounts({ ...counts, added: 1, supersetsAdded: 1 })).toContain(
      '1 superset added',
    );
  });

  it('reports no changes when nothing differs', () => {
    const workout = generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
    });
    const summary = composeSummary({
      prefix: 'Rebuilt for Gym',
      previous: workout,
      next: workout,
      changes: diffWorkouts(workout, workout),
    });
    expect(summary.headline).toBe('Rebuilt for Gym: no changes needed.');
    expect(summary.details).toEqual([]);
  });
});
