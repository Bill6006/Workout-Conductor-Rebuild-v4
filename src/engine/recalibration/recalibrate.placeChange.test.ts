import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import {
  createDefaultLocations,
  createLocation,
  type LocationProfile,
} from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { equipmentAvailable } from '../conflicts/conflictEngine';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from './types';

const NOW = '2026-09-22T14:00:00.000Z';
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };

function gymWorkout(): GeneratedWorkout {
  return generateWorkout({ profile, location: gym, history: [], now: NOW, duration: 'default' });
}

function moveHome(workout: GeneratedWorkout, completed: CompletedWork): RecalibrationSuccess {
  const request: RecalibrationRequest = {
    trigger: { type: 'location' },
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: workout.duration.choice,
    profile: { ...profile, currentLocationId: home?.id ?? 'home' },
    location: home,
    history: [],
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: NOW,
  };
  const result = recalibrate(request);
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** Logs every set of the given entries, and the first `partial` sets of one more. */
function logged(
  done: readonly WorkoutEntry[],
  partial?: { entry: WorkoutEntry; sets: number },
): CompletedWork {
  const setsOf = (entry: WorkoutEntry, count = entry.sets.length) =>
    entry.sets.slice(0, count).map((set) => ({
      entryId: entry.id,
      exerciseId: entry.exerciseId,
      setIndex: set.index,
      kind: set.kind,
      reps: 8,
      weight: 135,
      rir: 2,
      completedAt: NOW,
    }));
  return {
    ...emptyCompleted(),
    startedAt: NOW,
    elapsedSeconds: 25 * 60,
    currentEntryId: partial?.entry.id ?? null,
    sets: [
      ...done.flatMap((entry) => setsOf(entry)),
      ...(partial ? setsOf(partial.entry, partial.sets) : []),
    ],
  };
}

const fitsHome = (entry: WorkoutEntry) =>
  equipmentAvailable(requireExercise(entry.exerciseId), new Set(home?.equipment ?? []));
const workingCount = (entry: WorkoutEntry) =>
  entry.sets.filter((set) => set.kind === 'working').length;

describe('changing place mid-workout', () => {
  it('fills the rest of the session from the new place; what was logged stays and blocks nothing', () => {
    const workout = gymWorkout();
    const [bench, incline, ...rest] = allEntries(workout.blocks);
    if (!bench || !incline) throw new Error('no session');
    // The gym's barbell lift is done: it does not fit Home, and it must not stop Home filling in.
    expect(fitsHome(bench)).toBe(false);
    const result = moveHome(workout, logged([bench, incline]));

    const after = allEntries(result.workout.blocks);
    expect(after.find((entry) => entry.id === bench.id)?.sets).toEqual(bench.sets);
    expect(after.find((entry) => entry.id === incline.id)?.sets).toEqual(incline.sets);
    const unfinished = after.filter((entry) => entry.id !== bench.id && entry.id !== incline.id);
    expect(unfinished).toHaveLength(rest.length);
    expect(unfinished.every(fitsHome)).toBe(true);
    expect(result.workout.compromises.filter((line) => /option fits/.test(line))).toEqual([]);
    // Every muscle the gym's rest of the session trained is still trained at Home.
    const muscles = (entries: readonly WorkoutEntry[]) =>
      new Set(entries.flatMap((entry) => requireExercise(entry.exerciseId).primaryMuscles));
    expect([...muscles(rest)].filter((muscle) => !muscles(unfinished).has(muscle))).toEqual([]);
  });

  it('ends an exercise Home cannot equip at its logged sets, and a Home move takes the sets it owed', () => {
    const workout = gymWorkout();
    const [bench] = allEntries(workout.blocks);
    if (!bench) throw new Error('no session');
    const warmups = bench.sets.filter((set) => set.kind === 'warmup').length;
    const owed = workingCount(bench) - 1;
    // The ramps and one working set of the bench press, then the move.
    const result = moveHome(workout, logged([], { entry: bench, sets: warmups + 1 }));

    const after = allEntries(result.workout.blocks);
    const closed = after.find((entry) => entry.id === bench.id);
    expect(closed?.exerciseId).toBe(bench.exerciseId);
    expect(closed?.sets).toEqual(bench.sets.slice(0, warmups + 1));
    const next = after[after.indexOf(closed as WorkoutEntry) + 1];
    expect(next?.id).not.toBe(bench.id);
    expect(next && fitsHome(next)).toBe(true);
    expect(requireExercise(next?.exerciseId ?? '').movementPattern).toBe(
      requireExercise(bench.exerciseId).movementPattern,
    );
    expect(next && workingCount(next)).toBe(owed);
    expect(result.summary.headline).toMatch(/^Rebuilt for Home/);
    // Ids stay unique, so every logged set still finds its exercise.
    expect(new Set(after.map((entry) => entry.id)).size).toBe(after.length);
  });

  it('leaves logged work that still fits the new place as it was', () => {
    const workout = gymWorkout();
    const entries = allEntries(workout.blocks);
    const incline = entries[1];
    if (!incline) throw new Error('no session');
    expect(fitsHome(incline)).toBe(true);
    const result = moveHome(workout, logged([], { entry: incline, sets: 2 }));
    expect(allEntries(result.workout.blocks).find((entry) => entry.id === incline.id)).toEqual(
      incline,
    );
  });
});

/** The next rebuild the store would ask for: any trigger, at any place, with the session so far. */
function rebuildAt(
  place: LocationProfile | undefined,
  workout: GeneratedWorkout,
  completed: CompletedWork,
  trigger: RecalibrationTrigger = { type: 'location' },
): RecalibrationSuccess {
  const result = recalibrate({
    trigger,
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: trigger.type === 'duration' ? trigger.choice : workout.duration.choice,
    profile: { ...profile, currentLocationId: place?.id ?? 'home' },
    location: place,
    history: [],
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** The entry right after the given one, in the order the session runs. */
function after(workout: GeneratedWorkout, entryId: string): WorkoutEntry | undefined {
  const entries = allEntries(workout.blocks);
  const at = entries.findIndex((entry) => entry.id === entryId);
  return at < 0 ? undefined : entries[at + 1];
}

const patternOf = (entry: WorkoutEntry | undefined) =>
  entry ? requireExercise(entry.exerciseId).movementPattern : undefined;
const fitsAt = (place: LocationProfile | undefined, entry: WorkoutEntry | undefined) =>
  entry !== undefined &&
  equipmentAvailable(requireExercise(entry.exerciseId), new Set(place?.equipment ?? []));

/** One working set of a stand-in, logged, with the stand-in the exercise under way. */
function withOneSetOf(completed: CompletedWork, entry: WorkoutEntry): CompletedWork {
  const set = entry.sets.find((candidate) => candidate.kind === 'working');
  if (!set) throw new Error('no working set');
  return {
    ...completed,
    currentEntryId: entry.id,
    sets: [
      ...completed.sets,
      {
        entryId: entry.id,
        exerciseId: entry.exerciseId,
        setIndex: set.index,
        kind: 'working',
        reps: 8,
        weight: 50,
        rir: 2,
        completedAt: NOW,
      },
    ],
  };
}

// The owner's phone, in Maintenance 21's review: a Smith machine squat stopped at its warm-up
// at Home, and a later change of place lost the stand-in and the squat sets with it.
describe('a later change after the move', () => {
  /** The gym's bench press stopped at its ramps and `working` working sets, and the move Home. */
  function stoppedAtRamps(working = 0) {
    const workout = gymWorkout();
    const [bench] = allEntries(workout.blocks);
    if (!bench) throw new Error('no session');
    const ramps = bench.sets.filter((set) => set.kind === 'warmup').length;
    expect(ramps).toBeGreaterThan(0);
    const completed = logged([], { entry: bench, sets: ramps + working });
    const moved = rebuildAt(home, workout, completed);
    const standIn = after(moved.workout, bench.id);
    if (!standIn) throw new Error('no stand-in');
    return { bench, completed, moved, standIn };
  }

  it('writes down what the stopped exercise owed, since its unlogged sets are gone', () => {
    const { bench, moved, standIn } = stoppedAtRamps();
    const stopped = allEntries(moved.workout.blocks).find((entry) => entry.id === bench.id);
    expect(stopped?.sets).toEqual(bench.sets.filter((set) => set.kind === 'warmup'));
    expect(stopped?.stopped).toEqual({ owed: workingCount(bench) });
    expect(patternOf(standIn)).toBe(patternOf(bench));
    expect(fitsAt(home, standIn)).toBe(true);
    // The stand-in leads now, as the main lift it stands in for.
    expect(moved.workout.explanation.reasons).toContain(
      `${requireExercise(standIn.exerciseId).name} leads as the primary strength lift with full rests and warm-up ramp sets.`,
    );
  });

  it.each([
    ['its ramps only', 0],
    ['a working set', 1],
  ])(
    'keeps a stand-in for the owed sets through a new length, the gym, and Home again, after %s',
    (_, working) => {
      const { bench, completed, moved, standIn } = stoppedAtRamps(working);
      const loggedSets = bench.sets.slice(0, completed.sets.length);
      const owed = workingCount(bench) - working;
      // Nothing of the stand-in done, and it is not the exercise under way: every rebuild has
      // to find the owed sets again from the stopped bench press alone.
      const idle: CompletedWork = { ...completed, currentEntryId: null };
      const steps: [LocationProfile | undefined, RecalibrationTrigger][] = [
        [home, { type: 'duration', choice: 45 }],
        [gym, { type: 'location' }],
        [home, { type: 'location' }],
        [home, { type: 'duration', choice: 'default' }],
      ];
      let workout = moved.workout;
      for (const [place, trigger] of steps) {
        workout = rebuildAt(place, workout, idle, trigger).workout;
        const stopped = allEntries(workout.blocks).find((entry) => entry.id === bench.id);
        expect(stopped?.sets).toEqual(loggedSets);
        expect(stopped?.stopped).toEqual({ owed });
        const next = after(workout, bench.id);
        expect(next?.exerciseId).not.toBe(bench.exerciseId);
        expect(patternOf(next)).toBe(patternOf(bench));
        expect(fitsAt(place, next)).toBe(true);
        expect(next && workingCount(next)).toBeGreaterThan(0);
        expect(next && workingCount(next)).toBeLessThanOrEqual(owed);
      }
      // Home again at the length it started from: the same stand-in, the same sets.
      const last = after(workout, bench.id);
      expect(last?.exerciseId).toBe(standIn.exerciseId);
      expect(last && workingCount(last)).toBe(workingCount(standIn));
    },
  );

  it('lets a stand-in under way carry on in its place, with no second one beside it', () => {
    const { bench, completed, moved, standIn } = stoppedAtRamps();
    const later = rebuildAt(home, moved.workout, withOneSetOf(completed, standIn), {
      type: 'duration',
      choice: 45,
    });
    const next = after(later.workout, bench.id);
    expect(next?.id).toBe(standIn.id);
    expect(next?.sets).toEqual(standIn.sets);
    const pattern = patternOf(bench);
    expect(
      allEntries(later.workout.blocks)
        .filter((entry) => patternOf(entry) === pattern)
        .map((entry) => entry.id),
    ).toEqual([bench.id, standIn.id]);
  });

  it('adds no second stand-in when the one under way was moved above the stopped exercise', () => {
    const { bench, completed, moved, standIn } = stoppedAtRamps();
    // The stand-in moved up the list, ahead of the bench press it stands in for.
    const blockOf = (entryId: string) =>
      moved.workout.blocks.findIndex((block) =>
        block.entries.some((entry) => entry.id === entryId),
      );
    const blocks = [...moved.workout.blocks];
    const [from, to] = [blockOf(standIn.id), blockOf(bench.id)];
    [blocks[from], blocks[to]] = [blocks[to]!, blocks[from]!];
    const later = rebuildAt(home, { ...moved.workout, blocks }, withOneSetOf(completed, standIn), {
      type: 'duration',
      choice: 45,
    });
    const pattern = patternOf(bench);
    expect(
      allEntries(later.workout.blocks)
        .filter((entry) => patternOf(entry) === pattern)
        .map((entry) => entry.id)
        .sort(),
    ).toEqual([bench.id, standIn.id].sort());
  });

  it('hands on only what a stopped stand-in still owed, when it cannot go on either', () => {
    const { bench, completed, moved, standIn } = stoppedAtRamps();
    const hotel = createLocation(
      { id: 'hotel', name: 'Hotel', kind: 'travel', equipment: ['resistance-bands'] },
      NOW,
    );
    expect(fitsAt(hotel, standIn)).toBe(false);
    const result = rebuildAt(hotel, moved.workout, withOneSetOf(completed, standIn));
    const entries = allEntries(result.workout.blocks);
    const second = entries.find((entry) => entry.id === standIn.id);
    expect(second?.stopped).toEqual({ owed: workingCount(standIn) - 1 });
    expect(after(result.workout, bench.id)?.id).toBe(standIn.id);
    const third = after(result.workout, standIn.id);
    expect(fitsAt(hotel, third)).toBe(true);
    expect(patternOf(third)).toBe(patternOf(bench));
    expect(third && workingCount(third)).toBeGreaterThan(0);
    expect(third && workingCount(third)).toBeLessThanOrEqual(workingCount(standIn) - 1);
  });

  it('gives back a stand-in that an older copy of the app lost, at the next change', () => {
    const { bench, completed, moved, standIn } = stoppedAtRamps();
    // What an older copy left on the phone: the bench press at its ramps with no count
    // written, and no stand-in after it.
    const lost: GeneratedWorkout = {
      ...moved.workout,
      blocks: moved.workout.blocks
        .filter((block) => !block.entries.some((entry) => entry.id === standIn.id))
        .map((block) => ({
          ...block,
          entries: block.entries.map((entry) =>
            entry.id === bench.id ? { ...entry, stopped: undefined } : entry,
          ),
        })),
    };
    expect(after(lost, bench.id)?.exerciseId).not.toBe(standIn.exerciseId);
    const repaired = rebuildAt(
      home,
      lost,
      { ...completed, currentEntryId: null },
      { type: 'duration', choice: 'default' },
    );
    const next = after(repaired.workout, bench.id);
    expect(next?.exerciseId).toBe(standIn.exerciseId);
    expect(next && workingCount(next)).toBe(workingCount(standIn));
  });
});
