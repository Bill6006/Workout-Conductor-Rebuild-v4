import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { RecalibrationTrigger } from '../recalibration/types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyMaxes, recordMax } from './maxes';
import { buildSets, easyWarmupReps, prescribe, rampSetsFor } from './roles';
import { hasNoLoad } from './startingLoad';

/**
 * Maintenance 23, the owner's item 22 (docs/research/bodyweight-warm-ups.md): a lift with no
 * load gets at most one warm-up set, of a few easy reps, about a third to a half of the bottom of
 * the working range and never more than the working sets ask. The same rule holds when the plan
 * is built, when "+ Ramp set" adds one, and when the working range is edited.
 */

const NOW = '2026-09-24T12:00:00.000Z';
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const profile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const chinUp = requireExercise('chin-up');
const bench = requireExercise('barbell-bench-press');

describe('a few easy reps', () => {
  it('is a third to a half of the bottom of the working range', () => {
    const table: [[number, number], [number, number]][] = [
      [
        [6, 12],
        [2, 3],
      ],
      [
        [3, 6],
        [1, 1],
      ],
      [
        [5, 10],
        [2, 2],
      ],
      [
        [8, 12],
        [3, 4],
      ],
      [
        [12, 20],
        [4, 6],
      ],
      [
        [1, 2],
        [1, 1],
      ],
    ];
    for (const [working, easy] of table) {
      expect([working, easyWarmupReps(working)]).toEqual([working, easy]);
      // Never more than the working sets ask.
      expect(easyWarmupReps(working)[1]).toBeLessThanOrEqual(working[0]);
    }
  });

  it('is what a lift with no load warms up with; a loaded lift keeps its ramp', () => {
    const rx = prescribe(chinUp, 'primary-hypertrophy', profile);
    const easy = buildSets(rx, 1, chinUp).find((set) => set.kind === 'warmup');
    expect(easy?.targetReps).toEqual(easyWarmupReps(rx.reps));
    const benchRx = prescribe(bench, 'primary-strength', profile);
    const ramps = buildSets(benchRx, 2, bench).filter((set) => set.kind === 'warmup');
    expect(ramps).toHaveLength(2);
    for (const ramp of ramps) {
      expect(ramp.targetReps).toEqual([Math.max(3, benchRx.reps[0]), Math.max(5, benchRx.reps[1])]);
    }
    // Without the exercise, the old ramp.
    expect(buildSets(rx, 1).find((set) => set.kind === 'warmup')?.targetReps).toEqual([
      Math.max(3, rx.reps[0]),
      Math.max(5, rx.reps[1]),
    ]);
  });

  it('comes in one set, never two, however long the workout', () => {
    for (const minutes of [15, 30, 45, 60, 90]) {
      expect(rampSetsFor(chinUp, 'primary-strength', minutes)).toBeLessThanOrEqual(1);
    }
    expect(rampSetsFor(chinUp, 'primary-strength', 60)).toBe(1);
    // A loaded lift still ramps twice in a long workout.
    expect(rampSetsFor(bench, 'primary-strength', 60)).toBe(2);
  });
});

describe('the plan', () => {
  it('gives every lift with no load at most one easy warm-up set', () => {
    let warmed = 0;
    for (const place of [home, gym]) {
      for (const templateId of ['lower', 'push-arms', 'pull-arms', 'upper', 'full-body']) {
        for (const duration of [15, 30, 45, 'default'] as const) {
          const workout = generateWorkout({
            profile,
            location: place,
            history: [],
            now: NOW,
            duration,
            constraints: { templateId },
          });
          for (const entry of allEntries(workout.blocks)) {
            if (!hasNoLoad(requireExercise(entry.exerciseId))) continue;
            const warmups = entry.sets.filter((set) => set.kind === 'warmup');
            const working = entry.sets.filter((set) => set.kind === 'working');
            expect([entry.exerciseId, warmups.length <= 1]).toEqual([entry.exerciseId, true]);
            for (const set of warmups) {
              warmed += 1;
              const floor = Math.min(...working.map((work) => work.targetReps[0]));
              expect(set.targetReps).toEqual(easyWarmupReps([floor, floor]));
              expect(set.targetReps[1]).toBeLessThanOrEqual(floor);
            }
          }
        }
      }
    }
    // The sweep did plan warm-ups at bodyweight.
    expect(warmed).toBeGreaterThan(0);
  });
});

function pullDay(): { workout: GeneratedWorkout; chin: WorkoutEntry } {
  const workout = generateWorkout({
    profile,
    location: home,
    history: [],
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'pull-arms' },
  });
  const chin = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'chin-up');
  if (!chin) throw new Error('no chin-up');
  return { workout, chin };
}

function act(workout: GeneratedWorkout, trigger: RecalibrationTrigger) {
  return recalibrate({
    trigger,
    workout,
    completed: emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: null,
    duration: workout.duration.choice,
    profile: { ...profile, currentLocationId: 'home' },
    location: home,
    history: [],
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: NOW,
  });
}

const find = (workout: GeneratedWorkout, id: string) => {
  const found = allEntries(workout.blocks).find((entry) => entry.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe('warm-ups added or moved by hand', () => {
  it('"+ Ramp set" adds the one easy set, and no second', () => {
    const { workout, chin } = pullDay();
    // Without its planned warm-up, the lift takes one back.
    const bare: GeneratedWorkout = structuredClone(workout);
    const bareChin = find(bare, chin.id);
    bareChin.sets = bareChin.sets.filter((set) => set.kind !== 'warmup');
    bareChin.warmupSets = 0;
    const added = act(bare, { type: 'add-warmup', entryId: chin.id });
    if (!added.ok) throw new Error(added.error);
    const after = find(added.workout, chin.id);
    const working = after.sets.filter((set) => set.kind === 'working');
    expect(after.sets.filter((set) => set.kind === 'warmup')).toEqual([
      expect.objectContaining({ targetReps: easyWarmupReps(working[0]!.targetReps) }),
    ]);
    // A second is refused.
    const again = act(added.workout, { type: 'add-warmup', entryId: chin.id });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe('Chin-Up already has its warm-up set.');
  });

  it('"+ Ramp set" still adds as many as asked to a loaded lift', () => {
    const { workout } = pullDay();
    const row = allEntries(workout.blocks).find(
      (entry) => !hasNoLoad(requireExercise(entry.exerciseId)),
    );
    if (!row) throw new Error('no loaded lift');
    const before = row.sets.filter((set) => set.kind === 'warmup').length;
    const once = act(workout, { type: 'add-warmup', entryId: row.id });
    if (!once.ok) throw new Error(once.error);
    const twice = act(once.workout, { type: 'add-warmup', entryId: row.id });
    if (!twice.ok) throw new Error(twice.error);
    expect(find(twice.workout, row.id).sets.filter((set) => set.kind === 'warmup')).toHaveLength(
      before + 2,
    );
  });

  it('follows the working range when it is edited, up or down', () => {
    const { workout, chin } = pullDay();
    expect(chin.sets.some((set) => set.kind === 'warmup')).toBe(true);
    for (const reps of [
      [3, 5],
      [8, 15],
      [12, 20],
    ] as [number, number][]) {
      const edited = act(workout, { type: 'rep-range', entryId: chin.id, reps });
      if (!edited.ok) throw new Error(edited.error);
      for (const set of find(edited.workout, chin.id).sets) {
        if (set.kind === 'warmup') expect(set.targetReps).toEqual(easyWarmupReps(reps));
        if (set.kind === 'working') expect(set.targetReps).toEqual(reps);
      }
    }
  });
});

describe('warm-ups rebuilt by the engine during a workout', () => {
  /** Every lift with no load in the workout: at most one warm-up, of a few easy reps. */
  const easyEverywhere = (workout: GeneratedWorkout) => {
    let seen = 0;
    for (const entry of allEntries(workout.blocks)) {
      if (!hasNoLoad(requireExercise(entry.exerciseId))) continue;
      const warmups = entry.sets.filter((set) => set.kind === 'warmup');
      const floor = Math.min(
        ...entry.sets.filter((set) => set.kind === 'working').map((set) => set.targetReps[0]),
      );
      expect(warmups.length).toBeLessThanOrEqual(1);
      for (const set of warmups) {
        seen += 1;
        expect([entry.exerciseId, set.targetReps]).toEqual([
          entry.exerciseId,
          easyWarmupReps([floor, floor]),
        ]);
      }
    }
    return seen;
  };

  const gymPull = () =>
    generateWorkout({
      profile,
      location: gym,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'pull-arms' },
    });

  const atGym = (
    workout: GeneratedWorkout,
    trigger: RecalibrationTrigger,
    maxes: ReturnType<typeof emptyMaxes> | null = null,
  ) => {
    const result = recalibrate({
      trigger,
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: workout.duration.choice,
      profile: { ...profile, currentLocationId: 'gym' },
      location: gym,
      history: [],
      maxes,
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    return result.workout;
  };

  it('after a swap, the weights changing, or a max entered for another lift', () => {
    const workout = gymPull();
    expect(easyEverywhere(workout)).toBeGreaterThan(0);
    const chin = allEntries(workout.blocks).find((entry) => entry.exerciseId === 'chin-up');
    if (!chin) throw new Error('no chin-up');
    const swapped = atGym(workout, { type: 'replace', entryId: chin.id, exerciseId: 'pull-up' });
    expect(allEntries(swapped.blocks).some((entry) => entry.exerciseId === 'pull-up')).toBe(true);
    expect(easyEverywhere(swapped)).toBeGreaterThan(0);
    expect(easyEverywhere(atGym(workout, { type: 'loading' }))).toBeGreaterThan(0);
    const maxes = recordMax(emptyMaxes(), 'barbell-row', { kind: 'max', e1rm: 200 }, 'lb', NOW);
    expect(
      easyEverywhere(atGym(workout, { type: 'max', exerciseId: 'barbell-row' }, maxes)),
    ).toBeGreaterThan(0);
  });
});
