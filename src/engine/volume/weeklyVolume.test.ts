import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import {
  computeExposure,
  computeMusclePriorities,
  computeWeeklyVolume,
  goalWeights,
  weeklyTargets,
} from './weeklyVolume';

const NOW = '2026-09-10T12:00:00.000Z';

function record(
  id: string,
  daysAgo: number,
  exerciseId: string,
  sets: number,
  templateId = 'push-arms',
): WorkoutRecord {
  const when = new Date(new Date(NOW).getTime() - daysAgo * 86_400_000).toISOString();
  return {
    id,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId,
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId,
        sets: [
          { kind: 'warmup', reps: 8, weight: 95, rir: 5, completed: true },
          ...Array.from({ length: sets }, () => ({
            kind: 'working' as const,
            reps: 8,
            weight: 135,
            rir: 1,
            completed: true,
          })),
        ],
      },
    ],
  };
}

describe('weekly volume and exposure', () => {
  it('counts direct and indirect working sets in the last seven days only', () => {
    const history = [
      record('a', 2, 'barbell-bench-press', 3),
      record('b', 9, 'barbell-bench-press', 5),
    ];
    const volume = computeWeeklyVolume(history, NOW);
    expect(volume.chest.direct).toBe(3);
    expect(volume.triceps.direct).toBe(3);
    expect(volume['front-delts'].indirect).toBe(1.5);
    expect(volume.lats.direct).toBe(0);
  });

  it('tracks days since each muscle and exercise, and recent templates', () => {
    const history = [
      record('a', 2, 'barbell-bench-press', 3),
      record('b', 9, 'lat-pulldown', 3, 'pull-arms'),
      record('c', 20, 'back-squat', 3, 'lower'),
    ];
    const exposure = computeExposure(history, NOW);
    expect(exposure.daysSinceMuscle.chest).toBeCloseTo(2, 5);
    expect(exposure.daysSinceMuscle.lats).toBeCloseTo(9, 5);
    expect(exposure.daysSinceMuscle.quads).toBeCloseTo(20, 5);
    expect(exposure.daysSinceExercise['lat-pulldown']).toBeCloseTo(9, 5);
    expect(exposure.recentTemplates).toEqual(['push-arms', 'pull-arms']);
    expect(exposure.sessionsLast14Days).toBe(2);
  });

  it('weights and targets follow the goals', () => {
    const profile = createDefaultProfile(NOW);
    const weights = goalWeights(profile);
    expect(weights.biceps).toBeGreaterThan(weights.chest);
    expect(weights.calves).toBeLessThan(weights.chest);
    const targets = weeklyTargets(profile);
    expect(targets.biceps).toBeGreaterThan(targets.chest);
    expect(targets.chest).toBe(10);
    expect(targets.abs).toBeLessThan(targets.chest);
  });

  it('prioritises fresh, under-trained, goal muscles', () => {
    const profile = createDefaultProfile(NOW);
    const history = [record('a', 1, 'barbell-bench-press', 4)];
    const priorities = computeMusclePriorities(
      profile,
      computeWeeklyVolume(history, NOW),
      computeExposure(history, NOW),
    );
    const by = (muscle: string) => priorities.find((priority) => priority.muscle === muscle)!;
    expect(by('chest').weight).toBeLessThan(by('lats').weight);
    expect(by('biceps').weight).toBeGreaterThan(by('lats').weight);
    expect(by('chest').reason).toContain('trained in the last day');
    expect(by('chest').weeklySetsDone).toBe(4);
    expect(priorities[0]!.weight).toBeGreaterThanOrEqual(priorities[1]!.weight);
  });
});
