import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { TrainingRole } from '../../catalog/exercises/exerciseSchema';
import type { WorkoutSession } from '../../core/state/session';
import { buildWorkoutRecord } from '../../core/state/workoutRecordBuilder';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { DUMBBELLS_KEY, loadingFor, type LoadingRange } from '../loading/loading';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { CompletedWork, RecalibrationTrigger } from '../recalibration/types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyMaxes, recordMax, type StrengthMaxes } from './maxes';
import { capTarget, recommendNextTarget } from './progression';
import { prescribe } from './roles';

/**
 * Maintenance 23, the sixth pass (a re-check of the fixes before it). A deload already served is
 * not given again; sets done keep their kind and number through a change of place; the fatigue
 * hold reaches a lift refreshed there; the session is fitted to time with the kept lifts as they
 * will be done; reps set by hand keep the weight they were set at; and the note by the target is
 * rewritten only from what the sets stand in for.
 */

const NOW = RECORD_NOW;
const places = createDefaultLocations({ gymAccess: true }, NOW);
const home = places.find((place) => place.id === 'home') as LocationProfile;
const gym = places.find((place) => place.id === 'gym') as LocationProfile;
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const incline = 'incline-dumbbell-press';
const bench = 'dumbbell-bench-press';
const none: CompletedWork = emptyCompleted();

const at = (...ranges: LoadingRange[]): LocationProfile => ({
  ...home,
  loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges } },
});
const lightHome = at({ from: 5, to: 20, step: 5 });

function pushedSession(
  daysAgo: number,
  exerciseId: string,
  reps: number[],
  shown: { at: number; reps: [number, number] },
  asked: { weight: number; reps: [number, number] },
  lifted = shown.at,
  rir = 1,
): WorkoutRecord {
  const done = record(
    daysAgo,
    exerciseId,
    reps.map((count): SetSpec => [count, lifted, rir]),
    shown.reps,
    1,
  );
  for (const set of done.entries[0]?.sets ?? []) {
    set.asked = asked;
    set.targetWeight = shown.at;
  }
  return done;
}

function plain(
  daysAgo: number,
  exerciseId: string,
  reps: number[],
  weight: number,
  target: [number, number],
  rir = 1,
  targetRir = 1,
): WorkoutRecord {
  const done = record(
    daysAgo,
    exerciseId,
    reps.map((count): SetSpec => [count, weight, rir]),
    target,
    targetRir,
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
    profile,
    location: place,
    history,
    now: NOW,
    duration: 'default',
    constraints: { templateId },
  });
}

function entryFor(workout: GeneratedWorkout, exerciseId: string): WorkoutEntry {
  const found = allEntries(workout.blocks).find((entry) => entry.exerciseId === exerciseId);
  if (!found) throw new Error(`no ${exerciseId}`);
  return found;
}

const working = (workout: GeneratedWorkout, exerciseId: string) =>
  entryFor(workout, exerciseId).sets.filter((set) => set.kind === 'working');

function logThrough(lift: WorkoutEntry, count: number): CompletedWork {
  const last = lift.sets.filter((set) => set.kind === 'working')[count - 1];
  if (!last) throw new Error('not enough working sets');
  return {
    ...emptyCompleted(),
    startedAt: NOW,
    elapsedSeconds: 10 * 60,
    currentEntryId: lift.id,
    sets: lift.sets
      .filter((set) => set.index <= last.index)
      .map((set) => ({
        entryId: lift.id,
        exerciseId: lift.exerciseId,
        setIndex: set.index,
        kind: set.kind,
        reps: set.targetReps[1],
        weight: set.targetWeight,
        rir: 3,
        completedAt: NOW,
      })),
  };
}

function act(
  place: LocationProfile,
  workout: GeneratedWorkout,
  completed: CompletedWork,
  trigger: RecalibrationTrigger,
  extra: {
    loading?: { missingPlates: number[] };
    history?: WorkoutRecord[];
    maxes?: StrengthMaxes;
  } = {},
): GeneratedWorkout {
  const result = recalibrate({
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
  if (!result.ok) throw new Error(result.error);
  return result.workout;
}

const toCome = (entry: WorkoutEntry, completed: CompletedWork) =>
  entry.sets.filter(
    (set) =>
      set.kind === 'working' &&
      !completed.sets.some((done) => done.entryId === entry.id && done.setIndex === set.index),
  );

function savedWith(workout: GeneratedWorkout, exerciseId: string, reps: number): WorkoutRecord {
  const lift = entryFor(workout, exerciseId);
  const when = new Date(Date.parse(NOW) - 2 * 86_400_000);
  const completed: CompletedWork = {
    ...emptyCompleted(),
    startedAt: when.toISOString(),
    sets: lift.sets
      .filter((set) => set.kind === 'working')
      .map((set) => ({
        entryId: lift.id,
        exerciseId,
        setIndex: set.index,
        kind: 'working' as const,
        reps,
        weight: set.targetWeight,
        rir: 1,
        completedAt: new Date(when.getTime() + 30 * 60000).toISOString(),
      })),
  };
  const session = {
    workout,
    completed,
    duration: 'default',
    constraints: emptyConstraints(),
  } as unknown as WorkoutSession;
  return buildWorkoutRecord(session, {
    now: new Date(when.getTime() + 40 * 60000).toISOString(),
    elapsedSeconds: 2400,
    rating: null,
    endedEarly: false,
  });
}

const started = (entryId: string): CompletedWork => ({
  ...emptyCompleted(),
  startedAt: NOW,
  elapsedSeconds: 60,
  currentEntryId: entryId,
});

describe('a run of misses with pushes that met their reps', () => {
  const gymMiss = (daysAgo: number) => plain(daysAgo, bench, [3, 3, 3], 60, [4, 6], 0, 2);
  // The home's dumbbells stop at 50 lb.
  const home50 = at({ from: 5, to: 50, step: 5 });

  it('does not deload again after the deload was served and met at home', () => {
    const served = nextOf(bench, 'primary-strength', [gymMiss(4), gymMiss(8)]);
    expect([served.mode, served.weight]).toEqual(['deload', 55]);
    // What home shows for it: 50 lb standing in for 55 lb × 4-6.
    const shown = capTarget(
      served,
      loadingFor(home50.loading, undefined, requireExercise(bench), 'lb'),
      'lb',
      'primary-strength',
    );
    expect([shown.weight, shown.asked]).toEqual([50, { weight: 55, reps: [4, 6] }]);
    // The lifter meets the reps shown at home.
    const met = pushedSession(
      1,
      bench,
      [shown.reps[1], shown.reps[1], shown.reps[1]],
      { at: 50, reps: shown.reps },
      { weight: 55, reps: [4, 6] },
      50,
      2,
    );
    const next = nextOf(bench, 'primary-strength', [met, gymMiss(4), gymMiss(8)]);
    // The two gym misses already cost a step; meeting the deloaded target costs no other.
    expect(next.mode).not.toBe('deload');
    expect(next.weight).toBe(55);
  });

  it('holds the load after miss, met, miss at the same home weight, as at the gym', () => {
    const shownAt = { at: 50, reps: [7, 9] as [number, number] };
    const asked = { weight: 60, reps: [4, 6] as [number, number] };
    const pushed = [
      pushedSession(1, bench, [5, 5, 5], shownAt, asked, 50, 0),
      pushedSession(4, bench, [9, 9, 9], shownAt, asked, 50, 2),
      pushedSession(7, bench, [5, 5, 5], shownAt, asked, 50, 0),
    ];
    const gymRun = [gymMiss(1), plain(4, bench, [6, 6, 6], 60, [4, 6], 2, 2), gymMiss(7)];
    expect(nextOf(bench, 'primary-strength', gymRun)).toMatchObject({
      mode: 'maintain',
      weight: 60,
    });
    const next = nextOf(bench, 'primary-strength', pushed);
    expect(next.evidence.join(' ')).not.toMatch(/twice in a row/);
    expect(next.mode).toBe('maintain');
  });
});

/** The incline's added ramp logged, as the store logs it. */
function rampLogged(entryId: string, setIndex: number, weight: number | null): CompletedWork {
  return {
    ...started(entryId),
    sets: [
      {
        entryId,
        exerciseId: incline,
        setIndex,
        kind: 'warmup',
        reps: 5,
        weight,
        rir: 5,
        completedAt: '2026-09-10T12:01:00.000Z',
      },
    ],
  };
}

describe('a lift with only a ramp done, when the place changes', () => {
  const history = [plain(3, incline, [8, 8, 8], 30, [6, 10])];

  it('keeps the ramp the lifter added and logged a ramp, with every working set to come', () => {
    const workout = plan(gym, history);
    const lift = entryFor(workout, incline);
    const ramped = act(
      gym,
      workout,
      started(lift.id),
      { type: 'add-warmup', entryId: lift.id },
      { history },
    );
    const added = entryFor(ramped, incline).sets[0];
    if (!added || added.kind !== 'warmup') throw new Error('no ramp added');
    const completed = rampLogged(lift.id, added.index, 15);
    const moved = entryFor(
      act(lightHome, ramped, completed, { type: 'location' }, { history }),
      incline,
    );
    expect(moved.sets.find((set) => set.index === added.index)?.kind).toBe('warmup');
    expect(toCome(moved, completed)).toHaveLength(3);
  });

  it('keeps a ramp put back after a long break a ramp', () => {
    const workout = plan(gym);
    const raise = entryFor(workout, 'lateral-raise');
    const away = { ...started(raise.id), elapsedSeconds: 20 * 60 };
    const back = act(gym, workout, away, { type: 'resume', awaySeconds: 25 * 60 });
    const ramp = entryFor(back, 'lateral-raise').sets.find((set) => set.kind === 'warmup');
    if (!ramp) throw new Error('no ramp put back');
    const completed: CompletedWork = {
      ...away,
      sets: [
        {
          entryId: raise.id,
          exerciseId: 'lateral-raise',
          setIndex: ramp.index,
          kind: 'warmup',
          reps: 8,
          weight: ramp.targetWeight,
          rir: 5,
          completedAt: '2026-09-10T12:01:00.000Z',
        },
      ],
    };
    const moved = entryFor(act(lightHome, back, completed, { type: 'location' }), 'lateral-raise');
    expect(moved.sets.find((set) => set.index === ramp.index)?.kind).toBe('warmup');
  });

  it('never saves the logged ramp as a working set', () => {
    const workout = plan(gym, history);
    const lift = entryFor(workout, incline);
    const ramped = act(
      gym,
      workout,
      started(lift.id),
      { type: 'add-warmup', entryId: lift.id },
      { history },
    );
    const added = entryFor(ramped, incline).sets[0];
    if (!added) throw new Error('no ramp added');
    const first = rampLogged(lift.id, added.index, 15);
    const moved = act(lightHome, ramped, first, { type: 'location' }, { history });
    // The lifter logs every set the app still shows for the incline, at its targets.
    const rest = entryFor(moved, incline).sets.filter(
      (set) => set.kind !== 'drop' && !first.sets.some((done) => done.setIndex === set.index),
    );
    const completed: CompletedWork = {
      ...first,
      sets: [
        ...first.sets,
        ...rest.map((set) => ({
          entryId: lift.id,
          exerciseId: incline,
          setIndex: set.index,
          kind: set.kind,
          reps: set.targetReps[1],
          weight: set.targetWeight,
          rir: set.kind === 'warmup' ? 5 : 1,
          completedAt: '2026-09-10T12:20:00.000Z',
        })),
      ],
    };
    const saved = buildWorkoutRecord(
      {
        workout: moved,
        completed,
        duration: 'default',
        constraints: emptyConstraints(),
      } as unknown as WorkoutSession,
      { now: '2026-09-10T12:40:00.000Z', elapsedSeconds: 2400, rating: null, endedEarly: false },
    );
    const sets = saved.entries.find((entry) => entry.exerciseId === incline)?.sets ?? [];
    expect(
      sets.filter((set) => set.kind === 'working').map((set) => [set.weight, set.reps]),
    ).toEqual([
      [20, 29],
      [20, 29],
      [20, 29],
    ]);
  });
});

describe('the day’s fatigue, for a lift refreshed by a change', () => {
  const hard = (done: WorkoutRecord) => {
    done.rating = { effort: 'too-hard', pain: false, energyAfter: 2, note: '' };
    return done;
  };
  const history = [
    hard(plain(1, 'back-squat', [5, 5, 5], 185, [4, 6])),
    hard(plain(2, 'romanian-deadlift', [8, 8, 8], 135, [6, 10])),
    hard(plain(3, incline, [10, 10, 10], 30, [6, 10])),
    hard(plain(4, 'back-squat', [5, 5, 5], 185, [4, 6])),
    hard(plain(5, 'romanian-deadlift', [8, 8, 8], 135, [6, 10])),
  ];

  it('keeps the hold the plan gives the lift in front at a new place', () => {
    const home50 = at({ from: 5, to: 50, step: 5 });
    const workout = plan(gym, history);
    const lift = entryFor(workout, incline);
    expect(working(workout, incline)[0]?.targetWeight).toBe(30);
    expect(working(plan(home50, history), incline)[0]?.targetWeight).toBe(30);
    const moved = act(home50, workout, started(lift.id), { type: 'location' }, { history });
    for (const set of working(moved, incline)) expect(set.targetWeight).toBe(30);
  });

  it('keeps it when a max is entered', () => {
    const workout = plan(gym, history);
    const maxes = recordMax(emptyMaxes(), incline, { kind: 'max', e1rm: 45 }, 'lb', NOW);
    const after = act(gym, workout, none, { type: 'max', exerciseId: incline }, { history, maxes });
    expect(working(after, incline)[0]?.targetWeight).toBe(30);
  });

  it('keeps it when a barbell plate goes missing', () => {
    const workout = plan(gym, history);
    const first = entryFor(workout, 'barbell-bench-press');
    const after = act(
      gym,
      workout,
      started(first.id),
      { type: 'loading' },
      { history, loading: { missingPlates: [2.5] } },
    );
    expect(working(after, incline)[0]?.targetWeight).toBe(30);
  });
});

describe('the time a change of place leaves', () => {
  it('fits the session with the kept lift as it will be done at the new place', () => {
    const history = [plain(3, incline, [8, 8, 8], 30, [6, 10])];
    const base = plan(gym, history);
    const shaped = act(
      gym,
      base,
      started(entryFor(base, incline).id),
      { type: 'duration', choice: 30 },
      { history },
    );
    const lift = entryFor(shaped, incline);
    const moved = act(lightHome, shaped, started(lift.id), { type: 'location' }, { history });
    // Kept, the incline is 20 lb × 25-29 at home, and the session is fitted with it so.
    expect(working(moved, incline)[0]?.targetReps).toEqual([25, 29]);
    expect(moved.duration.estimatedMinutes).toBeLessThanOrEqual(moved.duration.targetMinutes + 1);
    expect(moved.compromises.join(' ')).not.toMatch(/Even the leanest/);
  });
});

describe('reps set by hand on a lift the step rule held', () => {
  const gap = at({ from: 5, to: 30, step: 5 }, { from: 40, to: 40, step: 5 });
  const history = [plain(3, incline, [10, 10, 10], 30, [6, 10])];

  function handSet(): GeneratedWorkout {
    const workout = plan(gap, history);
    return act(
      gap,
      workout,
      none,
      { type: 'rep-range', entryId: entryFor(workout, incline).id, reps: [10, 12] },
      { history },
    );
  }

  it('stand in for nothing after a refit, and keep the step line', () => {
    const own = handSet();
    for (const set of working(own, incline)) expect(set.asked).toBeUndefined();
    const completed = logThrough(entryFor(own, incline), 1);
    const after = act(
      gap,
      own,
      completed,
      { type: 'loading' },
      { loading: { missingPlates: [2.5] }, history },
    );
    const lift = entryFor(after, incline);
    for (const set of toCome(lift, completed)) {
      expect([set.targetWeight, set.targetReps, set.asked]).toEqual([30, [10, 12], undefined]);
    }
    expect(lift.progression?.evidence.join(' ')).toMatch(/the reps go up first/);
  });

  it('plan the same next session whether or not a barbell plate went missing', () => {
    const own = handSet();
    const without = plan(gap, [savedWith(own, incline, 12), ...history]);
    const completed = logThrough(entryFor(own, incline), 1);
    const after = act(
      gap,
      own,
      completed,
      { type: 'loading' },
      { loading: { missingPlates: [2.5] }, history },
    );
    const withRefit = plan(gap, [savedWith(after, incline, 12), ...history]);
    const view = (workout: GeneratedWorkout) =>
      working(workout, incline).map((set) => [set.targetWeight, set.targetReps]);
    expect(view(without)).toEqual([
      [30, [8, 12]],
      [30, [8, 12]],
      [30, [8, 12]],
    ]);
    expect(view(withRefit)).toEqual(view(without));
  });

  it('keep the weight they were set at when the lifter moves to the gym mid-lift', () => {
    const own = handSet();
    const completed = logThrough(entryFor(own, incline), 1);
    const atGym = act(gym, own, completed, { type: 'location' }, { history });
    for (const set of toCome(entryFor(atGym, incline), completed)) {
      expect([set.targetWeight, set.targetReps]).toEqual([30, [10, 12]]);
    }
  });
});

describe('the note by the target after a refit', () => {
  it('drops "the heaviest weight here (20 lb)" once the place has 40s', () => {
    const workout = plan(lightHome);
    const lift = entryFor(workout, incline);
    expect(lift.progression?.capped).toEqual({ at: 20 });
    const completed = logThrough(lift, 1);
    // A pair of 40s joins home's 5-20: 30 lb is still not made, so the sets stay as they are.
    const more = at({ from: 5, to: 20, step: 5 }, { from: 40, to: 40, step: 5 });
    const moved = entryFor(act(more, workout, completed, { type: 'loading' }), incline);
    for (const set of toCome(moved, completed)) expect(set.targetWeight).toBe(20);
    expect(moved.progression?.capped).toBeUndefined();
    expect(moved.progression?.evidence.join(' ')).not.toMatch(/heaviest weight here \(20/);
    expect(moved.progression?.rack?.line).toMatch(/^The weights here make 20, not 30 lb/);
  });

  it('keeps "the heaviest weight here" on reps set by hand through an unrelated refit', () => {
    const workout = plan(lightHome);
    const own = act(lightHome, workout, none, {
      type: 'rep-range',
      entryId: entryFor(workout, incline).id,
      reps: [15, 20],
    });
    const completed = logThrough(entryFor(own, incline), 1);
    const after = entryFor(
      act(lightHome, own, completed, { type: 'loading' }, { loading: { missingPlates: [2.5] } }),
      incline,
    );
    expect(after.progression?.capped).toEqual({ at: 20 });
    expect(after.progression?.evidence.join(' ')).toMatch(
      /Held at the heaviest weight here \(20 lb\)\./,
    );
  });

  it('keeps it on a carry still held at the heaviest weight after an unrelated refit', () => {
    const workout = plan(lightHome, [], 'pull-arms');
    const shrug = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'dumbbell-shrug');
    if (!shrug) throw new Error('no shrug');
    const swapped = act(lightHome, workout, none, {
      type: 'replace',
      entryId: shrug.id,
      exerciseId: 'farmer-carry',
    });
    const carry = entryFor(swapped, 'farmer-carry');
    expect(carry.progression?.capped).toEqual({ at: 20 });
    const completed = logThrough(carry, 1);
    // A barbell plate goes missing; the carry's dumbbells did not change.
    const after = entryFor(
      act(
        lightHome,
        swapped,
        completed,
        { type: 'loading' },
        { loading: { missingPlates: [2.5] } },
      ),
      'farmer-carry',
    );
    for (const set of toCome(after, completed)) expect(set.targetWeight).toBe(20);
    expect(after.progression?.capped).toEqual({ at: 20 });
  });
});
