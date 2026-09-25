import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { TrainingRole } from '../../catalog/exercises/exerciseSchema';
import type { WorkoutSession } from '../../core/state/session';
import { buildWorkoutRecord } from '../../core/state/workoutRecordBuilder';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { gatherSignals, type CoachInput } from '../coach/coachConductor';
import { estimateWorkout, workSecondsFor } from '../duration/duration';
import { DUMBBELLS_KEY, type LoadingRange } from '../loading/loading';
import { autoregulate, outcomeFor } from '../recalibration/autoregulate';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { CompletedWork, RecalibrationTrigger } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy, sessionFeedback } from '../strategy/strategy';
import {
  allEntries,
  type GeneratedWorkout,
  type SetPrescription,
  type WorkoutEntry,
} from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { recordMax, emptyMaxes, type StrengthMaxes } from './maxes';
import { entryPushedToEffort, recommendNextTarget } from './progression';
import { prescribe } from './roles';

/**
 * Maintenance 23, the fourth review. The finish summary grades a set as the rules read it; a push
 * short of the effort is passed over by the runs that move the load; the step rule's note, reps
 * set by hand and the record of what a set stands in for survive every change of weights and a
 * refresh; a weight the coach sets keeps the push's rule; and a lift under way goes on at the
 * weights of a new place.
 */

const NOW = RECORD_NOW;
const places = createDefaultLocations({ gymAccess: true }, NOW);
const home = places.find((place) => place.id === 'home') as LocationProfile;
const gym = places.find((place) => place.id === 'gym') as LocationProfile;
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const incline = 'incline-dumbbell-press';
const none: CompletedWork = emptyCompleted();

const at = (...ranges: LoadingRange[]): LocationProfile => ({
  ...home,
  loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges } },
});
const lightHome = at({ from: 5, to: 20, step: 5 });

/** A session the weights at a place pushed: `shown` at `shown.at`, standing in for `asked`. */
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

/** A session at `weight`, its sets logged against `target`. */
function plain(
  daysAgo: number,
  exerciseId: string,
  reps: number[],
  weight: number,
  target: [number, number],
  rir = 1,
): WorkoutRecord {
  const done = record(
    daysAgo,
    exerciseId,
    reps.map((count): SetSpec => [count, weight, rir]),
    target,
    1,
  );
  for (const set of done.entries[0]?.sets ?? []) set.targetWeight = weight;
  return done;
}

function nextOf(
  exerciseId: string,
  role: TrainingRole,
  history: WorkoutRecord[],
  who: UserProfile = profile,
) {
  const exercise = requireExercise(exerciseId);
  return recommendNextTarget({
    exercise,
    role,
    prescription: prescribe(exercise, role, who),
    history,
    profile: who,
    now: NOW,
  });
}

function plan(place: LocationProfile, history: WorkoutRecord[] = []): GeneratedWorkout {
  return generateWorkout({
    profile,
    location: place,
    history,
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
}

function entryFor(workout: GeneratedWorkout, exerciseId: string): WorkoutEntry {
  const found = allEntries(workout.blocks).find((entry) => entry.exerciseId === exerciseId);
  if (!found) throw new Error(`no ${exerciseId}`);
  return found;
}

const working = (workout: GeneratedWorkout, exerciseId: string) =>
  entryFor(workout, exerciseId).sets.filter((set) => set.kind === 'working');

/** The lift's sets logged up to and including its `count`-th working set, at the targets. */
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

/** The workout saved with every working set of one lift logged at `reps`, as the store saves it. */
function savedWith(workout: GeneratedWorkout, exerciseId: string, reps: number): WorkoutRecord {
  const lift = entryFor(workout, exerciseId);
  const completed: CompletedWork = {
    ...emptyCompleted(),
    startedAt: '2026-09-08T12:00:00.000Z',
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
        completedAt: '2026-09-08T12:30:00.000Z',
      })),
  };
  const session = {
    workout,
    completed,
    duration: 'default',
    constraints: emptyConstraints(),
  } as unknown as WorkoutSession;
  return buildWorkoutRecord(session, {
    now: '2026-09-08T12:40:00.000Z',
    elapsedSeconds: 2400,
    rating: null,
    endedEarly: false,
  });
}

describe('the step rule, when the weights change elsewhere', () => {
  // Dumbbells to 30, then 40. After 30 lb × 10 at 6-10, 35 lb is asked; the dumbbells make
  // exactly the last load, so the plan holds 30 lb and adds two reps.
  const gap = at({ from: 5, to: 30, step: 5 }, { from: 40, to: 40, step: 5 });
  const history = [plain(3, incline, [10, 10, 10], 30, [6, 10])];

  it('keeps "the reps go up first" and stands in for nothing', () => {
    const workout = plan(gap, history);
    for (const set of working(workout, incline)) {
      expect([set.targetWeight, set.targetReps, set.asked]).toEqual([30, [8, 12], undefined]);
    }
    const completed = logThrough(entryFor(workout, incline), 1);
    // A 2.5 lb plate for the barbell goes missing: the dumbbells did not change.
    const after = act(
      gap,
      workout,
      completed,
      { type: 'loading' },
      {
        loading: { missingPlates: [2.5] },
        history,
      },
    );
    const lift = entryFor(after, incline);
    for (const set of toCome(lift, completed)) {
      expect([set.targetWeight, set.targetReps, set.asked]).toEqual([30, [8, 12], undefined]);
    }
    expect(lift.progression?.evidence.join(' ')).toMatch(/the reps go up first/);
  });

  it('keeps reps set by hand as they are', () => {
    const workout = plan(gap, history);
    const own = act(gap, workout, none, {
      type: 'rep-range',
      entryId: entryFor(workout, incline).id,
      reps: [10, 12],
    });
    const completed = logThrough(entryFor(own, incline), 1);
    const after = act(
      gap,
      own,
      completed,
      { type: 'loading' },
      {
        loading: { missingPlates: [2.5] },
        history,
      },
    );
    expect(
      toCome(entryFor(after, incline), completed).map((set) => [set.targetWeight, set.targetReps]),
    ).toEqual([
      [30, [10, 12]],
      [30, [10, 12]],
    ]);
  });
});

describe('reps set by hand on a started lift, when the weights change elsewhere', () => {
  it('stay through a refresh before the lift began and another after its first set', () => {
    // Dumbbells to 25, then 35: 25 lb stands in for 30.
    const gap = at({ from: 5, to: 25, step: 5 }, { from: 35, to: 35, step: 5 });
    const workout = plan(gap);
    const own = act(gap, workout, none, {
      type: 'rep-range',
      entryId: entryFor(workout, incline).id,
      reps: [15, 20],
    });
    const refreshed = act(
      gap,
      own,
      none,
      { type: 'loading' },
      { loading: { missingPlates: [2.5] } },
    );
    for (const set of working(refreshed, incline)) expect(set.targetReps).toEqual([15, 20]);
    const completed = logThrough(entryFor(refreshed, incline), 1);
    const after = act(
      gap,
      refreshed,
      completed,
      { type: 'loading' },
      {
        loading: { missingPlates: [5] },
      },
    );
    expect(toCome(entryFor(after, incline), completed).map((set) => set.targetReps)).toEqual([
      [15, 20],
      [15, 20],
    ]);
  });
});

describe('reps set by hand on a pushed lift, refreshed before it starts', () => {
  it('still carry the load asked into the next session', () => {
    const workout = plan(lightHome);
    const own = act(lightHome, workout, none, {
      type: 'rep-range',
      entryId: entryFor(workout, incline).id,
      reps: [15, 20],
    });
    // Without a refresh: 20 lb × 20 stands in for 30 lb, a push short of the effort: 30 lb next.
    expect(nextOf(incline, 'primary-hypertrophy', [savedWith(own, incline, 20)]).weight).toBe(30);
    // A plate for the barbell marked missing before the incline starts changes nothing here.
    const refreshed = act(
      lightHome,
      own,
      none,
      { type: 'loading' },
      {
        loading: { missingPlates: [2.5] },
      },
    );
    for (const set of working(refreshed, incline)) {
      expect([set.targetWeight, set.targetReps, set.asked]).toEqual([
        20,
        [15, 20],
        { weight: 30, reps: [6, 10] },
      ]);
    }
    expect(nextOf(incline, 'primary-hypertrophy', [savedWith(refreshed, incline, 20)]).weight).toBe(
      30,
    );
  });

  it('keep what they stand in for when a max is entered', () => {
    const workout = plan(lightHome);
    const own = act(lightHome, workout, none, {
      type: 'rep-range',
      entryId: entryFor(workout, incline).id,
      reps: [15, 20],
    });
    const maxes = recordMax(emptyMaxes(), incline, { kind: 'max', e1rm: 45 }, 'lb', NOW);
    const after = act(lightHome, own, none, { type: 'max', exerciseId: incline }, { maxes });
    for (const set of working(after, incline)) {
      expect(set.targetReps).toEqual([15, 20]);
      expect(set.targetWeight).toBe(20);
      expect(set.asked?.weight).toBeGreaterThan(20);
    }
  });
});

describe('an advanced lifter who trains at the gym and at a light home in turn', () => {
  const advanced = { ...profile, experience: 'advanced' as const };

  it('moves a strength lift after two clean gym sessions, whatever the home sessions between', () => {
    const bench = 'dumbbell-bench-press';
    const gymAt = (daysAgo: number) => plain(daysAgo, bench, [6, 6, 6], 60, [4, 6], 2);
    // The home stops at 50 lb: 50 lb × 6-8 stands in for 60 lb × 4-6, a push short of the effort.
    const homeAt = (daysAgo: number) =>
      pushedSession(
        daysAgo,
        bench,
        [8, 8, 8],
        { at: 50, reps: [6, 8] },
        { weight: 60, reps: [4, 6] },
        50,
        2,
      );
    const history = [gymAt(2), homeAt(5), gymAt(9), homeAt(12), gymAt(16), homeAt(19)];
    expect(nextOf(bench, 'primary-strength', [gymAt(2), gymAt(9)], advanced).weight).toBe(65);
    expect(nextOf(bench, 'primary-strength', history, advanced).weight).toBe(65);
  });

  it('moves a muscle-building lift after two gym sessions at the top', () => {
    const gymAt = (daysAgo: number) => plain(daysAgo, incline, [10, 10, 10], 35, [6, 10], 1);
    // The home stops at 20 lb: held at 30 reps, a push short of the effort.
    const homeAt = (daysAgo: number) =>
      pushedSession(
        daysAgo,
        incline,
        [30, 30, 30],
        { at: 20, reps: [26, 30] },
        { weight: 35, reps: [6, 10] },
      );
    const history = [gymAt(2), homeAt(5), gymAt(9), homeAt(12), gymAt(16)];
    expect(nextOf(incline, 'primary-hypertrophy', history, advanced).weight).toBe(40);
  });

  it('moves it too when the home sessions between stop short of the top of their reps', () => {
    const gymAt = (daysAgo: number) => plain(daysAgo, incline, [10, 10, 10], 35, [6, 10], 1);
    // 27 of the 26-30 the push asked: inside its range, not the top, and still short of the effort.
    const homeAt = (daysAgo: number) =>
      pushedSession(
        daysAgo,
        incline,
        [27, 27, 27],
        { at: 20, reps: [26, 30] },
        { weight: 35, reps: [6, 10] },
      );
    const history = [gymAt(2), homeAt(5), gymAt(9), homeAt(12), gymAt(16)];
    expect(nextOf(incline, 'primary-hypertrophy', history, advanced).weight).toBe(40);
  });
});

describe('the finish summary and the next target agree on a pushed set', () => {
  const asked = { weight: 30, reps: [6, 10] as [number, number] };
  const shown = { at: 20, reps: [25, 29] as [number, number] };
  const line = (done: WorkoutRecord, before: WorkoutRecord[]) =>
    sessionFeedback(done, before, profile).find((text) =>
      text.startsWith('Incline Dumbbell Press:'),
    );

  it('grades the top or the inside of the range as on target, as the next target reads it', () => {
    const before = plain(4, incline, [10, 10], 30, [6, 10]);
    // The plan showed 20 lb × 25-29; the lifter took the 25s for 18, which the rules read as 30.
    const other = pushedSession(0, incline, [18, 18, 18], shown, asked, 25);
    expect(nextOf(incline, 'primary-hypertrophy', [other, before]).evidence).toContain(
      'Top of the range on every set: add 5 lb and work back up the range.',
    );
    expect(line(other, [before])).toBe('Incline Dumbbell Press: on target at 25 lb × 18.');
    // The lifter took the 30s for 8: inside the range asked.
    const heavy = pushedSession(0, incline, [8, 8, 8], shown, asked, 30);
    expect(nextOf(incline, 'primary-hypertrophy', [heavy, before]).evidence).toContain(
      'Inside the range: same load, one more rep per set.',
    );
    expect(line(heavy, [before])).toBe('Incline Dumbbell Press: on target at 30 lb × 8.');
  });

  it('grades a miss as short, and never says what a missed session stood in for', () => {
    const before = pushedSession(4, incline, [27, 27], shown, asked);
    // The 15s for 29: the rules read 14 reps at 20 lb, under the floor.
    const lighter = pushedSession(0, incline, [29, 29, 29], shown, asked, 15);
    const next = nextOf(incline, 'primary-hypertrophy', [lighter, before]);
    expect(next.evidence).toContain(
      'Missed the floor last time; one session is not a trend, so repeat the load.',
    );
    expect(next.evidence.join(' ')).not.toMatch(/stood in for/);
    expect(line(lighter, [before])).toBe(
      'Incline Dumbbell Press: short, 3 of 3 sets with reps under the floor. Hold the load next time.',
    );
  });
});

describe('a weight the coach sets on a lift the light dumbbells pushed', () => {
  // Five gym sessions at 30 lb × 8 with 3 in reserve: a stall, sets ending too easy.
  const history = [3, 6, 9, 12, 15].map((daysAgo) =>
    plain(daysAgo, incline, [8, 8, 8], 30, [6, 10], 3),
  );

  it('takes the reps its push gives at the new weight, and keeps what it stands in for', () => {
    const workout = plan(lightHome, history);
    const fatigue = interpretFatigue(history, NOW, null);
    const input: CoachInput = {
      workout,
      status: 'preview',
      duration: 'default',
      completed: emptyCompleted(),
      constraints: emptyConstraints(),
      profile,
      history,
      now: NOW,
      fatigue,
      strategy: analyzeStrategy({ history, profile, now: NOW, fatigue }),
      lastExportAt: NOW,
      workoutCount: history.length,
      location: lightHome,
    };
    const take = gatherSignals(input).find((signal) => signal.source === 'stall: undershooting');
    expect(take?.action).toMatchObject({ kind: 'recalibrate', label: 'Take 25 lb today' });
    if (take?.action?.kind !== 'recalibrate') throw new Error('no action');
    const after = act(lightHome, workout, none, take.action.trigger, { history });
    // 25-29 reps were the effort at 20 lb for 30 lb × 6-10; at 25 lb that effort is 14-18.
    for (const set of working(after, incline)) {
      expect([set.targetWeight, set.targetReps, set.asked]).toEqual([
        25,
        [14, 18],
        { weight: 30, reps: [6, 10] },
      ]);
    }
  });

  it('keeps its reps and what it stands in for when the weight comes down', () => {
    const workout = plan(lightHome);
    const lift = entryFor(workout, incline);
    const shown = working(workout, incline).map((set) => set.targetReps);
    const after = act(lightHome, workout, none, {
      type: 'target-weight',
      entryId: lift.id,
      weight: 15,
    });
    const sets = working(after, incline);
    expect(sets.map((set) => set.targetReps)).toEqual(shown);
    for (const set of sets) {
      expect([set.targetWeight, set.asked]).toEqual([15, { weight: 30, reps: [6, 10] }]);
    }
  });
});

describe('a lift started at a light home, when the place changes', () => {
  it('goes on at the load asked where the weights make it, and back at home is pushed again', () => {
    const workout = plan(lightHome);
    const lift = entryFor(workout, incline);
    const pushed = toCome(lift, logThrough(lift, 1)).map((set) => [
      set.targetWeight,
      set.targetReps,
    ]);
    const completed = logThrough(lift, 1);
    // The lifter moves to the gym after the first set: its dumbbells make 30 lb.
    const atGym = act(gym, workout, completed, { type: 'location' });
    expect(
      toCome(entryFor(atGym, incline), completed).map((set) => [set.targetWeight, set.targetReps]),
    ).toEqual([
      [30, [6, 10]],
      [30, [6, 10]],
    ]);
    // And back home again: the sets are pushed as they were.
    const back = act(lightHome, atGym, completed, { type: 'location' });
    const again = toCome(entryFor(back, incline), completed);
    expect(again.map((set) => [set.targetWeight, set.targetReps])).toEqual(pushed);
    for (const set of again) expect(set.asked).toEqual({ weight: 30, reps: [6, 10] });
  });
});

describe('a pushed set autoregulation moved, when its own weights change', () => {
  it('stays as autoregulation left it where the new weights land on its weight', () => {
    const workout = plan(lightHome);
    const lift = entryFor(workout, incline);
    const completed = logThrough(lift, 1);
    const first = completed.sets.at(-1);
    if (!first) throw new Error('nothing logged');
    const down = act(lightHome, workout, completed, {
      type: 'performance',
      entryId: lift.id,
      setIndex: first.setIndex,
      actualReps: 15,
      actualWeight: 20,
      plan: { kind: 'weight', delta: -5, reason: 'A grind: the next sets come down.' },
    });
    const moved = toCome(entryFor(down, incline), completed);
    // The 20s leave the list: the heaviest weight is now the 15s the sets already use.
    const after = act(at({ from: 5, to: 15, step: 5 }), down, completed, { type: 'loading' });
    const rest = toCome(entryFor(after, incline), completed);
    expect(rest.map((set) => [set.targetWeight, set.targetReps, set.asked])).toEqual(
      moved.map((set) => [15, set.targetReps, { weight: 30, reps: [6, 10] }]),
    );
  });
});

describe('in-session autoregulation on a pushed set', () => {
  // 20 lb × 25-29 shown, standing in for 30 lb × 6-10.
  const shown: SetPrescription = {
    index: 1,
    kind: 'working',
    targetReps: [25, 29],
    targetRir: 2,
    targetWeight: 20,
    restSeconds: 90,
    asked: { weight: 30, reps: [6, 10] },
  };
  const decide = (reps: number, weight: number) =>
    autoregulate({
      set: outcomeFor(shown, { reps, rir: 2, weight }),
      earlier: [],
      step: 5,
      remaining: 2,
      setNumber: 1,
      units: 'lb',
    });

  it('reads a set lifted at the load asked against the range asked', () => {
    // 30 lb × 8 is inside 6-10: nothing to change, and no "the next sets come down".
    expect(decide(8, 30).kind).toBe('none');
  });

  it('still reads a set lifted at the weight shown against the reps shown', () => {
    expect(decide(8, 20)).toMatchObject({ kind: 'weight', delta: -5 });
  });
});

describe('the re-check of the fourth review', () => {
  const started = (entryId: string): CompletedWork => ({
    ...emptyCompleted(),
    startedAt: NOW,
    elapsedSeconds: 60,
    currentEntryId: entryId,
  });
  const gymHistory = [plain(3, incline, [8, 8, 8], 30, [6, 10])];

  it('fits the lift in front, not started, to the weights at a new place', () => {
    // At the gym the incline is up next at 30 lb; the lifter moves home before starting it.
    const workout = plan(gym, gymHistory);
    const lift = entryFor(workout, incline);
    const home = act(
      lightHome,
      workout,
      started(lift.id),
      { type: 'location' },
      {
        history: gymHistory,
      },
    );
    for (const set of working(home, incline)) {
      expect(set.targetWeight).toBe(20);
      expect(set.asked?.weight).toBe(30);
    }
    // And back at the gym it goes back to 30 lb.
    const back = act(
      gym,
      home,
      started(lift.id),
      { type: 'location' },
      {
        history: gymHistory,
      },
    );
    for (const set of working(back, incline)) {
      expect([set.targetWeight, set.asked]).toEqual([30, undefined]);
    }
  });

  it('fits a pinned lift not started to the weights at a new place', () => {
    const workout = plan(gym, gymHistory);
    const lift = entryFor(workout, incline);
    lift.pinned = true;
    lift.locked = true;
    const first = allEntries(workout.blocks)[0];
    if (!first) throw new Error('no lift');
    const home = act(
      lightHome,
      workout,
      started(first.id),
      { type: 'location' },
      {
        history: gymHistory,
      },
    );
    for (const set of working(home, incline)) expect(set.targetWeight).toBeLessThanOrEqual(20);
  });

  it('counts the time the sets take after a change of place or of weights', () => {
    const workout = plan(lightHome);
    const lift = entryFor(workout, incline);
    const completed = logThrough(lift, 1);
    const isDone = (entryId: string, setIndex: number) =>
      completed.sets.some((set) => set.entryId === entryId && set.setIndex === setIndex);
    const estimated = (after: GeneratedWorkout) =>
      Math.round(
        estimateWorkout(after.blocks, after.warmup.generalMinutes, requireExercise, isDone)
          .totalMinutes,
      );
    const atGym = act(gym, workout, completed, { type: 'location' });
    expect(atGym.duration.estimatedMinutes).toBe(estimated(atGym));
    const lighter = act(at({ from: 5, to: 15, step: 5 }), workout, completed, { type: 'loading' });
    expect(lighter.duration.estimatedMinutes).toBe(estimated(lighter));
  });

  it('keeps what reps set by hand stand in for when a lift under way moves to a lighter place', () => {
    const workout = plan(gym, gymHistory);
    const own = act(
      gym,
      workout,
      none,
      {
        type: 'rep-range',
        entryId: entryFor(workout, incline).id,
        reps: [8, 10],
      },
      { history: gymHistory },
    );
    const lift = entryFor(own, incline);
    const completed = logThrough(lift, 1);
    const home = act(lightHome, own, completed, { type: 'location' }, { history: gymHistory });
    const rest = toCome(entryFor(home, incline), completed);
    for (const set of rest) {
      expect([set.targetWeight, set.targetReps, set.asked]).toEqual([
        20,
        [8, 10],
        { weight: 30, reps: [8, 10] },
      ]);
    }
    // Logged there at the top of 8-10, the next target holds the 30 lb it stood in for.
    const done = savedWith(home, incline, 10);
    expect(nextOf(incline, 'primary-hypertrophy', [done, ...gymHistory]).weight).toBe(30);
    // Back where 30 lb is made, the sets go back to the 30 lb the reps were set at (Maintenance
    // 23, the ninth pass), and no line says the heaviest weight here is 20 lb.
    const back = entryFor(act(gym, home, completed, { type: 'location' }), incline);
    expect(toCome(back, completed).map((set) => [set.targetWeight, set.asked])).toEqual([
      [30, undefined],
      [30, undefined],
    ]);
    expect(back.progression?.capped).toBeUndefined();
    expect(back.progression?.evidence.join(' ')).not.toMatch(/heaviest weight here \(20/);
  });

  it('keeps reps set by hand when the coach raises the weight', () => {
    const workout = plan(lightHome);
    const own = act(lightHome, workout, none, {
      type: 'rep-range',
      entryId: entryFor(workout, incline).id,
      reps: [12, 15],
    });
    const after = act(lightHome, own, none, {
      type: 'target-weight',
      entryId: entryFor(own, incline).id,
      weight: 25,
    });
    for (const set of working(after, incline)) {
      expect([set.targetWeight, set.targetReps, set.asked]).toEqual([
        25,
        [12, 15],
        { weight: 30, reps: [6, 10] },
      ]);
    }
  });

  it('keeps reps set by hand when autoregulation moves the rest up past the load asked', () => {
    const gap = at({ from: 5, to: 25, step: 5 }, { from: 35, to: 35, step: 5 });
    const workout = plan(gap);
    const own = act(gap, workout, none, {
      type: 'rep-range',
      entryId: entryFor(workout, incline).id,
      reps: [10, 12],
    });
    const lift = entryFor(own, incline);
    const completed = logThrough(lift, 1);
    const first = completed.sets.at(-1);
    if (!first) throw new Error('nothing logged');
    const up = act(gap, own, completed, {
      type: 'performance',
      entryId: lift.id,
      setIndex: first.setIndex,
      actualReps: 16,
      actualWeight: 25,
      plan: { kind: 'weight', delta: 10, reason: 'Easy: the next sets go up.' },
    });
    for (const set of toCome(entryFor(up, incline), completed)) {
      expect([set.targetWeight, set.targetReps, set.asked]).toEqual([35, [10, 12], undefined]);
    }
  });

  it('keeps the step rule through a move to the gym and back, mid-lift', () => {
    const gap = at({ from: 5, to: 30, step: 5 }, { from: 40, to: 40, step: 5 });
    const history = [plain(3, incline, [10, 10, 10], 30, [6, 10])];
    const workout = plan(gap, history);
    const completed = logThrough(entryFor(workout, incline), 1);
    const atGym = act(gym, workout, completed, { type: 'location' }, { history });
    const back = act(gap, atGym, completed, { type: 'location' }, { history });
    for (const set of toCome(entryFor(back, incline), completed)) {
      expect([set.targetWeight, set.targetReps, set.asked]).toEqual([30, [8, 12], undefined]);
    }
  });

  it('times reps set by hand at the heaviest weight here as that weight is timed', () => {
    const workout = plan(lightHome);
    const lift = entryFor(workout, incline);
    const own = entryFor(
      act(lightHome, workout, none, { type: 'rep-range', entryId: lift.id, reps: [10, 12] }),
      incline,
    );
    const set = own.sets.find((candidate) => candidate.kind === 'working');
    if (!set || !own.progression?.capped) throw new Error('not held at the heaviest weight');
    // The slower tempo of the heaviest weight, as for any set not run to its effort.
    expect(workSecondsFor(own, set)).toBeGreaterThan(workSecondsFor({ ...own, manual: {} }, set));
  });

  it('never calls reps set by hand a set run to its effort', () => {
    const workout = plan(lightHome);
    const lift = entryFor(workout, incline);
    expect(entryPushedToEffort(lift)).toBe(true);
    const own = entryFor(
      act(lightHome, workout, none, { type: 'rep-range', entryId: lift.id, reps: [10, 12] }),
      incline,
    );
    expect(entryPushedToEffort(own)).toBe(false);
  });
});

describe('a miss run with pushes short of the effort between', () => {
  const bench = 'dumbbell-bench-press';
  const gymMiss = (daysAgo: number) => plain(daysAgo, bench, [3, 3, 3], 60, [4, 6], 0);
  // The home stops at 50 lb: 50 lb × 8 met the 6-8 it showed for 60 lb × 4-6.
  const homeMet = (daysAgo: number) =>
    pushedSession(
      daysAgo,
      bench,
      [8, 8, 8],
      { at: 50, reps: [6, 8] },
      { weight: 60, reps: [4, 6] },
      50,
      2,
    );

  it('still deloads a lifter who misses at the gym between sessions at home', () => {
    const next = nextOf(bench, 'primary-strength', [gymMiss(2), homeMet(4), gymMiss(6)]);
    expect(next).toMatchObject({ mode: 'deload', weight: 55 });
  });

  it('deloads from the load asked when the last session met its reps at home', () => {
    const next = nextOf(bench, 'primary-strength', [homeMet(1), gymMiss(2), gymMiss(6)]);
    expect(next).toMatchObject({ mode: 'deload', weight: 55 });
  });
});
