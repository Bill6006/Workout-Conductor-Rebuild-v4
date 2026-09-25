import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
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
import { recommendNextTarget } from './progression';
import { prescribe } from './roles';

/**
 * Maintenance 23, the tenth pass, from the re-check of the ninth: a swap or a swap back leaves
 * what was set by hand behind, the weight included; a set autoregulation moved keeps its weight
 * through a change that leaves its lift alone, reps set by hand or not; ramps put in since the
 * plan (after a break, on a lift picked up again) climb on their own; a step note goes where the
 * weights make the step; a max entered once a lift has begun counts from the next session; a max
 * sets the load for reps set by hand; and reps set by hand drop the push's note at once.
 */

const NOW = RECORD_NOW;
const places = createDefaultLocations({ gymAccess: true }, NOW);
const home = places.find((place) => place.id === 'home') as LocationProfile;
const gym = places.find((place) => place.id === 'gym') as LocationProfile;
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const none: CompletedWork = emptyCompleted();
const incline = 'incline-dumbbell-press';
const row = 'chest-supported-row';
const bench = 'barbell-bench-press';
const dbBench = 'dumbbell-bench-press';

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
  timestamp?: string;
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
    timestamp: extra.timestamp ?? NOW,
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

function saveSession(
  workout: GeneratedWorkout,
  completed: CompletedWork,
  when = '2026-09-10T12:40:00.000Z',
): WorkoutRecord {
  return buildWorkoutRecord(
    {
      workout,
      completed,
      duration: 'default',
      constraints: emptyConstraints(),
    } as unknown as WorkoutSession,
    { now: when, elapsedSeconds: 2400, rating: null, endedEarly: false },
  );
}

const toCome = (entry: WorkoutEntry, completed: CompletedWork) =>
  entry.sets.filter(
    (set) =>
      !completed.sets.some((done) => done.entryId === entry.id && done.setIndex === set.index),
  );

const weightsToCome = (entry: WorkoutEntry, completed: CompletedWork) =>
  toCome(entry, completed).map((set) => [set.kind, set.targetWeight]);

const working = (workout: GeneratedWorkout, exerciseId: string) =>
  entryFor(workout, exerciseId)
    .sets.filter((set) => set.kind === 'working')
    .map((set) => [set.targetWeight, set.targetReps, set.asked]);

const maxOf = (exerciseId: string, e1rm: number, at: string) =>
  recordMax(emptyMaxes(), exerciseId, { kind: 'max', e1rm }, 'lb', at);

describe('a swap after a weight was set for today', () => {
  // The coach's "Take 105 lb today" on the bench, accepted; then the bench swapped before it
  // starts. The dumbbell bench takes its own target: nothing of its weight was set by hand.
  function swapped(setFirst: boolean): GeneratedWorkout {
    const workout = plan(gym);
    const lift = entryFor(workout, bench);
    const before = setFirst
      ? act(gym, workout, none, { type: 'target-weight', entryId: lift.id, weight: 105 })
      : workout;
    return act(gym, before, none, { type: 'replace', entryId: lift.id, exerciseId: dbBench });
  }
  const maxes = maxOf(dbBench, 120, '2026-09-10T12:02:00.000Z');

  it('leaves the weight set behind: a max sets the new lift’s first target', () => {
    const after = run(gym, swapped(true), none, { type: 'max', exerciseId: dbBench }, { maxes });
    const reference = run(
      gym,
      swapped(false),
      none,
      { type: 'max', exerciseId: dbBench },
      {
        maxes,
      },
    );
    if (!after.ok || !reference.ok) throw new Error('max failed');
    expect(after.summary.headline).toBe('First target for Dumbbell Bench Press set from your max.');
    expect(working(after.workout, dbBench)).toEqual(working(reference.workout, dbBench));
  });

  it('fits the new lift to the weights here, as a swap with no weight set does', () => {
    const to20 = gymAt({ from: 5, to: 20, step: 5 });
    const after = act(to20, swapped(true), started('e1'), { type: 'loading' });
    const reference = act(to20, swapped(false), started('e1'), { type: 'loading' });
    expect(working(after, dbBench)).toEqual(working(reference, dbBench));
    for (const set of entryFor(after, dbBench).sets) {
      expect(set.targetWeight ?? 0).toBeLessThanOrEqual(20);
    }
  });

  it('leaves the plan before the swap as it was', () => {
    const workout = plan(gym);
    const lift = entryFor(workout, bench);
    const set = act(gym, workout, none, { type: 'target-weight', entryId: lift.id, weight: 105 });
    act(gym, set, none, { type: 'replace', entryId: lift.id, exerciseId: dbBench });
    expect(entryFor(set, bench).manual?.weight).toBe(true);
  });
});

describe('reps set by hand, swapped out and back, then the gym', () => {
  it('never ask the push’s 25-29 reps at a weight the gym makes more of', () => {
    const workout = plan(lightHome, [], 'full-body');
    const lift = entryFor(workout, row);
    const own = act(lightHome, workout, none, {
      type: 'rep-range',
      entryId: lift.id,
      reps: [12, 15],
    });
    const ownLift = entryFor(own, row);
    const first = ownLift.sets.find((set) => set.kind === 'working');
    if (!first) throw new Error('no working set');
    const done = logSets(
      ownLift,
      [...ownLift.sets.filter((set) => set.kind === 'warmup').map((set) => set.index), first.index],
      started(lift.id, 600),
    );
    const swapped = act(lightHome, own, done, {
      type: 'replace',
      entryId: lift.id,
      exerciseId: 'dumbbell-row',
    });
    const stand = entryFor(swapped, 'dumbbell-row');
    const back = act(
      lightHome,
      swapped,
      { ...done, currentEntryId: stand.id },
      { type: 'replace', entryId: stand.id, exerciseId: row },
    );
    const picked = allEntries(back.blocks).find((entry) => entry.exerciseId === row);
    if (!picked) throw new Error('not picked up');
    // The sets built again are the plan's: nothing on them was set by hand.
    expect(picked.manual?.reps).toBeUndefined();
    const atGym = act(gym, back, { ...done, currentEntryId: picked.id }, { type: 'location' });
    const moved = allEntries(atGym.blocks).find((entry) => entry.exerciseId === row);
    if (!moved) throw new Error('lost');
    const left = toCome(moved, done).filter((set) => set.kind === 'working');
    expect(left.map((set) => [set.targetWeight, set.targetReps])).toEqual([
      [30, [6, 10]],
      [30, [6, 10]],
    ]);
  });
});

describe('a weight autoregulation lowered, on sets with reps set by hand', () => {
  function lowered(place: LocationProfile, trigger: 'loading' | 'location') {
    const workout = plan(gym, [], 'full-body');
    const lift = entryFor(workout, row);
    // 8-10 set by hand at the gym's 30 lb; then the weights stop short of it.
    const own = act(gym, workout, none, { type: 'rep-range', entryId: lift.id, reps: [8, 10] });
    const short = act(place, own, started(lift.id), { type: trigger });
    const now = entryFor(short, row);
    const top = now.sets.find((set) => set.kind === 'working')?.targetWeight ?? 0;
    const first = now.sets.find((set) => set.kind === 'working');
    if (!first) throw new Error('no working set');
    // The ramps, then the first working set: 5 reps with nothing in reserve.
    let done = logSets(
      now,
      now.sets.filter((set) => set.kind === 'warmup').map((set) => set.index),
      started(lift.id),
    );
    done = logSets(now, [first.index], done, { reps: 5, weight: top, rir: 0 });
    const after = act(place, short, done, {
      type: 'performance',
      entryId: lift.id,
      setIndex: first.index,
      actualReps: 5,
      actualWeight: top,
      plan: { kind: 'weight', delta: -5, reason: 'Set 1: 5 reps with nothing in reserve.' },
    });
    return { after, done, top };
  }

  for (const [label, place, trigger, top] of [
    ['the gym’s dumbbells saved as 5-25', gymAt({ from: 5, to: 25, step: 5 }), 'loading', 25],
    ['a move to a light home', lightHome, 'location', 20],
  ] as const) {
    it(`stays lower through a change that leaves the lift alone (${label})`, () => {
      const lowered_ = lowered(place, trigger);
      expect(lowered_.top).toBe(top);
      const left = (workout: GeneratedWorkout) =>
        toCome(entryFor(workout, row), lowered_.done).map((set) => set.targetWeight);
      expect(left(lowered_.after)).toEqual([top - 5, top - 5]);
      // The barbell's 2.5 lb plates go missing: nothing about the row changed.
      const refit = act(
        place,
        lowered_.after,
        lowered_.done,
        { type: 'loading' },
        {
          loading: { missingPlates: [2.5] },
        },
      );
      expect(left(refit)).toEqual([top - 5, top - 5]);
    });
  }

  it('comes back to the load they were set at when the weights make it again', () => {
    const { after, done } = lowered(gymAt({ from: 5, to: 25, step: 5 }), 'loading');
    const back = act(gym, after, done, { type: 'loading' });
    expect(toCome(entryFor(back, row), done).map((set) => [set.targetWeight, set.asked])).toEqual([
      [30, undefined],
      [30, undefined],
    ]);
  });
});

describe('ramps put in since the plan', () => {
  function rampsThenBreak() {
    const workout = plan(gym, [], 'full-body');
    const lift = entryFor(workout, row);
    // The ramps (15, 25) done, then 25 minutes away before the first working set.
    const done = logSets(
      lift,
      lift.sets.filter((set) => set.kind === 'warmup').map((set) => set.index),
      started(lift.id, 20 * 60),
    );
    const back = act(gym, workout, done, { type: 'resume', awaySeconds: 25 * 60 });
    const again = toCome(entryFor(back, row), done).find((set) => set.kind === 'warmup');
    expect(again?.targetWeight).toBe(20);
    return { back, done };
  }

  it('the ramp put back after a break before the working sets stays, at three fifths of them', () => {
    const { back, done } = rampsThenBreak();
    const to25 = entryFor(
      act(gymAt({ from: 5, to: 25, step: 5 }), back, done, { type: 'loading' }),
      row,
    );
    expect(weightsToCome(to25, done)).toEqual([
      ['warmup', 15],
      ['working', 25],
      ['working', 25],
      ['working', 25],
    ]);
    const home_ = entryFor(act(lightHome, back, done, { type: 'location' }), row);
    expect(weightsToCome(home_, done)).toEqual([
      ['warmup', 10],
      ['working', 20],
      ['working', 20],
      ['working', 20],
    ]);
  });

  it('a ramp put back after a second break climbs on its own, whatever the first one lifted', () => {
    const workout = plan(gym, [], 'full-body');
    const lift = entryFor(workout, row);
    const [w1, w2] = lift.sets.filter((set) => set.kind === 'working');
    if (!w1 || !w2) throw new Error('fewer than two working sets');
    let done = logSets(
      lift,
      [...lift.sets.filter((set) => set.kind === 'warmup').map((set) => set.index), w1.index],
      started(lift.id, 20 * 60),
    );
    const back1 = act(gym, workout, done, { type: 'resume', awaySeconds: 25 * 60 });
    const first = toCome(entryFor(back1, row), done).find((set) => set.kind === 'warmup');
    if (!first) throw new Error('no ramp put back');
    done = logSets(entryFor(back1, row), [first.index, w2.index], done);
    const back2 = act(gym, back1, done, { type: 'resume', awaySeconds: 25 * 60 });
    const second = toCome(entryFor(back2, row), done).find((set) => set.kind === 'warmup');
    expect(second?.targetWeight).toBe(20);
    const after = entryFor(
      act(gymAt({ from: 5, to: 25, step: 5 }), back2, done, { type: 'loading' }),
      row,
    );
    expect(weightsToCome(after, done)).toEqual([
      ['warmup', 15],
      ['working', 25],
    ]);
  });

  it('the ramps of a lift picked up again climb when the weights change', () => {
    const workout = plan(gym, [], 'full-body');
    const lift = entryFor(workout, row);
    const first = lift.sets.find((set) => set.kind === 'working');
    if (!first) throw new Error('no working set');
    // Ramps and one working set done 40 minutes ago; the row then swapped out and back.
    const done = logSets(
      lift,
      [...lift.sets.filter((set) => set.kind === 'warmup').map((set) => set.index), first.index],
      started(lift.id, 600),
      { completedAt: '2026-09-10T11:20:00.000Z' },
    );
    const swapped = act(gym, workout, done, {
      type: 'replace',
      entryId: lift.id,
      exerciseId: 'dumbbell-row',
    });
    const stand = entryFor(swapped, 'dumbbell-row');
    const back = act(
      gym,
      swapped,
      { ...done, currentEntryId: stand.id },
      { type: 'replace', entryId: stand.id, exerciseId: row },
    );
    const picked = allEntries(back.blocks).find((entry) => entry.exerciseId === row);
    if (!picked) throw new Error('not picked up');
    expect(weightsToCome(picked, done)).toEqual([
      ['warmup', 15],
      ['warmup', 25],
      ['working', 30],
      ['working', 30],
    ]);
    const after = act(
      gymAt({ from: 5, to: 25, step: 5 }),
      back,
      { ...done, currentEntryId: picked.id },
      { type: 'loading' },
    );
    const refit = allEntries(after.blocks).find((entry) => entry.exerciseId === row);
    if (!refit) throw new Error('lost');
    // The plan's two-ramp climb to 25 lb: half and three quarters of it.
    expect(weightsToCome(refit, done)).toEqual([
      ['warmup', 15],
      ['warmup', 20],
      ['working', 25],
      ['working', 25],
    ]);
  });
});

describe('reps set by hand on a lift the step rule held, at a place that makes the step', () => {
  it('drop the note about the next weight there, and keep the weight they were set at', () => {
    const gap = at({ from: 5, to: 30, step: 5 }, { from: 40, to: 40, step: 5 });
    const history = [plain(3, incline, [10, 10, 10], 30, [6, 10])];
    const workout = plan(gap, history);
    const lift = entryFor(workout, incline);
    expect(lift.progression?.rack?.line).toMatch(/next weight here after 30 lb is 40/);
    const own = act(
      gap,
      workout,
      none,
      { type: 'rep-range', entryId: lift.id, reps: [10, 12] },
      { history },
    );
    const moved = act(gym, own, started(lift.id), { type: 'location' }, { history });
    expect(working(moved, incline)).toEqual([
      [30, [10, 12], undefined],
      [30, [10, 12], undefined],
      [30, [10, 12], undefined],
    ]);
    const after = entryFor(moved, incline);
    expect(after.progression?.rack).toBeUndefined();
    expect(after.progression?.evidence.join(' ')).not.toMatch(/next weight here after 30 lb/);
  });
});

describe('reps set by hand on a pushed set: the note by the target', () => {
  it('names the load alone at once, as after a change of weights', () => {
    // Dumbbells to 30, then 40: the RDL's 35 lb is made as 30 lb, "about 6 more reps".
    const gap = at({ from: 5, to: 30, step: 5 }, { from: 40, to: 40, step: 5 });
    const rdl = 'dumbbell-romanian-deadlift';
    const workout = plan(gap, [], 'full-body');
    const lift = entryFor(workout, rdl);
    expect(lift.progression?.rack?.line).toBe(
      'The weights here make 30, not 35 lb: about 6 more reps, to 1 in reserve.',
    );
    const own = act(gap, workout, none, { type: 'rep-range', entryId: lift.id, reps: [6, 10] });
    expect(entryFor(own, rdl).progression?.rack?.line).toBe('The weights here make 30, not 35 lb.');
    for (const set of working(own, rdl)) {
      expect(set).toEqual([30, [6, 10], { weight: 35, reps: [6, 10] }]);
    }
  });
});

describe('a max entered once a lift has begun', () => {
  const history = [plain(3, incline, [8, 8, 8], 40, [6, 10])];

  function day(maxAt: string, rampFirst: boolean) {
    const workout = plan(gym, history);
    const lift = entryFor(workout, incline);
    const ramp = lift.sets.find((set) => set.kind === 'warmup');
    if (!ramp) throw new Error('no ramp');
    const maxes = maxOf(incline, 80, maxAt);
    // The first ramp at 12:01; the max at `maxAt`.
    const rampDone = logSets(lift, [ramp.index], started(lift.id));
    const result = run(
      gym,
      workout,
      rampFirst ? rampDone : none,
      {
        type: 'max',
        exerciseId: incline,
      },
      { history, maxes },
    );
    if (!result.ok) throw new Error(result.error);
    const today = entryFor(result.workout, incline);
    let done = rampFirst ? rampDone : logSets(today, [ramp.index], started(lift.id));
    done = logSets(
      today,
      today.sets.filter((set) => set.kind === 'working').map((set) => set.index),
      done,
      { reps: 8, rir: 2, completedAt: '2026-09-10T12:10:00.000Z' },
    );
    return { headline: result.summary.headline, saved: saveSession(result.workout, done), maxes };
  }

  function next(
    saved: WorkoutRecord,
    maxes: StrengthMaxes | null,
    now = '2026-09-12T12:00:00.000Z',
  ) {
    const exercise = requireExercise(incline);
    return recommendNextTarget({
      exercise,
      role: 'primary-hypertrophy',
      prescription: prescribe(exercise, 'primary-hypertrophy', profile),
      history: [saved, ...history],
      profile,
      now,
      maxes,
    });
  }

  it('counts from the next session, as it says', () => {
    const { headline, saved, maxes } = day('2026-09-10T12:02:00.000Z', true);
    expect(headline).toMatch(/your max counts from the next session\.$/);
    const withMax = next(saved, maxes);
    expect(withMax.weight ?? 0).toBeGreaterThan(next(saved, null).weight ?? 0);
    expect(withMax.evidence.at(-1)).toMatch(
      /^Your max of 80 lb, entered after you began this lift last time/,
    );
  });

  it('counts after a long break too, from the max', () => {
    const { saved, maxes } = day('2026-09-10T12:02:00.000Z', true);
    const later = '2026-10-08T12:00:00.000Z';
    const withMax = next(saved, maxes, later);
    expect(withMax.mode).toBe('return');
    expect(withMax.evidence.at(-1)).toMatch(/starting from the max you entered \(80 lb\)/);
  });

  it('is not counted again once it set the day’s target', () => {
    // Entered before the lift began, it moved today's target already.
    const { saved, maxes } = day('2026-09-10T11:55:00.000Z', false);
    expect(next(saved, maxes).weight).toBe(next(saved, null).weight);
  });
});

describe('a max over reps set by hand, on a lift never done', () => {
  it('sets the load for those reps, not the heavier one for the plan’s', () => {
    const workout = plan(gym);
    const lift = entryFor(workout, bench);
    expect(lift.progression?.mode).toBe('start');
    const maxes = maxOf(bench, 225, '2026-09-10T12:02:00.000Z');
    const planned = act(gym, workout, none, { type: 'max', exerciseId: bench }, { maxes });
    const reps = working(planned, bench)[0]?.[1];
    expect(reps).toEqual([4, 6]);
    expect(working(planned, bench)[0]?.[0]).toBe(160);
    const own = act(gym, workout, none, { type: 'rep-range', entryId: lift.id, reps: [10, 12] });
    const after = act(gym, own, none, { type: 'max', exerciseId: bench }, { maxes });
    for (const set of working(after, bench)) expect(set).toEqual([145, [10, 12], undefined]);
  });
});
