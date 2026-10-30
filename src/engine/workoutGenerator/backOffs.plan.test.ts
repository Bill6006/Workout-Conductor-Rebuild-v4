import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import {
  createDefaultProfile,
  type ProgramStyle,
  type UserProfile,
} from '../../core/validation/profile';
import { LoggedExerciseSchema, LoggedSetSchema } from '../../core/validation/workoutRecord';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { buildWorkoutRecord } from '../../core/state/workoutRecordBuilder';
import type { WorkoutSession } from '../../core/state/session';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { emptyMaxes, recordMax } from '../progression/maxes';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from '../recalibration/types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { SetPrescriptionSchema, WorkoutEntrySchema } from '../workout/workoutSchema';
import { generateWorkout, type GenerationConstraints } from './generate';

/**
 * Maintenance 32, the owner's item 11: a main lift planned as a top set and back-offs, read by the
 * progression through its top set alone, kept through every change to the plan, and saved with the
 * set. Synthetic data only.
 */

const gym = createDefaultLocations({ gymAccess: true }, RECORD_NOW).find(
  (place) => place.kind === 'gym',
)!;
const BENCH = 'barbell-bench-press';
const profileOf = (programStyle: ProgramStyle = 'hybrid', extra: Partial<UserProfile> = {}) => ({
  ...createDefaultProfile(RECORD_NOW),
  bodyweight: 185,
  programStyle,
  ...extra,
});
/** Two straight sessions of the bench press at 185, every set clean at 2 in reserve. */
const trained = (): WorkoutRecord[] =>
  [7, 3].map((daysAgo) =>
    record(
      daysAgo,
      BENCH,
      [
        [5, 185, 2],
        [5, 185, 2],
        [5, 185, 2],
      ],
      [4, 6],
      2,
    ),
  );
/**
 * Fatigue high from the sessions' own signs (Maintenance 33: no day count scores): rows the last
 * three days, each logged with nothing in reserve where two were asked, each rated too hard, the
 * last with pain.
 */
const worn = (): WorkoutRecord[] =>
  [3, 2, 1].map((daysAgo) =>
    record(
      daysAgo + 0.5,
      'barbell-row',
      [
        [8, 135, 0],
        [8, 135, 0],
      ],
      [8, 12],
      2,
      { rating: { effort: 'too-hard', pain: daysAgo === 1, energyAfter: 2, note: '' } },
    ),
  );
/** A session on the structure: a top set, then back-offs, `daysAgo`, at a drop. */
function structured(daysAgo: number, top: SetSpec, backOffs: SetSpec[], drop = 0.05) {
  const done = record(daysAgo, BENCH, [top, ...backOffs], [4, 6], 2);
  const entry = done.entries[0]!;
  entry.backOffDrop = drop;
  entry.sets.forEach((set, at) => {
    set.tier = at === 0 ? 'top' : 'back-off';
    set.targetRir = at === 0 ? 1 : 2;
  });
  return done;
}
function plan(
  history: WorkoutRecord[] = trained(),
  profile: UserProfile = profileOf(),
  constraints: GenerationConstraints = {},
): GeneratedWorkout {
  return generateWorkout({
    profile,
    location: gym,
    history,
    now: RECORD_NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms', ...constraints },
  });
}
const bench = (workout: GeneratedWorkout): WorkoutEntry => {
  const found = allEntries(workout.blocks).find((entry) => entry.exerciseId === BENCH);
  if (!found) throw new Error('no bench press');
  return found;
};
/** Each working set: its load, its reserve and its tier. */
const shape = (entry: WorkoutEntry) =>
  entry.sets
    .filter((set) => set.kind === 'working')
    .map((set) => [set.targetWeight, set.targetRir, set.tier ?? 'straight']);

describe('a main lift planned as a top set and back-offs', () => {
  it('under Hybrid, Strength focus and Lean-down: the top set at 1, three back-offs 5% lighter at 2', () => {
    for (const style of ['hybrid', 'strength-focus', 'lean-down'] as const) {
      const entry = bench(plan(trained(), profileOf(style)));
      expect(shape(entry), style).toEqual([
        [190, 1, 'top'],
        [180, 2, 'back-off'],
        [180, 2, 'back-off'],
        [180, 2, 'back-off'],
      ]);
      expect(entry.backOffDrop, style).toBe(0.05);
      // The same reps: the strength range.
      expect(new Set(entry.sets.map((set) => set.targetReps.join('-'))).size, style).toBe(1);
    }
  });

  it('the drop is the last session’s on it', () => {
    const history = [structured(3, [5, 190, 1], [[5, 175, 2]], 0.08)];
    const entry = bench(plan(history));
    expect(entry.backOffDrop).toBe(0.08);
    // 195 less 8% is 179.4: onto the nearest weight on the 5 lb grid (the fifth review of round N).
    expect(shape(entry)[1]).toEqual([180, 2, 'back-off']);
  });

  it('straight sets on a first target, under the other styles, and where the day shapes every set', () => {
    const straight = (entry: WorkoutEntry) =>
      entry.sets.every((set) => set.tier === undefined) && entry.backOffDrop === undefined;
    expect(straight(bench(plan([])))).toBe(true);
    for (const style of ['hypertrophy-focus', 'undulating', 'high-rep', 'foundation'] as const) {
      expect(straight(bench(plan(trained(), profileOf(style)))), style).toBe(true);
    }
    // A deload week.
    const deload = { startsAt: '2026-09-07T00:00:00.000Z', endsAt: '2026-09-14T00:00:00.000Z' };
    expect(straight(bench(plan(trained(), profileOf(), { deload })))).toBe(true);
    // A catch-up: its reserve holds every lift.
    const catchUp = {
      kind: 'catch-up' as const,
      muscles: [{ muscle: 'chest' as const, sets: 3, minRir: 1, why: 'behind' as const }],
      sitOut: [],
    };
    expect(straight(bench(plan(trained(), profileOf(), { catchUp })))).toBe(true);
    // Fatigue high, from the sessions' own signs.
    expect(straight(bench(plan([...trained(), ...worn()], profileOf())))).toBe(true);
    // Days in a row alone are no sign since Maintenance 33: rows five days running, lifted as
    // asked, leave the top set and back-offs.
    const running = [
      ...trained(),
      ...[5, 4, 3, 2, 1].map((daysAgo) =>
        record(daysAgo + 0.5, 'barbell-row', [
          [8, 135, 2],
          [8, 135, 2],
        ]),
      ),
    ];
    expect(straight(bench(plan(running, profileOf())))).toBe(false);
    // The lift to push keeps the push's sets.
    const pushLift = { exerciseId: BENCH, target: 225, units: 'lb' as const, since: RECORD_NOW };
    const pushed = plan(trained(), profileOf('hybrid', { pushLift }));
    const pushEntry = allEntries(pushed.blocks).find((entry) => entry.push !== undefined);
    expect(pushEntry).toBeDefined();
    expect(straight(pushEntry!)).toBe(true);
  });
});

describe('the progression reads the top set alone', () => {
  it('back-offs under their floor never hold back the top set’s step', () => {
    const history = [
      structured(
        3,
        [5, 190, 1],
        [
          [3, 180, 0],
          [3, 180, 0],
          [3, 180, 0],
        ],
      ),
    ];
    const entry = bench(plan(history));
    expect(entry.progression?.mode).toBe('weight');
    expect(shape(entry)[0]).toEqual([195, 1, 'top']);
  });

  it('a top set at no reserve holds the load', () => {
    const history = [structured(3, [5, 190, 0], [[5, 180, 2]])];
    const entry = bench(plan(history));
    expect(shape(entry)[0]).toEqual([190, 1, 'top']);
  });
});

describe('saved with the set', () => {
  it('its tier and its drop, and an unreadable one never costs the set nor the exercise', () => {
    const workout = plan();
    const entry = bench(workout);
    const [top, first] = entry.sets.filter((set) => set.kind === 'working');
    const session = {
      workout,
      constraints: emptyConstraints(),
      completed: {
        ...emptyCompleted(),
        startedAt: RECORD_NOW,
        sets: [top!, first!].map((set) => ({
          entryId: entry.id,
          exerciseId: entry.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: 5,
          weight: set.targetWeight,
          rir: set.targetRir,
          completedAt: RECORD_NOW,
        })),
      },
    } as unknown as WorkoutSession;
    const saved = buildWorkoutRecord(session, {
      now: RECORD_NOW,
      elapsedSeconds: 600,
      rating: null,
      endedEarly: true,
    });
    const logged = saved.entries.find((item) => item.entryId === entry.id)!;
    expect(logged.backOffDrop).toBe(0.05);
    expect(logged.sets.map((set) => set.tier)).toEqual(['top', 'back-off']);
    const base = { kind: 'working', reps: 5, weight: 190, rir: 1 };
    expect(LoggedSetSchema.parse({ ...base, tier: 'top' }).tier).toBe('top');
    expect(LoggedSetSchema.parse({ ...base, tier: 'heavy' }).tier).toBeUndefined();
    expect(LoggedSetSchema.parse({ ...base, tier: 'heavy' }).reps).toBe(5);
    expect(SetPrescriptionSchema.parse({ ...top, tier: 7 }).tier).toBeUndefined();
    expect(SetPrescriptionSchema.parse(top).tier).toBe('top');
    const exercise = { exerciseId: BENCH, sets: [base] };
    expect(LoggedExerciseSchema.parse({ ...exercise, backOffDrop: 0.3 }).backOffDrop).toBe(
      undefined,
    );
    expect(LoggedExerciseSchema.parse({ ...exercise, backOffDrop: 0.3 }).sets).toHaveLength(1);
    const plannedEntry = WorkoutEntrySchema.parse({ ...entry, backOffDrop: 'wide' });
    expect(plannedEntry.backOffDrop).toBeUndefined();
    expect(plannedEntry.exerciseId).toBe(BENCH);
    expect(WorkoutEntrySchema.parse(entry).backOffDrop).toBe(0.05);
    // The ninth review of round N: the load the drop gave the back-offs, and the weight they took
    // by hand, each dropped alone when unreadable.
    expect(LoggedExerciseSchema.parse({ ...exercise, backOffAt: 180 }).backOffAt).toBe(180);
    const unreadAt = LoggedExerciseSchema.parse({ ...exercise, backOffAt: 'heavy' });
    expect(unreadAt.backOffAt).toBeUndefined();
    expect(unreadAt.sets).toHaveLength(1);
    const hand = { ...entry, manual: { weight: true, backOffs: 115 } };
    expect(WorkoutEntrySchema.parse(hand).manual?.backOffs).toBe(115);
    const unreadHand = WorkoutEntrySchema.parse({
      ...hand,
      manual: { weight: true, backOffs: 'x' },
    });
    expect(unreadHand.manual?.backOffs).toBeUndefined();
    expect(unreadHand.manual?.weight).toBe(true);
    expect(unreadHand.exerciseId).toBe(BENCH);
  });
});

describe('through a change to the plan', () => {
  const request = (
    trigger: RecalibrationTrigger,
    workout: GeneratedWorkout,
    options: Partial<RecalibrationRequest> = {},
  ): RecalibrationRequest => ({
    trigger,
    workout,
    completed: emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: null,
    duration: 'default',
    profile: profileOf(),
    location: gym,
    loading: { missingPlates: [] },
    history: trained(),
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: RECORD_NOW,
    ...options,
  });
  const run = (
    trigger: RecalibrationTrigger,
    workout: GeneratedWorkout,
    options: Partial<RecalibrationRequest> = {},
  ): RecalibrationSuccess => {
    const result = recalibrate(request(trigger, workout, options));
    if (!result.ok) throw new Error(result.error);
    return result;
  };
  /** The top set logged at a load. */
  const topDone = (entry: WorkoutEntry, weight: number | null): CompletedWork => {
    const top = entry.sets.find((set) => set.tier === 'top')!;
    return {
      ...emptyCompleted(),
      startedAt: RECORD_NOW,
      currentEntryId: entry.id,
      sets: [
        {
          entryId: entry.id,
          exerciseId: entry.exerciseId,
          setIndex: top.index,
          kind: 'working',
          reps: 5,
          weight,
          rir: 1,
          completedAt: RECORD_NOW,
        },
      ],
    };
  };

  it('a plate missing today keeps it, where the place still makes the loads', () => {
    const workout = plan();
    const result = run({ type: 'loading' }, workout, { loading: { missingPlates: [35] } });
    expect(shape(bench(result.workout)).map((set) => set[2])).toEqual([
      'top',
      'back-off',
      'back-off',
      'back-off',
    ]);
  });

  it('a lift pinned through "Make it easier" keeps it, a rep more in reserve', () => {
    const workout = structuredClone(plan());
    bench(workout).pinned = true;
    const result = run({ type: 'intensity', direction: 'easier' }, workout);
    const sets = shape(bench(result.workout));
    expect(sets[0]).toEqual([expect.any(Number), 2, 'top']);
    expect(sets.slice(1).every((set) => set[1] === 3 && set[2] === 'back-off')).toBe(true);
  });

  it('a max entered keeps it', () => {
    const maxes = recordMax(emptyMaxes(), BENCH, { kind: 'max', e1rm: 250 }, 'lb', RECORD_NOW);
    const result = run({ type: 'max', exerciseId: BENCH }, plan(), { maxes });
    expect(shape(bench(result.workout)).map((set) => set[2])).toEqual([
      'top',
      'back-off',
      'back-off',
      'back-off',
    ]);
  });

  it('a change of weights in a deload week keeps straight sets', () => {
    const deload = { startsAt: '2026-09-07T00:00:00.000Z', endsAt: '2026-09-14T00:00:00.000Z' };
    const workout = plan(trained(), profileOf(), { deload });
    const result = run({ type: 'loading' }, workout, {
      constraints: { ...emptyConstraints(), deload },
      loading: { missingPlates: [35] },
    });
    expect(bench(result.workout).sets.every((set) => set.tier === undefined)).toBe(true);
  });

  it('the list of changes names the top set’s load', () => {
    const workout = plan();
    const result = run({ type: 'target-weight', entryId: bench(workout).id, weight: 200 }, workout);
    expect(result.changes.map((change) => change.detail).join(' | ')).toContain('top set 200');
  });

  it('a lift swapped in before a set is logged takes it, read from its own sessions', () => {
    // A lift with none of its own starts from an estimate, on straight sets.
    const own = [7, 3].map((daysAgo) =>
      record(
        daysAgo + 1,
        'dumbbell-bench-press',
        [
          [5, 70, 2],
          [5, 70, 2],
          [5, 70, 2],
        ],
        [4, 6],
        2,
      ),
    );
    const workout = plan();
    const result = run(
      { type: 'replace', entryId: bench(workout).id, exerciseId: 'dumbbell-bench-press' },
      workout,
      { history: [...trained(), ...own] },
    );
    const swapped = allEntries(result.workout.blocks).find(
      (entry) => entry.exerciseId === 'dumbbell-bench-press',
    )!;
    expect(swapped.sets.filter((set) => set.kind === 'working').map((set) => set.tier)).toEqual([
      'top',
      'back-off',
      'back-off',
      'back-off',
    ]);
    expect(swapped.backOffDrop).toBe(0.05);
  });

  it('a stand-in after the top set carries straight sets', () => {
    const workout = plan();
    const entry = bench(workout);
    const result = run(
      { type: 'replace', entryId: entry.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      { completed: topDone(entry, 190), currentEntryId: entry.id },
    );
    const stand = allEntries(result.workout.blocks).find(
      (candidate) => candidate.exerciseId === 'dumbbell-bench-press',
    )!;
    expect(stand.sets.every((set) => set.tier === undefined)).toBe(true);
    expect(stand.backOffDrop).toBeUndefined();
  });

  it('swapped back after its top set, it owes its back-offs', () => {
    const workout = plan();
    const entry = bench(workout);
    const done = topDone(entry, 190);
    const away = run(
      { type: 'replace', entryId: entry.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      { completed: done, currentEntryId: entry.id },
    );
    const stand = allEntries(away.workout.blocks).find(
      (candidate) => candidate.exerciseId === 'dumbbell-bench-press',
    )!;
    const back = run({ type: 'replace', entryId: stand.id, exerciseId: BENCH }, away.workout, {
      completed: done,
      constraints: away.constraints,
    });
    const owed = bench(back.workout).sets.filter(
      (set) => set.kind === 'working' && set.tier !== 'top',
    );
    expect(owed.length).toBeGreaterThan(0);
    expect(owed.map((set) => [set.targetWeight, set.targetRir, set.tier])).toEqual(
      owed.map(() => [180, 2, 'back-off']),
    );
  });

  it('stopped at a place with no bar after its top set, and back at the gym: its back-offs', () => {
    const [home] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['pull-up-bar'] },
      RECORD_NOW,
    );
    const workout = plan();
    const entry = bench(workout);
    const done = topDone(entry, 190);
    const away = run({ type: 'location' }, workout, {
      location: home,
      completed: done,
      currentEntryId: entry.id,
    });
    const back = run({ type: 'location' }, away.workout, {
      completed: done,
      constraints: away.constraints,
    });
    const owed = bench(back.workout).sets.filter(
      (set) => set.kind === 'working' && set.tier !== 'top',
    );
    expect(owed.length).toBeGreaterThan(0);
    expect(owed.map((set) => [set.targetWeight, set.tier])).toEqual(
      owed.map(() => [180, 'back-off']),
    );
  });

  it('high fatigue keeps a change of weights and a swap on straight sets', () => {
    const fresh = [
      ...trained(),
      ...[7, 3].map((daysAgo) =>
        record(daysAgo + 1, 'dumbbell-bench-press', [
          [5, 70, 2],
          [5, 70, 2],
          [5, 70, 2],
        ]),
      ),
    ];
    // Planned before fatigue was high; changed once it is (from the sessions' own signs since
    // Maintenance 33).
    const workout = plan(fresh);
    expect(bench(workout).backOffDrop).toBe(0.05);
    const options = { history: [...fresh, ...worn()], constraints: emptyConstraints() };
    const refit = run({ type: 'loading' }, workout, {
      ...options,
      loading: { missingPlates: [35] },
    });
    expect(bench(refit.workout).sets.every((set) => set.tier === undefined)).toBe(true);
    const swap = run(
      { type: 'replace', entryId: bench(workout).id, exerciseId: 'dumbbell-bench-press' },
      workout,
      options,
    );
    const swapped = allEntries(swap.workout.blocks).find(
      (entry) => entry.exerciseId === 'dumbbell-bench-press',
    )!;
    expect(swapped.sets.every((set) => set.tier === undefined)).toBe(true);
  });

  it('a change of weights after "Make it easier" keeps the day’s reserve: 2 on the top set, 3 after', () => {
    const easier = run({ type: 'intensity', direction: 'easier' }, plan());
    expect(shape(bench(easier.workout)).map((set) => set[1])).toEqual([2, 3, 3]);
    const refit = run({ type: 'loading' }, easier.workout, {
      constraints: easier.constraints,
      loading: { missingPlates: [35] },
    });
    expect(shape(bench(refit.workout)).map((set) => [set[1], set[2]])).toEqual([
      [2, 'top'],
      [3, 'back-off'],
      [3, 'back-off'],
    ]);
  });

  it('a set added to a top set alone is a back-off at the drop', () => {
    let trimmed = { workout: plan(), constraints: emptyConstraints() };
    const id = bench(trimmed.workout).id;
    for (let taken = 0; taken < 3; taken += 1) {
      trimmed = run({ type: 'sets', entryId: id, workingDelta: -1 }, trimmed.workout, {
        constraints: trimmed.constraints,
      });
    }
    expect(shape(bench(trimmed.workout))).toEqual([[190, 1, 'top']]);
    const added = run({ type: 'sets', entryId: id, workingDelta: 1 }, trimmed.workout, {
      constraints: trimmed.constraints,
    });
    expect(shape(bench(added.workout))).toEqual([
      [190, 1, 'top'],
      [180, 2, 'back-off'],
    ]);
  });

  it('fewer reps over more sets adds a back-off', () => {
    const workout = plan();
    const result = run(
      { type: 'rep-range', entryId: bench(workout).id, reps: [3, 5], workingDelta: 1 },
      workout,
    );
    const sets = shape(bench(result.workout));
    expect(sets).toHaveLength(5);
    expect(sets.at(-1)?.[2]).toBe('back-off');
  });

  it('a set added is a back-off', () => {
    const workout = plan();
    const result = run({ type: 'sets', entryId: bench(workout).id, workingDelta: 1 }, workout);
    expect(shape(bench(result.workout)).at(-1)).toEqual([180, 2, 'back-off']);
  });

  it('a weight set on the top set before it is done: the back-offs follow at the drop', () => {
    const workout = plan();
    const result = run({ type: 'target-weight', entryId: bench(workout).id, weight: 200 }, workout);
    expect(shape(bench(result.workout)).map((set) => set[0])).toEqual([200, 190, 190, 190]);
  });

  it('the top set lifted heavier: the back-offs follow it as lifted', () => {
    const workout = plan();
    const entry = bench(workout);
    const top = entry.sets.find((set) => set.tier === 'top')!;
    const result = run(
      {
        type: 'performance',
        entryId: entry.id,
        setIndex: top.index,
        actualReps: 5,
        actualWeight: 200,
        plan: { kind: 'none', reason: 'On target.' },
      },
      workout,
      { completed: topDone(entry, 200), currentEntryId: entry.id },
    );
    // 200 less 5%: 190.
    expect(shape(bench(result.workout)).map((set) => set[0])).toEqual([190, 190, 190, 190]);
    expect(result.summary.headline).toContain('back-offs at 190 lb');
  });
});
