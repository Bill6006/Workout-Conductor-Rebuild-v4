import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from './session';
import { buildCompletion, buildWorkoutRecord } from './workoutRecordBuilder';
import { emptyCompleted, emptyConstraints } from '../../engine/recalibration/recalibrate';
import { allEntries, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { RECORD_NOW } from '../../test/records';
import { BENCH, gym, profileOf, trained } from '../../test/backOffs';

/**
 * Maintenance 32, the owner's item 11, in the completion (the third review of round N): "Next time"
 * reads the lift to push as the next plan does, on its own straight sets, never as a top set.
 * Synthetic data only.
 */

const pushLift = { exerciseId: BENCH, target: 225, units: 'lb' as const, since: RECORD_NOW };
const profile = profileOf('hybrid', { pushLift });

const at = (daysAfter: number) =>
  new Date(Date.parse(RECORD_NOW) + daysAfter * 86_400_000).toISOString();

function planAt(now: string, history = trained()): GeneratedWorkout {
  return generateWorkout({
    profile,
    location: gym,
    history,
    now,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
}

describe('the completion’s "Next time" for the lift to push, the third review of round N', () => {
  it('reads the next target as the next plan does', () => {
    const workout = planAt(RECORD_NOW);
    const pushed = allEntries(workout.blocks).find((entry) => entry.exerciseId === BENCH)!;
    expect(pushed.push).toBe('natural');
    // Straight sets: the push shapes every set of it.
    expect(pushed.sets.every((set) => set.tier === undefined)).toBe(true);
    const working = pushed.sets.filter((set) => set.kind === 'working');
    const load = working[0]!.targetWeight!;
    // Every set lifted at the load asked, the reps in range, one in reserve (the push asks 2).
    const session = {
      workout,
      constraints: emptyConstraints(),
      completed: {
        ...emptyCompleted(),
        startedAt: RECORD_NOW,
        sets: working.map((set) => ({
          entryId: pushed.id,
          exerciseId: BENCH,
          setIndex: set.index,
          kind: 'working',
          reps: 5,
          weight: load,
          rir: 1,
          completedAt: RECORD_NOW,
        })),
      },
    } as unknown as WorkoutSession;
    const record = buildWorkoutRecord(session, {
      now: RECORD_NOW,
      elapsedSeconds: 1800,
      rating: null,
      endedEarly: false,
    });
    const summary = buildCompletion(session, record, profile, trained());
    const line = summary.nextTargets.find((text) => text.startsWith('Barbell Bench Press'))!;
    expect(line).toBeDefined();
    // The next plan with the bench press in it, as the push has it: straight, its own target.
    const next = [3, 4, 5, 6, 7]
      .map((days) => planAt(at(days), [...trained(), record]))
      .map((plan) => allEntries(plan.blocks).find((entry) => entry.exerciseId === BENCH))
      .find((entry) => entry !== undefined && entry.push !== undefined);
    expect(next).toBeDefined();
    const nextLoad = next!.sets.find((set) => set.kind === 'working')!.targetWeight;
    expect(line).toContain(`${nextLoad} lb`);
  });
});
