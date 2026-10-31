import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { RULES } from '../rules/ruleTable';
import { allEntries, type DurationChoice, type GeneratedWorkout } from '../workout/types';
import { generateWorkout, type GenerationConstraints } from './generate';
import { INDIRECT_SET_WEIGHT } from '../volume/weeklyVolume';

/**
 * Maintenance 34, the need carried forward: a set more on a lift that works a muscle the week is
 * short of, where the length leaves room (the approved proposal part 2: "Carry forward the need,
 * not the exercise ... within a per-session limit"). The default lifter with no history, at the
 * gym. Synthetic data only.
 */

const profile = createDefaultProfile(RECORD_NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);

function plan(
  constraints: GenerationConstraints = {},
  duration: DurationChoice = 'default',
  history: readonly WorkoutRecord[] = [],
) {
  return generateWorkout({
    profile,
    location: gym,
    history,
    now: RECORD_NOW,
    duration,
    constraints,
  });
}

/** The working sets today's plan gives a muscle, a synergist's at half, as the week counts them. */
function setsFor(workout: GeneratedWorkout, muscle: MuscleId): number {
  return allEntries(workout.blocks).reduce((sum, entry) => {
    const exercise = requireExercise(entry.exerciseId);
    const working = entry.sets.filter((set) => set.kind === 'working').length;
    if (exercise.primaryMuscles.includes(muscle)) return sum + working;
    if (exercise.secondaryMuscles.includes(muscle)) return sum + working * INDIRECT_SET_WEIGHT;
    return sum;
  }, 0);
}

const working = (workout: GeneratedWorkout, id: string) =>
  allEntries(workout.blocks)
    .find((entry) => entry.exerciseId === id)!
    .sets.filter((set) => set.kind === 'working').length;

/** An accessory in a straight block of the plan, and a muscle it works directly. */
function accessoryOf(workout: GeneratedWorkout): { id: string; muscle: MuscleId } {
  for (const block of workout.blocks) {
    if (block.kind !== 'straight') continue;
    const entry = block.entries[0]!;
    if (entry.role === 'primary-strength' || entry.dropSet) continue;
    return { id: entry.exerciseId, muscle: requireExercise(entry.exerciseId).primaryMuscles[0]! };
  }
  throw new Error('no accessory');
}

describe('the need carried into today’s plan', () => {
  const base = plan();
  const { id, muscle } = accessoryOf(base);
  const own = setsFor(base, muscle);

  it('gives a muscle the week is short of a set more on a lift that works it, in the room left', () => {
    const carried = plan({ carry: { [muscle]: own + 1 } });
    expect(setsFor(carried, muscle)).toBe(own + 1);
    expect(carried.duration.estimatedMinutes).toBeLessThanOrEqual(carried.duration.targetMinutes);
    const entry = allEntries(carried.blocks).find((one) => one.carried !== undefined)!;
    expect(entry.carried).toBe(1);
    expect(requireExercise(entry.exerciseId).primaryMuscles).toContain(muscle);
    expect(entry.progression?.evidence[0]).toMatch(
      /^A set more for the .+, which this week is short of\.$/,
    );
    expect(carried.explanation.reasons.join(' / ')).toMatch(
      /This week is short of the .+: a set more for (it|them), in the room \d+ min leaves\./,
    );
  });

  it('owes nothing where today’s plan already gives the muscle its need', () => {
    const carried = plan({ carry: { [muscle]: own } });
    expect(allEntries(carried.blocks).some((entry) => entry.carried !== undefined)).toBe(false);
    expect(setsFor(carried, muscle)).toBe(own);
  });

  it('gives a lift at most two sets over its own', () => {
    const carried = plan({ carry: { [muscle]: own + 20 } });
    for (const entry of allEntries(carried.blocks)) {
      expect(entry.carried ?? 0, entry.exerciseId).toBeLessThanOrEqual(RULES.carryLiftSets.value);
    }
    expect(working(carried, id)).toBeLessThanOrEqual(working(base, id) + RULES.carryLiftSets.value);
  });

  it('never takes a muscle over 11 sets today', () => {
    const carried = plan({ carry: { [muscle]: 40 } });
    expect(setsFor(carried, muscle)).toBeLessThanOrEqual(RULES.carryMuscleSets.value);
  });

  it('never runs the plan over its length, nor takes a set off the plan’s own', () => {
    const short = plan({}, 30);
    const carried = plan({ carry: { [muscle]: 40 } }, 30);
    // The fit leaves a plan up to a minute over its length: a set carried adds none to that.
    expect(carried.duration.estimatedMinutes).toBeLessThanOrEqual(
      Math.max(carried.duration.targetMinutes, short.duration.estimatedMinutes),
    );
    for (const entry of allEntries(short.blocks)) {
      expect(working(carried, entry.exerciseId), entry.exerciseId).toBeGreaterThanOrEqual(
        working(short, entry.exerciseId),
      );
    }
  });

  it('carries nothing in a deload week', () => {
    const deload = { startsAt: RECORD_NOW, endsAt: '2026-09-17T12:00:00.000Z' };
    const carried = plan({ carry: { [muscle]: own + 2 }, deload });
    expect(allEntries(carried.blocks).some((entry) => entry.carried !== undefined)).toBe(false);
  });

  it('carries nothing into a catch-up', () => {
    const carried = plan({
      carry: { [muscle]: 30 },
      catchUp: {
        kind: 'catch-up',
        muscles: [{ muscle, sets: 2, minRir: 2, why: 'behind' }],
        sitOut: [],
      },
    });
    expect(allEntries(carried.blocks).some((entry) => entry.carried !== undefined)).toBe(false);
  });
});

describe('the need carried, held back', () => {
  const base = plan();
  const { muscle } = accessoryOf(base);
  const none = (workout: GeneratedWorkout) =>
    allEntries(workout.blocks).every((entry) => entry.carried === undefined);

  it('carries nothing on a day of an illness, a head cold or a fever', () => {
    for (const illness of ['head', 'body'] as const) {
      const carried = plan({
        carry: { [muscle]: 40 },
        readiness: {
          energy: 3,
          soreness: 2,
          sleep: 3,
          motivation: 3,
          jointDiscomfort: [],
          timePressure: false,
          illness,
        },
      });
      expect(none(carried), illness).toBe(true);
    }
  });

  it('carries nothing for a muscle still inside its recovery window', () => {
    // Yesterday, the muscle's own accessory taken to failure: its window runs past today.
    const { id } = accessoryOf(base);
    const yesterday = record(1, id, [
      [12, 30, 0],
      [12, 30, 0],
      [12, 30, 0],
      [12, 30, 0],
    ]);
    const today = plan({}, 'default', [yesterday]);
    const carried = plan({ carry: { [muscle]: 40 } }, 'default', [yesterday]);
    expect(
      allEntries(carried.blocks).some(
        (entry) =>
          entry.carried !== undefined &&
          requireExercise(entry.exerciseId).primaryMuscles.includes(muscle),
      ),
    ).toBe(false);
    expect(setsFor(carried, muscle)).toBe(setsFor(today, muscle));
  });
});

describe('the need carried onto a lift in a pair', () => {
  it('gives it a set more, a round more for the pair', () => {
    const base = plan();
    // A paired lift with no drop set (one with a drop set takes none), the only lift working its
    // muscle directly, so the set goes on it.
    const direct = (muscle: MuscleId) =>
      allEntries(base.blocks).filter((entry) =>
        requireExercise(entry.exerciseId).primaryMuscles.includes(muscle),
      );
    const pair = base.blocks.find(
      (block) =>
        block.kind === 'superset' &&
        block.entries.some(
          (entry) =>
            !entry.dropSet &&
            direct(requireExercise(entry.exerciseId).primaryMuscles[0]!).length === 1,
        ),
    );
    expect(pair).toBeDefined();
    const lift = pair!.entries.find(
      (entry) =>
        !entry.dropSet && direct(requireExercise(entry.exerciseId).primaryMuscles[0]!).length === 1,
    )!;
    const muscle = requireExercise(lift.exerciseId).primaryMuscles[0]!;
    const own = setsFor(base, muscle);
    const carried = plan({ carry: { [muscle]: own + 1 } });
    expect(setsFor(carried, muscle)).toBe(own + 1);
    expect(working(carried, lift.exerciseId)).toBe(working(base, lift.exerciseId) + 1);
    const block = carried.blocks.find((one) => one.id === pair!.id)!;
    expect(block.rounds).toBe(
      Math.max(
        ...block.entries.map((entry) => entry.sets.filter((set) => set.kind === 'working').length),
      ),
    );
  });

  it('gives none to a lift with a drop set', () => {
    const base = plan();
    const dropped = allEntries(base.blocks).find((entry) => entry.dropSet);
    expect(dropped).toBeDefined();
    const carried = plan({
      carry: Object.fromEntries(
        requireExercise(dropped!.exerciseId).primaryMuscles.map((muscle) => [muscle, 40]),
      ),
    });
    const same = allEntries(carried.blocks).find((entry) => entry.id === dropped!.id)!;
    expect(same.carried).toBeUndefined();
    expect(working(carried, same.exerciseId)).toBe(working(base, same.exerciseId));
  });
});
