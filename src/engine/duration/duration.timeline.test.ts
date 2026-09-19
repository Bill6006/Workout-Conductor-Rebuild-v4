import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type ProgramStyle } from '../../core/validation/profile';
import { nextPosition, restAfter, workoutSequence } from '../workout/sequence';
import type {
  DurationChoice,
  GeneratedWorkout,
  WorkoutBlock,
  WorkoutEntry,
} from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import {
  REP_SECONDS,
  SET_OVERHEAD_SECONDS,
  estimateSeconds,
  estimateWorkout,
  remainingMinutes,
  workSecondsFor,
} from './duration';

const NOW = '2026-09-03T12:00:00.000Z';
const places = createDefaultLocations({ gymAccess: true }, NOW);
const base = { ...createDefaultProfile(NOW), bodyweight: 185 };

function plan(
  duration: DurationChoice,
  kind: 'gym' | 'home' = 'gym',
  programStyle: ProgramStyle = 'hybrid',
): GeneratedWorkout {
  const location = places.find((place) => place.kind === kind);
  if (!location) throw new Error(`no ${kind}`);
  return generateWorkout({
    profile: { ...base, programStyle, currentLocationId: location.id },
    location,
    history: [],
    now: NOW,
    duration,
  });
}

/** Every rest the workout screen's timer would run from here to the end of the session. */
function timerRest(workout: GeneratedWorkout, done: ReadonlySet<string>): number {
  const left = workoutSequence(workout).filter(
    (item) => !done.has(`${item.entryId}:${item.setIndex}`),
  );
  // Nothing is timed after the final set of the day.
  return left.slice(0, -1).reduce((sum, item) => sum + restAfter(workout, item), 0);
}

describe('the estimate is the timeline the workout screen runs', () => {
  const sessions: [string, GeneratedWorkout][] = [
    ['15 min at the gym', plan(15)],
    ['30 min at the gym', plan(30)],
    ['45 min at home', plan(45, 'home')],
    ['Default at the gym', plan('default')],
    ['Default at home, light weights', plan('default', 'home', 'high-rep')],
    ['Default at the gym, lean-down', plan('default', 'gym', 'lean-down')],
  ];

  it.each(sessions)('%s: counts exactly the rests the timer will show', (_name, workout) => {
    const { rest } = estimateSeconds(workout.blocks, requireExercise);
    expect(rest).toBe(timerRest(workout, new Set()));
    expect(workout.blocks.length).toBeGreaterThan(1);
  });

  it.each(sessions)('%s: and still does at every point through the session', (_name, workout) => {
    const sequence = workoutSequence(workout);
    const done = new Set<string>();
    for (const item of sequence) {
      done.add(`${item.entryId}:${item.setIndex}`);
      const isDone = (entryId: string, setIndex: number) => done.has(`${entryId}:${setIndex}`);
      expect(estimateSeconds(workout.blocks, requireExercise, isDone).rest).toBe(
        timerRest(workout, done),
      );
    }
    // With everything logged there is nothing left to time.
    const all = (entryId: string, setIndex: number) => done.has(`${entryId}:${setIndex}`);
    expect(estimateSeconds(workout.blocks, requireExercise, all)).toEqual({
      work: 0,
      rest: 0,
      setup: 0,
    });
  });

  it('counts the rest between two exercises, which the timer runs in full', () => {
    const workout = plan('default');
    const sequence = workoutSequence(workout);
    const crossing = sequence.find((item) => {
      const next = nextPosition(workout, item);
      return next !== null && next.blockId !== item.blockId && item.kind === 'working';
    });
    if (!crossing) throw new Error('expected a set followed by another exercise');
    expect(restAfter(workout, crossing)).toBeGreaterThanOrEqual(45);
  });
});

describe('a set is timed at its reps and the coached tempo', () => {
  const entry = (role: WorkoutEntry['role'], capped = false) => ({
    role,
    progression: capped
      ? {
          mode: 'weight' as const,
          evidence: [],
          sessions: 1,
          viaFamily: false,
          confidence: 'low' as const,
          setsAdvice: 0 as const,
          capped: { at: 55 },
        }
      : undefined,
  });

  it('uses the middle of the rep range, so longer sets take longer', () => {
    const fives = workSecondsFor(entry('primary-strength'), {
      kind: 'working',
      targetReps: [4, 6],
    });
    expect(fives).toBe(5 * REP_SECONDS.strength + SET_OVERHEAD_SECONDS.strength);
    const fifteens = workSecondsFor(entry('isolation'), { kind: 'working', targetReps: [10, 15] });
    expect(fifteens).toBe(12.5 * REP_SECONDS.isolation + SET_OVERHEAD_SECONDS.other);
    const light = workSecondsFor(entry('isolation'), { kind: 'working', targetReps: [20, 25] });
    expect(light).toBeGreaterThan(fifteens * 1.6);
  });

  it('times ramp sets, drop sets, and a lift held at the heaviest weight here at their own pace', () => {
    expect(workSecondsFor(entry('primary-strength'), { kind: 'warmup', targetReps: [4, 6] })).toBe(
      5 * REP_SECONDS.warmup + SET_OVERHEAD_SECONDS.strength,
    );
    expect(workSecondsFor(entry('isolation'), { kind: 'drop', targetReps: [8, 12] })).toBe(
      10 * REP_SECONDS.drop + SET_OVERHEAD_SECONDS.drop,
    );
    const free = workSecondsFor(entry('primary-hypertrophy'), {
      kind: 'working',
      targetReps: [8, 12],
    });
    const held = workSecondsFor(entry('primary-hypertrophy', true), {
      kind: 'working',
      targetReps: [8, 12],
    });
    expect(held).toBeGreaterThan(free);
  });

  it('so a light-weights session is honestly longer than the same session under Hybrid', () => {
    const hybrid = plan(45, 'home');
    const light = plan(45, 'home', 'high-rep');
    const perSet = (workout: GeneratedWorkout) => {
      const { work } = estimateSeconds(workout.blocks, requireExercise);
      return work / workoutSequence(workout).length;
    };
    expect(perSet(light)).toBeGreaterThan(perSet(hybrid) * 1.3);
    // And it is still fitted to the length that was asked for.
    expect(light.duration.estimatedMinutes).toBeLessThanOrEqual(46);
  });
});

describe('set-up counts only where it outlasts the rest that led to it', () => {
  function straight(id: string, exerciseId: string, restSeconds: number): WorkoutBlock {
    const entry: WorkoutEntry = {
      id,
      exerciseId,
      role: 'secondary-hypertrophy',
      sets: [0, 1].map((index) => ({
        index,
        kind: 'working' as const,
        targetReps: [8, 12] as [number, number],
        targetRir: 1,
        targetWeight: null,
        restSeconds,
      })),
      restSeconds,
      warmupSets: 0,
      dropSet: false,
      chosenFor: [],
      locked: false,
      pinned: false,
    };
    return {
      id: `b-${id}`,
      kind: 'straight',
      label: exerciseId,
      entries: [entry],
      rounds: 2,
      restBetweenRoundsSeconds: restSeconds,
    };
  }
  const bench = requireExercise('barbell-bench-press');
  const benchSetup = bench.setupSeconds + bench.transitionCost * 10;

  it('a long rest swallows the walk to the next exercise; a short one leaves the difference', () => {
    const first = estimateSeconds([straight('a', 'barbell-bench-press', 300)], requireExercise);
    expect(first.setup).toBe(benchSetup);
    const long = estimateSeconds(
      [straight('a', 'cable-fly', 300), straight('b', 'barbell-bench-press', 60)],
      requireExercise,
    );
    const fly = requireExercise('cable-fly');
    expect(long.setup).toBe(fly.setupSeconds + fly.transitionCost * 10);
    const short = estimateSeconds(
      [straight('a', 'cable-fly', 30), straight('b', 'barbell-bench-press', 60)],
      requireExercise,
    );
    expect(short.setup).toBe(fly.setupSeconds + fly.transitionCost * 10 + (benchSetup - 30));
    // The rest between the two exercises is counted in full either way.
    expect(long.rest).toBe(300 + 300 + 60);
    expect(short.rest).toBe(30 + 30 + 60);
  });
});

describe('time left on the workout screen', () => {
  const workout = plan('default');
  // The exact total in minutes; `estimateWorkout` rounds each part to a tenth for display.
  const seconds = estimateSeconds(workout.blocks, requireExercise);
  const total = workout.warmup.generalMinutes + (seconds.work + seconds.rest + seconds.setup) / 60;
  const left = (patch: Partial<Parameters<typeof remainingMinutes>[0]>) =>
    remainingMinutes({
      blocks: workout.blocks,
      exerciseOf: requireExercise,
      isDone: () => false,
      generalWarmupMinutes: workout.warmup.generalMinutes,
      anythingLogged: false,
      elapsedSeconds: 0,
      restSecondsLeft: 0,
      ...patch,
    });

  it('starts at the length the plan promised, and adds up with the clock through the warm-up', () => {
    expect(workout.warmup.generalMinutes).toBeGreaterThan(0);
    // The number on the dropdown is this total, rounded.
    expect(
      Math.abs(
        estimateWorkout(workout.blocks, workout.warmup.generalMinutes, requireExercise)
          .totalMinutes - total,
      ),
    ).toBeLessThan(0.2);
    expect(workout.duration.estimatedMinutes).toBe(Math.round(total));
    expect(left({})).toBeCloseTo(total, 1);
    // A minute and ten seconds in, nothing logged: the clock and time left still make the total.
    expect(left({ elapsedSeconds: 70 }) + 70 / 60).toBeCloseTo(total, 1);
    // A warm-up that runs long does not go negative.
    expect(left({ elapsedSeconds: 1200 })).toBeCloseTo(total - workout.warmup.generalMinutes, 1);
  });

  it('drops the general warm-up once a set is logged, and counts a rest in progress', () => {
    const first = workoutSequence(workout)[0];
    if (!first) throw new Error('expected a first set');
    const isDone = (entryId: string, setIndex: number) =>
      entryId === first.entryId && setIndex === first.setIndex;
    const after = left({ isDone, anythingLogged: true, elapsedSeconds: 200 });
    expect(after).toBeLessThan(total - workout.warmup.generalMinutes);
    const resting = left({
      isDone,
      anythingLogged: true,
      elapsedSeconds: 200,
      restSecondsLeft: 90,
    });
    expect(resting).toBeCloseTo(after + 1.5, 5);
  });
});
