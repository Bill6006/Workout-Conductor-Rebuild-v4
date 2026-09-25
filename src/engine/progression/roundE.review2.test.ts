import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { DUMBBELLS_KEY, type LoadingRange } from '../loading/loading';
import { DELOAD_RIR_DELTA } from '../planning/deload';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { CompletedWork, RecalibrationTrigger } from '../recalibration/types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyMaxes, recordMax, type StrengthMaxes } from './maxes';
import { coachingPolicy } from '../coach/experience';
import { detectStalls } from '../strategy/plateau';
import { sessionFeedback } from '../strategy/strategy';
import { pushedToEffort, recommendNextTarget } from './progression';
import { prescribe } from './roles';

/**
 * Maintenance 23, the second review. The read-back is the exact inverse of the push: a set that
 * met the reps it showed met the range asked, and a push that stopped short of the effort asked
 * holds the load asked rather than reading as a miss. The record of what a set stands in for
 * goes where the set goes, and every rebuild keeps a deload week and drops a drop set that no
 * longer suits.
 */

const NOW = RECORD_NOW;
const places = createDefaultLocations({ gymAccess: true }, NOW);
const home = places.find((place) => place.id === 'home');
if (!home) throw new Error('no home');
const profile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const incline = requireExercise('incline-dumbbell-press');
const rx = prescribe(incline, 'primary-hypertrophy', profile);

const at = (...ranges: LoadingRange[]): LocationProfile => ({
  ...home,
  loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges } },
});
const lightHome = at({ from: 5, to: 20, step: 5 });

/** A session the weights at a place pushed: `shown` at `shownAt`, standing in for `asked`. */
function pushedSession(
  daysAgo: number,
  exerciseId: string,
  reps: number[],
  shown: { at: number; reps: [number, number] },
  asked: { weight: number; reps: [number, number] },
  lifted = shown.at,
): WorkoutRecord {
  const done = record(
    daysAgo,
    exerciseId,
    reps.map((count): SetSpec => [count, lifted, 1]),
    shown.reps,
    1,
  );
  for (const set of done.entries[0]?.sets ?? []) {
    set.asked = asked;
    set.targetWeight = shown.at;
  }
  return done;
}

const nextOf = (
  exerciseId: string,
  role: 'primary-hypertrophy' | 'primary-strength',
  history: WorkoutRecord[],
) => {
  const exercise = requireExercise(exerciseId);
  return recommendNextTarget({
    exercise,
    role,
    prescription: prescribe(exercise, role, profile),
    history,
    profile,
    now: NOW,
  });
};

describe('a set that met the reps it showed', () => {
  it('is never read as a miss at thirty reps, and never deloads', () => {
    // 35 lb asked at 6-10, home stops at 20: 26-30 reps, the most a set asks.
    const clipped = (daysAgo: number) =>
      pushedSession(
        daysAgo,
        incline.id,
        [30, 30, 30],
        { at: 20, reps: [26, 30] },
        { weight: 35, reps: [6, 10] },
      );
    const gym = record(14, incline.id, [
      [8, 35, 1],
      [8, 35, 1],
    ]);
    gym.entries[0]!.sets.forEach((set) => (set.targetReps = [6, 10]));
    const once = nextOf(incline.id, 'primary-hypertrophy', [clipped(2), gym]);
    expect(once).toMatchObject({ mode: 'maintain', weight: 35 });
    expect(once.evidence).toContain(
      'The weights last time made less than 35 lb: the same target again.',
    );
    expect(once.evidence.join(' ')).not.toMatch(/Missed|micro-deload/);
    const twice = nextOf(incline.id, 'primary-hypertrophy', [clipped(2), clipped(5), gym]);
    expect(twice).toMatchObject({ mode: 'maintain', weight: 35 });
  });

  it('is never read as a miss after a small push', () => {
    const small = pushedSession(
      2,
      incline.id,
      [8, 8, 8],
      { at: 45, reps: [8, 12] },
      { weight: 50, reps: [6, 10] },
    );
    const next = nextOf(incline.id, 'primary-hypertrophy', [small]);
    expect(next).toMatchObject({ mode: 'maintain', weight: 50 });
    expect(next.evidence.join(' ')).not.toMatch(/Missed/);
  });

  it('holds a strength lift at the load asked', () => {
    const strength = pushedSession(
      2,
      'dumbbell-bench-press',
      [6, 6, 6],
      { at: 50, reps: [6, 8] },
      { weight: 60, reps: [4, 6] },
    );
    const next = nextOf('dumbbell-bench-press', 'primary-strength', [strength]);
    expect(next).toMatchObject({ mode: 'maintain', weight: 60 });
    expect(next.evidence.join(' ')).not.toMatch(/Missed/);
  });

  it('counts the top of the reps it showed as the top, and says what it stood in for', () => {
    const top = pushedSession(
      2,
      incline.id,
      [29, 29, 29],
      { at: 20, reps: [25, 29] },
      { weight: 30, reps: [6, 10] },
    );
    const next = nextOf(incline.id, 'primary-hypertrophy', [top]);
    expect(next.evidence).toContain('At 20 lb, those reps stood in for 30 lb.');
    expect(next.evidence.join(' ')).toMatch(/Top of the range|at the top of the range/);
    expect([30, 35]).toContain(next.weight);
  });

  it('reads a set lifted at another light weight by the effort it took', () => {
    // Shown 20 lb for 25-29; the lifter took the 25s for 20: 30 lb for about 12.
    const other = pushedSession(
      2,
      incline.id,
      [20, 20],
      { at: 20, reps: [25, 29] },
      { weight: 30, reps: [6, 10] },
      25,
    );
    const next = nextOf(incline.id, 'primary-hypertrophy', [other]);
    expect(next.evidence.join(' ')).not.toMatch(/Missed/);
    expect(next.evidence).toContain('At 25 lb, those reps stood in for 30 lb.');
  });

  it('answers to the range asked when lifted at the load asked or heavier', () => {
    const heavier = pushedSession(
      2,
      incline.id,
      [9, 8, 8],
      { at: 25, reps: [14, 18] },
      { weight: 30, reps: [6, 10] },
      35,
    );
    const next = nextOf(incline.id, 'primary-hypertrophy', [heavier]);
    expect(next.evidence.join(' ')).not.toMatch(/Missed|14-18/);
    expect(next.weight).toBe(35);
  });
});

/** The home push day at `place`, the incline press's first working set logged. */
function started(place: LocationProfile): {
  workout: GeneratedWorkout;
  completed: CompletedWork;
  lift: WorkoutEntry;
} {
  const workout = generateWorkout({
    profile,
    location: place,
    history: [],
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
  const lift = allEntries(workout.blocks).find((entry) => entry.exerciseId === incline.id);
  if (!lift) throw new Error('no incline');
  const first = lift.sets.findIndex((set) => set.kind === 'working');
  const completed: CompletedWork = {
    ...emptyCompleted(),
    startedAt: NOW,
    elapsedSeconds: 10 * 60,
    currentEntryId: lift.id,
    sets: lift.sets.slice(0, first + 1).map((set) => ({
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
  return { workout, completed, lift };
}

function act(
  place: LocationProfile,
  workout: GeneratedWorkout,
  completed: CompletedWork,
  trigger: RecalibrationTrigger,
  extra: {
    loading?: { missingPlates: number[] };
    deload?: boolean;
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
    profile: { ...profile, currentLocationId: 'home' },
    location: place,
    history: [],
    constraints: {
      ...emptyConstraints(),
      deload: extra.deload
        ? { startsAt: '2026-09-09T00:00:00.000Z', endsAt: '2026-09-16T00:00:00.000Z' }
        : null,
    },
    ...(extra.loading ? { loading: extra.loading } : {}),
    maxes: extra.maxes ?? null,
    reason: 'test',
    timestamp: NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return result.workout;
}

const entryOf = (workout: GeneratedWorkout, id: string) => {
  const found = allEntries(workout.blocks).find((entry) => entry.id === id);
  if (!found) throw new Error(id);
  return found;
};

const toCome = (entry: WorkoutEntry, completed: CompletedWork) =>
  entry.sets.filter(
    (set) => set.kind === 'working' && !completed.sets.some((done) => done.setIndex === set.index),
  );

describe('a push short of the effort, among other sessions', () => {
  const advanced = { ...profile, experience: 'advanced' as const };
  const nextFor = (
    exerciseId: string,
    role: 'primary-hypertrophy' | 'primary-strength',
    history: WorkoutRecord[],
  ) => {
    const exercise = requireExercise(exerciseId);
    return recommendNextTarget({
      exercise,
      role,
      prescription: prescribe(exercise, role, advanced),
      history,
      profile: advanced,
      now: NOW,
    });
  };

  it('never counts as a second session at the top', () => {
    // Two sessions at the top move the load for an advanced lifter; thirty reps at 20 lb that
    // stood in for 35 lb is not one of them.
    const gym = record(2, incline.id, [
      [10, 35, 1],
      [10, 35, 1],
    ]);
    gym.entries[0]!.sets.forEach((set) => (set.targetReps = [6, 10]));
    const home = pushedSession(
      5,
      incline.id,
      [30, 30],
      { at: 20, reps: [26, 30] },
      { weight: 35, reps: [6, 10] },
    );
    expect(nextFor(incline.id, 'primary-hypertrophy', [gym, home]).weight).toBe(35);
  });

  it('never counts as a second clean session for a strength lift', () => {
    const gym = record(2, 'dumbbell-bench-press', [
      [5, 60, 2],
      [5, 60, 2],
    ]);
    const home = pushedSession(
      5,
      'dumbbell-bench-press',
      [6, 6],
      { at: 50, reps: [6, 8] },
      { weight: 60, reps: [4, 6] },
    );
    for (const set of home.entries[0]!.sets) set.rir = 2;
    expect(nextFor('dumbbell-bench-press', 'primary-strength', [gym, home]).weight).toBe(60);
  });

  it('comes back from a break by the max its reps showed', () => {
    const clipped = pushedSession(
      25,
      incline.id,
      [30, 30],
      { at: 20, reps: [26, 30] },
      { weight: 35, reps: [6, 10] },
    );
    const back = nextOf(incline.id, 'primary-hypertrophy', [clipped]);
    expect(back.mode).toBe('return');
    // 20 lb for 30 shows about 40 lb, not the 47 lb that 35 lb for 10 would.
    expect(back.evidence.join(' ')).toContain('estimated max (40 lb)');
  });
});

describe('the record of what a set stands in for, through the workout', () => {
  it('goes with a set added to a pushed lift', () => {
    const { workout, completed, lift } = started(lightHome);
    const more = entryOf(
      act(lightHome, workout, completed, { type: 'sets', entryId: lift.id, workingDelta: 1 }),
      lift.id,
    );
    const working = more.sets.filter((set) => set.kind === 'working');
    expect(working.length).toBe(lift.sets.filter((set) => set.kind === 'working').length + 1);
    for (const set of working) {
      expect(set.asked).toEqual({ weight: 30, reps: [6, 10] });
      expect(pushedToEffort(set, more.role)).toBe(true);
    }
  });

  it('leaves the loads the lifter’s own sets earned when the weights change elsewhere', () => {
    // Dumbbells to 25, then 35: 25 lb for 14-18 stands in for 30. An easy first set moves the
    // rest up to 35; a plate missing today must not undo that.
    const gap = at({ from: 5, to: 25, step: 5 }, { from: 35, to: 35, step: 5 });
    const { workout, completed, lift } = started(gap);
    const first = completed.sets.at(-1)!;
    const up = act(gap, workout, completed, {
      type: 'performance',
      entryId: lift.id,
      setIndex: first.setIndex,
      actualReps: 18,
      actualWeight: 25,
      plan: { kind: 'weight', delta: 10, reason: 'Easy: the next sets go up.' },
    });
    // At 35, past the 30 lb they stood in for, the sets take the range asked.
    for (const set of toCome(entryOf(up, lift.id), completed)) {
      expect([set.targetWeight, set.targetReps, set.asked]).toEqual([35, [6, 10], undefined]);
    }
    const after = act(
      gap,
      up,
      completed,
      { type: 'loading' },
      { loading: { missingPlates: [2.5] } },
    );
    expect(toCome(entryOf(after, lift.id), completed).map((set) => set.targetWeight)).toEqual([
      35, 35,
    ]);
  });

  it('goes with a set a new range adds', () => {
    const { workout, completed, lift } = started(lightHome);
    const more = entryOf(
      act(lightHome, workout, completed, {
        type: 'rep-range',
        entryId: lift.id,
        reps: [15, 20],
        workingDelta: 1,
      }),
      lift.id,
    );
    for (const set of toCome(more, completed)) {
      expect(set.asked).toEqual({ weight: 30, reps: [6, 10] });
    }
  });

  it('leaves reps the lifter’s own sets earned when the weights change elsewhere', () => {
    const { workout, completed, lift } = started(lightHome);
    const first = completed.sets.at(-1)!;
    const up = act(lightHome, workout, completed, {
      type: 'performance',
      entryId: lift.id,
      setIndex: first.setIndex,
      actualReps: 29,
      actualWeight: 20,
      plan: { kind: 'reps', shift: 2, reason: 'Easy: two more reps.' },
    });
    const shifted = toCome(entryOf(up, lift.id), completed).map((set) => set.targetReps);
    const after = act(
      lightHome,
      up,
      completed,
      { type: 'loading' },
      {
        loading: { missingPlates: [2.5] },
      },
    );
    expect(toCome(entryOf(after, lift.id), completed).map((set) => set.targetReps)).toEqual(
      shifted,
    );
  });

  it('stays with reps set by hand, and those reps stay when the weights change', () => {
    const { workout, completed, lift } = started(lightHome);
    const own = act(lightHome, workout, completed, {
      type: 'rep-range',
      entryId: lift.id,
      reps: [15, 20],
    });
    for (const set of toCome(entryOf(own, lift.id), completed)) {
      expect(set.targetReps).toEqual([15, 20]);
      expect(set.asked).toEqual({ weight: 30, reps: [6, 10] });
    }
    const more = act(at({ from: 5, to: 30, step: 5 }), own, completed, { type: 'loading' });
    for (const set of toCome(entryOf(more, lift.id), completed)) {
      expect(set.targetReps).toEqual([15, 20]);
      expect(set.targetWeight).toBe(20);
    }
    // Logged so, it reads as a push short of the effort: the load asked holds.
    const logged = pushedSession(
      2,
      incline.id,
      [20, 20],
      { at: 20, reps: [15, 20] },
      { weight: 30, reps: [6, 10] },
    );
    expect(nextOf(incline.id, 'primary-hypertrophy', [logged])).toMatchObject({
      mode: 'maintain',
      weight: 30,
    });
  });
});

describe('a rebuild in a deload week', () => {
  const deloaded = (entry: WorkoutEntry) => {
    for (const set of entry.sets.filter((candidate) => candidate.kind === 'working')) {
      expect(set.targetRir).toBe(rx.rir + DELOAD_RIR_DELTA);
    }
    expect(entry.progression?.evidence).toContain('Deload week: loads 10% lighter.');
  };

  it('keeps the deload when the weights change', () => {
    const { workout } = started(home);
    const none = emptyCompleted();
    const lift = allEntries(workout.blocks).find((entry) => entry.exerciseId === incline.id)!;
    deloaded(
      entryOf(act(lightHome, workout, none, { type: 'loading' }, { deload: true }), lift.id),
    );
  });

  it('keeps it when a max is entered', () => {
    const { workout } = started(home);
    const none = emptyCompleted();
    const lift = allEntries(workout.blocks).find((entry) => entry.exerciseId === incline.id)!;
    const maxes = recordMax(emptyMaxes(), incline.id, { kind: 'max', e1rm: 45 }, 'lb', NOW);
    deloaded(
      entryOf(
        act(
          lightHome,
          workout,
          none,
          { type: 'max', exerciseId: incline.id },
          {
            deload: true,
            maxes,
          },
        ),
        lift.id,
      ),
    );
  });
});

describe('a drop set on a lift the weights here now push to its effort', () => {
  /** The home pull day with a drop set on the dumbbell curl. */
  function withCurlDrop(): { workout: GeneratedWorkout; curl: WorkoutEntry } {
    const workout = generateWorkout({
      profile,
      location: home,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'pull-arms' },
    });
    const curl = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'dumbbell-curl');
    if (!curl) throw new Error('no curl');
    curl.dropSet = true;
    curl.sets.push({
      index: curl.sets.length,
      kind: 'drop',
      targetReps: [8, 12],
      targetRir: 0,
      targetWeight: null,
      restSeconds: 0,
    });
    return { workout, curl };
  }
  const tenPound = at({ from: 5, to: 10, step: 5 });
  const dropped = (entry: WorkoutEntry) => {
    expect(entry.sets.some((set) => pushedToEffort(set, entry.role))).toBe(true);
    expect(entry.dropSet).toBe(false);
    expect(entry.sets.some((set) => set.kind === 'drop')).toBe(false);
  };

  it('comes off when the weights change', () => {
    const { workout, curl } = withCurlDrop();
    dropped(entryOf(act(tenPound, workout, emptyCompleted(), { type: 'loading' }), curl.id));
  });

  it('comes off when a max is entered', () => {
    const { workout, curl } = withCurlDrop();
    const maxes = recordMax(emptyMaxes(), 'dumbbell-curl', { kind: 'max', e1rm: 30 }, 'lb', NOW);
    dropped(
      entryOf(
        act(
          tenPound,
          workout,
          emptyCompleted(),
          { type: 'max', exerciseId: 'dumbbell-curl' },
          {
            maxes,
          },
        ),
        curl.id,
      ),
    );
  });
});

describe('a drop set carried by a swap onto a lift the weights here push', () => {
  const fivePound = at({ from: 5, to: 5, step: 5 });
  function curlDay(): { workout: GeneratedWorkout; curl: WorkoutEntry } {
    const workout = generateWorkout({
      profile,
      location: fivePound,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'pull-arms' },
    });
    const curl = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'dumbbell-curl');
    if (!curl) throw new Error('no curl');
    curl.dropSet = true;
    curl.sets.push({
      index: curl.sets.length,
      kind: 'drop',
      targetReps: [8, 12],
      targetRir: 0,
      targetWeight: null,
      restSeconds: 0,
    });
    return { workout, curl };
  }
  const noDrop = (entry: WorkoutEntry) => {
    expect(entry.sets.some((set) => pushedToEffort(set, entry.role))).toBe(true);
    expect(entry.sets.some((set) => set.kind === 'drop')).toBe(false);
  };
  const byExercise = (workout: GeneratedWorkout, exerciseId: string) => {
    const found = allEntries(workout.blocks).find(
      (entry) =>
        entry.exerciseId === exerciseId && entry.sets.some((set) => set.kind === 'working'),
    );
    if (!found) throw new Error(exerciseId);
    return found;
  };

  it('comes off in a swap before a set is logged', () => {
    const { workout, curl } = curlDay();
    const swapped = act(fivePound, workout, emptyCompleted(), {
      type: 'replace',
      entryId: curl.id,
      exerciseId: 'incline-dumbbell-curl',
    });
    noDrop(byExercise(swapped, 'incline-dumbbell-curl'));
  });

  it('comes off in a swap after a set is logged, and in the swap back', () => {
    const { workout, curl } = curlDay();
    const first = curl.sets.find((set) => set.kind === 'working')!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 5 * 60,
      currentEntryId: curl.id,
      sets: curl.sets
        .filter((set) => set.index <= first.index)
        .map((set) => ({
          entryId: curl.id,
          exerciseId: curl.exerciseId,
          setIndex: set.index,
          kind: set.kind,
          reps: 20,
          weight: set.targetWeight,
          rir: 2,
          completedAt: NOW,
        })),
    };
    const swapped = act(fivePound, workout, completed, {
      type: 'replace',
      entryId: curl.id,
      exerciseId: 'incline-dumbbell-curl',
    });
    const stand = byExercise(swapped, 'incline-dumbbell-curl');
    noDrop(stand);
    // Had the stand-in carried one, the curl picked up again would not take it back.
    stand.dropSet = true;
    stand.sets.push({
      index: Math.max(...stand.sets.map((set) => set.index)) + 1,
      kind: 'drop',
      targetReps: [8, 12],
      targetRir: 0,
      targetWeight: null,
      restSeconds: 0,
    });
    const back = act(fivePound, swapped, completed, {
      type: 'replace',
      entryId: stand.id,
      exerciseId: 'dumbbell-curl',
    });
    noDrop(entryOf(back, curl.id));
  });
});

describe('the third review', () => {
  it('keeps the record when "the next sets go up" cannot move a set at the heaviest weight', () => {
    const { workout, completed, lift } = started(lightHome);
    const first = completed.sets.at(-1)!;
    const same = act(lightHome, workout, completed, {
      type: 'performance',
      entryId: lift.id,
      setIndex: first.setIndex,
      actualReps: 29,
      actualWeight: 20,
      plan: { kind: 'weight', delta: 5, reason: 'Easy: the next sets go up.' },
    });
    for (const set of toCome(entryOf(same, lift.id), completed)) {
      expect([set.targetWeight, set.asked]).toEqual([20, { weight: 30, reps: [6, 10] }]);
    }
  });

  it('never calls a strength lift held at the heaviest weight a stall', () => {
    const history = [2, 5, 8, 11, 14].map((daysAgo) =>
      pushedSession(
        daysAgo,
        'dumbbell-bench-press',
        [8, 8, 8],
        { at: 50, reps: [6, 8] },
        { weight: 60, reps: [4, 6] },
      ),
    );
    expect(detectStalls(history, profile, coachingPolicy(profile.experience))).toEqual([]);
  });

  it('judges a range set by hand as the reps it showed', () => {
    const own = pushedSession(
      2,
      incline.id,
      [32, 30, 28],
      { at: 20, reps: [30, 35] },
      { weight: 30, reps: [6, 10] },
    );
    const next = nextOf(incline.id, 'primary-hypertrophy', [own]);
    expect(next).toMatchObject({ mode: 'maintain', weight: 30 });
    expect(next.evidence).toContain(
      'Missed the floor last time; one session is not a trend, so repeat the load.',
    );
  });

  it('takes a short push that missed twice down from what was lifted', () => {
    const missed = (daysAgo: number) =>
      pushedSession(
        daysAgo,
        'dumbbell-bench-press',
        [5, 5],
        { at: 50, reps: [6, 8] },
        { weight: 60, reps: [4, 6] },
      );
    const next = nextOf('dumbbell-bench-press', 'primary-strength', [missed(2), missed(5)]);
    expect(next.mode).toBe('deload');
    expect(next.weight).toBe(45);
  });

  it('holds a strength lift lifted heavier than shown at the load asked', () => {
    const heavier = pushedSession(
      2,
      'dumbbell-bench-press',
      [6, 6],
      { at: 50, reps: [6, 8] },
      { weight: 60, reps: [4, 6] },
      55,
    );
    const next = nextOf('dumbbell-bench-press', 'primary-strength', [heavier]);
    expect(next).toMatchObject({ mode: 'maintain', weight: 60 });
    expect(next.evidence.join(' ')).not.toMatch(/Missed/);
  });

  it('runs a set to its effort where a step lands well under the last load', () => {
    // Dumbbells to 25, then 40: 35 lb after 30 lb is made by 25, far under both.
    const gap = at({ from: 5, to: 25, step: 5 }, { from: 40, to: 40, step: 5 });
    const plan = generateWorkout({
      profile,
      location: gap,
      history: [
        pushedSession(
          2,
          incline.id,
          [18, 18, 18],
          { at: 25, reps: [14, 18] },
          { weight: 30, reps: [6, 10] },
        ),
      ],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const entry = allEntries(plan.blocks).find((item) => item.exerciseId === incline.id)!;
    const working = entry.sets.find((set) => set.kind === 'working')!;
    expect(working.targetWeight).toBe(25);
    expect(working.asked).toEqual({ weight: 35, reps: [6, 10] });
    expect(entry.progression?.evidence.join(' ')).not.toMatch(/reps go up first/);
  });

  it('never calls a session at the gym progress over one the light home read higher', () => {
    const home = pushedSession(
      4,
      incline.id,
      [29, 29],
      { at: 20, reps: [25, 29] },
      { weight: 30, reps: [6, 10] },
    );
    const gym = record(0, incline.id, [
      [8, 30, 1],
      [8, 30, 1],
    ]);
    gym.entries[0]!.sets.forEach((set) => (set.targetReps = [6, 10]));
    const lines = sessionFeedback(gym, [home], profile);
    expect(lines.join(' ')).not.toContain('Incline Dumbbell Press: progressed');
    expect(lines.join(' ')).toContain('Incline Dumbbell Press: on target at 30 lb × 8.');
    // The other way round: 29 at 20 lb after 8 at 30 lb is progress, counted as the rules count it.
    const later = pushedSession(
      0,
      incline.id,
      [29, 29],
      { at: 20, reps: [25, 29] },
      { weight: 30, reps: [6, 10] },
    );
    const earlier = record(4, incline.id, [
      [8, 30, 1],
      [8, 30, 1],
    ]);
    earlier.entries[0]!.sets.forEach((set) => (set.targetReps = [6, 10]));
    expect(sessionFeedback(later, [earlier], profile).join(' ')).toContain(
      'Incline Dumbbell Press: progressed',
    );
  });

  // The fourth review: the sets keep what they stand in for, as a range set by hand does
  // unrefreshed; set at the load, before any push, the reps set are that range (round seven).
  it('keeps reps set by hand on a lift not started when the weights change, and claims no reps', () => {
    const plan = generateWorkout({
      profile,
      location: home,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const lift = allEntries(plan.blocks).find((entry) => entry.exerciseId === incline.id)!;
    const own = act(home, plan, emptyCompleted(), {
      type: 'rep-range',
      entryId: lift.id,
      reps: [8, 12],
    });
    const after = entryOf(act(lightHome, own, emptyCompleted(), { type: 'loading' }), lift.id);
    for (const set of after.sets.filter((candidate) => candidate.kind === 'working')) {
      expect([set.targetWeight, set.targetReps, set.asked]).toEqual([
        20,
        [8, 12],
        { weight: 30, reps: [8, 12] },
      ]);
    }
    expect(after.progression?.evidence.at(-1)).toBe('Held at the heaviest weight here (20 lb).');
    // A max entered for it keeps them too.
    const maxes = recordMax(emptyMaxes(), incline.id, { kind: 'max', e1rm: 45 }, 'lb', NOW);
    const maxed = entryOf(
      act(lightHome, own, emptyCompleted(), { type: 'max', exerciseId: incline.id }, { maxes }),
      lift.id,
    );
    for (const set of maxed.sets.filter((candidate) => candidate.kind === 'working')) {
      expect([set.targetWeight, set.targetReps, set.asked?.reps]).toEqual([20, [8, 12], [8, 12]]);
      expect(set.asked?.weight).toBeGreaterThan(20);
    }
    expect(maxed.progression?.evidence.at(-1)).toBe('Held at the heaviest weight here (20 lb).');
  });

  it('drops a drop set still to come from a started lift the weights now push', () => {
    const workout = generateWorkout({
      profile,
      location: home,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'pull-arms' },
    });
    const curl = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'dumbbell-curl')!;
    curl.dropSet = true;
    curl.sets.push({
      index: curl.sets.length,
      kind: 'drop',
      targetReps: [8, 12],
      targetRir: 0,
      targetWeight: null,
      restSeconds: 0,
    });
    const first = curl.sets.find((set) => set.kind === 'working')!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 5 * 60,
      currentEntryId: curl.id,
      sets: curl.sets
        .filter((set) => set.index <= first.index)
        .map((set) => ({
          entryId: curl.id,
          exerciseId: curl.exerciseId,
          setIndex: set.index,
          kind: set.kind,
          reps: 12,
          weight: set.targetWeight,
          rir: 2,
          completedAt: NOW,
        })),
    };
    const after = entryOf(
      act(at({ from: 5, to: 10, step: 5 }), workout, completed, { type: 'loading' }),
      curl.id,
    );
    expect(after.sets.some((set) => pushedToEffort(set, after.role))).toBe(true);
    expect(after.dropSet).toBe(false);
    expect(after.sets.some((set) => set.kind === 'drop')).toBe(false);
  });
});

describe('checking the third review', () => {
  it('judges sessions lifted at the load asked at the range asked when calling a stall', () => {
    // The plan showed 20 lb for 25-29, standing in for 30 lb × 6-10, and the lifter brought 30s:
    // 8 reps at 30 lb, session after session, is a stall at the range asked, not five misses.
    const history = [2, 5, 8, 11, 14].map((daysAgo) =>
      pushedSession(
        daysAgo,
        incline.id,
        [8, 8],
        { at: 20, reps: [25, 29] },
        { weight: 30, reps: [6, 10] },
        30,
      ),
    );
    const stalls = detectStalls(history, profile, coachingPolicy(profile.experience));
    expect(stalls.map((stall) => stall.exerciseId)).toContain(incline.id);
  });

  it('leaves pushed sets autoregulation moved when the weights change elsewhere', () => {
    const { workout, completed, lift } = started(lightHome);
    const first = completed.sets.at(-1)!;
    const down = act(lightHome, workout, completed, {
      type: 'performance',
      entryId: lift.id,
      setIndex: first.setIndex,
      actualReps: 15,
      actualWeight: 20,
      plan: { kind: 'weight', delta: -5, reason: 'A grind: the next sets come down.' },
    });
    const moved = toCome(entryOf(down, lift.id), completed);
    for (const set of moved) {
      expect([set.targetWeight, set.asked]).toEqual([15, { weight: 30, reps: [6, 10] }]);
    }
    const after = act(
      lightHome,
      down,
      completed,
      { type: 'loading' },
      { loading: { missingPlates: [2.5] } },
    );
    expect(
      toCome(entryOf(after, lift.id), completed).map((set) => [set.targetWeight, set.targetReps]),
    ).toEqual(moved.map((set) => [set.targetWeight, set.targetReps]));
  });

  it('leaves a set autoregulation moved at a gap in the weights when they change elsewhere', () => {
    // Dumbbells to 25, then 40: 25 lb stands in for 30. A grind moves the rest down to 20.
    const gap = at({ from: 5, to: 25, step: 5 }, { from: 40, to: 40, step: 5 });
    const { workout, completed, lift } = started(gap);
    const first = completed.sets.at(-1)!;
    const down = act(gap, workout, completed, {
      type: 'performance',
      entryId: lift.id,
      setIndex: first.setIndex,
      actualReps: 10,
      actualWeight: 25,
      plan: { kind: 'weight', delta: -5, reason: 'A grind: the next sets come down.' },
    });
    const moved = toCome(entryOf(down, lift.id), completed);
    for (const set of moved) {
      expect([set.targetWeight, set.asked]).toEqual([20, { weight: 30, reps: [6, 10] }]);
    }
    const after = act(
      gap,
      down,
      completed,
      { type: 'loading' },
      { loading: { missingPlates: [2.5] } },
    );
    expect(
      toCome(entryOf(after, lift.id), completed).map((set) => [set.targetWeight, set.targetReps]),
    ).toEqual(moved.map((set) => [set.targetWeight, set.targetReps]));
  });

  it('fits a pushed set again when the weight autoregulation moved it to is gone', () => {
    const { workout, completed, lift } = started(lightHome);
    const planned = toCome(entryOf(workout, lift.id), completed).map((set) => [
      set.targetWeight,
      set.targetReps,
    ]);
    const first = completed.sets.at(-1)!;
    const down = act(lightHome, workout, completed, {
      type: 'performance',
      entryId: lift.id,
      setIndex: first.setIndex,
      actualReps: 15,
      actualWeight: 20,
      plan: { kind: 'weight', delta: -5, reason: 'A grind: the next sets come down.' },
    });
    // The 15s are gone and 20 lb is still the heaviest: the sets go back to the plan's.
    const without = at({ from: 5, to: 10, step: 5 }, { from: 20, to: 20, step: 5 });
    const after = act(without, down, completed, { type: 'loading' });
    expect(
      toCome(entryOf(after, lift.id), completed).map((set) => [set.targetWeight, set.targetReps]),
    ).toEqual(planned);
  });

  it('fits a pushed set autoregulation moved again when its own weights change', () => {
    const { workout, completed, lift } = started(lightHome);
    const first = completed.sets.at(-1)!;
    const down = act(lightHome, workout, completed, {
      type: 'performance',
      entryId: lift.id,
      setIndex: first.setIndex,
      actualReps: 15,
      actualWeight: 20,
      plan: { kind: 'weight', delta: -5, reason: 'A grind: the next sets come down.' },
    });
    // Dumbbells up to 30 now make the load asked: the sets take it, and its range.
    const more = act(at({ from: 5, to: 30, step: 5 }), down, completed, { type: 'loading' });
    for (const set of toCome(entryOf(more, lift.id), completed)) {
      expect([set.targetWeight, set.targetReps, set.asked]).toEqual([30, [6, 10], undefined]);
    }
  });
});
