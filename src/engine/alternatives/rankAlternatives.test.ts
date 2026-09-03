import { describe, expect, it } from 'vitest';
import { GYM_DEFAULT_EQUIPMENT, HOME_DEFAULT_EQUIPMENT } from '../../catalog/equipment/equipment';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultProfile } from '../../core/validation/profile';
import type { ConflictContext } from '../conflicts/conflictEngine';
import { rankAlternatives } from './rankAlternatives';

const NOW = '2026-09-02T12:00:00.000Z';

function context(overrides: Partial<ConflictContext> = {}): ConflictContext {
  return {
    availableEquipment: new Set(GYM_DEFAULT_EQUIPMENT),
    locationName: 'Gym',
    limitations: createDefaultProfile(NOW).limitations,
    ...overrides,
  };
}

describe('rankAlternatives', () => {
  it('ranks same-muscle, same-pattern options first with complete fields', () => {
    const result = rankAlternatives({
      current: requireExercise('barbell-bench-press'),
      context: context(),
    });
    expect(result.emptyReason).toBeNull();
    expect(result.candidates.length).toBeGreaterThanOrEqual(4);
    const top = result.candidates[0];
    expect(top).toBeDefined();
    if (!top) return;
    expect(top.exercise.primaryMuscles).toContain('chest');
    expect(top.exercise.movementPattern).toBe('horizontal-push');
    expect(top.score).toBeGreaterThan(50);
    expect(top.primaryReason.length).toBeGreaterThan(0);
    expect(top.keyDifference.length).toBeGreaterThan(0);
    expect(top.equipment.length).toBeGreaterThan(0);
    expect(typeof top.preservesProgression).toBe('boolean');
    expect(result.candidates.map((candidate) => candidate.exercise.id)).toContain(
      'dumbbell-bench-press',
    );
    const scores = result.candidates.map((candidate) => candidate.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('excludes unavailable equipment, limitations, dislikes, and exercises already in the workout', () => {
    const home = rankAlternatives({
      current: requireExercise('barbell-bench-press'),
      context: context({
        availableEquipment: new Set(HOME_DEFAULT_EQUIPMENT),
        locationName: 'Home',
      }),
    });
    for (const candidate of home.candidates) {
      expect(
        candidate.exercise.equipment.some((group) =>
          group.every((id) => HOME_DEFAULT_EQUIPMENT.includes(id)),
        ),
      ).toBe(true);
    }

    const noDips = rankAlternatives({
      current: requireExercise('cable-triceps-pushdown'),
      context: context({
        limitations: {
          painAreas: [],
          shoulder: ['avoid-dips'],
          avoidBarbellSquats: false,
          notes: '',
        },
        dislikedIds: new Set(['skull-crusher']),
      }),
      otherExercises: [requireExercise('overhead-triceps-extension')],
    });
    const ids = noDips.candidates.map((candidate) => candidate.exercise.id);
    expect(ids).not.toContain('dip');
    expect(ids).not.toContain('bench-dip');
    expect(ids).not.toContain('skull-crusher');
    expect(ids).not.toContain('overhead-triceps-extension');
    expect(ids).not.toContain('cable-triceps-pushdown');
  });

  it('only offers exercises that train the same primary muscle', () => {
    const result = rankAlternatives({
      current: requireExercise('lateral-raise'),
      context: context(),
    });
    expect(
      result.candidates.every((candidate) =>
        candidate.exercise.primaryMuscles.includes('side-delts'),
      ),
    ).toBe(true);
  });

  it('respects the superset partner and reports superset impact', () => {
    const result = rankAlternatives({
      current: requireExercise('cable-fly'),
      context: context(),
      supersetPartner: requireExercise('leg-press'),
    });
    expect(
      result.candidates.every(
        (candidate) =>
          !(candidate.exercise.compound && candidate.exercise.strengthSuitability >= 2),
      ),
    ).toBe(true);
    expect(
      result.candidates.every((candidate) =>
        ['none', 'changes', 'breaks'].includes(candidate.supersetImpact),
      ),
    ).toBe(true);
  });

  it('boosts preferred exercises and honours the drop-set plan', () => {
    const plain = rankAlternatives({
      current: requireExercise('barbell-bench-press'),
      context: context(),
    });
    const boosted = rankAlternatives({
      current: requireExercise('barbell-bench-press'),
      context: context(),
      signals: { preferredIds: new Set(['machine-chest-press']) },
      dropSetPlanned: true,
    });
    const plainScore =
      plain.candidates.find((candidate) => candidate.exercise.id === 'machine-chest-press')
        ?.score ?? 0;
    const boostedScore =
      boosted.candidates.find((candidate) => candidate.exercise.id === 'machine-chest-press')
        ?.score ?? 0;
    expect(boostedScore).toBeGreaterThan(plainScore);
    expect(boosted.candidates[0]?.exercise.id).toBe('machine-chest-press');
  });

  it('excludes candidates that cannot fit the remaining time', () => {
    const result = rankAlternatives({
      current: requireExercise('barbell-bench-press'),
      context: context(),
      remainingMinutes: 3,
      plannedSets: { sets: 3, restSeconds: 60 },
    });
    expect(result.candidates.every((candidate) => candidate.setupSeconds <= 30)).toBe(true);
  });

  it('explains an empty list', () => {
    const bare = rankAlternatives({
      current: requireExercise('leg-curl'),
      context: context({ availableEquipment: new Set(), locationName: 'Bare room' }),
    });
    expect(bare.candidates).toEqual([]);
    expect(bare.emptyReason).toContain('Bare room');
  });
});
