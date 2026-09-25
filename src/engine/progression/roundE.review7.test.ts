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
import type { CompletedWork, RecalibrationTrigger } from '../recalibration/types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyMaxes, recordMax, type StrengthMaxes } from './maxes';
import { recommendNextTarget } from './progression';
import { prescribe } from './roles';

/**
 * Maintenance 23, the seventh pass. An entered max never numbers a lift again around a set done;
 * the ramps still to come follow the working weight; reps set by hand get a note for the weight
 * they show, and one record whatever path fitted them; a pushed set goes back on the step rule
 * when the weights return; and a bodyweight lift keeps its easy warm-up under reps set by hand.
 */

const NOW = RECORD_NOW;
const places = createDefaultLocations({ gymAccess: true }, NOW);
const home = places.find((place) => place.id === 'home') as LocationProfile;
const gym = places.find((place) => place.id === 'gym') as LocationProfile;
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const incline = 'incline-dumbbell-press';
const benchBar = 'barbell-bench-press';
const none: CompletedWork = emptyCompleted();

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
  extra: { history?: WorkoutRecord[]; maxes?: StrengthMaxes } = {},
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

const started = (entryId: string): CompletedWork => ({
  ...emptyCompleted(),
  startedAt: NOW,
  elapsedSeconds: 60,
  currentEntryId: entryId,
});

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

describe('an entered max, after a ramp was done', () => {
  function rampLoggedThenMax() {
    const workout = plan(gym);
    const lift = entryFor(workout, benchBar);
    // The lifter adds a ramp (it goes first) and does it.
    const ramped = act(gym, workout, started(lift.id), { type: 'add-warmup', entryId: lift.id });
    const added = entryFor(ramped, benchBar).sets[0];
    if (!added || added.kind !== 'warmup') throw new Error('no ramp added');
    const completed: CompletedWork = {
      ...started(lift.id),
      sets: [
        {
          entryId: lift.id,
          exerciseId: benchBar,
          setIndex: added.index,
          kind: 'warmup',
          reps: 5,
          weight: 45,
          rir: 5,
          completedAt: '2026-09-10T12:01:00.000Z',
        },
      ],
    };
    // Then enters a max before the first working set.
    const maxes = recordMax(
      emptyMaxes(),
      benchBar,
      { kind: 'max', e1rm: 250 },
      'lb',
      '2026-09-10T12:02:00.000Z',
    );
    const after = act(gym, ramped, completed, { type: 'max', exerciseId: benchBar }, { maxes });
    return { lift, added, completed, after, workingBefore: toCome(lift, none).length };
  }

  it('keeps the logged ramp a ramp, with every working set still to come', () => {
    const { added, completed, after, workingBefore } = rampLoggedThenMax();
    const moved = entryFor(after, benchBar);
    expect(moved.sets.find((set) => set.index === added.index)?.kind).toBe('warmup');
    expect(toCome(moved, completed)).toHaveLength(workingBefore);
  });

  it('never saves the ramp as a working set', () => {
    const { completed, after } = rampLoggedThenMax();
    const saved = saveSession(after, completed);
    const sets = saved.entries.find((entry) => entry.exerciseId === benchBar)?.sets ?? [];
    expect(sets.filter((set) => set.kind === 'working')).toHaveLength(0);
  });
});

describe('a ramp still to come after a change of weights or of place', () => {
  function rampThenChange(trigger: 'loading' | 'location') {
    const workout = plan(gym, [], 'full-body');
    const row = entryFor(workout, 'chest-supported-row');
    const ramps = row.sets.filter((set) => set.kind === 'warmup');
    expect(ramps).toHaveLength(2);
    const first = ramps[0];
    if (!first) throw new Error('no ramp');
    const completed: CompletedWork = {
      ...started(row.id),
      sets: [
        {
          entryId: row.id,
          exerciseId: row.exerciseId,
          setIndex: first.index,
          kind: 'warmup',
          reps: 6,
          weight: first.targetWeight,
          rir: 5,
          completedAt: '2026-09-10T12:01:00.000Z',
        },
      ],
    };
    const place = trigger === 'loading' ? gymAt({ from: 5, to: 20, step: 5 }) : lightHome;
    const after = entryFor(
      act(place, workout, completed, { type: trigger }),
      'chest-supported-row',
    );
    const left = after.sets.filter(
      (set) => set.kind === 'warmup' && !completed.sets.some((done) => done.setIndex === set.index),
    );
    return { left, firstWorking: after.sets.find((set) => set.kind === 'working') };
  }

  for (const trigger of ['loading', 'location'] as const) {
    it(`sits under the working weight (${trigger})`, () => {
      const { left, firstWorking } = rampThenChange(trigger);
      expect(firstWorking?.targetWeight).toBe(20);
      for (const ramp of left) {
        expect(ramp.targetWeight ?? 0).toBeLessThan(firstWorking?.targetWeight ?? 0);
      }
    });
  }
});

describe('reps set by hand: the note by the target', () => {
  // Reps set on sets the weights had already pushed stay at the weight they show; the load those
  // sets stand in for is fitted separately, and its note must not come to the set.
  it('never says "held at the heaviest weight here (25 lb)" beside a 20 lb target', () => {
    // At home the dumbbells stop at 20: the incline stands in for 30 lb, and after its first set
    // the lifter asks 15-20 of the rest.
    const workout = plan(lightHome);
    const lift = entryFor(workout, incline);
    expect(lift.sets.find((set) => set.kind === 'working')?.asked?.weight).toBe(30);
    const own = act(lightHome, workout, logThrough(lift, 1), {
      type: 'rep-range',
      entryId: lift.id,
      reps: [15, 20],
    });
    const completed = logThrough(entryFor(own, incline), 1);
    // A place whose dumbbells go to 25.
    const to25 = at({ from: 5, to: 25, step: 5 });
    const moved = entryFor(act(to25, own, completed, { type: 'location' }), incline);
    for (const set of toCome(moved, completed)) {
      expect([set.targetWeight, set.targetReps]).toEqual([20, [15, 20]]);
    }
    expect(moved.progression?.capped).toBeUndefined();
    expect(moved.progression?.evidence.join(' ')).not.toMatch(/heaviest weight here \(25 lb\)/);
  });

  it('never says "the weights here make 30" beside a 20 lb target', () => {
    // After 30 lb × 10, 35 lb is asked; at home the dumbbells stop at 20, and after the first set
    // the lifter asks 15-20 of the rest.
    const history = [plain(3, incline, [10, 10, 10], 30, [6, 10])];
    const workout = plan(lightHome, history);
    const lift = entryFor(workout, incline);
    expect(lift.sets.find((set) => set.kind === 'working')?.asked?.weight).toBe(35);
    const own = act(
      lightHome,
      workout,
      logThrough(lift, 1),
      { type: 'rep-range', entryId: lift.id, reps: [15, 20] },
      { history },
    );
    const completed = logThrough(entryFor(own, incline), 1);
    // Home's dumbbells are saved as 5-30 and a pair of 40s: 30 lb is made, 35 lb is not.
    const gap = at({ from: 5, to: 30, step: 5 }, { from: 40, to: 40, step: 5 });
    const moved = entryFor(act(gap, own, completed, { type: 'loading' }, { history }), incline);
    for (const set of toCome(moved, completed)) {
      expect([set.targetWeight, set.targetReps]).toEqual([20, [15, 20]]);
    }
    expect(moved.progression?.rack?.line ?? '').not.toMatch(/make 30, not 35/);
  });
});

describe('reps set by hand before the lift starts, then the weights change', () => {
  const gap45 = gymAt({ from: 5, to: 45, step: 5 });
  const history = [plain(3, incline, [8, 8, 8], 50, [6, 10])];

  function doAll(workout: GeneratedWorkout, prior: CompletedWork): CompletedWork {
    const lift = entryFor(workout, incline);
    return {
      ...prior,
      sets: [
        ...prior.sets,
        ...lift.sets
          .filter((set) => set.kind === 'working')
          .map((set) => ({
            entryId: lift.id,
            exerciseId: incline,
            setIndex: set.index,
            kind: 'working' as const,
            reps: 12,
            weight: set.targetWeight,
            rir: 1,
            completedAt: '2026-09-08T12:20:00.000Z',
          })),
      ],
    };
  }

  it('record and read the same as when a ramp was done first', () => {
    const workout = plan(gym, history);
    const lift = entryFor(workout, incline);
    const own = act(
      gym,
      workout,
      none,
      { type: 'rep-range', entryId: lift.id, reps: [10, 12] },
      { history },
    );
    const firstId = own.blocks[0]?.entries[0]?.id as string;
    // Nothing of the incline done: the gym's dumbbells are saved as going to 45.
    const fresh = act(gap45, own, started(firstId), { type: 'loading' }, { history });
    // The same, with the incline's ramp done first.
    const ramp = entryFor(own, incline).sets.find((set) => set.kind === 'warmup');
    if (!ramp) throw new Error('no ramp');
    const rampDone: CompletedWork = {
      ...started(lift.id),
      sets: [
        {
          entryId: lift.id,
          exerciseId: incline,
          setIndex: ramp.index,
          kind: 'warmup',
          reps: 6,
          weight: ramp.targetWeight,
          rir: 5,
          completedAt: '2026-09-08T12:01:00.000Z',
        },
      ],
    };
    const refit = act(gap45, own, rampDone, { type: 'loading' }, { history });
    // A second change of weights keeps the record the first one wrote.
    const again = act(
      gymAt({ from: 5, to: 45, step: 5 }, { from: 60, to: 60, step: 5 }),
      fresh,
      started(firstId),
      {
        type: 'loading',
      },
      { history },
    );
    for (const set of entryFor(again, incline).sets.filter((one) => one.kind === 'working')) {
      expect(set.asked).toEqual({ weight: 50, reps: [10, 12] });
    }
    for (const after of [fresh, refit]) {
      for (const set of entryFor(after, incline).sets.filter((one) => one.kind === 'working')) {
        expect([set.targetWeight, set.targetReps, set.asked]).toEqual([
          45,
          [10, 12],
          { weight: 50, reps: [10, 12] },
        ]);
      }
    }
    // The lifter does 45 lb × 12 on every set either way: 50 lb for 10-12 was not met.
    const savedFresh = saveSession(
      fresh,
      doAll(fresh, started(lift.id)),
      '2026-09-08T12:40:00.000Z',
    );
    const savedRefit = saveSession(refit, doAll(refit, rampDone), '2026-09-08T12:40:00.000Z');
    expect(nextOf(incline, 'primary-hypertrophy', [savedRefit, ...history]).weight).toBe(50);
    expect(nextOf(incline, 'primary-hypertrophy', [savedFresh, ...history]).weight).toBe(50);
  });
});

describe('the step rule after the weights stop at the same weight and come back', () => {
  const gapGym = gymAt({ from: 5, to: 30, step: 5 }, { from: 40, to: 40, step: 5 });
  const gym30 = gymAt({ from: 5, to: 30, step: 5 });
  const gapHome = at({ from: 5, to: 30, step: 5 }, { from: 40, to: 40, step: 5 });
  const home30 = at({ from: 5, to: 30, step: 5 });
  const history = [plain(3, incline, [10, 10, 10], 30, [6, 10])];

  for (const [trigger, withGap, without] of [
    ['loading', gapGym, gym30],
    ['location', gapHome, home30],
  ] as const) {
    it(`puts the sets back on the step rule (${trigger})`, () => {
      const workout = plan(withGap, history);
      const lift = entryFor(workout, incline);
      const completed = logThrough(lift, 1);
      const shown = toCome(lift, completed).map((set) => [
        set.targetWeight,
        set.targetReps,
        set.asked,
      ]);
      expect(shown[0]).toEqual([30, [8, 12], undefined]);
      // The 40s go (or the lifter moves to where there are none), then come back.
      const there = act(without, workout, completed, { type: trigger }, { history });
      const back = entryFor(
        act(withGap, there, completed, { type: trigger }, { history }),
        incline,
      );
      expect(back.progression?.rack?.line).toMatch(/the reps go up first/);
      expect(
        toCome(back, completed).map((set) => [set.targetWeight, set.targetReps, set.asked]),
      ).toEqual(shown);
    });
  }
});

describe('a bodyweight lift with reps set by hand', () => {
  it('keeps its warm-up under the working reps when the weights change', () => {
    const workout = plan(gym, [], 'pull-arms');
    const chin = entryFor(workout, 'chin-up');
    const own = act(gym, workout, none, { type: 'rep-range', entryId: chin.id, reps: [3, 5] });
    const warm = entryFor(own, 'chin-up').sets.find((set) => set.kind === 'warmup');
    expect(warm?.targetReps).toEqual([1, 1]);
    const firstId = own.blocks[0]?.entries[0]?.id as string;
    // The gym's dumbbells are saved as going to 30: nothing to do with a chin-up.
    const after = act(gymAt({ from: 5, to: 30, step: 5 }), own, started(firstId), {
      type: 'loading',
    });
    const lift = entryFor(after, 'chin-up');
    const ramp = lift.sets.find((set) => set.kind === 'warmup');
    const first = lift.sets.find((set) => set.kind === 'working');
    expect(first?.targetReps).toEqual([3, 5]);
    expect(ramp?.targetReps[1] ?? 0).toBeLessThan(first?.targetReps[0] ?? 0);
  });
});
