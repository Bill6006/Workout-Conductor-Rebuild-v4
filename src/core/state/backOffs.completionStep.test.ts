import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from './session';
import { buildCompletion, buildWorkoutRecord } from './workoutRecordBuilder';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { emptyCompleted, emptyConstraints } from '../../engine/recalibration/recalibrate';
import { allEntries, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { BENCH, gym, profileOf } from '../../test/backOffs';

/**
 * The sixth review of round N. The completion's "Next time" reads a lift's next target as the next
 * plan does (the second and third reviews), but where the next plan runs the lift straight after a
 * session on top set plus back-offs, at its back-offs' load, the completion takes that load to the
 * pound (`buildCompletion` passes `mainLiftTarget` a step of 1 and no loading): 5% under a 170 lb
 * top set is "162 lb", where the plan, on the weights the place has, asks 160. The lift to push is
 * such a lift on every push day after its sessions on the structure. The spec: wrong words on
 * screen; "Next time" says what the next plan asks. Synthetic data only.
 */

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.parse(RECORD_NOW) + days * DAY).toISOString();

/** A push day of the bench press on top set plus back-offs, `daysAgo` before RECORD_NOW. */
function structured(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, BENCH, [top, ...backOffs], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, index) => {
    set.tier = index === 0 ? 'top' : 'back-off';
    set.targetRir = index === 0 ? 1 : 2;
  });
  return done;
}

// The last top set 165 x 5 at 1 in reserve, as asked: 170 next.
const history = [
  structured(
    4,
    [5, 165, 1],
    [
      [5, 155, 2],
      [5, 155, 2],
      [5, 155, 2],
    ],
  ),
];
const profile = profileOf('hybrid', {
  pushLift: { exerciseId: BENCH, target: 225, units: 'lb', since: at(-1) },
});

function planAt(now: string, past: WorkoutRecord[]): GeneratedWorkout {
  return generateWorkout({
    profile,
    location: gym,
    history: past,
    now,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
}

describe('the completion’s "Next time" for the lift to push after its sessions on the structure', () => {
  it('names the load the next plan asks, on the weights the place has', () => {
    const workout = planAt(RECORD_NOW, history);
    const pushed = allEntries(workout.blocks).find((entry) => entry.exerciseId === BENCH)!;
    expect(pushed.push).toBe('natural');
    // Straight at the back-offs' load: 5% under the 170 lb top set, 161.5, on the plates 160.
    expect(pushed.atBackOffs).toBe(true);
    const working = pushed.sets.filter((set) => set.kind === 'working');
    expect(working[0]!.targetWeight).toBe(160);
    // Every set lifted as asked.
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
          weight: set.targetWeight,
          rir: set.targetRir,
          completedAt: RECORD_NOW,
        })),
      },
    } as unknown as WorkoutSession;
    const saved = buildWorkoutRecord(session, {
      now: RECORD_NOW,
      elapsedSeconds: 1800,
      rating: null,
      endedEarly: false,
    });
    const summary = buildCompletion(session, saved, profile, history);
    const line = summary.nextTargets.find((text) => text.startsWith('Barbell Bench Press'))!;
    expect(line).toBeDefined();
    // The next push day, as the push has it: straight again at the back-offs' load.
    const next = allEntries(planAt(at(3), [...history, saved]).blocks).find(
      (entry) => entry.exerciseId === BENCH,
    )!;
    expect(next.push).toBe('natural');
    const nextLoad = next.sets.find((set) => set.kind === 'working')!.targetWeight;
    // On 6f2d5ea: "Barbell Bench Press: 162 lb × 4-6 (load up)", the plan 160 lb.
    expect(line, `next plan ${nextLoad} lb`).toContain(`${nextLoad} lb`);
  });
});
