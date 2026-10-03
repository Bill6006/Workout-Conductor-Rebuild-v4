import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { postponeBehind, postponeRefusal } from '../workout/sequence';
import {
  allEntries,
  isStopped,
  type DurationChoice,
  type GeneratedWorkout,
  type WorkoutBlock,
  type WorkoutEntry,
} from '../workout/types';
import { estimateWorkout } from '../duration/duration';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  CompletedSet,
  CompletedWork,
  RecalibrationResult,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';

/**
 * Maintenance 25, the owner's item 37: Equipment busy moves the exercise later, never out. It goes
 * behind the next row with a set to do, leads again once that row is done, and can move again,
 * until nothing is left behind it: then the button is off, and the lift is done, skipped, or the
 * workout finished (docs/research/equipment-busy.md).
 */

const NOW = RECORD_NOW;
const places = createDefaultLocations({ gymAccess: true }, NOW);
const gym = places.find((place) => place.id === 'gym') as LocationProfile;
const home = places.find((place) => place.id === 'home') as LocationProfile;
const profile = { ...createDefaultProfile(NOW), bodyweight: 185, currentLocationId: gym.id };

function plan(history: WorkoutRecord[] = []): GeneratedWorkout {
  return generateWorkout({
    profile,
    location: gym,
    history,
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
}

function busy(
  workout: GeneratedWorkout,
  entryId: string,
  completed: CompletedWork = emptyCompleted(),
  history: WorkoutRecord[] = [],
): RecalibrationResult {
  return recalibrate({
    trigger: { type: 'equipment-busy', entryId },
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: 'default',
    profile,
    location: gym,
    history,
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: NOW,
  });
}

/** Any change to the workout, with the day's settings as they stand. */
function run(
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  constraints: SessionConstraints,
  options: { completed?: CompletedWork; history?: WorkoutRecord[]; place?: LocationProfile } = {},
): RecalibrationResult {
  const completed = options.completed ?? emptyCompleted();
  return recalibrate({
    trigger,
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: 'default',
    profile,
    location: options.place ?? gym,
    history: options.history ?? [],
    constraints,
    reason: 'test',
    timestamp: NOW,
  });
}

function ok(result: RecalibrationResult) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** Last week's push day: the bench's six sets, then the incline press, a clean session. */
function pushDay(): WorkoutRecord[] {
  const session = record(
    4,
    'barbell-bench-press',
    Array.from({ length: 6 }, () => [6, 185, 2] as [number, number, number]),
  );
  const incline = record(
    4,
    'incline-dumbbell-press',
    [
      [9, 50, 2],
      [9, 50, 2],
      [9, 50, 2],
    ],
    [6, 10],
  );
  session.entries.push(...incline.entries);
  return [session];
}

const named = (workout: GeneratedWorkout, exerciseId: string) =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === exerciseId) as WorkoutEntry;
const rowOf = (workout: GeneratedWorkout, exerciseId: string) =>
  workout.blocks.findIndex((block) =>
    block.entries.some((entry) => entry.exerciseId === exerciseId),
  );

/** Every set of a row logged, as the lifter does it. */
function finish(completed: CompletedWork, block: WorkoutBlock): CompletedWork {
  const sets: CompletedSet[] = block.entries.flatMap((entry) =>
    entry.sets.map((set) => ({
      entryId: entry.id,
      exerciseId: entry.exerciseId,
      setIndex: set.index,
      kind: set.kind,
      reps: 8,
      weight: set.targetWeight,
      rir: 2,
      completedAt: NOW,
    })),
  );
  return { ...completed, startedAt: NOW, sets: [...completed.sets, ...sets] };
}

const rows = (workout: GeneratedWorkout) =>
  workout.blocks.map((block) => block.entries.map((entry) => entry.exerciseId).join('+'));
const doneIn = (completed: CompletedWork) => {
  const keys = new Set(completed.sets.map((set) => `${set.entryId}:${set.setIndex}`));
  return (entryId: string, index: number) => keys.has(`${entryId}:${index}`);
};
const firstWorking = (entry: WorkoutEntry | undefined) =>
  entry?.sets.find((set) => set.kind === 'working')?.targetWeight ?? null;

/** A session of the whole plan done at its targets, `daysAgo` before now: last week's workout. */
function planDone(workout: GeneratedWorkout, daysAgo: number): WorkoutRecord {
  const entries = allEntries(workout.blocks).flatMap(
    (entry) =>
      record(
        daysAgo,
        entry.exerciseId,
        entry.sets
          .filter((set) => set.kind === 'working')
          .map(
            (set) => [set.targetReps[1], set.targetWeight, 2] as [number, number | null, number],
          ),
        workingRange(entry),
      ).entries,
  );
  return { ...record(daysAgo, 'barbell-bench-press', []), id: `w-plan-${daysAgo}`, entries };
}
const workingRange = (entry: WorkoutEntry): [number, number] =>
  entry.sets.find((set) => set.kind === 'working')?.targetReps ?? [8, 12];

/** A set logged, `minute` minutes into the session. */
function loggedSet(entry: WorkoutEntry, index: number, minute = 0): CompletedSet {
  const set = entry.sets.find((each) => each.index === index) as WorkoutEntry['sets'][number];
  return {
    entryId: entry.id,
    exerciseId: entry.exerciseId,
    setIndex: index,
    kind: set.kind,
    reps: 8,
    weight: set.targetWeight,
    rir: 2,
    completedAt: new Date(Date.parse(NOW) + minute * 60_000).toISOString(),
  };
}

describe('Equipment busy', () => {
  it('moves the lift behind the next row each time it is tapped, until nothing is left behind it', () => {
    let workout = plan();
    const bench = allEntries(workout.blocks)[0] as WorkoutEntry;
    const exercises = allEntries(workout.blocks)
      .map((entry) => entry.exerciseId)
      .sort();
    let completed = emptyCompleted();
    for (let round = 1; round < workout.blocks.length; round += 1) {
      const result = busy(workout, bench.id, completed);
      if (!result.ok) throw new Error(result.error);
      workout = result.workout;
      // It sits right behind the row it gave way to, and every exercise is still there, as is.
      const at = workout.blocks.findIndex((block) => block.entries.some((e) => e.id === bench.id));
      expect(at).toBe(round);
      expect(
        allEntries(workout.blocks)
          .map((entry) => entry.exerciseId)
          .sort(),
      ).toEqual(exercises);
      expect(allEntries(workout.blocks).some((entry) => isStopped(entry))).toBe(false);
      expect(result.constraints.busyEquipment).toEqual([]);
      // The row it gave way to is done; the bench leads again, and can be moved again.
      completed = finish(completed, workout.blocks[round - 1] as WorkoutBlock);
    }
    // Last of the workout: nothing to move it behind, so the button is off and the engine refuses.
    expect(postponeBehind(workout, bench.id, doneIn(completed))).toBeNull();
    const last = busy(workout, bench.id, completed);
    expect(last.ok).toBe(false);
    if (!last.ok)
      expect(last.error).toBe(
        'Nothing after Barbell Bench Press is left to do: do it now, skip it today, or finish the workout.',
      );
    expect(rows(workout).at(-1)).toBe('barbell-bench-press');
  });

  it('moves a superset whole', () => {
    const workout = plan();
    const pair = workout.blocks.find((block) => block.kind === 'superset') as WorkoutBlock;
    const first = pair.entries[0] as WorkoutEntry;
    const result = busy(workout, first.id);
    if (!result.ok) throw new Error(result.error);
    const at = workout.blocks.indexOf(pair);
    const moved = result.workout.blocks[at + 1] as WorkoutBlock;
    expect(moved.id).toBe(pair.id);
    expect(moved.entries.map((entry) => entry.id)).toEqual(pair.entries.map((entry) => entry.id));
    expect(result.workout.blocks[at]?.id).toBe(workout.blocks[at + 1]?.id);
  });

  it('passes over a row already done', () => {
    const workout = plan();
    const [bench, incline, press] = workout.blocks as [WorkoutBlock, WorkoutBlock, WorkoutBlock];
    // The incline press was done out of order: the bench goes behind the shoulder press.
    const completed = finish(emptyCompleted(), incline);
    expect(postponeBehind(workout, bench.entries[0]!.id, doneIn(completed))?.id).toBe(press.id);
    const result = busy(workout, bench.entries[0]!.id, completed);
    if (!result.ok) throw new Error(result.error);
    expect(result.workout.blocks.map((block) => block.id).slice(0, 3)).toEqual([
      incline.id,
      press.id,
      bench.id,
    ]);
  });

  it('sets the lift’s target for its new place: the work now before it lowers its load', () => {
    // Last week the bench led and the incline press followed it; the plan keeps that order.
    const history: WorkoutRecord[] = [
      record(4, 'barbell-bench-press', [
        [6, 185, 2],
        [6, 185, 2],
        [6, 185, 2],
      ]),
    ];
    const withIncline = record(
      4,
      'incline-dumbbell-press',
      [
        [9, 50, 2],
        [9, 50, 2],
        [9, 50, 2],
      ],
      [6, 10],
    );
    const session = history[0] as WorkoutRecord;
    session.entries.push(...withIncline.entries);
    const workout = plan(history);
    const bench = allEntries(workout.blocks).find(
      (entry) => entry.exerciseId === 'barbell-bench-press',
    ) as WorkoutEntry;
    const incline = allEntries(workout.blocks).find(
      (entry) => entry.exerciseId === 'incline-dumbbell-press',
    ) as WorkoutEntry;
    // Busy twice: the bench goes behind the incline press, then behind the shoulder press too.
    const once = busy(workout, bench.id, emptyCompleted(), history);
    if (!once.ok) throw new Error(once.error);
    const twice = busy(once.workout, bench.id, emptyCompleted(), history);
    if (!twice.ok) throw new Error(twice.error);
    const benchAfter = allEntries(twice.workout.blocks).find((entry) => entry.id === bench.id);
    const inclineAfter = allEntries(twice.workout.blocks).find((entry) => entry.id === incline.id);
    // Behind two pressing lifts the bench asks for less, and says why; the incline press, now
    // first, asks for no less than it did behind the bench.
    expect(firstWorking(benchAfter)).toBeLessThan(firstWorking(bench) as number);
    expect(benchAfter?.progression?.evidence.join(' ')).toMatch(/sets on these muscles/);
    expect(firstWorking(inclineAfter)).toBeGreaterThanOrEqual(firstWorking(incline) as number);
  });

  it('refuses a lift with nothing left to do', () => {
    const workout = plan();
    const bench = workout.blocks[0] as WorkoutBlock;
    const completed = finish(emptyCompleted(), bench);
    const result = busy(workout, bench.entries[0]!.id, completed);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBe('Barbell Bench Press is done: nothing is left to move.');
  });

  it('counts the sets the moved lift has logged as work done before the lift that passes it', () => {
    // The bench's ramps and two of its working sets are done when its equipment is taken.
    const history = pushDay();
    const workout = plan(history);
    const bench = named(workout, 'barbell-bench-press');
    const incline = named(workout, 'incline-dumbbell-press');
    const logged = bench.sets.filter((set) => set.kind === 'warmup').length + 2;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      currentEntryId: bench.id,
      sets: bench.sets.slice(0, logged).map((set) => ({
        entryId: bench.id,
        exerciseId: bench.exerciseId,
        setIndex: set.index,
        kind: set.kind,
        reps: 6,
        weight: set.targetWeight,
        rir: 2,
        completedAt: NOW,
      })),
    };
    const moved = ok(busy(workout, bench.id, completed, history)).workout;
    const inclineAfter = named(moved, 'incline-dumbbell-press');
    // Two bench sets done count for the incline press, now in front: no fresher than the day its
    // target was set, so no step up, and one ramp is enough after the bench's.
    expect(rowOf(moved, 'incline-dumbbell-press')).toBe(0);
    expect(firstWorking(inclineAfter)).toBe(firstWorking(incline));
    expect(inclineAfter.progression?.evidence.join(' ')).not.toMatch(/fresher, so up a step/);
    expect(inclineAfter.warmupSets).toBeLessThanOrEqual(1);
    // The bench keeps every set it logged, as it was.
    expect(named(moved, 'barbell-bench-press').sets.slice(0, logged)).toEqual(
      bench.sets.slice(0, logged),
    );
  });

  it('keeps a ramp set added by hand', () => {
    const workout = plan();
    const bench = named(workout, 'barbell-bench-press');
    const ramped = ok(run({ type: 'add-warmup', entryId: bench.id }, workout, emptyConstraints()));
    const ramps = named(ramped.workout, 'barbell-bench-press').warmupSets;
    expect(ramps).toBe(bench.warmupSets + 1);
    const moved = ok(busy(ramped.workout, bench.id)).workout;
    const after = named(moved, 'barbell-bench-press');
    expect(after.warmupSets).toBe(ramps);
    expect(after.sets.filter((set) => set.kind === 'warmup')).toHaveLength(ramps);
  });

  it('holds the move through a check-in and a new length, and lets it go at a new place', () => {
    const workout = plan();
    const moved = ok(busy(workout, named(workout, 'barbell-bench-press').id));
    const passed = moved.workout.blocks[0]!.entries[0]!.exerciseId;
    expect(moved.constraints.postponed).toEqual([
      { exerciseId: 'barbell-bench-press', after: [passed] },
    ]);
    const tired = {
      energy: 2,
      soreness: 3,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    const checkedIn = ok(
      run({ type: 'readiness', readiness: tired }, moved.workout, moved.constraints),
    );
    expect(rowOf(checkedIn.workout, 'barbell-bench-press')).toBe(
      rowOf(checkedIn.workout, passed) + 1,
    );
    const shorter = ok(
      run({ type: 'duration', choice: 45 }, checkedIn.workout, checkedIn.constraints),
    );
    expect(rowOf(shorter.workout, 'barbell-bench-press')).toBe(rowOf(shorter.workout, passed) + 1);
    // The rebuilt plan says so: the lift in front is named first, and the bench no longer leads.
    expect(shorter.workout.explanation.summary).toContain(
      `, ${requireExercise(passed).name} first`,
    );
    // Busy equipment was busy at the place left behind.
    const elsewhere = ok(
      run({ type: 'location' }, shorter.workout, shorter.constraints, { place: home }),
    );
    expect(elsewhere.constraints.postponed).toEqual([]);
  });

  it('no longer takes out lifts for equipment a session saved before marked busy', () => {
    const old = { ...emptyConstraints(), busyEquipment: ['barbell'] };
    const rebuilt = ok(run({ type: 'duration', choice: 45 }, plan(), old)).workout;
    expect(rowOf(rebuilt, 'barbell-bench-press')).toBe(0);
  });

  it('keeps the plan’s lines on the order true: what comes first, and the main lift', () => {
    const workout = plan();
    expect(workout.explanation.reasons).toContain(
      'Barbell Bench Press leads as the primary strength lift with full rests and warm-up ramp sets.',
    );
    const moved = ok(busy(workout, named(workout, 'barbell-bench-press').id)).workout;
    const first = requireExercise(moved.blocks[0]!.entries[0]!.exerciseId).name;
    expect(moved.explanation.summary).toContain(`, ${first} first`);
    expect(moved.explanation.summary).not.toContain('Barbell Bench Press first');
    expect(moved.explanation.reasons).toContain(
      'Barbell Bench Press is the primary strength lift, with full rests and warm-up ramp sets.',
    );
    expect(moved.explanation.reasons.join(' ')).not.toContain('Barbell Bench Press leads');
  });

  it('names a pair by its lifts, and says whose equipment is busy', () => {
    const workout = plan();
    const pair = workout.blocks.find((block) => block.kind === 'superset') as WorkoutBlock;
    const at = workout.blocks.indexOf(pair);
    const next = workout.blocks[at + 1] as WorkoutBlock;
    const [a, b] = pair.entries.map((entry) => requireExercise(entry.exerciseId).name);
    const nextNames = next.entries.map((entry) => requireExercise(entry.exerciseId).name);
    const result = ok(busy(workout, pair.entries[0]!.id));
    const passed = nextNames.join(', ').replace(/, ([^,]*)$/, ' and $1');
    expect(result.summary.headline).toBe(
      `${a} and ${b} moved after ${passed}: the equipment for ${a} is busy. They come up again once ${next.kind === 'straight' ? passed : 'that pair'} is done.`,
    );
  });

  it('holds the move when the lift it gave way to is swapped: the swap takes its place', () => {
    const workout = plan();
    const moved = ok(busy(workout, named(workout, 'barbell-bench-press').id));
    const passed = moved.workout.blocks[0]!.entries[0]!;
    const swapped = ok(
      run(
        { type: 'replace', entryId: passed.id, exerciseId: 'dumbbell-bench-press' },
        moved.workout,
        moved.constraints,
      ),
    );
    // The lift swapped in joins the lifts it gave way to; the one swapped out stays named, as a
    // rebuild could bring it back.
    expect(swapped.constraints.postponed).toEqual([
      { exerciseId: 'barbell-bench-press', after: [passed.exerciseId, 'dumbbell-bench-press'] },
    ]);
    const tired = {
      energy: 2,
      soreness: 3,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    const checkedIn = ok(
      run({ type: 'readiness', readiness: tired }, swapped.workout, swapped.constraints),
    );
    expect(rowOf(checkedIn.workout, 'barbell-bench-press')).toBe(
      rowOf(checkedIn.workout, 'dumbbell-bench-press') + 1,
    );
  });

  it('holds the move when the lift it gave way to is swapped for comfort or for a sore joint', () => {
    const tired = {
      energy: 2,
      soreness: 3,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    for (const trigger of ['uncomfortable', 'pain'] as const) {
      const workout = plan();
      const moved = ok(busy(workout, named(workout, 'barbell-bench-press').id));
      const passed = moved.workout.blocks[0]!.entries[0]!;
      const swapped = ok(
        run(
          trigger === 'uncomfortable'
            ? { type: 'uncomfortable', entryId: passed.id }
            : { type: 'pain', entryId: passed.id, joint: 'elbow' },
          moved.workout,
          moved.constraints,
        ),
      );
      const now = swapped.workout.blocks[0]!.entries[0]!.exerciseId;
      expect(now).not.toBe(passed.exerciseId);
      expect(swapped.constraints.postponed).toEqual([
        { exerciseId: 'barbell-bench-press', after: [passed.exerciseId, now] },
      ]);
      const checkedIn = ok(
        run({ type: 'readiness', readiness: tired }, swapped.workout, swapped.constraints),
      );
      expect(rowOf(checkedIn.workout, 'barbell-bench-press')).toBe(
        rowOf(checkedIn.workout, now) + 1,
      );
    }
  });

  it('keeps a swapped-in lift where the busy lift was moved to', () => {
    const workout = plan();
    const moved = ok(busy(workout, named(workout, 'barbell-bench-press').id));
    const passed = moved.workout.blocks[0]!.entries[0]!.exerciseId;
    const bench = named(moved.workout, 'barbell-bench-press');
    const swapped = ok(
      run(
        { type: 'replace', entryId: bench.id, exerciseId: 'dumbbell-bench-press' },
        moved.workout,
        moved.constraints,
      ),
    );
    expect(swapped.constraints.postponed).toEqual([
      { exerciseId: 'dumbbell-bench-press', was: ['barbell-bench-press'], after: [passed] },
    ]);
    const shorter = ok(run({ type: 'duration', choice: 45 }, swapped.workout, swapped.constraints));
    expect(rowOf(shorter.workout, 'dumbbell-bench-press')).toBe(rowOf(shorter.workout, passed) + 1);
  });

  it('lets the move go once the lift is put back in front of what it gave way to by hand', () => {
    const workout = plan();
    const moved = ok(busy(workout, named(workout, 'barbell-bench-press').id));
    const bench = named(moved.workout, 'barbell-bench-press');
    const up = ok(
      run(
        { type: 'reorder', entryId: bench.id, direction: 'up' },
        moved.workout,
        moved.constraints,
      ),
    );
    expect(rowOf(up.workout, 'barbell-bench-press')).toBe(0);
    expect(up.constraints.postponed).toEqual([]);
    const shorter = ok(run({ type: 'duration', choice: 45 }, up.workout, up.constraints));
    expect(rowOf(shorter.workout, 'barbell-bench-press')).toBe(0);
  });

  it('keeps the move when a hand reorder leaves the lift behind what it gave way to', () => {
    const workout = plan();
    const moved = ok(busy(workout, named(workout, 'barbell-bench-press').id));
    const bench = named(moved.workout, 'barbell-bench-press');
    const down = ok(
      run(
        { type: 'reorder', entryId: bench.id, direction: 'down' },
        moved.workout,
        moved.constraints,
      ),
    );
    expect(down.constraints.postponed).toEqual(moved.constraints.postponed);
  });

  it('says the time its timers add up to after a rebuild puts a moved lift back behind', () => {
    for (const choice of [15, 30, 45] as const) {
      const workout = plan();
      const moved = ok(busy(workout, named(workout, 'barbell-bench-press').id));
      const rebuilt = ok(
        run({ type: 'duration', choice }, moved.workout, moved.constraints),
      ).workout;
      const time = estimateWorkout(
        rebuilt.blocks,
        rebuilt.warmup.generalMinutes,
        requireExercise,
        () => false,
      );
      expect(rebuilt.duration.estimatedMinutes).toBe(Math.round(time.totalMinutes));
      expect(rebuilt.explanation.summary).toContain(
        `in about ${Math.round(time.totalMinutes)} min`,
      );
      const over = Math.max(0, Math.round((time.totalMinutes - choice) * 10) / 10);
      if (over > 1) {
        expect(rebuilt.compromises).toContain(
          `Runs about ${Math.round(over)} min over ${choice} min.`,
        );
      }
    }
  });

  it('stays behind the next row when the lift it gave way to is gone from a rebuild', () => {
    const workout = plan();
    const moved = ok(busy(workout, named(workout, 'barbell-bench-press').id));
    // The lift it gave way to is not in the rebuilt plan (the place's equipment changed, say).
    const gone: SessionConstraints = {
      ...moved.constraints,
      postponed: [{ exerciseId: 'barbell-bench-press', after: ['goblet-squat'] }],
    };
    const rebuilt = ok(run({ type: 'duration', choice: 45 }, moved.workout, gone));
    expect(rowOf(rebuilt.workout, 'goblet-squat')).toBe(-1);
    // The bench waits behind the row now in front, its equipment still taken, and stays there.
    expect(rowOf(rebuilt.workout, 'barbell-bench-press')).toBe(1);
    const now = rebuilt.workout.blocks[0]!.entries.map((entry) => entry.exerciseId);
    expect(rebuilt.constraints.postponed).toEqual([
      { exerciseId: 'barbell-bench-press', after: now },
    ]);
    const again = ok(run({ type: 'duration', choice: 30 }, rebuilt.workout, rebuilt.constraints));
    expect(rowOf(again.workout, 'barbell-bench-press')).toBe(rowOf(again.workout, now[0]!) + 1);
  });

  it('keeps the move of a lift a rebuild brings back after a sore joint swapped it (from the second review)', () => {
    const workout = plan();
    const moved = ok(busy(workout, named(workout, 'barbell-bench-press').id));
    const passed = moved.workout.blocks[0]!.entries[0]!;
    const hurt = ok(
      run(
        { type: 'pain', entryId: passed.id, joint: 'shoulder' },
        moved.workout,
        moved.constraints,
      ),
    );
    const [move] = hurt.constraints.postponed;
    expect(move).toBeDefined();
    const tired = {
      energy: 2,
      soreness: 3,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    const checkedIn = ok(
      run({ type: 'readiness', readiness: tired }, hurt.workout, hurt.constraints),
    );
    // Whichever bench the rebuild has, the old or the one swapped in, it waits behind the row it
    // gave way to (or what stands in for it).
    const benchAt = checkedIn.workout.blocks.findIndex((block) =>
      block.entries.some((entry) =>
        [move!.exerciseId, ...(move!.was ?? [])].includes(entry.exerciseId),
      ),
    );
    const passedAt = checkedIn.workout.blocks.findIndex((block) =>
      block.entries.some((entry) => move!.after.includes(entry.exerciseId)),
    );
    expect(benchAt).toBeGreaterThan(-1);
    expect(passedAt).toBeGreaterThan(-1);
    expect(benchAt).toBeGreaterThan(passedAt);
  });

  it('moves no lift that does not lead when the lift it gave way to is gone', () => {
    const workout = plan();
    const third = workout.blocks[2]!.entries[0]!.exerciseId;
    const gone: SessionConstraints = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: third, after: ['goblet-squat'] }],
    };
    const rebuilt = ok(run({ type: 'duration', choice: 45 }, workout, gone)).workout;
    const fresh = ok(run({ type: 'duration', choice: 45 }, workout, emptyConstraints())).workout;
    expect(rowOf(rebuilt, third)).toBe(rowOf(fresh, third));
  });

  it('leaves a pair alone when the rebuild pairs the lift with one it gave way to', () => {
    const workout = plan();
    const at = workout.blocks.findIndex((block) => block.entries.length > 1);
    const pair = workout.blocks[at]!;
    const [first, second] = pair.entries.map((entry) => entry.exerciseId) as [string, string];
    // Every row before the pair done: the pair leads, the lift waiting on its partner in it.
    let completed = emptyCompleted();
    for (const block of workout.blocks.slice(0, at)) completed = finish(completed, block);
    const paired: SessionConstraints = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: second, after: [first] }],
    };
    const rebuilt = ok(
      run({ type: 'duration', choice: 'default' }, workout, paired, { completed }),
    ).workout;
    const fresh = ok(
      run({ type: 'duration', choice: 'default' }, workout, emptyConstraints(), { completed }),
    ).workout;
    expect(rowOf(fresh, second)).toBe(at);
    expect(rowOf(rebuilt, second)).toBe(rowOf(fresh, second));
  });

  it('never moves a lift begun, whatever its move says (from the second review)', () => {
    const workout = plan();
    const bench = named(workout, 'barbell-bench-press');
    const set = bench.sets.find((each) => each.kind === 'working')!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      currentEntryId: bench.id,
      sets: [
        {
          entryId: bench.id,
          exerciseId: bench.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: 5,
          weight: set.targetWeight,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    // A move whose lift it gave way to is gone, for a lift under way and in front.
    const gone: SessionConstraints = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: 'barbell-bench-press', after: ['goblet-squat'] }],
    };
    const rebuilt = ok(run({ type: 'duration', choice: 45 }, workout, gone, { completed }));
    expect(rowOf(rebuilt.workout, 'barbell-bench-press')).toBe(0);
    expect(rebuilt.constraints.postponed).toEqual([]);
  });

  it('says how many exercises the plan has after one is skipped', () => {
    const workout = plan();
    const last = workout.blocks.at(-1)!.entries[0]!;
    const skipped = ok(
      run({ type: 'skip', entryId: last.id }, workout, emptyConstraints()),
    ).workout;
    expect(skipped.explanation.summary).toContain(
      `: ${allEntries(skipped.blocks).length} exercises in about ${skipped.duration.estimatedMinutes} min`,
    );
  });

  it('passes over a lift waiting on the one tapped: two busy lifts let the next free one lead (from the third review)', () => {
    const workout = plan();
    const first = ok(busy(workout, named(workout, 'barbell-bench-press').id));
    const passed = first.workout.blocks[0]!.entries[0]!;
    // The lift in front now is busy too: it goes behind the next free row, not behind the bench.
    const second = ok(
      run({ type: 'equipment-busy', entryId: passed.id }, first.workout, first.constraints),
    );
    const lead = second.workout.blocks[0]!.entries.map((entry) => entry.exerciseId);
    expect(lead).not.toContain('barbell-bench-press');
    expect(lead).not.toContain(passed.exerciseId);
    // And the bench still waits behind the lift it gave way to.
    expect(rowOf(second.workout, 'barbell-bench-press')).toBeGreaterThan(
      rowOf(second.workout, passed.exerciseId),
    );
    const tired = {
      energy: 2,
      soreness: 3,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    const checkedIn = ok(
      run({ type: 'readiness', readiness: tired }, second.workout, second.constraints),
    ).workout;
    expect(checkedIn.blocks[0]!.entries.map((entry) => entry.exerciseId)).toEqual(lead);
  });

  it('never has a lift give way to itself after swaps and swaps back (from the third review)', () => {
    const workout = plan();
    const moved = ok(busy(workout, named(workout, 'barbell-bench-press').id));
    const passed = moved.workout.blocks[0]!.entries[0]!;
    const there = ok(
      run(
        { type: 'replace', entryId: passed.id, exerciseId: 'dumbbell-bench-press' },
        moved.workout,
        moved.constraints,
      ),
    );
    const standIn = named(there.workout, 'dumbbell-bench-press');
    const back = ok(
      run(
        { type: 'replace', entryId: standIn.id, exerciseId: passed.exerciseId },
        there.workout,
        there.constraints,
      ),
    );
    const bench = named(back.workout, 'barbell-bench-press');
    const swapped = ok(
      run(
        { type: 'replace', entryId: bench.id, exerciseId: 'dumbbell-bench-press' },
        back.workout,
        back.constraints,
      ),
    );
    const [move] = swapped.constraints.postponed;
    expect(move?.exerciseId).toBe('dumbbell-bench-press');
    expect(move?.after).not.toContain('dumbbell-bench-press');
    const tired = {
      energy: 2,
      soreness: 3,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    const checkedIn = ok(
      run({ type: 'readiness', readiness: tired }, swapped.workout, swapped.constraints),
    ).workout;
    expect(rowOf(checkedIn, 'dumbbell-bench-press')).toBeGreaterThan(
      rowOf(checkedIn, passed.exerciseId),
    );
  });

  it('says when a session under way will run past the minutes left (from the third review)', () => {
    const workout = plan();
    // Twenty minutes into the default hour, the first row done.
    let completed = finish(emptyCompleted(), workout.blocks[0]!);
    completed = { ...completed, elapsedSeconds: 20 * 60 };
    let now = workout;
    let constraints = emptyConstraints();
    for (const block of workout.blocks.slice(1)) {
      for (const entry of block.entries) {
        for (let added = 0; added < 2; added += 1) {
          const result = ok(
            run({ type: 'sets', entryId: entry.id, workingDelta: 1 }, now, constraints, {
              completed,
            }),
          );
          now = result.workout;
          constraints = result.constraints;
        }
      }
    }
    const left = 60 - 20;
    expect(now.duration.overByMinutes).toBeGreaterThan(1);
    expect(now.compromises).toContain(
      `Runs about ${Math.round(now.duration.overByMinutes)} min over the ${left} min left.`,
    );
  });

  it('refuses a lift whose only rows after it wait on it, as the screens turn the button off (the third review)', () => {
    let workout = plan();
    let constraints = emptyConstraints();
    // The bench moved to the end, one row at a time: it waits on the row before it.
    for (let guard = 0; guard < 10; guard += 1) {
      if (
        workout.blocks.at(-1)!.entries.some((entry) => entry.exerciseId === 'barbell-bench-press')
      )
        break;
      const moved = ok(
        run(
          { type: 'equipment-busy', entryId: named(workout, 'barbell-bench-press').id },
          workout,
          constraints,
        ),
      );
      workout = moved.workout;
      constraints = moved.constraints;
    }
    const before = workout.blocks.at(-2)!.entries[0]!;
    const refused = run({ type: 'equipment-busy', entryId: before.id }, workout, constraints);
    expect(refused.ok).toBe(false);
    if (!refused.ok)
      expect(refused.error).toBe(
        `Everything left after ${requireExercise(before.exerciseId).name} is waiting for it, moved there for busy equipment: do it now, skip it today, or finish the workout.`,
      );
  });

  it('passes over a pair with a lift waiting on the one tapped (the fourth review)', () => {
    const workout = plan();
    // The fly pair moves behind the last pair; tapped then, the last pair has nothing to go behind
    // but the pair waiting on it.
    const fly = ok(busy(workout, named(workout, 'cable-fly').id));
    expect(rows(fly.workout).at(-1)).toBe('cable-fly+cable-triceps-pushdown');
    const refused = run(
      { type: 'equipment-busy', entryId: named(fly.workout, 'lateral-raise').id },
      fly.workout,
      fly.constraints,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok)
      expect(refused.error).toBe(
        'Everything left after Lateral Raise is waiting for it, moved there for busy equipment: do it now, skip it today, or finish the workout.',
      );
    // With a free row after it: the fly pair, moved up by hand and then behind the shoulder press,
    // is passed over, and the shoulder press goes behind the free pair.
    let now = plan();
    let constraints = emptyConstraints();
    const step = (trigger: RecalibrationTrigger) => {
      const result = ok(run(trigger, now, constraints));
      now = result.workout;
      constraints = result.constraints;
    };
    step({ type: 'reorder', entryId: named(now, 'cable-fly').id, direction: 'up' });
    step({ type: 'equipment-busy', entryId: named(now, 'cable-fly').id });
    expect(rows(now).slice(2)).toEqual([
      'dumbbell-shoulder-press',
      'cable-fly+cable-triceps-pushdown',
      'lateral-raise+ez-bar-curl',
    ]);
    step({ type: 'equipment-busy', entryId: named(now, 'dumbbell-shoulder-press').id });
    expect(rows(now).slice(2)).toEqual([
      'lateral-raise+ez-bar-curl',
      'dumbbell-shoulder-press',
      'cable-fly+cable-triceps-pushdown',
    ]);
  });

  it('lets a move’s old name go once another lift takes it (the fourth review)', () => {
    let now = plan();
    let constraints = emptyConstraints();
    const step = (trigger: RecalibrationTrigger) => {
      const result = ok(run(trigger, now, constraints));
      now = result.workout;
      constraints = result.constraints;
    };
    step({ type: 'equipment-busy', entryId: named(now, 'incline-dumbbell-press').id });
    step({
      type: 'replace',
      entryId: named(now, 'incline-dumbbell-press').id,
      exerciseId: 'incline-barbell-bench-press',
    });
    // The shoulder press, which the barbell incline waits on, swapped for the old incline press.
    step({
      type: 'replace',
      entryId: named(now, 'dumbbell-shoulder-press').id,
      exerciseId: 'incline-dumbbell-press',
    });
    expect(constraints.postponed[0]?.was ?? []).not.toContain('incline-dumbbell-press');
    // Busy on it: the barbell incline, waiting on it, is passed over and stays behind it.
    step({ type: 'equipment-busy', entryId: named(now, 'incline-dumbbell-press').id });
    expect(rowOf(now, 'incline-barbell-bench-press')).toBeGreaterThan(
      rowOf(now, 'incline-dumbbell-press'),
    );
    expect(constraints.postponed.map((item) => item.exerciseId).sort()).toEqual([
      'incline-barbell-bench-press',
      'incline-dumbbell-press',
    ]);
  });

  it('holds a check-in short on time to the length it picks, with a busy move kept (the fourth review)', () => {
    const workout = plan();
    // The bench done, one incline set logged, forty minutes in.
    let completed = finish(emptyCompleted(), workout.blocks[0]!);
    const incline = named(workout, 'incline-dumbbell-press');
    const first = incline.sets.find((set) => set.kind === 'working')!;
    completed = {
      ...completed,
      currentEntryId: incline.id,
      elapsedSeconds: 40 * 60,
      sets: [
        ...completed.sets,
        {
          entryId: incline.id,
          exerciseId: incline.exerciseId,
          setIndex: first.index,
          kind: 'working',
          reps: 8,
          weight: first.targetWeight,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    const moved = ok(
      run({ type: 'equipment-busy', entryId: incline.id }, workout, emptyConstraints(), {
        completed,
      }),
    );
    const short = {
      energy: 3,
      soreness: 3,
      sleep: 3,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: true,
    };
    // The lift in front now is the shoulder press, as the store has it after the tap.
    const inFront = { ...completed, currentEntryId: moved.workout.blocks[1]!.entries[0]!.id };
    expect(moved.workout.blocks[1]!.entries[0]!.exerciseId).toBe('dumbbell-shoulder-press');
    const checked = ok(
      run({ type: 'readiness', readiness: short }, moved.workout, moved.constraints, {
        completed: inFront,
      }),
    );
    // The check-in picks 45 min: forty in, five are left.
    const over = checked.workout.duration.overByMinutes;
    expect(over).toBeGreaterThan(1);
    expect(checked.workout.compromises).toContain(
      `Runs about ${Math.round(over)} min over the 5 min left.`,
    );
  });

  it('lets a moved lift with nothing left to do wait on nothing (the fifth review)', () => {
    const workout = plan();
    // The first three rows done; the fly pair's first round logged, then the fly moved for busy
    // equipment behind the last pair.
    let completed = emptyCompleted();
    for (const block of workout.blocks.slice(0, 3)) completed = finish(completed, block);
    const fly = named(workout, 'cable-fly');
    const pushdown = named(workout, 'cable-triceps-pushdown');
    const firstOf = (entry: WorkoutEntry) => entry.sets.find((set) => set.kind === 'working')!;
    const logged = (entry: WorkoutEntry, index: number): CompletedSet => ({
      entryId: entry.id,
      exerciseId: entry.exerciseId,
      setIndex: index,
      kind: 'working',
      reps: 10,
      weight: firstOf(entry).targetWeight,
      rir: 2,
      completedAt: NOW,
    });
    completed = {
      ...completed,
      sets: [
        ...completed.sets,
        logged(fly, firstOf(fly).index),
        logged(pushdown, firstOf(pushdown).index),
      ],
    };
    const moved = ok(
      run({ type: 'equipment-busy', entryId: fly.id }, workout, emptyConstraints(), { completed }),
    );
    expect(rows(moved.workout).at(-1)).toBe('cable-fly+cable-triceps-pushdown');
    // Every fly set done since: only the pushdown is left in that row, and it waits on nothing.
    const flyDone = {
      ...completed,
      sets: [
        ...completed.sets,
        ...named(moved.workout, 'cable-fly')
          .sets.filter(
            (set) =>
              !completed.sets.some(
                (done) => done.entryId === fly.id && done.setIndex === set.index,
              ),
          )
          .map((set) => logged(fly, set.index)),
      ],
    };
    const lateral = named(moved.workout, 'lateral-raise');
    const next = ok(
      run({ type: 'equipment-busy', entryId: lateral.id }, moved.workout, moved.constraints, {
        completed: flyDone,
      }),
    );
    expect(rows(next.workout).at(-1)).toBe('lateral-raise+ez-bar-curl');
  });

  it('never has a lift fall back behind a lift just moved behind it (the fifth review)', () => {
    const workout = plan();
    // The bench done, thirty minutes in; the shoulder press moved behind the fly pair.
    let completed = finish(emptyCompleted(), workout.blocks[0]!);
    const incline = named(workout, 'incline-dumbbell-press');
    completed = { ...completed, currentEntryId: incline.id, elapsedSeconds: 30 * 60 };
    const shoulder = ok(
      run(
        { type: 'equipment-busy', entryId: named(workout, 'dumbbell-shoulder-press').id },
        workout,
        emptyConstraints(),
        { completed },
      ),
    );
    // Short on time: the pairs go, and the shoulder press waits on lifts no longer planned.
    const short = {
      energy: 3,
      soreness: 3,
      sleep: 3,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: true,
    };
    const checked = ok(
      run({ type: 'readiness', readiness: short }, shoulder.workout, shoulder.constraints, {
        completed,
      }),
    );
    expect(rowOf(checked.workout, 'cable-fly')).toBe(-1);
    const tapped = ok(
      run(
        { type: 'equipment-busy', entryId: named(checked.workout, 'incline-dumbbell-press').id },
        checked.workout,
        checked.constraints,
        { completed },
      ),
    );
    // The incline goes behind the shoulder press, and the shoulder press stays in front of it.
    expect(rowOf(tapped.workout, 'incline-dumbbell-press')).toBeGreaterThan(
      rowOf(tapped.workout, 'dumbbell-shoulder-press'),
    );
    const moves = tapped.constraints.postponed;
    // The shoulder press's own move stays, waiting on lifts no longer planned, rather than turning
    // on the incline waiting behind it.
    expect(moves.map((move) => move.exerciseId)).toContain('dumbbell-shoulder-press');
    for (const move of moves) {
      for (const other of moves) {
        if (move === other) continue;
        const waitsOn = move.after.includes(other.exerciseId);
        const waitedOn = other.after.includes(move.exerciseId);
        expect(waitsOn && waitedOn).toBe(false);
      }
    }
  });

  it('never lets a row fall back past a lift waiting on it, the one just tapped included (the fifth review)', () => {
    const workout = plan();
    // The incline waits on the bench; the shoulder press waits on a lift no longer planned.
    const constraints = {
      ...emptyConstraints(),
      postponed: [
        { exerciseId: 'incline-dumbbell-press', after: ['barbell-bench-press'] },
        { exerciseId: 'dumbbell-shoulder-press', after: ['dumbbell-curl'] },
      ],
    };
    // Busy on the bench: it goes behind the shoulder press, the incline following it; the shoulder
    // press, in front then, stays there, the two behind it waiting on it.
    const tapped = ok(
      run(
        { type: 'equipment-busy', entryId: named(workout, 'barbell-bench-press').id },
        workout,
        constraints,
      ),
    );
    expect(rowOf(tapped.workout, 'barbell-bench-press')).toBeGreaterThan(
      rowOf(tapped.workout, 'dumbbell-shoulder-press'),
    );
    expect(rowOf(tapped.workout, 'incline-dumbbell-press')).toBeGreaterThan(
      rowOf(tapped.workout, 'barbell-bench-press'),
    );
  });

  it('keeps the move of a lift paired with the one tapped busy (the fifth review)', () => {
    const workout = plan();
    const fly = named(workout, 'cable-fly');
    // The pushdown gave way to the bench earlier; the fly, in front, is tapped busy.
    const constraints = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: 'cable-triceps-pushdown', after: ['barbell-bench-press'] }],
    };
    const tapped = ok(
      run({ type: 'equipment-busy', entryId: fly.id }, workout, constraints, {
        completed: { ...emptyCompleted(), currentEntryId: fly.id },
      }),
    );
    expect(tapped.constraints.postponed.map((move) => move.exerciseId).sort()).toEqual([
      'cable-fly',
      'cable-triceps-pushdown',
    ]);
  });

  it('never has a rebuild leave a lift waiting on itself under an old name (the fifth review)', () => {
    const workout = plan();
    // The bench's move knows the incline press as its old name, and waits on a lift no longer
    // planned: the rebuild has the bench lead, the incline right behind it. It waits behind the
    // next row that is not itself: the shoulder press.
    const constraints = {
      ...emptyConstraints(),
      postponed: [
        {
          exerciseId: 'barbell-bench-press',
          was: ['incline-dumbbell-press'],
          after: ['dumbbell-curl'],
        },
      ],
    };
    const tired = {
      energy: 2,
      soreness: 3,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    const rebuilt = ok(run({ type: 'readiness', readiness: tired }, workout, constraints));
    expect(rowOf(rebuilt.workout, 'dumbbell-shoulder-press')).toBe(0);
    expect(rebuilt.constraints.postponed[0]?.after).toEqual(['dumbbell-shoulder-press']);
    for (const move of rebuilt.constraints.postponed) {
      const own = [move.exerciseId, ...(move.was ?? [])];
      expect(move.after.some((id) => own.includes(id))).toBe(false);
    }
  });

  it('never has a lift fall back to wait on itself beside another lift (the fifth review)', () => {
    const planned = plan();
    // The fly pair right behind the bench, and the bench's move knowing the fly as its old name.
    const blocks = [...planned.blocks];
    const [pair] = blocks.splice(3, 1);
    blocks.splice(1, 0, pair!);
    const workout = { ...planned, blocks };
    const constraints = {
      ...emptyConstraints(),
      postponed: [
        { exerciseId: 'barbell-bench-press', was: ['cable-fly'], after: ['dumbbell-curl'] },
      ],
    };
    // A busy tap further down settles the bench's move: it goes behind the pair, waiting on the
    // pushdown and not on the fly, its own old name.
    const tapped = ok(
      run(
        { type: 'equipment-busy', entryId: named(workout, 'incline-dumbbell-press').id },
        workout,
        constraints,
      ),
    );
    for (const move of tapped.constraints.postponed) {
      const own = [move.exerciseId, ...(move.was ?? [])];
      expect(move.after.some((id) => own.includes(id))).toBe(false);
    }
    expect(
      tapped.constraints.postponed.find((move) => move.exerciseId === 'barbell-bench-press')?.after,
    ).toEqual(['cable-triceps-pushdown']);
  });

  it('lets a name a lift given way to once had go when another lift takes it (the fifth review)', () => {
    const workout = plan();
    // The lateral raise gave way to the shoulder press, once an Arnold press.
    const constraints = {
      ...emptyConstraints(),
      postponed: [
        { exerciseId: 'lateral-raise', after: ['arnold-press', 'dumbbell-shoulder-press'] },
      ],
    };
    const swapped = ok(
      run(
        {
          type: 'replace',
          entryId: named(workout, 'incline-dumbbell-press').id,
          exerciseId: 'arnold-press',
        },
        workout,
        constraints,
      ),
    );
    expect(swapped.constraints.postponed[0]?.after).toEqual(['dumbbell-shoulder-press']);
  });

  it('puts a lift paired with one it gave way to behind it when the pair is split (the sixth review)', () => {
    const workout = plan();
    const pair = workout.blocks.find((block) =>
      block.entries.some((entry) => entry.exerciseId === 'cable-fly'),
    )!;
    // The fly gave way to the pushdown, and a rebuild paired them: the pair takes them in turn.
    const constraints = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: 'cable-fly', after: ['cable-triceps-pushdown'] }],
    };
    const split = ok(run({ type: 'split-superset', blockId: pair.id }, workout, constraints));
    expect(rowOf(split.workout, 'cable-fly')).toBeGreaterThan(
      rowOf(split.workout, 'cable-triceps-pushdown'),
    );
    expect(split.constraints.postponed).toEqual(constraints.postponed);
  });

  it('gives two alike rebuilds one order, a lift and its old name both planned (the fifth review)', () => {
    const workout = plan();
    // The shoulder press moved behind the fly pair, then swapped for the incline press: both are in
    // today's plan, and the move knows the shoulder press as its old name.
    const constraints = {
      ...emptyConstraints(),
      postponed: [
        {
          exerciseId: 'incline-dumbbell-press',
          was: ['dumbbell-shoulder-press'],
          after: ['cable-fly', 'cable-triceps-pushdown'],
        },
      ],
    };
    const tired = {
      energy: 2,
      soreness: 3,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    const first = ok(run({ type: 'readiness', readiness: tired }, workout, constraints));
    const second = ok(
      run({ type: 'readiness', readiness: tired }, first.workout, first.constraints),
    );
    expect(rows(second.workout)).toEqual(rows(first.workout));
    expect(second.constraints.postponed).toEqual(first.constraints.postponed);
  });

  it('ends a move whose lift given way to is swapped for the moved lift itself (the fifth review)', () => {
    const workout = plan();
    // The dumbbell curl, moved behind the EZ-bar curl, is out of today's plan; the EZ-bar curl is
    // then swapped for it.
    const constraints = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: 'dumbbell-curl', after: ['ez-bar-curl'] }],
    };
    const swapped = ok(
      run(
        { type: 'replace', entryId: named(workout, 'ez-bar-curl').id, exerciseId: 'dumbbell-curl' },
        workout,
        constraints,
      ),
    );
    expect(swapped.constraints.postponed).toEqual([]);
    // An old name of its own that the lift given way to takes is that lift's: waited on, not its own.
    const renamed = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: 'cable-curl', was: ['dumbbell-curl'], after: ['ez-bar-curl'] }],
    };
    const taken = ok(
      run(
        { type: 'replace', entryId: named(workout, 'ez-bar-curl').id, exerciseId: 'dumbbell-curl' },
        workout,
        renamed,
      ),
    );
    const [move] = taken.constraints.postponed;
    expect(move?.after).toContain('dumbbell-curl');
    expect(move?.was ?? []).not.toContain('dumbbell-curl');
  });

  it('lets a move’s old name go when a lift it did not give way to takes it (the fifth review)', () => {
    let now = plan();
    let constraints = emptyConstraints();
    const step = (trigger: RecalibrationTrigger) => {
      const result = ok(run(trigger, now, constraints));
      now = result.workout;
      constraints = result.constraints;
    };
    step({ type: 'equipment-busy', entryId: named(now, 'incline-dumbbell-press').id });
    step({
      type: 'replace',
      entryId: named(now, 'incline-dumbbell-press').id,
      exerciseId: 'incline-barbell-bench-press',
    });
    // The bench, which the barbell incline did not give way to, swapped for the old incline press.
    step({
      type: 'replace',
      entryId: named(now, 'barbell-bench-press').id,
      exerciseId: 'incline-dumbbell-press',
    });
    expect(constraints.postponed[0]?.was ?? []).not.toContain('incline-dumbbell-press');
    // A check-in holds the barbell incline behind the shoulder press, and leaves the incline press
    // in the bench's place in front.
    const tired = {
      energy: 2,
      soreness: 3,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    step({ type: 'readiness', readiness: tired });
    expect(rowOf(now, 'incline-dumbbell-press')).toBe(0);
    expect(rowOf(now, 'incline-barbell-bench-press')).toBeGreaterThan(
      rowOf(now, 'dumbbell-shoulder-press'),
    );
  });

  it('ends a move whose own lift, out of the plan, another lift is swapped for (the fifth review)', () => {
    const workout = plan();
    const constraints = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: 'dumbbell-curl', after: ['ez-bar-curl'] }],
    };
    const swapped = ok(
      run(
        {
          type: 'replace',
          entryId: named(workout, 'lateral-raise').id,
          exerciseId: 'dumbbell-curl',
        },
        workout,
        constraints,
      ),
    );
    expect(swapped.constraints.postponed).toEqual([]);
  });

  it('counts the short warm-up a return after a pause sets, a busy move kept (the fifth review)', () => {
    const workout = plan();
    let completed = finish(emptyCompleted(), workout.blocks[0]!);
    const incline = named(workout, 'incline-dumbbell-press');
    completed = { ...completed, currentEntryId: incline.id, elapsedSeconds: 20 * 60 };
    const moved = ok(
      run({ type: 'equipment-busy', entryId: incline.id }, workout, emptyConstraints(), {
        completed,
      }),
    );
    const inFront = { ...completed, currentEntryId: moved.workout.blocks[1]!.entries[0]!.id };
    const back = ok(
      run({ type: 'resume', awaySeconds: 25 * 60 }, moved.workout, moved.constraints, {
        completed: inFront,
      }),
    );
    expect(rowOf(back.workout, 'incline-dumbbell-press')).toBeGreaterThan(
      rowOf(back.workout, 'dumbbell-shoulder-press'),
    );
    expect(back.workout.warmup.generalMinutes).toBeGreaterThan(0);
    const time = estimateWorkout(
      back.workout.blocks,
      back.workout.warmup.generalMinutes,
      requireExercise,
      doneIn(inFront),
    );
    expect(back.workout.explanation.time.totalMinutes).toBeCloseTo(time.totalMinutes, 5);
  });

  it('never moves the lift in front, under way, for a busy tap on another lift (the sixth review)', () => {
    const workout = plan();
    const bench = named(workout, 'barbell-bench-press');
    const set = bench.sets.find((each) => each.kind === 'working')!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      currentEntryId: bench.id,
      sets: [
        {
          entryId: bench.id,
          exerciseId: bench.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: 6,
          weight: set.targetWeight,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    // A move of the bench's from before, which the lifter, doing the bench now, has ended.
    const constraints = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: 'barbell-bench-press', after: ['incline-dumbbell-press'] }],
    };
    const tapped = ok(
      run(
        { type: 'equipment-busy', entryId: named(workout, 'cable-fly').id },
        workout,
        constraints,
        { completed },
      ),
    );
    expect(rowOf(tapped.workout, 'barbell-bench-press')).toBe(0);
  });

  it('keeps the move of a lift held under an old name when that lift is swapped (the sixth review)', () => {
    const workout = plan();
    // A rebuild brought the barbell bench back; its move still knows it as its old name.
    const constraints = {
      ...emptyConstraints(),
      postponed: [
        {
          exerciseId: 'dumbbell-bench-press',
          was: ['barbell-bench-press'],
          after: ['incline-dumbbell-press'],
        },
      ],
    };
    const swapped = ok(
      run(
        {
          type: 'replace',
          entryId: named(workout, 'barbell-bench-press').id,
          exerciseId: 'dumbbell-bench-press',
        },
        workout,
        constraints,
      ),
    );
    expect(swapped.constraints.postponed.map((move) => move.exerciseId)).toEqual([
      'dumbbell-bench-press',
    ]);
    expect(rowOf(swapped.workout, 'dumbbell-bench-press')).toBeGreaterThan(
      rowOf(swapped.workout, 'incline-dumbbell-press'),
    );
    // Another lift takes the name the move goes by now: the move goes on under the old name.
    const taken = ok(
      run(
        {
          type: 'replace',
          entryId: named(workout, 'dumbbell-shoulder-press').id,
          exerciseId: 'dumbbell-bench-press',
        },
        workout,
        constraints,
      ),
    );
    expect(taken.constraints.postponed.map((move) => move.exerciseId)).toEqual([
      'barbell-bench-press',
    ]);
    expect(rowOf(taken.workout, 'barbell-bench-press')).toBeGreaterThan(
      rowOf(taken.workout, 'incline-dumbbell-press'),
    );
  });

  it('lets a lift given way to that is done hold nothing (the sixth review)', () => {
    const workout = plan();
    // Every incline set logged before the bench: the bench's turn has come.
    const completed = finish(emptyCompleted(), workout.blocks[1]!);
    const constraints = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: 'barbell-bench-press', after: ['incline-dumbbell-press'] }],
    };
    const swapped = ok(
      run(
        {
          type: 'replace',
          entryId: named(workout, 'dumbbell-shoulder-press').id,
          exerciseId: 'arnold-press',
        },
        workout,
        constraints,
        { completed },
      ),
    );
    expect(rowOf(swapped.workout, 'barbell-bench-press')).toBe(0);
  });

  it('keeps a busy lift behind what it gave way to when a stopped lift is swapped back (the sixth review)', () => {
    const workout = plan();
    const bench = named(workout, 'barbell-bench-press');
    const set = bench.sets.find((each) => each.kind === 'working')!;
    let completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      currentEntryId: bench.id,
      sets: [
        {
          entryId: bench.id,
          exerciseId: bench.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: 6,
          weight: set.targetWeight,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    let now = workout;
    let constraints = emptyConstraints();
    const step = (trigger: RecalibrationTrigger) => {
      const result = ok(run(trigger, now, constraints, { completed }));
      now = result.workout;
      constraints = result.constraints;
    };
    // The bench, under way, swapped for the dumbbell bench; that moved for busy equipment; then
    // swapped back to the bench stopped earlier.
    step({ type: 'replace', entryId: bench.id, exerciseId: 'dumbbell-bench-press' });
    step({ type: 'equipment-busy', entryId: named(now, 'dumbbell-bench-press').id });
    // The lifter is on the incline now, as the store has it after the tap.
    completed = { ...completed, currentEntryId: named(now, 'incline-dumbbell-press').id };
    const standIn = allEntries(now.blocks).find(
      (entry) => entry.exerciseId === 'dumbbell-bench-press' && !isStopped(entry),
    )!;
    step({ type: 'replace', entryId: standIn.id, exerciseId: 'barbell-bench-press' });
    const back = now.blocks.findIndex((block) =>
      block.entries.some(
        (entry) => entry.exerciseId === 'barbell-bench-press' && !isStopped(entry),
      ),
    );
    expect(back).toBeGreaterThan(rowOf(now, 'incline-dumbbell-press'));
  });

  it('keeps the move of a row that waits behind a loop, ending only a move on the loop (the sixth review)', () => {
    const workout = plan();
    // The two pairs ask for opposite orders; the shoulder press, earlier, waits on the lateral
    // raise, behind the loop but not on it.
    const constraints = {
      ...emptyConstraints(),
      postponed: [
        { exerciseId: 'cable-fly', after: ['lateral-raise'] },
        { exerciseId: 'ez-bar-curl', after: ['cable-triceps-pushdown'] },
        { exerciseId: 'dumbbell-shoulder-press', after: ['lateral-raise'] },
      ],
    };
    const swapped = ok(
      run(
        {
          type: 'replace',
          entryId: named(workout, 'incline-dumbbell-press').id,
          exerciseId: 'incline-barbell-bench-press',
        },
        workout,
        constraints,
      ),
    );
    expect(swapped.constraints.postponed.map((move) => move.exerciseId).sort()).toEqual([
      'dumbbell-shoulder-press',
      'ez-bar-curl',
    ]);
    expect(rowOf(swapped.workout, 'dumbbell-shoulder-press')).toBeGreaterThan(
      rowOf(swapped.workout, 'lateral-raise'),
    );
  });

  it('ends the move holding back the earlier row when two moves ask for opposite orders (the sixth review)', () => {
    const workout = plan();
    // The fly waits on the lateral raise, and the curl on the pushdown: the fly's pair must come
    // after the lateral's pair and before it.
    const constraints = {
      ...emptyConstraints(),
      postponed: [
        { exerciseId: 'cable-fly', after: ['lateral-raise'] },
        { exerciseId: 'ez-bar-curl', after: ['cable-triceps-pushdown'] },
      ],
    };
    const swapped = ok(
      run(
        {
          type: 'replace',
          entryId: named(workout, 'dumbbell-shoulder-press').id,
          exerciseId: 'arnold-press',
        },
        workout,
        constraints,
      ),
    );
    expect(swapped.constraints.postponed).toEqual([
      { exerciseId: 'ez-bar-curl', after: ['cable-triceps-pushdown'] },
    ]);
    expect(rowOf(swapped.workout, 'lateral-raise')).toBeGreaterThan(
      rowOf(swapped.workout, 'cable-fly'),
    );
  });

  it('leaves the move of a lift that does not lead as it was, its lifts given way to gone (the sixth review)', () => {
    const workout = plan();
    const constraints = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: 'lateral-raise', after: ['dumbbell-curl'] }],
    };
    const swapped = ok(
      run(
        {
          type: 'replace',
          entryId: named(workout, 'dumbbell-shoulder-press').id,
          exerciseId: 'arnold-press',
        },
        workout,
        constraints,
      ),
    );
    expect(swapped.constraints.postponed).toEqual(constraints.postponed);
  });

  it('sets a target for its new place for a lift the settling moves, as for the one tapped (the sixth review)', () => {
    // Last week the bench led and the incline press followed it, as in the target test above.
    const session = record(4, 'barbell-bench-press', [
      [6, 185, 2],
      [6, 185, 2],
      [6, 185, 2],
    ]);
    const incline = record(
      4,
      'incline-dumbbell-press',
      [
        [9, 50, 2],
        [9, 50, 2],
        [9, 50, 2],
      ],
      [6, 10],
    );
    session.entries.push(...incline.entries);
    const history = [session];
    const workout = plan(history);
    // The bench behind the incline press: one pressing lift before it.
    const once = ok(
      busy(workout, named(workout, 'barbell-bench-press').id, emptyCompleted(), history),
    );
    // Then the incline behind the shoulder press. Passing over the bench, which waits on it, the
    // incline leaves the bench in front for a moment; the settling then puts the bench behind the
    // incline, two pressing lifts before it, and its target must be set for that place.
    const twice = ok(
      run(
        { type: 'equipment-busy', entryId: named(once.workout, 'incline-dumbbell-press').id },
        once.workout,
        once.constraints,
        { history },
      ),
    );
    expect(rows(twice.workout).slice(0, 3)).toEqual([
      'dumbbell-shoulder-press',
      'incline-dumbbell-press',
      'barbell-bench-press',
    ]);
    const bench = named(twice.workout, 'barbell-bench-press');
    expect(firstWorking(bench)).toBeLessThan(
      firstWorking(named(once.workout, 'barbell-bench-press')) as number,
    );
    expect(bench.progression?.evidence.join(' ')).toMatch(/sets on these muscles/);
  });

  it('never moves a lift stopped earlier, its logged set undone, for a move (the sixth review)', () => {
    const workout = plan();
    let now = workout;
    let constraints = emptyConstraints();
    let completed = emptyCompleted();
    const step = (trigger: RecalibrationTrigger) => {
      const result = ok(run(trigger, now, constraints, { completed }));
      now = result.workout;
      constraints = result.constraints;
    };
    // The bench goes behind the incline for busy equipment, is begun there, then swapped for the
    // dumbbell bench: the bench stops where it is, and the move knows it as its old name.
    step({ type: 'equipment-busy', entryId: named(now, 'barbell-bench-press').id });
    const bench = named(now, 'barbell-bench-press');
    const set = bench.sets.find((each) => each.kind === 'working')!;
    // One bench set logged out of order; the lifter is on the incline, in front.
    completed = {
      ...emptyCompleted(),
      startedAt: NOW,
      currentEntryId: named(now, 'incline-dumbbell-press').id,
      sets: [
        {
          entryId: bench.id,
          exerciseId: bench.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: 6,
          weight: set.targetWeight,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    step({ type: 'replace', entryId: bench.id, exerciseId: 'dumbbell-bench-press' });
    expect(constraints.postponed[0]?.was).toContain('barbell-bench-press');
    // The incline, in front, busy too: it goes behind the shoulder press, the dumbbell bench after
    // it; the stopped bench stays first.
    step({ type: 'equipment-busy', entryId: named(now, 'incline-dumbbell-press').id });
    const stoppedRow = () =>
      now.blocks.findIndex((block) =>
        block.entries.some((entry) => entry.id === bench.id && isStopped(entry)),
      );
    const before = stoppedRow();
    expect(before).toBeLessThan(rowOf(now, 'incline-dumbbell-press'));
    // The bench's one set undone: the stopped bench has a set not done again. A change that settles
    // the moves leaves its row where it is: a lift stopped earlier holds nothing.
    completed = { ...completed, sets: [] };
    step({
      type: 'replace',
      entryId: named(now, 'dumbbell-shoulder-press').id,
      exerciseId: 'arnold-press',
    });
    expect(stoppedRow()).toBe(before);
  });

  it('keeps a move through a hand reorder that puts its lift in front of nothing still to do (the sixth review)', () => {
    const workout = plan();
    // The incline gave way to the fly, whose pair is done now, after it: a lift done holds nothing.
    const pair = workout.blocks.find((block) =>
      block.entries.some((entry) => entry.exerciseId === 'cable-fly'),
    )!;
    const completed = finish(emptyCompleted(), pair);
    const constraints = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: 'incline-dumbbell-press', after: ['cable-fly'] }],
    };
    // The bench moved down by hand puts the incline first: in front of nothing still to do, so the
    // move stands.
    const reordered = ok(
      run(
        { type: 'reorder', entryId: named(workout, 'barbell-bench-press').id, direction: 'down' },
        workout,
        constraints,
        { completed },
      ),
    );
    expect(reordered.constraints.postponed).toEqual(constraints.postponed);
    // Put by hand in front of a lift it gave way to that is still to do, the move lapses.
    const open = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: 'dumbbell-shoulder-press', after: ['incline-dumbbell-press'] }],
    };
    const up = ok(
      run(
        { type: 'reorder', entryId: named(workout, 'dumbbell-shoulder-press').id, direction: 'up' },
        workout,
        open,
      ),
    );
    expect(up.constraints.postponed).toEqual([]);
  });

  it('sets a target for a row whose number stands while the rows before it changed (the seventh review)', () => {
    // Last week's push day, done at its targets: the plan's targets follow the work before each lift.
    const history = [planDone(plan(), 7)];
    let workout = plan(history);
    let constraints = emptyConstraints();
    const completed = { ...emptyCompleted(), startedAt: NOW };
    const tap = (exerciseId: string) => {
      const result = ok(
        run(
          { type: 'equipment-busy', entryId: named(workout, exerciseId).id },
          workout,
          constraints,
          {
            completed,
            history,
          },
        ),
      );
      workout = result.workout;
      constraints = result.constraints;
    };
    // The bench behind three rows, then the fly pair behind the lateral pair: the fly's row keeps
    // its number with other lifts before it than the plan's.
    tap('barbell-bench-press');
    tap('barbell-bench-press');
    tap('barbell-bench-press');
    tap('cable-fly');
    const fly = named(workout, 'cable-fly');
    const row = rowOf(workout, 'cable-fly');
    // The same length again rebuilds the plan and settles the moves: the order stands, and so does
    // the fly's target, set for the lifts before it now, not for the plan's own order.
    const rebuilt = ok(
      run({ type: 'duration', choice: 'default' }, workout, constraints, { completed, history }),
    );
    expect(rows(rebuilt.workout)).toEqual(rows(workout));
    expect(rowOf(rebuilt.workout, 'cable-fly')).toBe(row);
    const after = named(rebuilt.workout, 'cable-fly');
    expect(firstWorking(after)).toBe(firstWorking(fly));
    expect(after.progression?.evidence).toEqual(fly.progression?.evidence);
  });

  it("keeps a lift's old name in its new busy move, so a rebuild that brings the old lift back holds it (the seventh review)", () => {
    const workout = plan();
    // The bench behind the incline; a sore shoulder on the incline swaps it, and the bench, now
    // the dumbbell bench, keeps its move under its old name.
    const first = ok(busy(workout, named(workout, 'barbell-bench-press').id));
    const sore = ok(
      run(
        {
          type: 'pain',
          entryId: named(first.workout, 'incline-dumbbell-press').id,
          joint: 'shoulder',
        },
        first.workout,
        first.constraints,
      ),
    );
    const held = sore.constraints.postponed.find((item) =>
      item.was?.includes('barbell-bench-press'),
    );
    expect(held).toBeDefined();
    // Equipment busy on the lift swapped in: its new move still knows the old name.
    const again = ok(
      run(
        { type: 'equipment-busy', entryId: named(sore.workout, held!.exerciseId).id },
        sore.workout,
        sore.constraints,
      ),
    );
    const move = again.constraints.postponed.find((item) => item.exerciseId === held!.exerciseId);
    expect(move?.was).toContain('barbell-bench-press');
    // A check-in brings the barbell bench back: it is the busy lift under its old name, and it
    // does not lead.
    const tired = {
      energy: 2,
      soreness: 3,
      sleep: 2,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    const checked = ok(
      run({ type: 'readiness', readiness: tired }, again.workout, again.constraints),
    );
    expect(rowOf(checked.workout, 'barbell-bench-press')).toBeGreaterThan(0);
  });

  it('moves the lift behind a row still to do, never one holding only a lift stopped earlier (the seventh review)', () => {
    const workout = plan();
    const incline = named(workout, 'incline-dumbbell-press');
    const set = incline.sets.find((each) => each.kind === 'working')!;
    // One incline set logged out of order, the incline then swapped by hand: it stops, and its
    // stand-in takes the rest of its sets. That set undone: the stopped incline has a set not done.
    const logged = { ...emptyCompleted(), startedAt: NOW, sets: [loggedSet(incline, set.index)] };
    const swapped = ok(
      run(
        { type: 'replace', entryId: incline.id, exerciseId: 'incline-barbell-bench-press' },
        workout,
        emptyConstraints(),
        { completed: logged },
      ),
    );
    const bench = named(swapped.workout, 'barbell-bench-press');
    const completed = { ...logged, sets: [], currentEntryId: bench.id };
    // Equipment busy on the bench: it goes behind the stand-in, the next row with a lift to do,
    // and says so; the stopped incline holds nothing.
    const tapped = ok(
      run({ type: 'equipment-busy', entryId: bench.id }, swapped.workout, swapped.constraints, {
        completed,
      }),
    );
    expect(rowOf(tapped.workout, 'barbell-bench-press')).toBeGreaterThan(
      rowOf(tapped.workout, 'incline-barbell-bench-press'),
    );
    expect(tapped.summary.headline).toMatch(/moved after Incline Barbell Bench Press/);
  });

  it('passes over a row waiting on a row that waits on the lift tapped (the seventh review)', () => {
    let workout = plan();
    let constraints = emptyConstraints();
    const tap = (exerciseId: string) => {
      const result = ok(
        run(
          { type: 'equipment-busy', entryId: named(workout, exerciseId).id },
          workout,
          constraints,
        ),
      );
      workout = result.workout;
      constraints = result.constraints;
      return result;
    };
    tap('barbell-bench-press');
    tap('incline-dumbbell-press');
    // The shoulder press leads; the incline waits on it, and the bench on the incline.
    const before = rows(workout);
    const moved = tap('dumbbell-shoulder-press');
    expect(rows(workout)).not.toEqual(before);
    expect(rowOf(workout, 'dumbbell-shoulder-press')).toBeGreaterThan(rowOf(workout, 'cable-fly'));
    expect(moved.summary.headline).toMatch(/moved after Cable Fly and Cable Triceps Pushdown/);
  });

  it('counts a row as waiting when one of its lifts waits on a lift waiting on the one tapped (the seventh review)', () => {
    const workout = plan();
    const constraints = {
      ...emptyConstraints(),
      postponed: [
        { exerciseId: 'cable-fly', after: ['dumbbell-shoulder-press'] },
        { exerciseId: 'lateral-raise', after: ['cable-triceps-pushdown'] },
      ],
    };
    const shoulder = named(workout, 'dumbbell-shoulder-press');
    // The fly's pair waits on the shoulder press, and the lateral raise's pair on that pair's
    // pushdown: everything after the shoulder press waits on it.
    expect(postponeRefusal(workout, shoulder.id, () => false, constraints.postponed)).toBe(
      'waiting',
    );
    expect(run({ type: 'equipment-busy', entryId: shoulder.id }, workout, constraints).ok).toBe(
      false,
    );
  });

  it('moves a pair whose other lift the lifter is on (the seventh review)', () => {
    const workout = plan();
    const pair = workout.blocks.find((block) =>
      block.entries.some((entry) => entry.exerciseId === 'cable-fly'),
    ) as WorkoutBlock;
    const at = workout.blocks.indexOf(pair);
    // Every row before the pair done, its ramps and the fly's first working set logged: the
    // pushdown is next.
    let completed: CompletedWork = { ...emptyCompleted(), startedAt: NOW };
    for (const block of workout.blocks.slice(0, at)) completed = finish(completed, block);
    const fly = pair.entries.find((entry) => entry.exerciseId === 'cable-fly') as WorkoutEntry;
    const pushdown = pair.entries.find((entry) => entry !== fly) as WorkoutEntry;
    const sets = [
      ...pair.entries.flatMap((entry) =>
        entry.sets.filter((set) => set.kind === 'warmup').map((set) => loggedSet(entry, set.index)),
      ),
      loggedSet(fly, fly.sets.find((set) => set.kind === 'working')!.index),
    ];
    completed = { ...completed, sets: [...completed.sets, ...sets], currentEntryId: pushdown.id };
    // Equipment busy on the fly: the pair leaves the front whole, behind the next row.
    const moved = ok(
      run({ type: 'equipment-busy', entryId: fly.id }, workout, emptyConstraints(), { completed }),
    );
    expect(moved.workout.blocks.findIndex((block) => block.id === pair.id)).toBe(at + 1);
    expect(moved.constraints.postponed).toEqual([
      { exerciseId: 'cable-fly', after: ['lateral-raise', 'ez-bar-curl'] },
    ]);
  });

  it('sets a target for its new place for a row the busy lift passes (the seventh review)', () => {
    const session = record(4, 'barbell-bench-press', [
      [6, 185, 2],
      [6, 185, 2],
      [6, 185, 2],
    ]);
    const incline = record(
      4,
      'incline-dumbbell-press',
      [
        [9, 50, 2],
        [9, 50, 2],
        [9, 50, 2],
      ],
      [6, 10],
    );
    session.entries.push(...incline.entries);
    const history = [session];
    const workout = plan(history);
    const before = named(workout, 'incline-dumbbell-press');
    const moved = ok(
      busy(workout, named(workout, 'barbell-bench-press').id, emptyCompleted(), history),
    );
    // In front now, the incline is planned as a lift with nothing before it: a fuller ramp.
    expect(named(moved.workout, 'incline-dumbbell-press').warmupSets).toBeGreaterThan(
      before.warmupSets,
    );
  });

  it('lets a move lapse when a move by hand puts its lift in front of any lift it gave way to still to do (the seventh review)', () => {
    const workout = plan();
    // The shoulder press waits on the incline, before it, and on the lateral raise, after it.
    const constraints = {
      ...emptyConstraints(),
      postponed: [
        {
          exerciseId: 'dumbbell-shoulder-press',
          after: ['incline-dumbbell-press', 'lateral-raise'],
        },
      ],
    };
    // Moved down by hand past the fly pair, it is behind the incline but still in front of the
    // lateral raise: in front of a lift it gave way to, the move lapses.
    const down = ok(
      run(
        {
          type: 'reorder',
          entryId: named(workout, 'dumbbell-shoulder-press').id,
          direction: 'down',
        },
        workout,
        constraints,
      ),
    );
    expect(rowOf(down.workout, 'dumbbell-shoulder-press')).toBeLessThan(
      rowOf(down.workout, 'lateral-raise'),
    );
    expect(down.constraints.postponed).toEqual([]);
  });

  it('falls a move back behind the next row with a lift to do, past a row that is done (the seventh review)', () => {
    const workout = plan();
    const incline = workout.blocks.find((block) =>
      block.entries.some((entry) => entry.exerciseId === 'incline-dumbbell-press'),
    ) as WorkoutBlock;
    // The incline done out of order; the bench's lifts given way to are gone from the plan.
    const completed = finish(emptyCompleted(), incline);
    const constraints = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: 'barbell-bench-press', after: ['machine-chest-press'] }],
    };
    const rebuilt = ok(
      run({ type: 'duration', choice: 'default' }, workout, constraints, { completed }),
    );
    // Leading, it waits behind the shoulder press: the done incline is nothing to wait behind.
    expect(rowOf(rebuilt.workout, 'barbell-bench-press')).toBeGreaterThan(
      rowOf(rebuilt.workout, 'dumbbell-shoulder-press'),
    );
    expect(rebuilt.constraints.postponed).toContainEqual({
      exerciseId: 'barbell-bench-press',
      after: ['dumbbell-shoulder-press'],
    });
  });

  it('ends no move for a lift stopped earlier that the lifter is back on after an undone set (the seventh review)', () => {
    const workout = plan();
    const bench = named(workout, 'barbell-bench-press');
    const set = bench.sets.find((each) => each.kind === 'working')!;
    // A bench set logged, then the bench swapped by hand for the dumbbell bench: it stops.
    const logged = {
      ...emptyCompleted(),
      startedAt: NOW,
      currentEntryId: bench.id,
      sets: [loggedSet(bench, set.index)],
    };
    const swapped = ok(
      run(
        { type: 'replace', entryId: bench.id, exerciseId: 'dumbbell-bench-press' },
        workout,
        emptyConstraints(),
        { completed: logged },
      ),
    );
    // The dumbbell bench waits on the incline under the bench's old name, as a busy move carried
    // through the swap. The bench set undone: the lifter is back on the stopped bench.
    const constraints = {
      ...emptyConstraints(),
      postponed: [
        {
          exerciseId: 'dumbbell-bench-press',
          after: ['incline-dumbbell-press'],
          was: ['barbell-bench-press'],
        },
      ],
    };
    const completed = { ...logged, sets: [] };
    const tapped = ok(
      run(
        { type: 'equipment-busy', entryId: named(swapped.workout, 'dumbbell-bench-press').id },
        swapped.workout,
        constraints,
        { completed },
      ),
    );
    // The stopped bench holds no move: the dumbbell bench's move stands, and it goes where it said.
    expect(rowOf(tapped.workout, 'dumbbell-bench-press')).toBeGreaterThan(
      rowOf(tapped.workout, 'incline-dumbbell-press'),
    );
    const move = tapped.constraints.postponed.find(
      (item) => item.exerciseId === 'dumbbell-bench-press',
    );
    expect(move?.was).toEqual(['barbell-bench-press']);
    expect(tapped.summary.headline).toMatch(/^Dumbbell Bench Press moved after /);
  });
});

/** The eighth review: a busy tap and the names other lifts' moves keep, and the fallback's rows. */
describe('Equipment busy and the names of other lifts (the eighth review)', () => {
  const homeProfile = { ...profile, currentLocationId: home.id };
  const open = (workout: GeneratedWorkout, exerciseId: string) =>
    allEntries(workout.blocks).find(
      (entry) => entry.exerciseId === exerciseId && !isStopped(entry),
    ) as WorkoutEntry;

  /** A change at home, at the length the session stands at. */
  function atHome(
    trigger: RecalibrationTrigger,
    workout: GeneratedWorkout,
    constraints: SessionConstraints,
    options: { completed?: CompletedWork; duration?: DurationChoice } = {},
  ): RecalibrationResult {
    const completed = options.completed ?? emptyCompleted();
    return recalibrate({
      trigger,
      workout,
      completed,
      lockedEntryIds: [],
      currentEntryId: completed.currentEntryId,
      duration: options.duration ?? 'default',
      profile: homeProfile,
      location: home,
      history: [],
      constraints,
      reason: 'test',
      timestamp: NOW,
    });
  }

  /**
   * At home, a short push day; busy on the bench, swapped for the shoulder press and back; then the
   * full length again, the shoulder press back as a pick of its own. The bench's move still knows
   * the shoulder press as an old name.
   */
  function swappedBack() {
    const start = generateWorkout({
      profile: homeProfile,
      location: home,
      history: [],
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const short = ok(atHome({ type: 'duration', choice: 15 }, start, emptyConstraints()));
    const at15 = { duration: 15 as const };
    const bench = open(short.workout, 'dumbbell-bench-press');
    const moved = ok(
      atHome({ type: 'equipment-busy', entryId: bench.id }, short.workout, short.constraints, at15),
    );
    const away = ok(
      atHome(
        {
          type: 'replace',
          entryId: open(moved.workout, 'dumbbell-bench-press').id,
          exerciseId: 'dumbbell-shoulder-press',
        },
        moved.workout,
        moved.constraints,
        at15,
      ),
    );
    const back = ok(
      atHome(
        {
          type: 'replace',
          entryId: open(away.workout, 'dumbbell-shoulder-press').id,
          exerciseId: 'dumbbell-bench-press',
        },
        away.workout,
        away.constraints,
        at15,
      ),
    );
    return ok(
      atHome({ type: 'duration', choice: 'default' }, back.workout, back.constraints, at15),
    );
  }

  it('moves the lift tapped when the lifter is on a lift whose move knows it by an old name', () => {
    const full = swappedBack();
    expect(full.constraints.postponed).toEqual([
      {
        exerciseId: 'dumbbell-bench-press',
        after: ['incline-dumbbell-press'],
        was: ['dumbbell-shoulder-press'],
      },
    ]);
    expect(rows(full.workout).slice(0, 3)).toEqual([
      'incline-dumbbell-press',
      'dumbbell-bench-press',
      'dumbbell-shoulder-press',
    ]);
    // The incline done: the lifter is on the bench.
    const incline = full.workout.blocks[0] as WorkoutBlock;
    const completed = {
      ...finish(emptyCompleted(), incline),
      currentEntryId: open(full.workout, 'dumbbell-bench-press').id,
    };
    const tapped = ok(
      atHome(
        { type: 'equipment-busy', entryId: open(full.workout, 'dumbbell-shoulder-press').id },
        full.workout,
        full.constraints,
        { completed },
      ),
    );
    // Before, the tap took the bench's move as its own and held the bench, which the lifter is
    // on: the front rule ended it, and nothing moved.
    const behind = rowOf(tapped.workout, 'band-fly');
    expect(behind).toBeGreaterThan(0);
    expect(rowOf(tapped.workout, 'dumbbell-shoulder-press')).toBeGreaterThan(behind);
    expect(rowOf(tapped.workout, 'dumbbell-bench-press')).toBe(1);
    expect(tapped.constraints.postponed).toEqual([
      {
        exerciseId: 'dumbbell-shoulder-press',
        after: (tapped.workout.blocks[behind] as WorkoutBlock).entries.map(
          (entry) => entry.exerciseId,
        ),
      },
    ]);
    expect(tapped.summary.headline).toMatch(/^Dumbbell Shoulder Press moved after Band Fly/);
  });

  it('moves only the lift tapped, keeping the other lift its move without the name', () => {
    const full = swappedBack();
    const completed = {
      ...emptyCompleted(),
      startedAt: NOW,
      currentEntryId: open(full.workout, 'incline-dumbbell-press').id,
    };
    const tapped = ok(
      atHome(
        { type: 'equipment-busy', entryId: open(full.workout, 'dumbbell-shoulder-press').id },
        full.workout,
        full.constraints,
        { completed },
      ),
    );
    // Before, the tap's move held the bench too, and the bench went behind the fly pair as well.
    expect(rows(tapped.workout).slice(0, 2)).toEqual([
      'incline-dumbbell-press',
      'dumbbell-bench-press',
    ]);
    expect(rowOf(tapped.workout, 'dumbbell-shoulder-press')).toBeGreaterThan(
      rowOf(tapped.workout, 'band-fly'),
    );
    expect(tapped.constraints.postponed).toEqual([
      { exerciseId: 'dumbbell-bench-press', after: ['incline-dumbbell-press'] },
      {
        exerciseId: 'dumbbell-shoulder-press',
        after: (
          tapped.workout.blocks[rowOf(tapped.workout, 'band-fly')] as WorkoutBlock
        ).entries.map((entry) => entry.exerciseId),
      },
    ]);
  });

  it('never gives a busy move an old name that a lift in the plan has', () => {
    const workout = plan();
    const before = rows(workout);
    const incline = rowOf(workout, 'incline-dumbbell-press');
    const press = rowOf(workout, 'dumbbell-shoulder-press');
    expect(incline).toBeLessThan(press);
    expect(press).toBeLessThan(workout.blocks.length - 1);
    // The shoulder press's move knows it by the incline's name, the incline back as a lift of its
    // own (a swap, then a rebuild).
    const constraints = {
      ...emptyConstraints(),
      postponed: [
        {
          exerciseId: 'dumbbell-shoulder-press',
          after: ['barbell-bench-press'],
          was: ['incline-dumbbell-press'],
        },
      ],
    };
    const tapped = ok(
      run(
        { type: 'equipment-busy', entryId: open(workout, 'dumbbell-shoulder-press').id },
        workout,
        constraints,
      ),
    );
    // Before, the tap's move took the incline's name and held it, and the incline moved too.
    expect(rowOf(tapped.workout, 'incline-dumbbell-press')).toBe(incline);
    expect(rowOf(tapped.workout, 'dumbbell-shoulder-press')).toBe(press + 1);
    expect(rows(tapped.workout)[press]).toBe(before[press + 1]);
    expect(tapped.constraints.postponed).toEqual([
      {
        exerciseId: 'dumbbell-shoulder-press',
        after: (workout.blocks[press + 1] as WorkoutBlock).entries.map((entry) => entry.exerciseId),
      },
    ]);
  });

  /** A lift with one working set logged, swapped by hand (it stops), then that set undone. */
  function stopAndUndo(
    workout: GeneratedWorkout,
    exerciseId: string,
    to: string,
    completed: CompletedWork,
  ) {
    const entry = open(workout, exerciseId);
    const set = entry.sets.find((each) => each.kind === 'working') as WorkoutEntry['sets'][number];
    const logged = { ...completed, sets: [...completed.sets, loggedSet(entry, set.index)] };
    const swapped = ok(
      run({ type: 'replace', entryId: entry.id, exerciseId: to }, workout, emptyConstraints(), {
        completed: logged,
      }),
    );
    return { workout: swapped.workout, entry, completed: { ...logged, sets: completed.sets } };
  }

  it('falls a move back from the first row holding a lift to do, past a stopped lift the lifter is back on', () => {
    // The bench, a set logged, swapped by hand (it stops in the first row), the set undone.
    const stopped = stopAndUndo(plan(), 'barbell-bench-press', 'dumbbell-bench-press', {
      ...emptyCompleted(),
      startedAt: NOW,
    });
    // The dumbbell bench waits on a lift gone from the plan.
    const constraints = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: 'dumbbell-bench-press', after: ['machine-chest-press'] }],
    };
    const settled = ok(
      run(
        {
          type: 'replace',
          entryId: open(stopped.workout, 'dumbbell-shoulder-press').id,
          exerciseId: 'arnold-press',
        },
        stopped.workout,
        constraints,
        { completed: { ...stopped.completed, currentEntryId: stopped.entry.id } },
      ),
    );
    // The dumbbell bench leads the lifts still to do: it waits behind the next row, the incline.
    // Before, the stopped bench's row counted as the first, and the dumbbell bench led.
    expect(rowOf(settled.workout, 'dumbbell-bench-press')).toBeGreaterThan(
      rowOf(settled.workout, 'incline-dumbbell-press'),
    );
    expect(settled.constraints.postponed).toContainEqual({
      exerciseId: 'dumbbell-bench-press',
      after: ['incline-dumbbell-press'],
    });
  });

  it('falls a move back past a row holding only a lift stopped earlier with a set undone', () => {
    // The incline stopped (a set logged, swapped by hand, the set undone), then the bench too.
    const one = stopAndUndo(plan(), 'incline-dumbbell-press', 'incline-barbell-bench-press', {
      ...emptyCompleted(),
      startedAt: NOW,
    });
    const two = stopAndUndo(
      one.workout,
      'barbell-bench-press',
      'dumbbell-bench-press',
      one.completed,
    );
    const constraints = {
      ...emptyConstraints(),
      postponed: [{ exerciseId: 'dumbbell-bench-press', after: ['machine-chest-press'] }],
    };
    const settled = ok(
      run(
        {
          type: 'replace',
          entryId: open(two.workout, 'dumbbell-shoulder-press').id,
          exerciseId: 'arnold-press',
        },
        two.workout,
        constraints,
        { completed: { ...two.completed, currentEntryId: two.entry.id } },
      ),
    );
    // It waits behind the incline's stand-in, a lift still to do, never the stopped incline.
    expect(settled.constraints.postponed).toContainEqual({
      exerciseId: 'dumbbell-bench-press',
      after: ['incline-barbell-bench-press'],
    });
    expect(rowOf(settled.workout, 'dumbbell-bench-press')).toBeGreaterThan(
      rowOf(settled.workout, 'incline-barbell-bench-press'),
    );
  });
});
