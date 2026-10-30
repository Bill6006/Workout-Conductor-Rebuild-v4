import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { record } from '../../test/records';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout, setFloor } from '../workoutGenerator/generate';
import { emptyCompleted, emptyConstraints, planUnderTheEase, recalibrate } from './recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';

/**
 * Maintenance 33, the owner's decision 2: "too soon" warns, with a one-tap lighter option, never a
 * block and never by itself. The option lays a hard start's ease on the muscle's lifts (a set fewer
 * above the floor, a rep more in reserve, never heavier: proposal part 2, "keep the load and add a
 * rep in reserve or drop a set"), through every rebuild, never on top of a hard start's own; a lift
 * under way takes it on its sets still to come, for good. Synthetic data only.
 */

const NOW = '2026-10-21T14:00:00.000Z';
const places = createDefaultLocations({ gymAccess: true }, NOW);
const gym = places.find((place) => place.id === 'gym') as LocationProfile;
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };

interface Day {
  workout: GeneratedWorkout;
  constraints: SessionConstraints;
  completed: CompletedWork;
  duration: RecalibrationRequest['duration'];
  result?: RecalibrationSuccess;
}

const plan = (history: WorkoutRecord[] = []): Day => ({
  workout: generateWorkout({
    profile,
    location: gym,
    history,
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  }),
  constraints: emptyConstraints(),
  completed: emptyCompleted(),
  duration: 'default',
});

function run(day: Day, trigger: RecalibrationTrigger, history: WorkoutRecord[] = []): Day {
  const result = recalibrate({
    trigger,
    workout: day.workout,
    completed: day.completed,
    lockedEntryIds: [],
    currentEntryId: day.completed.currentEntryId,
    duration: day.duration,
    profile,
    location: gym,
    history,
    constraints: day.constraints,
    reason: 'test',
    timestamp: NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return {
    workout: result.workout,
    constraints: result.constraints,
    completed: day.completed,
    duration: result.duration,
    result,
  };
}

const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');
const chest = (entry: WorkoutEntry) =>
  requireExercise(entry.exerciseId).primaryMuscles.includes('chest');
const byId = (workout: GeneratedWorkout) =>
  new Map(allEntries(workout.blocks).map((entry) => [entry.id, entry]));

/** The first working set of an entry logged at its targets; it becomes the lift in front. */
function logFirst(day: Day, entry: WorkoutEntry): Day {
  const first = working(entry)[0]!;
  return {
    ...day,
    completed: {
      startedAt: NOW,
      elapsedSeconds: 6 * 60,
      currentEntryId: entry.id,
      sets: entry.sets
        .filter((set) => set.index <= first.index)
        .map((set) => ({
          entryId: entry.id,
          exerciseId: entry.exerciseId,
          setIndex: set.index,
          kind: set.kind,
          reps: set.targetReps[0],
          weight: set.targetWeight,
          rir: set.targetRir,
          completedAt: NOW,
        })),
    },
  };
}

/**
 * Each chest lift a set fewer above its floor and a rep more in reserve at its load, a rep fewer
 * (the first review of Maintenance 33: the loads came down); every other as planned.
 */
function expectLighterChest(before: GeneratedWorkout, after: GeneratedWorkout) {
  const was = byId(before);
  let eased = 0;
  for (const entry of allEntries(after.blocks)) {
    const plan = was.get(entry.id)!;
    if (!chest(entry)) {
      expect(working(entry), entry.exerciseId).toEqual(working(plan));
      continue;
    }
    const count = working(plan).length;
    expect(working(entry), entry.exerciseId).toHaveLength(
      count > setFloor(entry.role) ? count - 1 : count,
    );
    working(entry).forEach((set, at) => {
      const asked = working(plan)[at]!;
      expect(set.targetWeight).toBe(asked.targetWeight);
      expect(set.targetRir).toBe(Math.min(4, asked.targetRir + 1));
      if (set.targetRir > asked.targetRir) {
        expect(set.targetReps).toEqual([
          Math.max(1, asked.targetReps[0] - 1),
          asked.targetReps[1] - 1,
        ]);
      }
    });
    eased += 1;
  }
  expect(eased).toBeGreaterThanOrEqual(2);
}

describe('lighter today for a muscle the "too soon" card names', () => {
  it('eases the chest’s lifts before the start, and says so', () => {
    const day = plan();
    const light = run(day, { type: 'lighter', muscle: 'chest' });
    expect(light.constraints.lighter).toEqual(['chest']);
    expectLighterChest(day.workout, light.workout);
    expect(light.result!.summary.headline).toMatch(/^Lighter today for the chest: /);
    const bench = allEntries(light.workout.blocks).find(chest)!;
    expect(bench.progression?.evidence[0]).toMatch(/^Lighter today for the chest: a set fewer/);
  });

  it('holds through a rebuild of the rest, and a second tap changes nothing', () => {
    const light = run(plan(), { type: 'lighter', muscle: 'chest' });
    const harder = run(light, { type: 'intensity', direction: 'harder' });
    const plainHarder = run(plan(), { type: 'intensity', direction: 'harder' });
    expectLighterChest(plainHarder.workout, harder.workout);
    const again = run(light, { type: 'lighter', muscle: 'chest' });
    expect(again.result!.summary.headline).toBe(
      'Lighter today for the chest: nothing left to lighten.',
    );
    expect(again.workout.blocks).toEqual(light.workout.blocks);
  });

  it('eases a lift under way on its sets still to come, for good', () => {
    const day = plan();
    const bench = allEntries(day.workout.blocks).find(chest)!;
    const started = logFirst(day, bench);
    const light = run(started, { type: 'lighter', muscle: 'chest' });
    const under = byId(light.workout).get(bench.id)!;
    const done = working(bench)[0]!;
    // The set done is as it was; the sets still to come a rep more in reserve at their loads, one
    // fewer.
    expect(working(under)[0]).toEqual(done);
    expect(working(under)).toHaveLength(Math.max(setFloor(bench.role), working(bench).length - 1));
    working(under)
      .slice(1)
      .forEach((set, at) => {
        expect(set.targetRir).toBe(done.targetRir + 1);
        expect(set.targetWeight).toBe(working(bench)[at + 1]!.targetWeight);
      });
    expect(under.eased?.kept).toBe(true);
    // A rebuild after it never gives it back.
    const shorter = run(light, { type: 'duration', choice: 45 });
    expect(working(byId(shorter.workout).get(bench.id)!)).toEqual(working(under));
  });

  it('never goes on top of a hard start’s own ease: the larger of each part', () => {
    const day = plan();
    const [first, second] = allEntries(day.workout.blocks);
    const started = logFirst(day, first!);
    const hard = run(started, {
      type: 'bad-start',
      low: true,
      lifts: [first!.exerciseId, second!.exerciseId],
    });
    const both = run(hard, { type: 'lighter', muscle: 'chest' });
    for (const entry of allEntries(both.workout.blocks)) {
      if (entry.id === first!.id) continue;
      const plan = byId(day.workout).get(entry.id)!;
      const count = working(plan).length;
      expect(working(entry).length, entry.exerciseId).toBeGreaterThanOrEqual(
        Math.min(count, Math.max(setFloor(entry.role), count - 1)),
      );
      working(entry).forEach((set, at) =>
        expect(set.targetRir).toBeLessThanOrEqual(Math.min(4, working(plan)[at]!.targetRir + 1)),
      );
    }
    // The hard start taken back, the chest stays lighter: today's other settings stay.
    const back = run(both, {
      type: 'bad-start',
      low: false,
      lifts: [first!.exerciseId, second!.exerciseId],
    });
    expect(back.result!.summary.headline).toMatch(/^Your start no longer falls short/);
    expect(back.result!.summary.headline).toContain("today's other settings stay");
  });

  it('hands its ease on to a lift swapped in once nothing of it is logged, loads kept', () => {
    // Heavy enough that the place has a load a step lighter for a rep more in reserve, which the
    // ease does not take.
    const lifted = (exerciseId: string, daysAgo: number, weight: number): WorkoutRecord => {
      const when = new Date(Date.parse(NOW) - daysAgo * 86_400_000).toISOString();
      const done = record(0, exerciseId, [
        [8, weight, 2],
        [8, weight, 2],
        [8, weight, 2],
      ]);
      return {
        ...done,
        id: `${exerciseId}-${daysAgo}`,
        startedAt: when,
        completedAt: when,
        entries: done.entries.map((entry) => ({
          ...entry,
          sets: entry.sets.map((set) => ({ ...set, targetReps: [6, 10], targetWeight: weight })),
        })),
      };
    };
    const history = [7, 3].flatMap((daysAgo) => [
      lifted('barbell-bench-press', daysAgo, 185),
      lifted('close-grip-bench-press', daysAgo + 1, 155),
    ]);
    const day = plan(history);
    const bench = allEntries(day.workout.blocks).find(chest)!;
    const light = run(logFirst(day, bench), { type: 'lighter', muscle: 'chest' }, history);
    // The set taken back: nothing of the lift is logged, and it keeps the ease.
    const undone = { ...light, completed: { ...light.completed, sets: [] } };
    const swap = {
      type: 'replace',
      entryId: bench.id,
      exerciseId: 'close-grip-bench-press',
    } as const;
    const eased = byId(run(undone, swap, history).workout).get(bench.id)!;
    const asPlanned = byId(run(day, swap, history).workout).get(bench.id)!;
    expect(working(asPlanned)[0]!.targetWeight).toBeGreaterThanOrEqual(135);
    expect(eased.exerciseId).toBe('close-grip-bench-press');
    expect(eased.progression?.evidence[0]).toMatch(/^Lighter today for the chest: /);
    expect(working(eased).length).toBeLessThan(working(asPlanned).length);
    working(eased).forEach((set, at) => {
      const was = working(asPlanned)[at]!;
      expect(set.targetWeight).toBe(was.targetWeight);
      expect(set.targetRir).toBe(Math.min(4, was.targetRir + 1));
    });
  });

  it('is today’s: a saved copy has the plan back', () => {
    const day = plan();
    const bench = allEntries(day.workout.blocks).find(chest)!;
    const light = run(logFirst(day, bench), { type: 'lighter', muscle: 'chest' });
    const copy = planUnderTheEase(light.workout);
    for (const entry of allEntries(copy.blocks)) {
      expect(working(entry), entry.exerciseId).toEqual(working(byId(day.workout).get(entry.id)!));
      expect(entry.eased).toBeUndefined();
    }
  });
});
