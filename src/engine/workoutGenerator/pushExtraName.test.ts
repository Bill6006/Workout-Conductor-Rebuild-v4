import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import {
  createDefaultProfile,
  type UserProfile,
  type Weekday,
} from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationResult,
  RecalibrationTrigger,
} from '../../engine/recalibration/types';
import { allEntries, isStopped, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';

/**
 * Maintenance 27, the day's extra (item 44), and names (the eleventh review of round M): the extra
 * and a stand-in never share a name; spare names start past every name the plan's slots can take,
 * the extra's included, and never repeat one given out. Synthetic data only.
 */

const HOUR = 3_600_000;
const BENCH = 'barbell-bench-press';
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
/** A barbell, a flat bench and dumbbells, no rack: the bench press goes on, the back squat cannot. */
const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['barbell', 'flat-bench', 'dumbbells'] },
  RECORD_NOW,
) as [LocationProfile];
const base = createDefaultProfile(RECORD_NOW);
/** RECORD_NOW is a Thursday; the bench press to push, a long default session. */
const profile: UserProfile = {
  ...base,
  schedule: {
    ...base.schedule,
    weeklyFrequency: 3,
    availableDays: ['mon', 'thu', 'sat'] as Weekday[],
    typicalDurationMinutes: 150,
  },
  pushLift: { exerciseId: BENCH, target: 225, units: 'lb', since: '2026-08-01T12:00:00.000Z' },
};
/** Monday's push day, four sets of the bench press: the extra is due on Thursday's lower day. */
const lastMonday: WorkoutRecord[] = [
  {
    id: 'w-monday',
    startedAt: new Date(Date.parse(RECORD_NOW) - 72 * HOUR).toISOString(),
    completedAt: new Date(Date.parse(RECORD_NOW) - 72 * HOUR).toISOString(),
    locationId: 'gym',
    templateId: 'push-arms',
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      {
        exerciseId: BENCH,
        sets: Array.from({ length: 4 }, (_, index) => ({
          kind: 'working' as const,
          reps: 6,
          weight: 100,
          rir: 2,
          completed: true,
          setIndex: index,
          targetReps: [4, 6] as [number, number],
          targetRir: 2,
        })),
      },
    ],
  },
];

const run = (
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  overrides: Partial<RecalibrationRequest> = {},
): RecalibrationResult =>
  recalibrate({
    trigger,
    workout,
    completed: emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: null,
    duration: workout.duration.choice,
    profile,
    location: gym,
    history: lastMonday,
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: RECORD_NOW,
    ...overrides,
  });
const named = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks)
    .map((entry) => `${entry.id}:${entry.exerciseId}${isStopped(entry) ? ' (stopped)' : ''}`)
    .join(', ');

describe('the day’s extra and a stand-in never share a name, the eleventh review of round M', () => {
  it('a squat begun with the bench busy, then home: the plan is rebuilt for home', () => {
    const plan = generateWorkout({
      profile,
      location: gym,
      history: lastMonday,
      now: RECORD_NOW,
      duration: 'default',
      constraints: { templateId: 'lower' },
    });
    const [extra, squat] = allEntries(plan.blocks);
    expect(extra?.push, named(plan)).toBe('extra');
    expect(extra?.id, named(plan)).toBe('e8');
    expect(squat?.exerciseId, named(plan)).toBe('back-squat');
    // The bench is taken: the extra waits behind the squat, and the lifter does a set of it.
    const busy = run({ type: 'equipment-busy', entryId: extra!.id }, plan);
    if (!busy.ok) throw new Error(busy.error);
    const first = allEntries(busy.workout.blocks).find((entry) => !isStopped(entry));
    expect(first?.exerciseId, named(busy.workout)).toBe('back-squat');
    const set = first!.sets.find((one) => one.kind === 'working')!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: RECORD_NOW,
      elapsedSeconds: 300,
      sets: [
        {
          entryId: first!.id,
          exerciseId: first!.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: 5,
          weight: set.targetWeight,
          rir: 2,
          completedAt: RECORD_NOW,
        },
      ],
    };
    // Home has no rack: the squat stops at its set and a stand-in carries its sets; the bench press
    // fits there, and the extra is made again.
    const moved = run({ type: 'location' }, busy.workout, {
      completed,
      location: home,
      constraints: busy.constraints,
    });
    // Before (since item 44): "The rebuilt workout repeated a row, so nothing was changed.", the
    // extra and the squat's stand-in both e8.
    expect(moved.ok ? 'rebuilt' : moved.error).toBe('rebuilt');
    if (!moved.ok) return;
    const ids = allEntries(moved.workout.blocks).map((entry) => entry.id);
    expect(new Set(ids).size, named(moved.workout)).toBe(ids.length);
  });

  it('a stand-in made where the extra has no place keeps its name when the gym brings it in', () => {
    // A barbell and a rack, no bench: the bench press cannot go on, so no extra today.
    const [rack] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['barbell', 'squat-rack'] },
      RECORD_NOW,
    ) as [LocationProfile];
    const plan = generateWorkout({
      profile,
      location: rack,
      history: lastMonday,
      now: RECORD_NOW,
      duration: 'default',
      constraints: { templateId: 'lower' },
    });
    expect(
      allEntries(plan.blocks).some((entry) => entry.push === 'extra'),
      named(plan),
    ).toBe(false);
    const squat = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'back-squat');
    expect(squat, named(plan)).toBeDefined();
    const set = squat!.sets.find((one) => one.kind === 'working')!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: RECORD_NOW,
      elapsedSeconds: 300,
      sets: [
        {
          entryId: squat!.id,
          exerciseId: squat!.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: 5,
          weight: set.targetWeight,
          rir: 2,
          completedAt: RECORD_NOW,
        },
      ],
    };
    // One set done, the squat is uncomfortable: a stand-in carries its sets.
    const swapped = run({ type: 'uncomfortable', entryId: squat!.id }, plan, {
      completed,
      location: rack,
    });
    if (!swapped.ok) throw new Error(swapped.error);
    const inSlot = (workout: GeneratedWorkout) =>
      allEntries(workout.blocks).find(
        (entry) => !isStopped(entry) && entry.slot === squat!.slot && entry.push === undefined,
      );
    const stand = inSlot(swapped.workout);
    expect(stand, named(swapped.workout)).toBeDefined();
    // At the gym the bench press goes on: the extra comes in.
    const moved = run({ type: 'location' }, swapped.workout, {
      completed,
      location: gym,
      constraints: swapped.constraints,
    });
    if (!moved.ok) throw new Error(moved.error);
    expect(
      allEntries(moved.workout.blocks).some((entry) => entry.push === 'extra'),
      named(moved.workout),
    ).toBe(true);
    // The slot's lift at the gym takes the stand-in's name: a lift replaced, never one left out and
    // another added.
    const after = inSlot(moved.workout);
    expect(after?.id, `${named(swapped.workout)} -> ${named(moved.workout)}`).toBe(stand!.id);
    expect(
      moved.changes
        .filter((change) => change.entryId === stand!.id)
        .map((change) => change.kind)
        .filter((kind) => kind !== 'replaced' && kind !== 'adjusted'),
      moved.changes.map((change) => change.detail).join(' | '),
    ).toEqual([]);
  });
});
