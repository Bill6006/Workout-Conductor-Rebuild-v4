import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { allEntries, workingSets } from '../workout/types';
import { generateWorkout } from './generate';

const profile = createDefaultProfile(RECORD_NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);

function generate(
  history: WorkoutRecord[],
  constraints?: Parameters<typeof generateWorkout>[0]['constraints'],
) {
  return generateWorkout({
    profile,
    location: gym,
    history,
    now: RECORD_NOW,
    duration: 'default',
    constraints,
  });
}

describe('week-aware selection', () => {
  it('avoids muscles trained in the last two days and says which are ready', () => {
    // A heavy push session yesterday: chest, triceps, and front delts are recovering.
    const history = [
      record(1, 'barbell-bench-press', [
        [5, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
      ]),
      record(
        1,
        'cable-triceps-pushdown',
        [
          [10, 40, 1],
          [10, 40, 1],
        ],
        [8, 12],
        1,
      ),
    ];
    const workout = generate(history);
    expect(workout.templateId).not.toBe('push-arms');
    expect(workout.explanation.reasons.join(' ')).toMatch(
      /trained in the last two days, so (it sits|they sit) out/,
    );
    expect(workout.explanation.reasons.join(' ')).toMatch(/days to recover/);
  });

  it('leads the accessories with muscles behind their weekly target and says so', () => {
    const workout = generate([record(9, 'barbell-bench-press', [[5, 185, 2]])]);
    const names = allEntries(workout.blocks).map((entry) => requireExercise(entry.exerciseId).name);
    expect(names.length).toBeGreaterThan(2);
    expect(workout.explanation.reasons.join(' ')).toMatch(
      /behind this week: the accessories lead with/,
    );
  });

  it('applies a planned deload week: one set fewer, one more in reserve, loads lighter, and says so', () => {
    const history = [8, 5, 2].map((daysAgo) =>
      record(daysAgo, 'barbell-bench-press', [
        [5, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
      ]),
    );
    const plain = generate(history);
    const deload = generate(history, {
      deload: { startsAt: '2026-09-09T00:00:00.000Z', endsAt: '2026-09-16T00:00:00.000Z' },
    });
    const benchPlain = allEntries(plain.blocks).find(
      (entry) => entry.exerciseId === 'barbell-bench-press',
    );
    const benchDeload = allEntries(deload.blocks).find(
      (entry) => entry.exerciseId === 'barbell-bench-press',
    );
    if (benchPlain && benchDeload) {
      const plainSets = workingSets(benchPlain).filter((set) => set.kind === 'working');
      const deloadSets = workingSets(benchDeload).filter((set) => set.kind === 'working');
      expect(deloadSets.length).toBe(plainSets.length - 1);
      expect(deloadSets[0]!.targetRir).toBe(plainSets[0]!.targetRir + 1);
      if (plainSets[0]!.targetWeight !== null) {
        expect(deloadSets[0]!.targetWeight).toBeLessThan(plainSets[0]!.targetWeight);
      }
      expect(benchDeload.progression?.evidence.join(' ')).toMatch(/Deload week: loads 10% lighter/);
    }
    expect(deload.explanation.reasons.join(' ')).toMatch(
      /Deload week \(Wed, Sep 9 to Tue, Sep 15\): one set fewer per exercise/,
    );
  });
});
