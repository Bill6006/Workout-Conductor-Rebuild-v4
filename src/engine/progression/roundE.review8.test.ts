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
 * Maintenance 23, the eighth pass, from the probes of a re-check cut short. Ramps still to come
 * move only with a working weight that moved, as the rest of the plan's ramp and above the ramps
 * done; reps set by hand keep the record they have, and one is written from the load asked
 * without the step rule, on every path; a refresh by an entered max keeps a bodyweight lift's
 * easy warm-up; and a max skipped for a lift touched only by skips says so truthfully.
 */

const NOW = RECORD_NOW;
const places = createDefaultLocations({ gymAccess: true }, NOW);
const home = places.find((place) => place.id === 'home') as LocationProfile;
const gym = places.find((place) => place.id === 'gym') as LocationProfile;
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const none: CompletedWork = emptyCompleted();
const incline = 'incline-dumbbell-press';

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

function run(
  place: LocationProfile,
  workout: GeneratedWorkout,
  completed: CompletedWork,
  trigger: RecalibrationTrigger,
  extra: { history?: WorkoutRecord[]; maxes?: StrengthMaxes } = {},
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
  extra: { history?: WorkoutRecord[]; maxes?: StrengthMaxes } = {},
): GeneratedWorkout {
  const result = run(place, workout, completed, trigger, extra);
  if (!result.ok) throw new Error(result.error);
  return result.workout;
}

const started = (entryId: string): CompletedWork => ({
  ...emptyCompleted(),
  startedAt: NOW,
  elapsedSeconds: 60,
  currentEntryId: entryId,
});

function saveSession(
  workout: GeneratedWorkout,
  completed: CompletedWork,
  when = '2026-09-08T12:40:00.000Z',
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

const view = (entry: WorkoutEntry) =>
  entry.sets.map((set) => [set.index, set.kind, set.targetWeight, set.targetReps, set.asked]);

/** The lift's first ramp logged at its target, as the store logs it. */
function firstRampDone(lift: WorkoutEntry, reps = 5): CompletedWork {
  const ramp = lift.sets.find((set) => set.kind === 'warmup');
  if (!ramp) throw new Error('no ramp');
  return {
    ...started(lift.id),
    sets: [
      {
        entryId: lift.id,
        exerciseId: lift.exerciseId,
        setIndex: ramp.index,
        kind: 'warmup',
        reps,
        weight: ramp.targetWeight,
        rir: 5,
        completedAt: '2026-09-08T12:01:00.000Z',
      },
    ],
  };
}

/** Every working set of the lift logged at `reps`, after what was done before. */
function doAll(
  workout: GeneratedWorkout,
  exerciseId: string,
  prior: CompletedWork,
  reps: number,
): CompletedWork {
  const entry = entryFor(workout, exerciseId);
  return {
    ...prior,
    sets: [
      ...prior.sets,
      ...entry.sets
        .filter((set) => set.kind === 'working')
        .map((set) => ({
          entryId: entry.id,
          exerciseId,
          setIndex: set.index,
          kind: 'working' as const,
          reps,
          weight: set.targetWeight,
          rir: 1,
          completedAt: '2026-09-08T12:20:00.000Z',
        })),
    ],
  };
}

describe('ramps still to come', () => {
  it('stay where they were when the working weight does not move', () => {
    const workout = plan(gym);
    const bench = entryFor(workout, 'barbell-bench-press');
    // The gym's dumbbells are edited: nothing to do with the barbell bench.
    const after = entryFor(
      act(gymAt({ from: 5, to: 60, step: 5 }), workout, firstRampDone(bench), { type: 'loading' }),
      'barbell-bench-press',
    );
    expect(view(after)).toEqual(view(bench));
  });

  it('stay where they were after a ramp lifted heavier than planned', () => {
    const workout = plan(gym);
    const bench = entryFor(workout, 'barbell-bench-press');
    const [first, second] = bench.sets.filter((set) => set.kind === 'warmup');
    if (!first || !second || second.targetWeight === null) throw new Error('fewer than two ramps');
    // The first ramp lifted past the second's planned weight.
    const done: CompletedWork = {
      ...started(bench.id),
      sets: [
        {
          entryId: bench.id,
          exerciseId: bench.exerciseId,
          setIndex: first.index,
          kind: 'warmup',
          reps: 5,
          weight: second.targetWeight + 10,
          rir: 5,
          completedAt: '2026-09-08T12:01:00.000Z',
        },
      ],
    };
    // The gym's dumbbells are edited: nothing to do with the barbell bench.
    const after = entryFor(
      act(gymAt({ from: 5, to: 60, step: 5 }), workout, done, { type: 'loading' }),
      'barbell-bench-press',
    );
    expect(view(after)).toEqual(view(bench));
  });

  for (const trigger of ['loading', 'location'] as const) {
    it(`never land at or under the ramp just done when the working weight drops (${trigger})`, () => {
      const workout = plan(gym, [], 'full-body');
      const row = entryFor(workout, 'chest-supported-row');
      const done = firstRampDone(row, 6);
      const first = row.sets.find((set) => set.kind === 'warmup');
      const place = trigger === 'loading' ? gymAt({ from: 5, to: 20, step: 5 }) : lightHome;
      const after = entryFor(act(place, workout, done, { type: trigger }), 'chest-supported-row');
      const working = after.sets.find((set) => set.kind === 'working')?.targetWeight ?? 0;
      for (const ramp of after.sets.filter(
        (set) => set.kind === 'warmup' && set.index !== first?.index,
      )) {
        expect(ramp.targetWeight ?? 0).toBeGreaterThan(first?.targetWeight ?? 0);
        expect(ramp.targetWeight ?? 0).toBeLessThan(working);
      }
    });
  }
});

describe('an entered max and the lifts it refreshes', () => {
  it('keeps the easy warm-up of a bodyweight lift with reps set by hand', () => {
    const workout = plan(gym, [], 'pull-arms');
    const chin = entryFor(workout, 'chin-up');
    const own = act(gym, workout, none, { type: 'rep-range', entryId: chin.id, reps: [3, 5] });
    const maxes = recordMax(
      emptyMaxes(),
      'barbell-row',
      { kind: 'max', e1rm: 225 },
      'lb',
      '2026-09-10T12:02:00.000Z',
    );
    const after = entryFor(
      act(gym, own, none, { type: 'max', exerciseId: 'barbell-row' }, { maxes }),
      'chin-up',
    );
    const ramp = after.sets.find((set) => set.kind === 'warmup');
    const first = after.sets.find((set) => set.kind === 'working');
    expect(first?.targetReps).toEqual([3, 5]);
    expect(ramp?.targetReps[1] ?? 0).toBeLessThan(first?.targetReps[0] ?? 0);
  });

  it('never says a lift has logged sets when its ramps were only skipped', () => {
    const workout = plan(gym);
    const bench = entryFor(workout, 'barbell-bench-press');
    // "Skip warm-up sets": every ramp recorded as skipped, nothing logged.
    const completed: CompletedWork = {
      ...started(bench.id),
      sets: bench.sets
        .filter((set) => set.kind === 'warmup')
        .map((set) => ({
          entryId: bench.id,
          exerciseId: bench.exerciseId,
          setIndex: set.index,
          kind: 'warmup' as const,
          reps: 0,
          weight: null,
          rir: null,
          completedAt: '2026-09-10T12:01:00.000Z',
          skipped: true,
        })),
    };
    const maxes = recordMax(
      emptyMaxes(),
      'barbell-bench-press',
      { kind: 'max', e1rm: 275 },
      'lb',
      '2026-09-10T12:02:00.000Z',
    );
    const result = run(
      gym,
      workout,
      completed,
      { type: 'max', exerciseId: 'barbell-bench-press' },
      { maxes },
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.summary.headline).toBe(
      'Barbell Bench Press is already under way today; your max counts from the next session.',
    );
    // The skipped ramps keep their places: nothing is numbered again around them.
    expect(view(entryFor(result.workout, 'barbell-bench-press'))).toEqual(view(bench));
  });
});

describe('reps set by hand set twice, then a second change of weights', () => {
  const history = [plain(3, incline, [8, 8, 8], 50, [6, 10])];
  const to45 = gymAt({ from: 5, to: 45, step: 5 });
  // The same 45 lb top, and a pair of 60s: 50 lb is still not made.
  const to45and60 = gymAt({ from: 5, to: 45, step: 5 }, { from: 60, to: 60, step: 5 });

  function setUp(): GeneratedWorkout {
    const workout = plan(gym, history);
    const lift = entryFor(workout, incline);
    // At the gym, before any push: 10-12 by hand.
    const own = act(
      gym,
      workout,
      none,
      { type: 'rep-range', entryId: lift.id, reps: [10, 12] },
      { history },
    );
    const firstId = own.blocks[0]?.entries[0]?.id as string;
    // The gym's dumbbells are saved as going to 45: the incline stands in for 50 × 10-12.
    const pushed = act(to45, own, started(firstId), { type: 'loading' }, { history });
    // At 45 the lifter asks 12-15 of the sets.
    return act(
      to45,
      pushed,
      started(firstId),
      { type: 'rep-range', entryId: lift.id, reps: [12, 15] },
      { history },
    );
  }

  it('keep the record the first change wrote', () => {
    const again = setUp();
    const firstId = again.blocks[0]?.entries[0]?.id as string;
    const refreshed = act(to45and60, again, started(firstId), { type: 'loading' }, { history });
    for (const set of entryFor(refreshed, incline).sets.filter((one) => one.kind === 'working')) {
      expect([set.targetWeight, set.targetReps, set.asked]).toEqual([
        45,
        [12, 15],
        { weight: 50, reps: [10, 12] },
      ]);
    }
  });

  it('plan the same next session as the lift under way does', () => {
    const again = setUp();
    const lift = entryFor(again, incline);
    const firstId = again.blocks[0]?.entries[0]?.id as string;
    // Untouched, the second change goes through a fresh target; with the ramp done, in place.
    const fresh = act(to45and60, again, started(firstId), { type: 'loading' }, { history });
    const rampDone = firstRampDone(lift, 6);
    const inPlace = act(to45and60, again, rampDone, { type: 'loading' }, { history });
    const savedFresh = saveSession(fresh, doAll(fresh, incline, started(lift.id), 15));
    const savedInPlace = saveSession(inPlace, doAll(inPlace, incline, rampDone, 15));
    const next = nextOf(incline, 'primary-hypertrophy', [savedInPlace, ...history]);
    expect(nextOf(incline, 'primary-hypertrophy', [savedFresh, ...history]).weight).toBe(
      next.weight,
    );
  });
});

describe('reps set by hand at the gym, then a gap where the step rule holds', () => {
  const history = [plain(3, incline, [10, 10, 10], 30, [6, 10])];
  const gap = gymAt({ from: 5, to: 30, step: 5 }, { from: 40, to: 40, step: 5 });

  function both() {
    const workout = plan(gym, history);
    const lift = entryFor(workout, incline);
    expect(lift.sets.find((set) => set.kind === 'working')?.targetWeight).toBe(35);
    const own = act(
      gym,
      workout,
      none,
      { type: 'rep-range', entryId: lift.id, reps: [10, 12] },
      { history },
    );
    const firstId = own.blocks[0]?.entries[0]?.id as string;
    const fresh = act(gap, own, started(firstId), { type: 'loading' }, { history });
    const rampDone = firstRampDone(entryFor(own, incline), 6);
    const inPlace = act(gap, own, rampDone, { type: 'loading' }, { history });
    return { lift, fresh, inPlace, rampDone };
  }

  const shown = (workout: GeneratedWorkout) =>
    entryFor(workout, incline)
      .sets.filter((set) => set.kind === 'working')
      .map((set) => [set.targetWeight, set.targetReps, set.asked]);

  it('record the same whichever path fitted them', () => {
    const { fresh, inPlace } = both();
    expect(shown(fresh)).toEqual(shown(inPlace));
    for (const set of shown(fresh)) {
      expect(set).toEqual([30, [10, 12], { weight: 35, reps: [10, 12] }]);
    }
  });

  it('plan the same next session whichever path fitted them', () => {
    const { lift, fresh, inPlace, rampDone } = both();
    const savedFresh = saveSession(fresh, doAll(fresh, incline, started(lift.id), 10));
    const savedInPlace = saveSession(inPlace, doAll(inPlace, incline, rampDone, 10));
    const next = nextOf(incline, 'primary-hypertrophy', [savedInPlace, ...history]);
    expect(nextOf(incline, 'primary-hypertrophy', [savedFresh, ...history]).weight).toBe(
      next.weight,
    );
  });
});

describe('the revert run after round eight', () => {
  it('never lets a push short of the effort earn "fresher, so up a step"', () => {
    const bench = 'dumbbell-bench-press';
    // The day the target was set: eight sets of incline pressing first (about four on the
    // bench's muscles), then the bench, held at the 50 lb pair for 60 lb × 4-6 and met with reps
    // in reserve: a push short of the effort.
    const day = record(
      2,
      'incline-dumbbell-press',
      Array.from({ length: 8 }, (): SetSpec => [10, 40, 2]),
    );
    const benchDay = record(
      2,
      bench,
      [8, 8, 8].map((reps): SetSpec => [reps, 50, 2]),
      [6, 8],
      2,
    );
    for (const set of benchDay.entries[0]?.sets ?? []) {
      set.asked = { weight: 60, reps: [4, 6] };
      set.targetWeight = 50;
    }
    day.entries.push(...benchDay.entries);
    const exercise = requireExercise(bench);
    const next = recommendNextTarget({
      exercise,
      role: 'primary-strength',
      prescription: prescribe(exercise, 'primary-strength', profile),
      history: [day],
      profile,
      now: NOW,
      // Today the bench comes first: a much lighter day before it.
      session: { precedingSets: 0 },
    });
    expect(next.weight).toBe(60);
    expect(next.evidence.join(' ')).not.toMatch(/up a step/);
  });

  it('fits a set autoregulation moved again where its own weights change and still fall short', () => {
    const workout = plan(lightHome);
    const lift = entryFor(workout, incline);
    const completed: CompletedWork = {
      ...started(lift.id),
      elapsedSeconds: 10 * 60,
      sets: lift.sets
        .filter((set) => set.index <= (lift.sets.find((one) => one.kind === 'working')?.index ?? 0))
        .map((set) => ({
          entryId: lift.id,
          exerciseId: incline,
          setIndex: set.index,
          kind: set.kind,
          reps: set.targetReps[1],
          weight: set.targetWeight,
          rir: 3,
          completedAt: NOW,
        })),
    };
    const first = completed.sets.at(-1);
    if (!first) throw new Error('nothing logged');
    // A grind: autoregulation takes the rest down to 15 lb.
    const down = act(lightHome, workout, completed, {
      type: 'performance',
      entryId: lift.id,
      setIndex: first.setIndex,
      actualReps: 15,
      actualWeight: 20,
      plan: { kind: 'weight', delta: -5, reason: 'A grind: the next sets come down.' },
    });
    // A pair of 25s arrives: still short of 30 lb, but the lift's own weights changed.
    const more = act(at({ from: 5, to: 25, step: 5 }), down, completed, { type: 'loading' });
    const rest = entryFor(more, incline).sets.filter(
      (set) =>
        set.kind === 'working' && !completed.sets.some((done) => done.setIndex === set.index),
    );
    for (const set of rest) {
      expect([set.targetWeight, set.asked]).toEqual([25, { weight: 30, reps: [6, 10] }]);
    }
  });
});
