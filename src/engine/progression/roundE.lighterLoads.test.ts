import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { DUMBBELLS_KEY, loadingFor, type LoadingRange } from '../loading/loading';
import { record } from '../../test/records';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { CompletedWork, RecalibrationTrigger } from '../recalibration/types';
import { emptyMaxes, recordMax, type StrengthMaxes } from './maxes';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { capTarget, rackFit, WELL_SHORT, type NextTarget } from './progression';
import { restCategory } from './roles';

/**
 * Maintenance 23, the owner's item 21: at weights well short of the target (more than 10%
 * lighter, mostly light dumbbells at home), a muscle-building set runs to its reps in reserve
 * instead of stopping three reps on. A strength set keeps the old rule, and so does a set 10%
 * light or less (docs/research/lighter-loads.md).
 */

const NOW = '2026-09-24T12:00:00.000Z';
const home = createDefaultLocations({ gymAccess: true }, NOW).find((place) => place.id === 'home');
if (!home) throw new Error('no home');
const profile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const curl = requireExercise('dumbbell-curl');

const dumbbells = (...ranges: LoadingRange[]) =>
  loadingFor({ [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges } }, undefined, curl, 'lb');
/** Dumbbells to 40, then a jump to 60: nothing between. */
const gapAt40 = dumbbells({ from: 5, to: 40, step: 5 }, { from: 60, to: 60, step: 5 });
/** Dumbbells to 45, then 60: 45 is exactly 10% under 50. */
const gapAt45 = dumbbells({ from: 5, to: 45, step: 5 }, { from: 60, to: 60, step: 5 });
/** The heaviest pair is 40. */
const topAt40 = dumbbells({ from: 5, to: 40, step: 5 });
const topAt45 = dumbbells({ from: 5, to: 45, step: 5 });
const topAt20 = dumbbells({ from: 5, to: 20, step: 5 });

function target(weight: number, reps: [number, number], rir: number, hold = false): NextTarget {
  return {
    weight,
    reps,
    rir,
    mode: 'weight',
    increment: 5,
    sessions: 3,
    viaFamily: false,
    confidence: 'high',
    evidence: ['Top of the range: add 5 lb.'],
    setsAdvice: 0,
    from: null,
    ...(hold ? { hold: true } : {}),
  };
}

describe('the weights here make less than asked', () => {
  it('runs a muscle-building set well short of its load to its reserve', () => {
    expect(WELL_SHORT).toBe(0.9);
    expect(rackFit(50, [8, 12], gapAt40, 'lb', false, 2)).toEqual({
      asked: 50,
      loaded: 40,
      extra: 10,
      missing: false,
      line: 'The weights here make 40, not 50 lb: about 10 more reps, to 2 in reserve.',
    });
    // At no reps in reserve, to the last clean rep.
    expect(rackFit(50, [12, 15], gapAt40, 'lb', false, 0)).toMatchObject({
      extra: 11,
      line: 'The weights here make 40, not 50 lb: about 11 more reps, to the last clean rep.',
    });
  });

  it('never asks past thirty reps, and then promises no reserve', () => {
    const light = dumbbells({ from: 5, to: 20, step: 5 }, { from: 60, to: 60, step: 5 });
    // 2 in reserve at 20 lb would take far more than 30 reps: the set stops at 30, short of it.
    expect(rackFit(50, [12, 20], light, 'lb', false, 2)).toMatchObject({
      loaded: 20,
      extra: 10,
      line: 'The weights here make 20, not 50 lb: about 10 more reps, up to 30.',
    });
    expect(capTarget(target(50, [12, 20], 2), topAt20, 'lb', 'isolation')).toMatchObject({
      reps: [22, 30],
      evidence: [
        'Top of the range: add 5 lb.',
        'Held at the heaviest weight here (20 lb): about 10 more reps, up to 30.',
      ],
    });
    expect(rackFit(50, [25, 30], gapAt40, 'lb', false, 2)).toMatchObject({
      extra: 0,
      line: 'The weights here make 40, not 50 lb: the reps are already at the top.',
    });
  });

  it('keeps a strength set to one to three extra reps', () => {
    expect(rackFit(50, [8, 12], gapAt40, 'lb', false, null)).toMatchObject({
      loaded: 40,
      extra: 3,
      line: 'The weights here make 40, not 50 lb: three extra reps.',
    });
    // The default is a strength set's rule.
    expect(rackFit(50, [8, 12], gapAt40, 'lb')).toMatchObject({ extra: 3 });
  });

  it('keeps a set 10% light or less to the old rule', () => {
    expect(rackFit(50, [8, 12], gapAt45, 'lb', false, 2)).toMatchObject({
      loaded: 45,
      extra: 3,
      line: 'The weights here make 45, not 50 lb: three extra reps.',
    });
  });

  it('leaves a hold’s seconds alone', () => {
    expect(rackFit(50, [30, 45], gapAt40, 'lb', true, 2)).toMatchObject({
      loaded: 40,
      extra: 0,
      line: 'The weights here make 40, not 50 lb.',
    });
  });
});

describe('a target past the heaviest weight here', () => {
  it('runs a muscle-building set well short of it to its reserve', () => {
    const fitted = capTarget(target(50, [8, 12], 2), topAt40, 'lb', 'isolation');
    expect(fitted.weight).toBe(40);
    expect(fitted.reps).toEqual([18, 22]);
    expect(fitted.capped).toEqual({ at: 40 });
    expect(fitted.evidence.at(-1)).toBe(
      'Held at the heaviest weight here (40 lb): about 10 more reps, to 2 in reserve.',
    );
    // Every muscle-building role does the same.
    for (const role of ['primary-hypertrophy', 'secondary-hypertrophy', 'finisher'] as const) {
      expect(capTarget(target(50, [8, 12], 2), topAt40, 'lb', role).reps).toEqual([18, 22]);
    }
  });

  it('keeps the old rule for a strength set, a set 10% light or less, and a hold', () => {
    for (const role of ['primary-strength', 'secondary-strength', undefined] as const) {
      const fitted = capTarget(target(50, [8, 12], 2), topAt40, 'lb', role);
      expect(fitted.reps).toEqual([10, 14]);
      expect(fitted.evidence.at(-1)).toBe(
        'Held at the heaviest weight here (40 lb): the reps go up instead.',
      );
    }
    const close = capTarget(target(50, [8, 12], 2), topAt45, 'lb', 'isolation');
    expect(close.reps).toEqual([10, 14]);
    expect(close.evidence.at(-1)).toBe(
      'Held at the heaviest weight here (45 lb): the reps go up instead.',
    );
    const hold = capTarget(target(50, [30, 45], 2, true), topAt40, 'lb', 'isolation');
    expect(hold.reps).toEqual([30, 45]);
    expect(hold.evidence.at(-1)).toBe('Held at the heaviest weight here (40 lb).');
  });

  it('fits a gap in the weights the same way', () => {
    const fitted = capTarget(target(50, [8, 12], 2), gapAt40, 'lb', 'isolation');
    expect(fitted.weight).toBe(40);
    expect(fitted.reps).toEqual([18, 22]);
    expect(fitted.rack?.line).toBe(
      'The weights here make 40, not 50 lb: about 10 more reps, to 2 in reserve.',
    );
    expect(capTarget(target(50, [8, 12], 2), gapAt40, 'lb', 'primary-strength').reps).toEqual([
      11, 15,
    ]);
  });
});

/** Home, with dumbbells from 5 to 20 lb. */
const lightHome: LocationProfile = {
  ...home,
  loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 20, step: 5 }] } },
};

describe('a planned workout at light dumbbells', () => {
  it('says how far each capped set goes, by its role', () => {
    const workout = generateWorkout({
      profile,
      location: lightHome,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    let effort = 0;
    let strength = 0;
    for (const entry of allEntries(workout.blocks)) {
      const at = entry.progression?.capped?.at;
      if (at === undefined) continue;
      const working = entry.sets.filter((set) => set.kind === 'working');
      const line = entry.progression?.evidence.at(-1) ?? '';
      if (restCategory(entry.role) === 'strength') {
        strength += 1;
        expect(line).toMatch(/: the reps go up instead\.$/);
      } else if (line.includes('in reserve') || line.includes('last clean rep')) {
        effort += 1;
        const rir = working[0]?.targetRir ?? -1;
        expect(line).toMatch(
          rir === 0
            ? /^Held at the heaviest weight here \(20 lb\): about \d+ more reps?, to the last clean rep\.$/
            : new RegExp(
                `^Held at the heaviest weight here \\(20 lb\\): about \\d+ more reps?, to ${rir} in reserve\\.$`,
              ),
        );
      }
      for (const set of working) {
        expect(set.targetWeight).toBe(20);
        expect(set.targetReps[1]).toBeLessThanOrEqual(30);
      }
    }
    expect(strength).toBeGreaterThan(0);
    expect(effort).toBeGreaterThan(0);
    // The owner's incline press: 30 lb asked, 20 lb here, 6-10 reps at one in reserve.
    const incline = allEntries(workout.blocks).find(
      (entry) => entry.exerciseId === 'incline-dumbbell-press',
    );
    expect(incline?.progression?.evidence.at(-1)).toBe(
      'Held at the heaviest weight here (20 lb): about 19 more reps, to 1 in reserve.',
    );
    expect(incline?.sets.find((set) => set.kind === 'working')?.targetReps).toEqual([25, 29]);
  });
});

/** The home lower day with one lift's working sets asking 50 lb and its first one logged. */
function startedAtFifty(exerciseId: string): {
  workout: GeneratedWorkout;
  completed: CompletedWork;
  lift: WorkoutEntry;
} {
  const workout = generateWorkout({
    profile,
    location: home,
    history: [],
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'lower' },
  });
  const lift = allEntries(workout.blocks).find((entry) => entry.exerciseId === exerciseId);
  if (!lift) throw new Error(`no ${exerciseId}`);
  lift.sets = lift.sets.map((set) => (set.kind === 'working' ? { ...set, targetWeight: 50 } : set));
  const firstWorking = lift.sets.findIndex((set) => set.kind === 'working');
  const completed: CompletedWork = {
    ...emptyCompleted(),
    startedAt: NOW,
    elapsedSeconds: 10 * 60,
    currentEntryId: lift.id,
    sets: lift.sets.slice(0, firstWorking + 1).map((set) => ({
      entryId: lift.id,
      exerciseId: lift.exerciseId,
      setIndex: set.index,
      kind: set.kind,
      reps: 8,
      weight: set.targetWeight,
      rir: 2,
      completedAt: NOW,
    })),
  };
  return { workout, completed, lift };
}

function weightsChanged(
  workout: GeneratedWorkout,
  completed: CompletedWork,
  location: LocationProfile,
): GeneratedWorkout {
  const result = recalibrate({
    trigger: { type: 'loading' },
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: workout.duration.choice,
    profile: { ...profile, currentLocationId: 'home' },
    location,
    history: [],
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return result.workout;
}

const gapHome: LocationProfile = {
  ...home,
  loading: {
    [DUMBBELLS_KEY]: {
      kind: 'dumbbells',
      ranges: [
        { from: 5, to: 40, step: 5 },
        { from: 60, to: 60, step: 5 },
      ],
    },
  },
};

const still = (workout: GeneratedWorkout, lift: WorkoutEntry, completed: CompletedWork) => {
  const after = allEntries(workout.blocks).find((entry) => entry.id === lift.id);
  if (!after) throw new Error(lift.id);
  const remaining = after.sets.filter(
    (set) => set.kind === 'working' && !completed.sets.some((done) => done.setIndex === set.index),
  );
  expect(remaining.length).toBeGreaterThan(0);
  return { after, remaining };
};

describe('the weights change in the middle of an exercise', () => {
  it('runs a started muscle-building lift to its reserve, and back once they return', () => {
    const { workout, completed, lift } = startedAtFifty('dumbbell-romanian-deadlift');
    expect(lift.role).toBe('primary-hypertrophy');
    const lighter = weightsChanged(workout, completed, gapHome);
    const { after, remaining } = still(lighter, lift, completed);
    for (const set of remaining) {
      expect(set.targetWeight).toBe(40);
      expect(set.targetReps).toEqual([16, 20]);
    }
    expect(after.progression?.rack?.line).toBe(
      'The weights here make 40, not 50 lb: about 10 more reps, to 1 in reserve.',
    );
    // The logged set is as it was.
    const logged = after.sets.find((set) => set.index === completed.sets.at(-1)?.setIndex);
    expect(logged?.targetWeight).toBe(50);
    // Back at the full set of weights, the lift asks what it did before.
    const back = still(weightsChanged(lighter, completed, home), lift, completed);
    for (const set of back.remaining) {
      expect(set.targetWeight).toBe(50);
      expect(set.targetReps).toEqual([6, 10]);
    }
    expect(back.after.progression?.rack).toBeUndefined();
  });

  it('keeps a started strength lift to three extra reps', () => {
    const { workout, completed, lift } = startedAtFifty('goblet-squat');
    expect(restCategory(lift.role)).toBe('strength');
    const { after, remaining } = still(
      weightsChanged(workout, completed, gapHome),
      lift,
      completed,
    );
    for (const set of remaining) {
      expect(set.targetWeight).toBe(40);
      expect(set.targetReps).toEqual([11, 18]);
    }
    expect(after.progression?.rack?.line).toBe(
      'The weights here make 40, not 50 lb: three extra reps.',
    );
  });
});

/** An effort line at the 20 lb dumbbells, for a set at `rir` in reserve. */
/** An effort line at the 20 lb dumbbells: to the reserve, or up to 30 when that takes more. */
const effortAt20 = (rir: number) =>
  new RegExp(
    `^Held at the heaviest weight here \\(20 lb\\): about \\d+ more reps?, (to ${
      rir === 0 ? 'the last clean rep' : `${rir} in reserve`
    }|up to 30)\\.$`,
  );

/** The home push day, planned with the full set of dumbbells. */
function pushDay(): GeneratedWorkout {
  return generateWorkout({
    profile,
    location: home!,
    history: [],
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
}

function atLightHome(
  workout: GeneratedWorkout,
  trigger: RecalibrationTrigger,
  extra: {
    completed?: CompletedWork;
    history?: ReturnType<typeof record>[];
    maxes?: StrengthMaxes;
  } = {},
) {
  const completed = extra.completed ?? emptyCompleted();
  const result = recalibrate({
    trigger,
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: workout.duration.choice,
    profile: { ...profile, currentLocationId: 'home' },
    location: lightHome,
    history: extra.history ?? [],
    maxes: extra.maxes ?? null,
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return result.workout;
}

const entryFor = (workout: GeneratedWorkout, exerciseId: string) => {
  const found = allEntries(workout.blocks).find((entry) => entry.exerciseId === exerciseId);
  if (!found) throw new Error(exerciseId);
  return found;
};

const workingOf = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');

describe('every other way a target is set in a workout', () => {
  it('the weights changing before an exercise starts', () => {
    const workout = pushDay();
    const first = allEntries(workout.blocks)[0]!;
    const firstWorking = first.sets.findIndex((set) => set.kind === 'working');
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 5 * 60,
      currentEntryId: first.id,
      sets: first.sets.slice(0, firstWorking + 1).map((set) => ({
        entryId: first.id,
        exerciseId: first.exerciseId,
        setIndex: set.index,
        kind: set.kind,
        reps: 5,
        weight: set.targetWeight,
        rir: 2,
        completedAt: NOW,
      })),
    };
    const after = atLightHome(workout, { type: 'loading' }, { completed });
    const incline = entryFor(after, 'incline-dumbbell-press');
    expect(incline.progression?.evidence.at(-1)).toBe(
      'Held at the heaviest weight here (20 lb): about 19 more reps, to 1 in reserve.',
    );
    expect(workingOf(incline)[0]?.targetReps).toEqual([25, 29]);
  });

  it('a swap into a lift the dumbbells here fall well short of', () => {
    // Dumbbell flyes at 45 lb for 12s elsewhere: 50 lb is next, and home stops at 20.
    const history = [
      record(
        3,
        'dumbbell-fly',
        [
          [15, 45, 1],
          [15, 45, 1],
          [15, 45, 1],
        ],
        [10, 15],
        1,
      ),
    ];
    const workout = pushDay();
    const fly = entryFor(workout, 'band-fly');
    const after = atLightHome(
      workout,
      { type: 'replace', entryId: fly.id, exerciseId: 'dumbbell-fly' },
      { history },
    );
    const swapped = entryFor(after, 'dumbbell-fly');
    const rir = workingOf(swapped)[0]?.targetRir ?? -1;
    expect(swapped.progression?.evidence.at(-1)).toMatch(effortAt20(rir));
    expect(workingOf(swapped).every((set) => set.targetWeight === 20)).toBe(true);
    expect(workingOf(swapped)[0]!.targetReps[1]).toBeLessThanOrEqual(30);
  });

  it('a max entered for a lift', () => {
    const workout = pushDay();
    const maxes = recordMax(
      emptyMaxes(),
      'incline-dumbbell-press',
      { kind: 'max', e1rm: 60 },
      'lb',
      NOW,
    );
    const after = atLightHome(
      workout,
      { type: 'max', exerciseId: 'incline-dumbbell-press' },
      { maxes },
    );
    const incline = entryFor(after, 'incline-dumbbell-press');
    expect(incline.progression?.evidence.at(-1)).toMatch(effortAt20(1));
    expect(workingOf(incline)[0]!.targetReps[1]).toBeLessThanOrEqual(30);
  });
});
