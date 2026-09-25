import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { TrainingRole } from '../../catalog/exercises/exerciseSchema';
import type { WorkoutSession } from '../../core/state/session';
import { buildWorkoutRecord } from '../../core/state/workoutRecordBuilder';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { DUMBBELLS_KEY, type LoadingRange } from '../loading/loading';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type {
  CompletedSet,
  CompletedWork,
  RecalibrationResult,
  RecalibrationTrigger,
} from '../recalibration/types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyMaxes, recordMax, type StrengthMaxes } from './maxes';
import { rampWeights, recommendNextTarget } from './progression';
import { prescribe } from './roles';

/**
 * Maintenance 23, the ninth pass, from the re-check of the eighth: ramps past three get a
 * weight; a ramp put back after a long break follows the working weight on its own; reps set by
 * hand are fitted in place on every path, from the weight they were set at, and come back to it
 * where the weights make it again; a max keeps the step rule's record; a ramp reads the range its
 * set stands in for; a swap leaves reps set by hand behind; and a max skipped for a weight set
 * today says so.
 */

const NOW = RECORD_NOW;
const places = createDefaultLocations({ gymAccess: true }, NOW);
const home = places.find((place) => place.id === 'home') as LocationProfile;
const gym = places.find((place) => place.id === 'gym') as LocationProfile;
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const none: CompletedWork = emptyCompleted();
const incline = 'incline-dumbbell-press';
const row = 'chest-supported-row';

const at = (...ranges: LoadingRange[]): LocationProfile => ({
  ...home,
  loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges } },
});
const gymAt = (...ranges: LoadingRange[]): LocationProfile => ({
  ...gym,
  loading: { ...gym.loading, [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges } },
});
const lightHome = at({ from: 5, to: 20, step: 5 });

function plain(
  daysAgo: number,
  exerciseId: string,
  reps: number[],
  weight: number,
  target: [number, number],
): WorkoutRecord {
  const done = record(
    daysAgo,
    exerciseId,
    reps.map((count): SetSpec => [count, weight, 1]),
    target,
    1,
  );
  for (const set of done.entries[0]?.sets ?? []) set.targetWeight = weight;
  return done;
}

function nextOf(exerciseId: string, role: TrainingRole, history: WorkoutRecord[]) {
  const exercise = requireExercise(exerciseId);
  return recommendNextTarget({
    exercise,
    role,
    prescription: prescribe(exercise, role, profile),
    history,
    profile,
    now: NOW,
  });
}

function plan(
  place: LocationProfile,
  history: WorkoutRecord[] = [],
  templateId = 'push-arms',
): GeneratedWorkout {
  return generateWorkout({
    profile: { ...profile, currentLocationId: place.id },
    location: place,
    history,
    now: NOW,
    duration: 'default',
    constraints: { templateId },
  });
}

function entryFor(workout: GeneratedWorkout, exerciseId: string): WorkoutEntry {
  const found = allEntries(workout.blocks).find(
    (entry) => entry.exerciseId === exerciseId && !entry.stopped,
  );
  if (!found) throw new Error(`no ${exerciseId}`);
  return found;
}

interface Extra {
  history?: WorkoutRecord[];
  maxes?: StrengthMaxes;
  loading?: { missingPlates: number[] };
}

function run(
  place: LocationProfile,
  workout: GeneratedWorkout,
  completed: CompletedWork,
  trigger: RecalibrationTrigger,
  extra: Extra = {},
): RecalibrationResult {
  return recalibrate({
    trigger,
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: workout.duration.choice,
    profile: { ...profile, currentLocationId: place.id },
    location: place,
    history: extra.history ?? [],
    constraints: emptyConstraints(),
    ...(extra.loading ? { loading: extra.loading } : {}),
    maxes: extra.maxes ?? null,
    reason: 'test',
    timestamp: NOW,
  });
}

function act(
  place: LocationProfile,
  workout: GeneratedWorkout,
  completed: CompletedWork,
  trigger: RecalibrationTrigger,
  extra: Extra = {},
): GeneratedWorkout {
  const result = run(place, workout, completed, trigger, extra);
  if (!result.ok) throw new Error(result.error);
  return result.workout;
}

const started = (entryId: string, elapsedSeconds = 60): CompletedWork => ({
  ...emptyCompleted(),
  startedAt: NOW,
  elapsedSeconds,
  currentEntryId: entryId,
});

/** The given sets of an entry (by index) logged at their targets, after what was done before. */
function logSets(
  entry: WorkoutEntry,
  indices: number[],
  prior: CompletedWork,
  over: Partial<CompletedSet> = {},
): CompletedWork {
  const sets = indices.map((index): CompletedSet => {
    const set = entry.sets.find((one) => one.index === index);
    if (!set) throw new Error(`no set ${index}`);
    return {
      entryId: entry.id,
      exerciseId: entry.exerciseId,
      setIndex: set.index,
      kind: set.kind,
      reps: set.targetReps[1],
      weight: set.targetWeight,
      rir: set.kind === 'warmup' ? 5 : 1,
      completedAt: '2026-09-10T12:01:00.000Z',
      ...over,
    };
  });
  return { ...prior, currentEntryId: entry.id, sets: [...prior.sets, ...sets] };
}

/** Every working set of the incline still to come logged at `reps`. */
function doAll(workout: GeneratedWorkout, prior: CompletedWork, reps: number): CompletedWork {
  const lift = entryFor(workout, incline);
  const left = lift.sets
    .filter(
      (set) =>
        set.kind === 'working' &&
        !prior.sets.some((done) => done.entryId === lift.id && done.setIndex === set.index),
    )
    .map((set) => set.index);
  return logSets(lift, left, prior, { reps, rir: 1 });
}

function saveSession(workout: GeneratedWorkout, completed: CompletedWork): WorkoutRecord {
  return buildWorkoutRecord(
    {
      workout,
      completed,
      duration: 'default',
      constraints: emptyConstraints(),
    } as unknown as WorkoutSession,
    { now: '2026-09-08T12:40:00.000Z', elapsedSeconds: 2400, rating: null, endedEarly: false },
  );
}

const toCome = (entry: WorkoutEntry, completed: CompletedWork) =>
  entry.sets.filter(
    (set) =>
      !completed.sets.some((done) => done.entryId === entry.id && done.setIndex === set.index),
  );

const working = (workout: GeneratedWorkout, exerciseId: string) =>
  entryFor(workout, exerciseId)
    .sets.filter((set) => set.kind === 'working')
    .map((set) => [set.targetWeight, set.targetReps, set.asked]);

/** The incline's first ramp logged at its target. */
function rampDone(lift: WorkoutEntry): CompletedWork {
  const ramp = lift.sets.find((set) => set.kind === 'warmup');
  if (!ramp) throw new Error('no ramp');
  return logSets(lift, [ramp.index], started(lift.id), { reps: 6 });
}

describe('ramp weights past three ramps', () => {
  it('gives every ramp a weight, climbing under the working weight and never under the bar', () => {
    for (const [weight, floor] of [
      [45, null],
      [135, 45],
    ] as const) {
      for (const count of [4, 5, 6]) {
        const loads = rampWeights(weight, count, 5, floor);
        expect(loads).toHaveLength(count);
        loads.forEach((load, index) => {
          expect(Number.isFinite(load)).toBe(true);
          expect(load ?? 0).toBeGreaterThanOrEqual(floor ?? 5);
          expect(load ?? 0).toBeLessThan(weight);
          if (index > 0) expect(load ?? 0).toBeGreaterThan(loads[index - 1] ?? 0);
        });
      }
    }
    expect(rampWeights(45, 4, 5)).toEqual([20, 25, 30, 35]);
    // Three and fewer are as they were.
    expect(rampWeights(45, 3, 5)).toEqual([20, 25, 35]);
    expect(rampWeights(135, 3, 5, 45)).toEqual([55, 80, 110]);
  });
});

describe('ramps after four ramps, at a place with no saved weights', () => {
  it('stay numbers after two ramps added by hand and done, then the move to the gym', () => {
    const workout = plan(lightHome, [], 'full-body');
    const lift = entryFor(workout, row);
    const once = act(lightHome, workout, started(lift.id), {
      type: 'add-warmup',
      entryId: lift.id,
    });
    const twice = act(lightHome, once, started(lift.id), { type: 'add-warmup', entryId: lift.id });
    const added = entryFor(twice, row).sets.filter(
      (set) => set.kind === 'warmup' && set.targetWeight === null,
    );
    expect(added).toHaveLength(2);
    const done = logSets(
      entryFor(twice, row),
      added.map((set) => set.index),
      started(lift.id),
      { weight: 5, reps: 8 },
    );
    const moved = entryFor(act(gym, twice, done, { type: 'location' }), row);
    // The plan's own ramp to 30 lb, above the 5 lb ramps done.
    expect(toCome(moved, done).map((set) => [set.kind, set.targetWeight])).toEqual([
      ['warmup', 15],
      ['warmup', 25],
      ['working', 30],
      ['working', 30],
      ['working', 30],
    ]);
  });

  it('keep the plan’s ramps above the ramps added by hand, where those were lifted heavier', () => {
    const workout = plan(lightHome, [], 'full-body');
    const lift = entryFor(workout, row);
    const once = act(lightHome, workout, started(lift.id), {
      type: 'add-warmup',
      entryId: lift.id,
    });
    const added = entryFor(once, row).sets.filter(
      (set) => set.kind === 'warmup' && set.targetWeight === null,
    );
    // The ramp added by hand, lifted at 20 lb, then the move to the gym.
    const done = logSets(
      entryFor(once, row),
      added.map((set) => set.index),
      started(lift.id),
      { weight: 20, reps: 8 },
    );
    const moved = entryFor(act(gym, once, done, { type: 'location' }), row);
    expect(toCome(moved, done).map((set) => [set.kind, set.targetWeight])).toEqual([
      ['warmup', 25],
      ['working', 30],
      ['working', 30],
      ['working', 30],
    ]);
  });

  it('stay numbers when the coach sets the weight of a lift with two ramps added', () => {
    const workout = plan(gym, [], 'full-body');
    const lift = entryFor(workout, row);
    const once = act(gym, workout, started(lift.id), { type: 'add-warmup', entryId: lift.id });
    const twice = act(gym, once, started(lift.id), { type: 'add-warmup', entryId: lift.id });
    const set = act(gym, twice, started(lift.id), {
      type: 'target-weight',
      entryId: lift.id,
      weight: 50,
    });
    expect(
      entryFor(set, row)
        .sets.filter((one) => one.kind === 'warmup')
        .map((one) => one.targetWeight),
    ).toEqual([20, 25, 35, 40]);
  });
});

describe('ramps still to come where the weights leave room for fewer', () => {
  it('keep one ramp per weight under the working weight, never two at the same weight', () => {
    const workout = plan(gym, [], 'full-body');
    const lift = entryFor(workout, row);
    expect(lift.sets.filter((set) => set.kind === 'warmup').map((set) => set.targetWeight)).toEqual(
      [15, 25],
    );
    // Reps set by hand, then the gym's dumbbells saved as stopping at 10 lb: room for one ramp.
    const own = act(gym, workout, none, { type: 'rep-range', entryId: lift.id, reps: [8, 10] });
    const to10 = gymAt({ from: 5, to: 10, step: 5 });
    const moved = entryFor(act(to10, own, started(lift.id), { type: 'loading' }), row);
    expect(moved.sets.map((set) => [set.kind, set.targetWeight])).toEqual([
      ['warmup', 5],
      ['working', 10],
      ['working', 10],
      ['working', 10],
    ]);
    expect(moved.warmupSets).toBe(1);
  });
});

describe('the ramp put back after a long break', () => {
  function afterBreak(place: LocationProfile) {
    const workout = plan(place, [], 'full-body');
    const lift = entryFor(workout, row);
    const ramps = lift.sets.filter((set) => set.kind === 'warmup');
    const first = lift.sets.find((set) => set.kind === 'working');
    if (!first) throw new Error('no working set');
    const done = logSets(
      lift,
      [...ramps.map((set) => set.index), first.index],
      started(lift.id, 20 * 60),
    );
    const back = act(place, workout, done, { type: 'resume', awaySeconds: 25 * 60 });
    const again = toCome(entryFor(back, row), done).find((set) => set.kind === 'warmup');
    if (!again) throw new Error('no ramp put back');
    return { back, done, again };
  }

  for (const [label, place, trigger, weight, next] of [
    ['the gym dumbbells saved as 5-25', gymAt({ from: 5, to: 25, step: 5 }), 'loading', 15, 25],
    ['a move to the light home', lightHome, 'location', 10, 20],
  ] as const) {
    it(`stays before the next working set, three fifths of it (${label})`, () => {
      const { back, done, again } = afterBreak(gym);
      expect(again.targetWeight).toBe(20);
      const after = entryFor(act(place, back, done, { type: trigger }), row);
      const left = toCome(after, done);
      expect(left.map((set) => [set.index, set.kind, set.targetWeight])).toEqual([
        [again.index, 'warmup', weight],
        [left[1]?.index, 'working', next],
        [left[2]?.index, 'working', next],
      ]);
      expect(after.warmupSets).toBe(entryFor(back, row).warmupSets);
    });
  }

  it('stays a number after a ramp added by hand, all done, and the move to the gym', () => {
    const workout = plan(lightHome, [], 'full-body');
    const lift = entryFor(workout, row);
    const once = act(lightHome, workout, started(lift.id), {
      type: 'add-warmup',
      entryId: lift.id,
    });
    const ramps = entryFor(once, row).sets.filter((set) => set.kind === 'warmup');
    const first = entryFor(once, row).sets.find((set) => set.kind === 'working');
    if (!first) throw new Error('no working set');
    let done = logSets(
      entryFor(once, row),
      ramps.map((set) => set.index),
      started(lift.id, 20 * 60),
      { weight: 10, reps: 8 },
    );
    done = logSets(entryFor(once, row), [first.index], done);
    const back = act(lightHome, once, done, { type: 'resume', awaySeconds: 25 * 60 });
    const moved = entryFor(act(gym, back, done, { type: 'location' }), row);
    expect(toCome(moved, done).map((set) => [set.kind, set.targetWeight])).toEqual([
      ['warmup', 20],
      ['working', 30],
      ['working', 30],
    ]);
  });
});

describe('reps set by hand on a lift the step rule held, not started yet', () => {
  // Dumbbells to 30, then 40: after 30 lb × 10 the plan holds 30 lb and the reps go up first.
  const gap = at({ from: 5, to: 30, step: 5 }, { from: 40, to: 40, step: 5 });
  const history = [plain(3, incline, [10, 10, 10], 30, [6, 10])];

  function handSet() {
    const workout = plan(gap, history);
    const lift = entryFor(workout, incline);
    const own = act(
      gap,
      workout,
      none,
      { type: 'rep-range', entryId: lift.id, reps: [10, 12] },
      { history },
    );
    const firstId = own.blocks[0]?.entries[0]?.id as string;
    return { lift, own, firstId };
  }

  it('stand in for nothing and keep the step line after an unrelated refit', () => {
    const { own, firstId } = handSet();
    // A 2.5 lb plate for the barbell goes missing; the dumbbells did not change.
    const after = act(
      gap,
      own,
      started(firstId),
      { type: 'loading' },
      { history, loading: { missingPlates: [2.5] } },
    );
    expect(working(after, incline)).toEqual([
      [30, [10, 12], undefined],
      [30, [10, 12], undefined],
      [30, [10, 12], undefined],
    ]);
    expect(entryFor(after, incline).progression?.rack?.line ?? '').toMatch(/the reps go up first/);
  });

  it('plan the same next session whether or not a barbell plate went missing', () => {
    const { lift, own, firstId } = handSet();
    const untouched = saveSession(own, doAll(own, started(lift.id), 12));
    const refit = act(
      gap,
      own,
      started(firstId),
      { type: 'loading' },
      { history, loading: { missingPlates: [2.5] } },
    );
    const saved = saveSession(refit, doAll(refit, started(lift.id), 12));
    expect(working(plan(gap, [saved, ...history]), incline)).toEqual(
      working(plan(gap, [untouched, ...history]), incline),
    );
  });

  it('record and read the same as with a ramp done when the weights then stop at 25', () => {
    const { lift, own, firstId } = handSet();
    const to25 = at({ from: 5, to: 25, step: 5 });
    const fresh = act(to25, own, started(firstId), { type: 'loading' }, { history });
    const ramp = rampDone(entryFor(own, incline));
    const inPlace = act(to25, own, ramp, { type: 'loading' }, { history });
    // 25 lb for the 10-12 set at 30 lb: they stand in for 30 lb, as the lift under way records.
    for (const workout of [fresh, inPlace]) {
      for (const set of working(workout, incline)) {
        expect(set).toEqual([25, [10, 12], { weight: 30, reps: [10, 12] }]);
      }
    }
    const a = nextOf(incline, 'primary-hypertrophy', [
      saveSession(fresh, doAll(fresh, started(lift.id), 12)),
      ...history,
    ]);
    const b = nextOf(incline, 'primary-hypertrophy', [
      saveSession(inPlace, doAll(inPlace, ramp, 12)),
      ...history,
    ]);
    expect(a.weight).toBe(b.weight);
  });
});

describe('reps set by hand on a pushed set, then the weights go up and come back', () => {
  const history = [plain(3, incline, [8, 8, 8], 50, [6, 10])];
  const to45 = gymAt({ from: 5, to: 45, step: 5 });

  it('keep the plan’s range in the record, and plan the next session as the lift under way does', () => {
    const workout = plan(to45, history);
    const lift = entryFor(workout, incline);
    const own = act(
      to45,
      workout,
      none,
      { type: 'rep-range', entryId: lift.id, reps: [12, 15] },
      { history },
    );
    for (const set of working(own, incline)) {
      expect(set).toEqual([45, [12, 15], { weight: 50, reps: [6, 10] }]);
    }
    const firstId = own.blocks[0]?.entries[0]?.id as string;
    // The gym's dumbbells are saved as going higher, then back to 45.
    const up = act(gym, own, started(firstId), { type: 'loading' }, { history });
    // The reps stay at the weight they were set at, still standing in for 50 lb × 6-10.
    for (const set of working(up, incline)) {
      expect(set).toEqual([45, [12, 15], { weight: 50, reps: [6, 10] }]);
    }
    const down = act(to45, up, started(firstId), { type: 'loading' }, { history });
    for (const set of working(down, incline)) {
      expect(set).toEqual([45, [12, 15], { weight: 50, reps: [6, 10] }]);
    }
    const ramp = rampDone(entryFor(own, incline));
    const downIn = act(
      to45,
      act(gym, own, ramp, { type: 'loading' }, { history }),
      ramp,
      { type: 'loading' },
      { history },
    );
    const a = nextOf(incline, 'primary-hypertrophy', [
      saveSession(down, doAll(down, started(lift.id), 15)),
      ...history,
    ]);
    const b = nextOf(incline, 'primary-hypertrophy', [
      saveSession(downIn, doAll(downIn, ramp, 15)),
      ...history,
    ]);
    expect(a.weight).toBe(b.weight);
  });
});

describe('reps set by hand at the gym, then a move to a light home and back', () => {
  function handSet() {
    const workout = plan(gym, [], 'full-body');
    const lift = entryFor(workout, row);
    const own = act(gym, workout, none, { type: 'rep-range', entryId: lift.id, reps: [8, 10] });
    for (const set of working(own, row)) expect(set).toEqual([30, [8, 10], undefined]);
    const ramp = lift.sets.find((set) => set.kind === 'warmup');
    if (!ramp) throw new Error('no ramp');
    // Before the lift starts, and with its first ramp done.
    const paths = [started(lift.id), logSets(entryFor(own, row), [ramp.index], started(lift.id))];
    return { own, paths };
  }

  it('come back to the load they were set at, before the lift starts and under way', () => {
    const { own, paths } = handSet();
    for (const completed of paths) {
      const home = act(lightHome, own, completed, { type: 'location' });
      for (const set of working(home, row)) {
        expect(set).toEqual([20, [8, 10], { weight: 30, reps: [8, 10] }]);
      }
      const back = act(gym, home, completed, { type: 'location' });
      for (const set of working(back, row)) expect(set).toEqual([30, [8, 10], undefined]);
    }
  });

  it('go as far back as the weights make, still standing in for that load', () => {
    const { own, paths } = handSet();
    for (const completed of paths) {
      const home = act(lightHome, own, completed, { type: 'location' });
      const to25 = at({ from: 5, to: 25, step: 5 });
      const part = act(to25, home, completed, { type: 'location' });
      for (const set of working(part, row)) {
        expect(set).toEqual([25, [8, 10], { weight: 30, reps: [8, 10] }]);
      }
    }
  });
});

describe('a max entered for a lift the step rule held, with reps set by hand', () => {
  const gap = at({ from: 5, to: 30, step: 5 }, { from: 40, to: 40, step: 5 });
  const history = [plain(3, incline, [10, 10, 10], 30, [6, 10])];
  const maxes = recordMax(
    emptyMaxes(),
    incline,
    { kind: 'max', e1rm: 45 },
    'lb',
    '2026-09-10T12:02:00.000Z',
  );

  it('records what the reps set after the max record: nothing, where the load is held', () => {
    const workout = plan(gap, history);
    const lift = entryFor(workout, incline);
    const reps: RecalibrationTrigger = { type: 'rep-range', entryId: lift.id, reps: [10, 12] };
    const max: RecalibrationTrigger = { type: 'max', exerciseId: incline };
    const handFirst = act(gap, act(gap, workout, none, reps, { history }), none, max, {
      history,
      maxes,
    });
    const maxFirst = act(gap, act(gap, workout, none, max, { history, maxes }), none, reps, {
      history,
      maxes,
    });
    for (const workoutAfter of [handFirst, maxFirst]) {
      expect(working(workoutAfter, incline)).toEqual([
        [30, [10, 12], undefined],
        [30, [10, 12], undefined],
        [30, [10, 12], undefined],
      ]);
    }
  });
});

describe('a max entered over reps set by hand, where the weights make less than it asks', () => {
  const history = [plain(3, incline, [8, 8, 8], 50, [6, 10])];
  const maxOf = (e1rm: number) =>
    recordMax(emptyMaxes(), incline, { kind: 'max', e1rm }, 'lb', '2026-09-10T12:02:00.000Z');
  const max: RecalibrationTrigger = { type: 'max', exerciseId: incline };

  it('keeps the plan’s range in the record for reps set on a set already pushed', () => {
    // Dumbbells to 45: the incline stands in for 50 lb × 6-10, and the lifter asks 12-15.
    const to45 = gymAt({ from: 5, to: 45, step: 5 });
    const workout = plan(to45, history);
    const lift = entryFor(workout, incline);
    const own = act(
      to45,
      workout,
      none,
      { type: 'rep-range', entryId: lift.id, reps: [12, 15] },
      { history },
    );
    // A max that takes the target to 55 lb.
    const after = act(to45, own, none, max, { history, maxes: maxOf(80) });
    for (const set of working(after, incline)) {
      expect(set).toEqual([45, [12, 15], { weight: 55, reps: [6, 10] }]);
    }
  });

  it('records the reps set at the load as the range they stand in for', () => {
    // Dumbbells to 55: 50 lb is made, and the lifter asks 12-15 of it.
    const to55 = gymAt({ from: 5, to: 55, step: 5 });
    const workout = plan(to55, history);
    const lift = entryFor(workout, incline);
    const own = act(
      to55,
      workout,
      none,
      { type: 'rep-range', entryId: lift.id, reps: [12, 15] },
      { history },
    );
    for (const set of working(own, incline)) expect(set).toEqual([50, [12, 15], undefined]);
    // A max that takes the target to 60 lb, past what the dumbbells make.
    const after = act(to55, own, none, max, { history, maxes: maxOf(90) });
    for (const set of working(after, incline)) {
      expect(set).toEqual([55, [12, 15], { weight: 60, reps: [12, 15] }]);
    }
  });
});

describe('an entered max on a lift whose weight is set for today', () => {
  it('says the weight set stays, and promises nothing of the max for it', () => {
    const workout = plan(gym);
    const bench = entryFor(workout, 'barbell-bench-press');
    // The coach's "Take 105 lb today", accepted before the bench begins.
    const set = act(gym, workout, none, { type: 'target-weight', entryId: bench.id, weight: 105 });
    const maxes = recordMax(
      emptyMaxes(),
      'barbell-bench-press',
      { kind: 'max', e1rm: 275 },
      'lb',
      '2026-09-10T12:02:00.000Z',
    );
    const result = run(
      gym,
      set,
      none,
      { type: 'max', exerciseId: 'barbell-bench-press' },
      {
        maxes,
      },
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.summary.headline).toBe(
      'Max saved. Barbell Bench Press keeps the weight set for today.',
    );
    expect(
      entryFor(result.workout, 'barbell-bench-press').sets.find((one) => one.kind === 'working')
        ?.targetWeight,
    ).toBe(105);
  });
});

describe('a ramp added to, or put back on, a lift the light dumbbells push', () => {
  it('asks a ramp’s reps, the range the sets stand in for, never the push’s 25-29', () => {
    const workout = plan(lightHome, [], 'full-body');
    const lift = entryFor(workout, row);
    expect(lift.sets.find((set) => set.kind === 'working')?.targetReps).toEqual([25, 29]);
    const planned = lift.sets.find((set) => set.kind === 'warmup');
    expect(planned?.targetReps).toEqual([6, 10]);
    const added = entryFor(
      act(lightHome, workout, started(lift.id), { type: 'add-warmup', entryId: lift.id }),
      row,
    ).sets[0];
    expect([added?.kind, added?.targetReps]).toEqual(['warmup', [6, 10]]);
  });

  it('asks the same of the ramp put back after a long break', () => {
    const workout = plan(lightHome, [], 'full-body');
    const lift = entryFor(workout, row);
    const ramps = lift.sets.filter((set) => set.kind === 'warmup');
    const first = lift.sets.find((set) => set.kind === 'working');
    if (!first) throw new Error('no working set');
    const done = logSets(
      lift,
      [...ramps.map((set) => set.index), first.index],
      started(lift.id, 20 * 60),
    );
    const back = entryFor(
      act(lightHome, workout, done, { type: 'resume', awaySeconds: 25 * 60 }),
      row,
    );
    const again = toCome(back, done).find((set) => set.kind === 'warmup');
    expect([again?.targetWeight, again?.targetReps]).toEqual([10, [6, 10]]);
  });
});

describe('reps set by hand on a lift, then the lift swapped before it starts', () => {
  it('stay with the lift swapped out: the new one takes its own at the gym', () => {
    const workout = plan(lightHome, [], 'full-body');
    const lift = entryFor(workout, row);
    const own = act(lightHome, workout, none, {
      type: 'rep-range',
      entryId: lift.id,
      reps: [8, 10],
    });
    const swapped = act(lightHome, own, none, {
      type: 'replace',
      entryId: lift.id,
      exerciseId: 'dumbbell-row',
    });
    expect(entryFor(swapped, 'dumbbell-row').manual?.reps).toBeUndefined();
    // The plan before the swap is left as it was.
    expect(entryFor(own, row).manual?.reps).toBe(true);
    const firstId = swapped.blocks[0]?.entries[0]?.id as string;
    const atGym = act(gym, swapped, started(firstId), { type: 'location' });
    // 35 lb is made at the gym: the plan's 6-10 there, never the push's 26-30.
    for (const set of working(atGym, 'dumbbell-row')) {
      expect(set).toEqual([35, [6, 10], undefined]);
    }
  });
});
