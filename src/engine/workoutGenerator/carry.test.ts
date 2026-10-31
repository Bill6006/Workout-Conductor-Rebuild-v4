import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { RULES } from '../rules/ruleTable';
import {
  allEntries,
  type DurationChoice,
  type GeneratedWorkout,
  type WorkoutEntry,
} from '../workout/types';
import { generateWorkout, type GenerationConstraints } from './generate';
import { INDIRECT_SET_WEIGHT } from '../volume/weeklyVolume';
import { interpretFatigue } from '../recovery/fatigue';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { SessionConstraints } from '../recalibration/types';

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

/**
 * A lifter whose Default leaves room: 90 minutes, where the same push day runs about 56, so the
 * limits on the sets carried bind before the length does.
 */
const roomy = { ...profile, schedule: { ...profile.schedule, typicalDurationMinutes: 90 } };
function roomyPlan(
  constraints: GenerationConstraints = {},
  history: readonly WorkoutRecord[] = [],
): GeneratedWorkout {
  return generateWorkout({
    profile: roomy,
    location: gym,
    history,
    now: RECORD_NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms', ...constraints },
  });
}
const carriedOn = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks)
    .filter((entry) => entry.carried !== undefined)
    .map((entry) => `${entry.exerciseId} +${entry.carried}`);
const directLifts = (workout: GeneratedWorkout, muscle: MuscleId) =>
  allEntries(workout.blocks).filter((entry) =>
    requireExercise(entry.exerciseId).primaryMuscles.includes(muscle),
  );

describe('the need carried, with room to carry it', () => {
  const base = roomyPlan();

  it('gives a lift at most two sets over its own: the side delts’ one lift, two more', () => {
    expect(directLifts(base, 'side-delts').map((entry) => entry.exerciseId)).toEqual([
      'lateral-raise',
    ]);
    const carried = roomyPlan({ carry: { 'side-delts': 20 } });
    expect(carriedOn(carried)).toEqual([`lateral-raise +${RULES.carryLiftSets.value}`]);
    expect(setsFor(carried, 'side-delts')).toBe(
      setsFor(base, 'side-delts') + RULES.carryLiftSets.value,
    );
  });

  it('never takes a muscle over 11 sets today: the front delts stop a set short of two lifts’ caps', () => {
    const own = setsFor(base, 'front-delts');
    // Two lifts work the front delts directly: their caps alone would give them four sets more.
    expect(directLifts(base, 'front-delts')).toHaveLength(2);
    expect(own + 2 * RULES.carryLiftSets.value).toBeGreaterThan(RULES.carryMuscleSets.value);
    const carried = roomyPlan({ carry: { 'front-delts': 20 } });
    expect(setsFor(carried, 'front-delts')).toBeGreaterThan(own);
    expect(setsFor(carried, 'front-delts')).toBeLessThanOrEqual(RULES.carryMuscleSets.value);
  });

  it('puts the set on an accessory before the main lift', () => {
    // The chest: the bench press, the day's main lift, and the cable fly.
    expect(directLifts(base, 'chest').map((entry) => entry.role)).toEqual([
      'primary-strength',
      'isolation',
    ]);
    const carried = roomyPlan({ carry: { chest: setsFor(base, 'chest') + 1 } });
    expect(carriedOn(carried)).toEqual(['cable-fly +1']);
  });

  it('carries nothing on a day of high fatigue', () => {
    // Three hard row sessions this week: sets two reps nearer failure than planned, rated too hard,
    // the last with pain.
    const rows = (rir: number, hard: boolean) =>
      [3, 2, 1].map((daysAgo) =>
        record(
          daysAgo + 0.5,
          'barbell-row',
          [
            [8, 135, rir],
            [8, 135, rir],
          ],
          [8, 12],
          2,
          hard
            ? { rating: { effort: 'too-hard', pain: daysAgo === 1, energyAfter: 2, note: '' } }
            : {},
        ),
      );
    expect(interpretFatigue(rows(0, true), RECORD_NOW).level).toBe('high');
    expect(interpretFatigue(rows(2, false), RECORD_NOW).level).not.toBe('high');
    expect(carriedOn(roomyPlan({ carry: { 'side-delts': 20 } }, rows(2, false)))).not.toEqual([]);
    expect(carriedOn(roomyPlan({ carry: { 'side-delts': 20 } }, rows(0, true)))).toEqual([]);
  });

  it('carries nothing under "Make it easier", and carries under "Make it harder"', () => {
    const easier = roomyPlan({
      carry: { 'side-delts': 20 },
      adjust: { sets: -1, rir: 1, restFactor: 1 },
    });
    expect(carriedOn(easier)).toEqual([]);
    const harder = roomyPlan({
      carry: { 'side-delts': 20 },
      adjust: { sets: 1, rir: -1, restFactor: 1 },
    });
    expect(carriedOn(harder)).not.toEqual([]);
  });

  it('carries nothing for a muscle inside its recovery window, and carries once it is out', () => {
    // The incline press taken to failure: yesterday its window runs past today; a week ago, not.
    const hard = (daysAgo: number) =>
      record(daysAgo, 'incline-dumbbell-press', [
        [12, 40, 0],
        [12, 40, 0],
        [12, 40, 0],
        [12, 40, 0],
      ]);
    const yesterday = roomyPlan({ carry: { 'upper-chest': 20 } }, [hard(1)]);
    expect(directLifts(yesterday, 'upper-chest')).not.toEqual([]);
    expect(carriedOn(yesterday)).toEqual([]);
    expect(carriedOn(roomyPlan({ carry: { 'upper-chest': 20 } }, [hard(7)]))).not.toEqual([]);
  });

  it('gives a lift kept none: the lateral raise kept as it was', () => {
    const raise = allEntries(base.blocks).find((entry) => entry.exerciseId === 'lateral-raise')!;
    const carried = roomyPlan({
      carry: { 'side-delts': 20 },
      keep: [{ entry: raise, frozen: false }],
      keepBlocks: base.blocks,
    });
    expect(carriedOn(carried)).toEqual([]);
    expect(working(carried, 'lateral-raise')).toBe(working(base, 'lateral-raise'));
  });

  it('takes the count off with the sets a later fit trims from a lift kept', () => {
    const first = roomyPlan({ carry: { 'upper-chest': 20, 'side-delts': 20 } });
    const kept = allEntries(first.blocks).filter((entry) => entry.carried !== undefined);
    // The incline press one (the front delts it works too stop it there), the lateral raise two.
    expect(carriedOn(first)).toEqual(['incline-dumbbell-press +1', 'lateral-raise +2']);
    // The same lifts kept, fitted to the time like lifts not begun, in a plan of 15 minutes.
    const again = generateWorkout({
      profile: roomy,
      location: gym,
      history: [],
      now: RECORD_NOW,
      duration: 15,
      constraints: {
        templateId: 'push-arms',
        keep: kept.map((entry) => ({ entry, frozen: false, trimmable: true })),
        keepBlocks: first.blocks,
      },
    });
    for (const entry of allEntries(again.blocks).filter((one) =>
      kept.some((k) => k.id === one.id),
    )) {
      const own = working(base, entry.exerciseId);
      const left = entry.sets.filter((set) => set.kind === 'working').length;
      // What the count says is still there: the sets beyond the lift's own.
      expect(entry.carried ?? 0, entry.exerciseId).toBe(Math.max(0, left - own));
    }
  });
});

/**
 * The review of Maintenance 34: a set more works every muscle of its lift, so every prime mover of
 * the lift must be free to take it, and none pass 11 sets with it; the lift to push keeps to its own
 * sets; and a kept lift's sets carried before go first, when the day holds one of its muscles back
 * or the time runs short.
 */
describe('the need carried, for every muscle its set works', () => {
  const base = roomyPlan();
  const incline = (workout: GeneratedWorkout) =>
    allEntries(workout.blocks).find((entry) => entry.exerciseId === 'incline-dumbbell-press')!;

  it('puts no set on a lift whose other prime mover is inside its recovery window', () => {
    // The shoulder press taken to failure yesterday: the front delts rest, and the incline press
    // works them with the upper chest.
    const yesterday = record(1, 'dumbbell-shoulder-press', [
      [10, 40, 0],
      [10, 40, 0],
      [10, 40, 0],
      [10, 40, 0],
    ]);
    const carried = roomyPlan({ carry: { 'upper-chest': 20 } }, [yesterday]);
    expect(incline(carried)).toBeDefined();
    expect(carriedOn(carried)).toEqual([]);
  });

  it('puts no set on a lift whose other prime mover went lighter today', () => {
    expect(
      carriedOn(roomyPlan({ carry: { 'upper-chest': 20 }, carryHold: ['front-delts'] })),
    ).toEqual([]);
  });

  it('puts no set where another muscle the lift works would pass 11 sets today', () => {
    // The triceps already have 11.5 today: the bench press works them, the cable fly does not.
    expect(setsFor(base, 'triceps') + 1).toBeGreaterThan(RULES.carryMuscleSets.value);
    expect(carriedOn(roomyPlan({ carry: { chest: 20 } }))).toEqual(['cable-fly +2']);
  });

  it('puts no set on the lift to push, which keeps to its own sets', () => {
    const pushing = generateWorkout({
      profile: {
        ...roomy,
        pushLift: {
          exerciseId: 'incline-dumbbell-press',
          target: 225,
          units: 'lb',
          since: '2026-08-01T12:00:00.000Z',
        },
      },
      location: gym,
      history: [],
      now: RECORD_NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms', carry: { 'upper-chest': 20 } },
    });
    expect(incline(pushing).push).toBeDefined();
    expect(carriedOn(pushing)).toEqual([]);
  });

  it('takes a kept lift’s sets carried before off where the day now holds one of its prime movers', () => {
    const first = roomyPlan({ carry: { 'upper-chest': 20 } });
    const lift = incline(first);
    expect(lift.carried).toBe(1);
    const kept = { keep: [{ entry: lift, frozen: false }], keepBlocks: first.blocks };
    expect(incline(roomyPlan(kept)).carried).toBe(1);
    const held = incline(roomyPlan({ ...kept, carryHold: ['front-delts'] }));
    expect(held.carried).toBeUndefined();
    expect(held.sets.filter((set) => set.kind === 'working')).toHaveLength(
      working(base, lift.exerciseId),
    );
    expect(held.progression?.evidence.some((line) => / more for the /.test(line))).toBe(false);
  });

  it('takes a pinned lift’s carried sets off before anything of the plan’s own when time runs short', () => {
    const first = roomyPlan({ carry: { 'upper-chest': 20 } });
    const lift = incline(first);
    const own: WorkoutEntry = {
      ...lift,
      sets: lift.sets.slice(0, lift.sets.length - (lift.carried ?? 0)),
    };
    delete own.carried;
    delete own.carriedFor;
    // The incline press pinned, and the length taken down to 45 minutes: with its carried sets, and
    // at its own.
    const at45 = (entry: WorkoutEntry) =>
      generateWorkout({
        profile: roomy,
        location: gym,
        history: [],
        now: RECORD_NOW,
        duration: 45,
        constraints: {
          templateId: 'push-arms',
          keep: [{ entry: { ...entry, pinned: true }, frozen: false }],
          keepBlocks: first.blocks,
        },
      });
    const others = (workout: GeneratedWorkout) =>
      allEntries(workout.blocks)
        .filter((entry) => entry.id !== lift.id)
        .map(
          (entry) =>
            `${entry.exerciseId} x${entry.sets.filter((set) => set.kind === 'working').length}`,
        );
    expect(others(at45(lift))).toEqual(others(at45(own)));
  });
});

describe('the need carried through a rebuild', () => {
  const base = roomyPlan();
  const rebuilt = (constraints: Partial<SessionConstraints>, lifter = roomy, from = base) => {
    const result = recalibrate({
      trigger: { type: 'duration', choice: 'default' },
      workout: from,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: lifter,
      location: gym,
      loading: { missingPlates: [] },
      history: [],
      constraints: { ...emptyConstraints(), ...constraints },
      reason: 'test',
      timestamp: RECORD_NOW,
    });
    if (!result.ok) throw new Error(result.error);
    return result.workout;
  };

  it('fills the room the length leaves, as the plan made', () => {
    expect(carriedOn(rebuilt({ carry: { 'side-delts': 20 } }))).toEqual(['lateral-raise +2']);
  });

  it('comes off a plan a hard start eases, with nothing built again', () => {
    const from = roomyPlan({ carry: { 'side-delts': 20 } });
    expect(carriedOn(from)).toEqual(['lateral-raise +2']);
    const result = recalibrate({
      trigger: { type: 'bad-start', low: true, lifts: ['barbell-bench-press'] },
      workout: from,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: roomy,
      location: gym,
      loading: { missingPlates: [] },
      history: [],
      constraints: { ...emptyConstraints(), carry: { 'side-delts': 20 } },
      reason: 'test',
      timestamp: RECORD_NOW,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.constraints.badStart).toBe(true);
    expect(carriedOn(result.workout)).toEqual([]);
  });

  it('carries nothing under a hard start, whose ease takes work off the day', () => {
    expect(carriedOn(rebuilt({ carry: { 'side-delts': 20 }, badStart: true }))).toEqual([]);
  });

  it('gives the room a lighter muscle cannot take to one that can', () => {
    // The 60-minute Default: room for a set. The upper chest owes the most, and went lighter.
    const tight = plan({}, 'default');
    const owes = { 'upper-chest': 20, 'side-delts': 8 };
    expect(carriedOn(rebuilt({ carry: owes }, profile, tight))).toEqual([
      'incline-dumbbell-press +1',
    ]);
    expect(carriedOn(rebuilt({ carry: owes, lighter: ['upper-chest'] }, profile, tight))).toEqual([
      'lateral-raise +1',
    ]);
  });

  it('carries nothing for a muscle the lifter went lighter on, and the rest as before', () => {
    const carried = rebuilt({
      carry: { 'upper-chest': 20, 'side-delts': 20 },
      lighter: ['upper-chest'],
    });
    expect(carriedOn(carried)).toEqual(['lateral-raise +2']);
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
