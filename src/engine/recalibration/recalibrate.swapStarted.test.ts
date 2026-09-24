import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { stoppedNote, stoppedText } from '../workout/setText';
import {
  allEntries,
  isStopped,
  planOwnExercise,
  stoppedBefore,
  type GeneratedWorkout,
  type WorkoutBlock,
  type WorkoutEntry,
} from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  CompletedWork,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';

/**
 * Maintenance 22, item 29: a swap once an exercise has sets logged. From the owner's gym: a set
 * of the bodyweight Standing Calf Raise logged, then the Leg Press Calf Raise swapped in, and
 * every set after it asked for no weight; a barbell bench press swapped for dumbbells kept the
 * barbell's weight for each hand. Now the started exercise stops at what it logged, under its own
 * name, and the new one follows it for the sets still to come with its own targets.
 */

const NOW = '2026-09-23T17:00:00.000Z';
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };

function gymWorkout(): GeneratedWorkout {
  return generateWorkout({ profile, location: gym, history: [], now: NOW, duration: 'default' });
}

function run(
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  completed: CompletedWork,
  place: LocationProfile | undefined = gym,
  constraints: SessionConstraints = emptyConstraints(),
): RecalibrationSuccess {
  const result = recalibrate({
    trigger,
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: workout.duration.choice,
    profile: { ...profile, currentLocationId: place?.id ?? 'gym' },
    location: place,
    history: [],
    constraints,
    reason: 'test',
    timestamp: NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** The given sets of an entry logged, as the store records them. */
function logged(entry: WorkoutEntry, count: number, weight: number | null = 100): CompletedWork {
  return {
    ...emptyCompleted(),
    startedAt: NOW,
    elapsedSeconds: 10 * 60,
    currentEntryId: entry.id,
    sets: entry.sets.slice(0, count).map((set) => ({
      entryId: entry.id,
      exerciseId: entry.exerciseId,
      setIndex: set.index,
      kind: set.kind,
      reps: 8,
      weight: set.kind === 'working' ? weight : set.targetWeight,
      rir: 2,
      completedAt: NOW,
    })),
  };
}

const find = (workout: GeneratedWorkout, id: string) =>
  allEntries(workout.blocks).find((entry) => entry.id === id);
const after = (workout: GeneratedWorkout, id: string) => {
  const entries = allEntries(workout.blocks);
  return entries[entries.findIndex((entry) => entry.id === id) + 1];
};
const working = (entry: WorkoutEntry | undefined) =>
  entry?.sets.filter((set) => set.kind === 'working') ?? [];
const ramps = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'warmup').length;
/** The sets logged, not skipped, as a stopped row counts them. */
const loggedKeys = (completed: CompletedWork) =>
  new Set(
    completed.sets.filter((set) => !set.skipped).map((set) => `${set.entryId}:${set.setIndex}`),
  );

/** A workout whose first entry is the given exercise, not started. */
function withFirst(exerciseId: string): GeneratedWorkout {
  const workout = gymWorkout();
  const [first] = allEntries(workout.blocks);
  return run({ type: 'replace', entryId: first!.id, exerciseId }, workout, emptyCompleted())
    .workout;
}

describe('a swap once sets are logged', () => {
  it('keeps the logged barbell sets under the bench press, and gives dumbbells their own weight', () => {
    const workout = gymWorkout();
    const bench = allEntries(workout.blocks)[0]!;
    expect(bench.exerciseId).toBe('barbell-bench-press');
    const done = ramps(bench) + 1;
    const completed = logged(bench, done);
    const result = run(
      { type: 'replace', entryId: bench.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      completed,
    );
    const stopped = find(result.workout, bench.id);
    // The bench press keeps its name and exactly the sets it logged, and says what it owed.
    expect(stopped?.exerciseId).toBe('barbell-bench-press');
    expect(stopped?.sets).toEqual(bench.sets.slice(0, done));
    expect(stopped?.stopped).toEqual({ owed: working(bench).length - 1, why: 'swap' });
    // Dumbbells follow it for the sets still to come, at a dumbbell's weight per hand.
    const stand = after(result.workout, bench.id);
    expect(stand?.exerciseId).toBe('dumbbell-bench-press');
    expect(stand?.replacedFrom).toBe('barbell-bench-press');
    expect(stand?.locked).toBe(true);
    expect(working(stand)).toHaveLength(working(bench).length - 1);
    const fresh = working(find(withFirst('dumbbell-bench-press'), bench.id))[0]?.targetWeight;
    const barbell = working(bench)[0]?.targetWeight ?? 0;
    for (const set of working(stand)) {
      expect(set.targetWeight).not.toBeNull();
      expect(set.targetWeight ?? 0).toBeLessThan(barbell);
      expect(set.targetWeight ?? 0).toBeLessThanOrEqual(fresh ?? 0);
    }
    // Nothing is logged against the new exercise, so its sets are all still to come.
    expect(new Set(stand?.sets.map((set) => set.index)).size).toBe(stand?.sets.length);
    expect(result.summary.headline).toBe('Swapped Barbell Bench Press for Dumbbell Bench Press.');
  });

  it('gives the Leg Press Calf Raise its own weight after a bodyweight calf raise was started', () => {
    // The owner's gym: the plan's calf raise swapped for the Standing Calf Raise, one set logged
    // at bodyweight, then the Leg Press Calf Raise swapped in.
    const workout = withFirst('standing-calf-raise');
    const calf = allEntries(workout.blocks)[0]!;
    expect(working(calf)[0]?.targetWeight).toBeNull();
    const completed = logged(calf, ramps(calf) + 1, null);
    const result = run(
      { type: 'replace', entryId: calf.id, exerciseId: 'leg-press-calf-raise' },
      workout,
      completed,
    );
    expect(find(result.workout, calf.id)?.exerciseId).toBe('standing-calf-raise');
    const stand = after(result.workout, calf.id);
    expect(stand?.exerciseId).toBe('leg-press-calf-raise');
    expect(working(stand).length).toBeGreaterThan(0);
    expect(working(stand).every((set) => (set.targetWeight ?? 0) > 0)).toBe(true);
  });

  it('files every change as one swap: the stand-in reads as replaced, nothing reads as trimmed', () => {
    const workout = gymWorkout();
    const bench = allEntries(workout.blocks)[0]!;
    const result = run(
      { type: 'replace', entryId: bench.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      logged(bench, ramps(bench) + 1),
    );
    const stand = after(result.workout, bench.id)!;
    expect(result.changes).toEqual([
      expect.objectContaining({
        entryId: stand.id,
        kind: 'replaced',
        exerciseId: 'dumbbell-bench-press',
        previousExerciseId: 'barbell-bench-press',
      }),
    ]);
    expect(result.summary.counts).toMatchObject({ replaced: 1, added: 0, setsTrimmed: 0 });
  });

  it('refuses to swap an exercise that is done', () => {
    const workout = gymWorkout();
    const bench = allEntries(workout.blocks)[0]!;
    const result = recalibrate({
      trigger: { type: 'replace', entryId: bench.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      completed: logged(bench, bench.sets.length),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: workout.duration.choice,
      profile,
      location: gym,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Barbell Bench Press is done/);
  });
});

describe('swapping back', () => {
  function swappedAfterOneSet() {
    const workout = gymWorkout();
    const bench = allEntries(workout.blocks)[0]!;
    const completed = logged(bench, ramps(bench) + 1);
    const swapped = run(
      { type: 'replace', entryId: bench.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      completed,
    );
    return { bench, completed, swapped, stand: after(swapped.workout, bench.id)! };
  }

  it('picks the bench press up again instead of adding it twice', () => {
    const { bench, completed, swapped, stand } = swappedAfterOneSet();
    const back = run(
      { type: 'replace', entryId: stand.id, exerciseId: 'barbell-bench-press' },
      swapped.workout,
      { ...completed, currentEntryId: stand.id },
    );
    const entries = allEntries(back.workout.blocks);
    expect(entries.filter((entry) => entry.exerciseId === 'barbell-bench-press')).toHaveLength(1);
    expect(entries.some((entry) => entry.id === stand.id)).toBe(false);
    const lift = find(back.workout, bench.id)!;
    expect(isStopped(lift)).toBe(false);
    expect(lift.sets.slice(0, completed.sets.length)).toEqual(
      bench.sets.slice(0, completed.sets.length),
    );
    expect(working(lift)).toHaveLength(working(bench).length);
    // Already warmed up on it: no ramp comes back with it.
    expect(ramps(lift)).toBe(ramps(bench));
  });

  it('stops a stand-in already started, and the bench press takes the sets it still owed', () => {
    const { bench, completed, swapped, stand } = swappedAfterOneSet();
    const first = working(stand)[0]!;
    const withStand: CompletedWork = {
      ...completed,
      currentEntryId: stand.id,
      sets: [
        ...completed.sets,
        {
          entryId: stand.id,
          exerciseId: stand.exerciseId,
          setIndex: first.index,
          kind: 'working',
          reps: 10,
          weight: 40,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    const back = run(
      { type: 'replace', entryId: stand.id, exerciseId: 'barbell-bench-press' },
      swapped.workout,
      withStand,
    );
    const standNow = find(back.workout, stand.id)!;
    expect(isStopped(standNow)).toBe(true);
    expect(standNow.sets.map((set) => set.index)).toEqual(
      stand.sets.filter((set) => set.index <= first.index).map((set) => set.index),
    );
    const lift = find(back.workout, bench.id)!;
    // One barbell set before the swap, one dumbbell set after it: the rest is the bench's.
    expect(working(lift)).toHaveLength(working(bench).length - 1);
  });
});

describe('a swap in a superset', () => {
  /** The first two isolation entries paired as a superset. */
  function paired(): { workout: GeneratedWorkout; a1: WorkoutEntry; a2: WorkoutEntry } {
    const workout = gymWorkout();
    const isolation = allEntries(workout.blocks).filter((entry) => entry.role === 'isolation');
    const [a1, a2] = isolation;
    if (!a1 || !a2) throw new Error('no isolation pair');
    const rest = workout.blocks.filter(
      (block) => !block.entries.some((entry) => entry === a1 || entry === a2),
    );
    const at = workout.blocks.findIndex((block) => block.entries.includes(a1));
    const superset: WorkoutBlock = {
      id: `s-${a1.id}-${a2.id}`,
      kind: 'superset',
      label: 'pair',
      entries: [a1, a2],
      rounds: Math.min(working(a1).length, working(a2).length),
      restBetweenRoundsSeconds: 90,
    };
    const blocks = [...rest];
    blocks.splice(at, 0, superset);
    return { workout: { ...workout, blocks }, a1, a2 };
  }

  function alternativeFor(entry: WorkoutEntry, workout: GeneratedWorkout): string {
    const inWorkout = new Set(allEntries(workout.blocks).map((candidate) => candidate.exerciseId));
    const pattern = requireExercise(entry.exerciseId).movementPattern;
    const choice = requireExercise(entry.exerciseId).substitutions.find(
      (id) =>
        !inWorkout.has(id) &&
        requireExercise(id).movementPattern === pattern &&
        requireExercise(id).equipment.some((option) =>
          option.every((item) => gym?.equipment.includes(item)),
        ),
    );
    if (!choice) throw new Error(`no alternative for ${entry.exerciseId}`);
    return choice;
  }

  it('keeps the pairing when its rounds have not started, the stand-in in the stopped move’s place', () => {
    const { workout, a1, a2 } = paired();
    // A1's first set logged; A2 not yet: round one is not done.
    const completed = logged(a1, 1, 20);
    const to = alternativeFor(a1, workout);
    const result = run({ type: 'replace', entryId: a1.id, exerciseId: to }, workout, completed);
    const pairing = result.workout.blocks.find((block) => block.kind === 'superset');
    expect(pairing?.entries.map((entry) => entry.exerciseId)).toEqual([to, a2.exerciseId]);
    const own = result.workout.blocks.find((block) => block.entries.some((e) => e.id === a1.id));
    expect(own?.kind).toBe('straight');
    expect(result.workout.blocks.indexOf(own!)).toBeLessThan(
      result.workout.blocks.indexOf(pairing!),
    );
  });

  it('ends the pairing when a swap back stops the stand-in inside it', () => {
    const { workout, a1, a2 } = paired();
    const completed = logged(a1, 1, 20);
    const to = alternativeFor(a1, workout);
    const swapped = run({ type: 'replace', entryId: a1.id, exerciseId: to }, workout, completed);
    const stand = allEntries(swapped.workout.blocks).find((entry) => entry.exerciseId === to)!;
    const partner = find(swapped.workout, a2.id)!;
    // A round of the new pairing done, then back to the first move.
    const round: CompletedWork = {
      ...completed,
      currentEntryId: stand.id,
      sets: [...completed.sets, ...logged(stand, 1, 20).sets, ...logged(partner, 1, 20).sets],
    };
    const back = run(
      { type: 'replace', entryId: stand.id, exerciseId: a1.exerciseId },
      swapped.workout,
      round,
    );
    expect(isStopped(find(back.workout, stand.id)!)).toBe(true);
    expect(isStopped(find(back.workout, a1.id)!)).toBe(false);
    // Nothing stopped stays paired: its rounds can no longer line up.
    const paired_ = back.workout.blocks.filter((block) => block.kind !== 'straight');
    expect(paired_.flatMap((block) => block.entries).filter(isStopped)).toEqual([]);
  });

  it('ends the pairing once rounds are under way, each move running its own sets', () => {
    const { workout, a1, a2 } = paired();
    const first = logged(a1, 1, 20);
    const both: CompletedWork = {
      ...first,
      sets: [...first.sets, ...logged(a2, 1, 20).sets],
    };
    const to = alternativeFor(a1, workout);
    const result = run({ type: 'replace', entryId: a1.id, exerciseId: to }, workout, both);
    const blockOf = (exerciseId: string) =>
      result.workout.blocks.find((block) =>
        block.entries.some((entry) => entry.exerciseId === exerciseId),
      );
    expect([a1.exerciseId, to, a2.exerciseId].map((id) => blockOf(id)?.kind)).toEqual([
      'straight',
      'straight',
      'straight',
    ]);
    const order = allEntries(result.workout.blocks).map((entry) => entry.exerciseId);
    const at = order.indexOf(a1.exerciseId);
    expect(order.slice(at, at + 3)).toEqual([a1.exerciseId, to, a2.exerciseId]);
  });
});

describe('a later change after a swap', () => {
  it('never undoes the lifter’s own swap, even where the stopped exercise fits', () => {
    const workout = gymWorkout();
    const bench = allEntries(workout.blocks)[0]!;
    const completed = logged(bench, ramps(bench) + 1);
    const swapped = run(
      { type: 'replace', entryId: bench.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      completed,
    );
    const later = run(
      { type: 'duration', choice: 45 },
      swapped.workout,
      { ...completed, currentEntryId: null },
      gym,
    );
    expect(isStopped(find(later.workout, bench.id)!)).toBe(true);
    expect(after(later.workout, bench.id)?.exerciseId).toBe('dumbbell-bench-press');
  });

  it('keeps a lift swapped out for busy equipment stopped while the equipment stays busy', () => {
    const workout = gymWorkout();
    const bench = allEntries(workout.blocks)[0]!;
    const completed = logged(bench, ramps(bench) + 1);
    const busy = run({ type: 'equipment-busy', entryId: bench.id }, workout, completed);
    expect(isStopped(find(busy.workout, bench.id)!)).toBe(true);
    const stand = after(busy.workout, bench.id);
    expect(stand?.exerciseId).not.toBe('barbell-bench-press');
    const later = run(
      { type: 'duration', choice: 45 },
      busy.workout,
      { ...completed, currentEntryId: null },
      gym,
      busy.constraints,
    );
    expect(isStopped(find(later.workout, bench.id)!)).toBe(true);
    expect(requireExercise(after(later.workout, bench.id)!.exerciseId).movementPattern).toBe(
      'horizontal-push',
    );
    expect(home).toBeDefined();
  });
});

// The independent review of Maintenance 22 (engine): each case below failed before its fix.
describe('after a swap, what the next change may not undo', () => {
  function swappedAfterOneSet() {
    const workout = gymWorkout();
    const bench = allEntries(workout.blocks)[0]!;
    const completed = logged(bench, ramps(bench) + 1);
    const swapped = run(
      { type: 'replace', entryId: bench.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      completed,
    );
    const idle: CompletedWork = { ...completed, currentEntryId: null };
    return { bench, completed, idle, swapped, stand: after(swapped.workout, bench.id)! };
  }

  it('keeps the swapped-out lift stopped when the stand-in is skipped, and brings no sets back', () => {
    const { bench, idle, swapped, stand } = swappedAfterOneSet();
    const owed = find(swapped.workout, bench.id)?.stopped?.owed ?? 0;
    expect(owed).toBeGreaterThan(0);
    const skipped = run({ type: 'skip', entryId: stand.id }, swapped.workout, idle);
    const stoppedLift = find(skipped.workout, bench.id)!;
    // It keeps the count it stopped at, and still reads as one of all its sets done.
    expect(stoppedLift.stopped).toEqual({ owed, why: 'skip' });
    expect(stoppedText(stoppedLift, loggedKeys(idle))).toBe(`Stopped: 1 of ${1 + owed} sets done`);
    expect(stoppedNote(skipped.workout.blocks, stoppedLift, loggedKeys(idle))).toBe(
      `Stopped: 1 of ${1 + owed} sets done. Nothing is left to change on it today.`,
    );
    const later = run(
      { type: 'duration', choice: 45 },
      skipped.workout,
      idle,
      gym,
      skipped.constraints,
    );
    const lift = find(later.workout, bench.id)!;
    expect(isStopped(lift)).toBe(true);
    expect(working(lift)).toHaveLength(1);
    const pressing = allEntries(later.workout.blocks).filter(
      (entry) => requireExercise(entry.exerciseId).movementPattern === 'horizontal-push',
    );
    expect(pressing.map((entry) => entry.id)).toEqual([bench.id]);
  });

  it('refuses edits on the stopped lift: nothing is left to change on it', () => {
    const { bench, idle, swapped } = swappedAfterOneSet();
    const lift = find(swapped.workout, bench.id)!;
    expect(stoppedNote(swapped.workout.blocks, lift, loggedKeys(idle))).toMatch(
      /^Stopped: 1 of \d+ sets done\. Dumbbell Bench Press took over the rest\.$/,
    );
    const triggers: RecalibrationTrigger[] = [
      { type: 'sets', entryId: bench.id, workingDelta: 1 },
      { type: 'add-warmup', entryId: bench.id },
      { type: 'rep-range', entryId: bench.id, reps: [4, 6] },
      { type: 'drop-set', entryId: bench.id, on: true },
      { type: 'target-weight', entryId: bench.id, weight: 135 },
      { type: 'rest-adjust', entryId: bench.id, deltaSeconds: 30 },
      { type: 'pin', entryId: bench.id, pinned: true },
      { type: 'equipment-busy', entryId: bench.id },
    ];
    for (const trigger of triggers) {
      expect(() => run(trigger, swapped.workout, idle), trigger.type).toThrow(
        'Barbell Bench Press has stopped: nothing is left to change on it.',
      );
    }
  });

  it('counts only the sets still logged when a logged set is deleted', () => {
    const { bench, idle, swapped } = swappedAfterOneSet();
    const lift = find(swapped.workout, bench.id)!;
    const owed = lift.stopped?.owed ?? 0;
    const deleted = { ...idle, sets: idle.sets.filter((set) => set.kind !== 'working') };
    expect(stoppedText(lift, loggedKeys(deleted))).toBe(`Stopped: 0 of ${1 + owed} sets done`);
  });

  it('keeps it stopped after the stand-in is pinned and unpinned', () => {
    const { bench, idle, swapped, stand } = swappedAfterOneSet();
    const pinned = run({ type: 'pin', entryId: stand.id, pinned: true }, swapped.workout, idle);
    const unpinned = run({ type: 'pin', entryId: stand.id, pinned: false }, pinned.workout, idle);
    const later = run({ type: 'duration', choice: 45 }, unpinned.workout, idle);
    expect(isStopped(find(later.workout, bench.id)!)).toBe(true);
    expect(working(find(later.workout, bench.id))).toHaveLength(1);
  });

  it('keeps a lift swapped out for pain stopped', () => {
    const workout = gymWorkout();
    const [bench, , press] = allEntries(workout.blocks);
    expect(press?.exerciseId).toBe('dumbbell-shoulder-press');
    const completed = logged(bench!, ramps(bench!) + 1);
    const hurt = run({ type: 'pain', entryId: press!.id, joint: 'shoulder' }, workout, completed);
    expect(isStopped(find(hurt.workout, bench!.id)!)).toBe(true);
    const later = run(
      { type: 'duration', choice: 45 },
      hurt.workout,
      { ...completed, currentEntryId: null },
      gym,
      hurt.constraints,
    );
    expect(working(find(later.workout, bench!.id))).toHaveLength(1);
  });

  it('keeps the owed sets of a lift the coach added, once it is swapped out', () => {
    const workout = gymWorkout();
    const added = run(
      { type: 'add-exercise', exerciseId: 'barbell-row', muscle: 'upper-back', sets: 3 },
      workout,
      emptyCompleted(),
    );
    const row = allEntries(added.workout.blocks).find(
      (entry) => entry.exerciseId === 'barbell-row',
    )!;
    expect(row.slot).toBeUndefined();
    const completed = logged(row, 1, 95);
    const busy = run({ type: 'equipment-busy', entryId: row.id }, added.workout, completed);
    const stand = after(busy.workout, row.id)!;
    expect(stand.locked).toBe(true);
    const later = run(
      { type: 'duration', choice: 'default' },
      busy.workout,
      { ...completed, currentEntryId: null },
      gym,
      busy.constraints,
    );
    expect(find(later.workout, stand.id)?.exerciseId).toBe(stand.exerciseId);
  });

  it('gives a stopped lift no sets back when the weights or a max change', () => {
    const workout = gymWorkout();
    const bench = allEntries(workout.blocks)[0]!;
    // Stopped at its ramps, the common case: a swap right after warming up.
    const completed = logged(bench, ramps(bench));
    const swapped = run(
      { type: 'replace', entryId: bench.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      completed,
    );
    for (const trigger of [
      { type: 'loading' },
      { type: 'max', exerciseId: 'barbell-bench-press' },
    ] as const) {
      const result = run(trigger, swapped.workout, completed);
      expect(working(find(result.workout, bench.id))).toHaveLength(0);
    }
  });

  it('refuses Uncomfortable on a lift with no working set left, and keeps its drop set', () => {
    const workout = gymWorkout();
    const curl = allEntries(workout.blocks).find((entry) => entry.dropSet)!;
    const workingDone = curl.sets.filter((set) => set.kind !== 'drop').length;
    const result = recalibrate({
      trigger: { type: 'uncomfortable', entryId: curl.id },
      workout,
      completed: logged(curl, workingDone, 30),
      lockedEntryIds: [],
      currentEntryId: curl.id,
      duration: workout.duration.choice,
      profile,
      location: gym,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/is done: nothing is left to swap/);
  });

  it('gives the stand-in the deload week’s lighter load and extra rep in reserve', () => {
    const workout = gymWorkout();
    const bench = allEntries(workout.blocks)[0]!;
    const completed = logged(bench, ramps(bench) + 1);
    const deload = {
      ...emptyConstraints(),
      deload: { startsAt: '2026-09-21T00:00:00.000Z', endsAt: '2026-09-28T00:00:00.000Z' },
    };
    const trigger = {
      type: 'replace',
      entryId: bench.id,
      exerciseId: 'dumbbell-bench-press',
    } as const;
    const plain = working(after(run(trigger, workout, completed).workout, bench.id))[0]!;
    const light = working(
      after(run(trigger, workout, completed, gym, deload).workout, bench.id),
    )[0]!;
    expect(light.targetRir).toBe(plain.targetRir + 1);
    expect(light.targetWeight ?? 0).toBeLessThan(plain.targetWeight ?? 0);
  });

  it('reads a swap back to a started stand-in as one swap, nothing trimmed', () => {
    const { bench, completed, swapped, stand } = swappedAfterOneSet();
    const first = working(stand)[0]!;
    const withStand: CompletedWork = {
      ...completed,
      currentEntryId: stand.id,
      sets: [
        ...completed.sets,
        {
          entryId: stand.id,
          exerciseId: stand.exerciseId,
          setIndex: first.index,
          kind: 'working',
          reps: 10,
          weight: 40,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    const back = run(
      { type: 'replace', entryId: stand.id, exerciseId: 'barbell-bench-press' },
      swapped.workout,
      withStand,
    );
    expect(back.changes).toEqual([
      expect.objectContaining({
        entryId: bench.id,
        kind: 'replaced',
        previousExerciseId: 'dumbbell-bench-press',
      }),
    ]);
    expect(back.summary.counts.setsTrimmed).toBe(0);
  });

  it('remembers the plan’s own pick through swaps before a set is logged', () => {
    const workout = gymWorkout();
    const bench = allEntries(workout.blocks)[0]!;
    const once = run(
      { type: 'replace', entryId: bench.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      emptyCompleted(),
    );
    const twice = run(
      { type: 'replace', entryId: bench.id, exerciseId: 'machine-chest-press' },
      once.workout,
      emptyCompleted(),
    );
    expect(find(twice.workout, bench.id)?.replacedFrom).toBe('barbell-bench-press');
    const back = run(
      { type: 'replace', entryId: bench.id, exerciseId: 'barbell-bench-press' },
      twice.workout,
      emptyCompleted(),
    );
    expect(find(back.workout, bench.id)?.replacedFrom).toBeUndefined();
  });
});

describe('swapping to a stopped exercise from another slot', () => {
  /**
   * A chain of swaps across two slots: the incline slot's Incline Dumbbell Press renamed before
   * it starts, the bench press started and swapped to the freed Incline Dumbbell Press, and that
   * one started and swapped to Dumbbell Bench Press.
   */
  function chained() {
    const workout = gymWorkout();
    const [bench, incline] = allEntries(workout.blocks);
    expect(incline!.exerciseId).toBe('incline-dumbbell-press');
    const renamed = run(
      { type: 'replace', entryId: incline!.id, exerciseId: 'incline-barbell-bench-press' },
      workout,
      emptyCompleted(),
    ).workout;
    const benchDone = logged(bench!, ramps(bench!) + 1);
    const first = run(
      { type: 'replace', entryId: bench!.id, exerciseId: 'incline-dumbbell-press' },
      renamed,
      benchDone,
    ).workout;
    const standOne = after(first, bench!.id)!;
    expect(standOne.exerciseId).toBe('incline-dumbbell-press');
    const bothDone: CompletedWork = {
      ...benchDone,
      currentEntryId: standOne.id,
      sets: [...benchDone.sets, ...logged(standOne, ramps(standOne) + 1, 40).sets],
    };
    const second = run(
      { type: 'replace', entryId: standOne.id, exerciseId: 'dumbbell-bench-press' },
      first,
      bothDone,
    ).workout;
    return { workout: second, inclineId: incline!.id, standOne, done: bothDone };
  }

  it('follows the plan’s own pick back within the slot only', () => {
    const { workout, inclineId } = chained();
    const incline = find(workout, inclineId)!;
    expect(incline.exerciseId).toBe('incline-barbell-bench-press');
    expect(planOwnExercise(workout.blocks, incline)).toBe('incline-dumbbell-press');
  });

  it('skips only the sets the skipped exercise carried', () => {
    const { workout, inclineId, standOne, done } = chained();
    expect(find(workout, standOne.id)?.stopped?.why).toBe('swap');
    const skipped = run({ type: 'skip', entryId: inclineId }, workout, {
      ...done,
      currentEntryId: null,
    }).workout;
    // Its sets are still carried by the Dumbbell Bench Press in its own slot.
    expect(find(skipped, standOne.id)?.stopped?.why).toBe('swap');
  });

  it('offers back only the exercise stopped in the same slot', () => {
    const workout = gymWorkout();
    const [bench, incline] = allEntries(workout.blocks);
    const completed = logged(bench!, ramps(bench!) + 1);
    const swapped = run(
      { type: 'replace', entryId: bench!.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      completed,
    );
    const blocks = swapped.workout.blocks;
    const lift = find(swapped.workout, bench!.id)!;
    const stand = after(swapped.workout, bench!.id)!;
    expect(stoppedBefore(blocks, stand)).toEqual([lift]);
    // Another slot's entry first planned as the bench press: not the stopped one's stand-in.
    const other = { ...find(swapped.workout, incline!.id)!, replacedFrom: 'barbell-bench-press' };
    expect(other.slot).not.toBe(lift.slot);
    expect(stoppedBefore(blocks, other)).toEqual([]);
    // An entry with no slot goes by the exercise it replaced.
    const added = { ...other, slot: undefined };
    expect(stoppedBefore(blocks, added)).toEqual([lift]);
  });

  it('is not a swap back: the work of the other slot never moves onto it', () => {
    const workout = gymWorkout();
    const [bench, incline] = allEntries(workout.blocks);
    const completed = logged(bench!, ramps(bench!) + 1);
    const swapped = run(
      { type: 'replace', entryId: bench!.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      completed,
    );
    const result = recalibrate({
      trigger: { type: 'replace', entryId: incline!.id, exerciseId: 'barbell-bench-press' },
      workout: swapped.workout,
      completed,
      lockedEntryIds: [],
      currentEntryId: null,
      duration: workout.duration.choice,
      profile,
      location: gym,
      history: [],
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/appeared twice/);
  });
});
