import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import { allEntries, type WorkoutBlock } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { estimateSeconds, estimateWorkout, remainingMinutes } from './duration';
import { durationEfficiency } from '../scoring/analytics';
import {
  PACE,
  estimateDoneSeconds,
  measureTrainingSeconds,
  paceReadings,
  personalPace,
  trainingSeconds,
} from './trainingTime';

/**
 * Maintenance 28, the owner's items 3 and 4: a workout's training time from its sets' own log
 * times, not the hours it stayed open; and the lifter's own pace, read against the plan's own
 * estimate and fitted to.
 */

const MINUTE = 60_000;
const START = '2026-09-01T17:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(START) + minutes * MINUTE).toISOString();

/** A set logged at `minute`, done or skipped. */
function setAt(minute: number, completed = true) {
  return {
    kind: 'working' as const,
    reps: completed ? 5 : 0,
    weight: completed ? 185 : null,
    rir: completed ? 2 : null,
    completed,
    loggedAt: at(minute),
  };
}

/** A workout begun at START with one set logged at each of `minutes`, finished at `end`. */
function timed(minutes: number[], end: number, extra: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    id: `w-${minutes.join('-')}`,
    startedAt: START,
    completedAt: at(end),
    locationId: 'gym',
    templateId: 'full-body',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    elapsedSeconds: end * 60,
    entries: [
      {
        exerciseId: 'back-squat',
        sets: minutes.map((minute) => ({
          kind: 'working' as const,
          reps: 5,
          weight: 185,
          rir: 2,
          completed: true,
          loggedAt: at(minute),
        })),
      },
    ],
    ...extra,
  };
}

describe('training time (Maintenance 28, item 3)', () => {
  it('counts the run-up and each wait between sets, each only as far as training takes it', () => {
    // Sets at 4, 7 and 10; then two hours away; sets at 130 and 133; finished at 133.5.
    const record = timed([4, 7, 10, 130, 133], 133.5);
    // 4 + 3 + 3 + 10 (the two hours) + 3: training ends with the last set.
    expect(measureTrainingSeconds(record)).toBe((4 + 3 + 3 + 10 + 3) * 60);
  });

  it('ends with the last set, as the estimate does (the review of item 3)', () => {
    // Finish half an hour after the last set, or at once: the same training time.
    expect(measureTrainingSeconds(timed([4, 7, 10], 40))).toBe(10 * 60);
    expect(measureTrainingSeconds(timed([4, 7, 10], 10))).toBe(10 * 60);
  });

  it('reads a workout left open for a day as the sets it had', () => {
    // The 1504-minute workout: forty-five minutes of sets, then open until the next day.
    const sets = Array.from({ length: 16 }, (_, index) => 2 + index * 3);
    const record = timed(sets, 1504);
    expect(measureTrainingSeconds(record)).toBe((2 + 45) * 60);
  });

  it('takes no time for a skip, whenever it was tapped (the review of item 3)', () => {
    // Sets to minute 19, the rest of the exercise skipped three hours on, then Finish.
    const late = timed([4, 7, 10, 13, 16, 19], 200);
    late.entries[0]!.sets.push(setAt(199, false), setAt(199.2, false));
    expect(measureTrainingSeconds(late)).toBe(19 * 60);
    // A skip between two sets does not split a long wait into two short ones.
    const between = timed([4, 30], 31);
    between.entries[0]!.sets.splice(1, 0, setAt(17, false));
    expect(measureTrainingSeconds(between)).toBe((4 + 10) * 60);
  });

  it('counts the wait before sets logged at one go for each of them (the review of item 3)', () => {
    // Four sets done over twelve minutes and logged together at minute 14, then four more logged
    // together at 27: the clock's 27.6 minutes, where a single set's ten minutes would read 21.2.
    const batches = timed([14, 14.2, 14.4, 14.6, 27, 27.2, 27.4, 27.6], 28);
    expect(measureTrainingSeconds(batches)).toBe(27.6 * 60);
    // Two hours away before one set: still ten minutes.
    const away = timed([14, 14.2, 14.4, 14.6, 135], 136);
    expect(measureTrainingSeconds(away)).toBe((14.6 + 10) * 60);
    // Sets a minute and a half apart are one at a time, each wait its own.
    const apart = timed([3, 4.5, 30], 31);
    expect(measureTrainingSeconds(apart)).toBe((3 + 1.5 + 10) * 60);
  });

  it("caps the run-up and never exceeds the workout's own clock", () => {
    // Forty minutes before the first set: ten count.
    expect(measureTrainingSeconds(timed([40, 43], 44))).toBe((10 + 3) * 60);
    // A pause the clock left out: the clock stands.
    expect(measureTrainingSeconds(timed([2, 5, 8], 9, { elapsedSeconds: 300 }))).toBe(300);
  });

  it('is what Duration efficiency reads', () => {
    const sets = Array.from({ length: 16 }, (_, index) => 2 + index * 3);
    const open = timed(sets, 1504, { plannedMinutes: 60 });
    expect(durationEfficiency([open]).value.averageActualMinutes).toBe(47);
  });

  it('keeps the clock of a workout with no set times, and prefers the saved time', () => {
    const imported = timed([], 50);
    expect(measureTrainingSeconds(imported)).toBe(50 * 60);
    expect(trainingSeconds({ ...timed([2, 5], 1504), trainingSeconds: 900 })).toBe(900);
  });
});

describe("the plan's own estimate of the sets done", () => {
  const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
  const profile = createDefaultProfile(RECORD_NOW);
  const workout = generateWorkout({
    profile,
    location: gym,
    history: [],
    now: RECORD_NOW,
    duration: 'default',
  });

  it('is the estimate of the plan cut to them, its warm-up with them, a skip costing nothing', () => {
    const first = allEntries(workout.blocks)[0]!;
    const doneSets = new Set(first.sets.map((set) => `${first.id}:${set.index}`));
    const done = (entryId: string, setIndex: number) => doneSets.has(`${entryId}:${setIndex}`);
    const cut: WorkoutBlock[] = [
      {
        id: 'cut',
        kind: 'straight',
        label: 'cut',
        entries: [first],
        rounds: first.sets.filter((set) => set.kind === 'working').length,
        restBetweenRoundsSeconds: 0,
      },
    ];
    const alone = estimateSeconds(cut, requireExercise);
    expect(estimateDoneSeconds(workout.blocks, done, 5, requireExercise)).toBe(
      Math.round(5 * 60 + alone.work + alone.rest + alone.setup),
    );
    expect(estimateDoneSeconds(workout.blocks, () => false, 5, requireExercise)).toBe(0);
  });
});

/** A finished workout with its training time and estimate, `daysAgo` before RECORD_NOW. */
function paced(daysAgo: number, training: number, estimate: number): WorkoutRecord {
  return {
    ...timed([], 60),
    id: `w-paced-${daysAgo}`,
    startedAt: new Date(Date.parse(RECORD_NOW) - daysAgo * 86_400_000).toISOString(),
    trainingSeconds: training * 60,
    estimatedSeconds: estimate * 60,
  };
}

describe('the pace (Maintenance 28, item 4)', () => {
  it('needs three workouts, and reads their middle', () => {
    expect(personalPace([])).toEqual({ readings: 0, ratio: null, usable: false, factor: 1 });
    const two = [paced(3, 60, 50), paced(2, 55, 50)];
    expect(personalPace(two)).toMatchObject({ readings: 2, usable: false, factor: 1 });
    const three = [...two, paced(1, 65, 50)];
    expect(personalPace(three)).toMatchObject({ readings: 3, usable: true, factor: 1.2 });
  });

  it('leaves out a short workout, a slip, and those before a reset', () => {
    const history = [
      paced(9, 45, 50),
      paced(8, 45, 50),
      paced(7, 45, 50),
      paced(6, 9, 8), // too short to read, though not far off
      paced(5, 200, 50), // four times its estimate: a slip
      paced(4, 60, 50),
      paced(3, 60, 50),
      paced(2, 60, 50),
    ];
    expect(paceReadings(history)).toHaveLength(6);
    const reset = new Date(Date.parse(RECORD_NOW) - 4.5 * 86_400_000).toISOString();
    expect(personalPace(history, reset)).toMatchObject({ readings: 3, factor: 1.2 });
  });

  it('reads the middle workout, so one far slower does not set the pace', () => {
    const history = [paced(3, 50, 50), paced(2, 50, 50), paced(1, 95, 50)];
    expect(personalPace(history)).toMatchObject({ ratio: 1, factor: 1 });
  });

  it('reads only the latest eight, and moves a plan no further than its bounds', () => {
    const slow = Array.from({ length: 8 }, (_, index) => paced(20 - index, 95, 50));
    const fast = Array.from({ length: 8 }, (_, index) => paced(10 - index, 35, 50));
    expect(personalPace([...slow, ...fast])).toMatchObject({
      readings: 8,
      factor: PACE.FACTOR_LOW,
    });
    expect(personalPace(slow)).toMatchObject({ ratio: 1.9, factor: PACE.FACTOR_HIGH });
  });

  it("keeps a plan's own parts, the pace a part of its own, all adding up (the review)", () => {
    const workout = generateWorkout({
      profile: createDefaultProfile(RECORD_NOW),
      location: createDefaultLocations({ gymAccess: true }, RECORD_NOW)[1],
      history: [],
      now: RECORD_NOW,
      duration: 'default',
    });
    const plain = estimateWorkout(workout.blocks, 5, requireExercise);
    const slow = estimateWorkout(workout.blocks, 5, requireExercise, undefined, 1.2);
    expect(plain.paceMinutes).toBeUndefined();
    expect(slow.totalMinutes).toBeCloseTo(plain.totalMinutes * 1.2, 0);
    // The warm-up, work, rests and setup are the plan's own; the pace adds a part of its own.
    expect(slow).toMatchObject({
      warmupMinutes: plain.warmupMinutes,
      workMinutes: plain.workMinutes,
      restMinutes: plain.restMinutes,
      transitionMinutes: plain.transitionMinutes,
    });
    expect(slow.paceMinutes).toBeCloseTo(plain.totalMinutes * 0.2, 0);
    expect(slow.totalMinutes).toBeCloseTo(
      slow.warmupMinutes +
        slow.workMinutes +
        slow.restMinutes +
        slow.transitionMinutes +
        (slow.paceMinutes ?? 0),
      5,
    );
    const fast = estimateWorkout(workout.blocks, 5, requireExercise, undefined, 0.8);
    expect(fast.paceMinutes).toBeLessThan(0);
    const left = (pace?: number) =>
      remainingMinutes({
        blocks: workout.blocks,
        exerciseOf: requireExercise,
        isDone: () => false,
        generalWarmupMinutes: 5,
        anythingLogged: false,
        elapsedSeconds: 0,
        restSecondsLeft: 0,
        ...(pace ? { pace } : {}),
      });
    expect(left(1.2)).toBeCloseTo(left() * 1.2, 5);
  });

  it('counts a running rest, a hold and the warm-up down in real time (the review of item 4)', () => {
    const workout = generateWorkout({
      profile: createDefaultProfile(RECORD_NOW),
      location: createDefaultLocations({ gymAccess: true }, RECORD_NOW)[1],
      history: [],
      now: RECORD_NOW,
      duration: 'default',
    });
    const first = allEntries(workout.blocks)[0]!;
    const isDone = (entryId: string, setIndex: number) =>
      entryId === first.id && setIndex === first.sets[0]!.index;
    const left = (input: { rest?: number; held?: number; elapsed?: number; logged?: boolean }) =>
      remainingMinutes({
        blocks: workout.blocks,
        exerciseOf: requireExercise,
        isDone: input.logged === false ? () => false : isDone,
        generalWarmupMinutes: 5,
        anythingLogged: input.logged ?? true,
        elapsedSeconds: input.elapsed ?? 0,
        restSecondsLeft: input.rest ?? 0,
        holdSecondsDone: input.held ?? 0,
        pace: 1.5,
      });
    // A minute of a rest gone: Left is a minute less, not a minute and a half.
    expect(left({ rest: 120 }) - left({ rest: 60 })).toBeCloseTo(1, 5);
    // Thirty seconds of a hold gone: half a minute less.
    expect(left({ held: 0 }) - left({ held: 30 })).toBeCloseTo(0.5, 5);
    // A minute of the warm-up gone: a minute less.
    expect(
      left({ logged: false, elapsed: 60 }) - left({ logged: false, elapsed: 120 }),
    ).toBeCloseTo(1, 5);
    // Before anything runs, the warm-up is the lifter's: half again as long.
    expect(left({ logged: false })).toBeCloseTo(
      remainingMinutes({
        blocks: workout.blocks,
        exerciseOf: requireExercise,
        isDone: () => false,
        generalWarmupMinutes: 5,
        anythingLogged: false,
        elapsedSeconds: 0,
        restSecondsLeft: 0,
      }) * 1.5,
      5,
    );
  });
});
