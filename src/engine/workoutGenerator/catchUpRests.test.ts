import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { MUSCLE_IDS, type MuscleId } from '../../catalog/muscles/muscles';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { gatherSignals, type CoachInput } from '../coach/coachConductor';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { accessoryPicker, builtCatchUp, generateWorkout, pickAccessoryFor } from './generate';
import { RECORD_NOW, record } from '../../test/records';

/**
 * Maintenance 31, the review of round M: a catch-up or a second workout leaves alone the muscles
 * trained today that sit out, and every other muscle trained in the last 48 hours it is not built
 * for. No lift in it works one of them directly, a lift two muscles share takes the cap of one
 * trained today, and the coach offers nothing for one. A second workout with nothing behind is the
 * usual plan without them, or nothing more for today. Synthetic data only.
 */
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  ...createDefaultProfile(RECORD_NOW, 'gym'),
  bodyweight: 185,
  ...overrides,
});
const build = (
  catchUp: CatchUpSpec,
  history: WorkoutRecord[] = [],
  overrides: Partial<UserProfile> = {},
  templateId?: string,
) =>
  generateWorkout({
    profile: profile(overrides),
    location: gym!,
    history,
    now: RECORD_NOW,
    duration: 'default',
    constraints: { catchUp, ...(templateId ? { templateId } : {}) },
  });
/** Three sets of one lift, `daysAgo`. */
const done = (daysAgo: number, exerciseId: string, range: [number, number]) =>
  record(
    daysAgo,
    exerciseId,
    [
      [range[1], 100, 2],
      [range[1], 100, 2],
      [range[1], 100, 2],
    ],
    range,
    2,
  );
const works = (workout: GeneratedWorkout, muscle: MuscleId) =>
  allEntries(workout.blocks).some((entry) =>
    requireExercise(entry.exerciseId).primaryMuscles.includes(muscle),
  );
const glutes = { muscle: 'glutes' as const, sets: 3, minRir: 1, why: 'behind' as const };
/** Behind, with no lift that leaves the front delts out (the incline presses work both). */
const upperChest = { muscle: 'upper-chest' as const, sets: 3, minRir: 1, why: 'behind' as const };

describe('the muscles a catch-up or a second workout leaves alone', () => {
  it('a second workout: the glutes go with the hinge, the quads sitting out', () => {
    const workout = build({ kind: 'second', muscles: [glutes], sitOut: ['quads'] });
    const entries = allEntries(workout.blocks);
    expect(workout.templateId).toBe('second-workout');
    expect(requireExercise(entries[0]!.exerciseId).movementPattern).toBe('hinge');
    expect(works(workout, 'quads')).toBe(false);
    expect(workout.explanation.reasons.slice(0, 2)).toEqual([
      'A second workout today: it leads with what you missed, glutes.',
      'Quads, trained today, sit out.',
    ]);
  });

  it('the glutes’ slot is the hinge from the start, in its place after the strength lift', () => {
    const chest = { muscle: 'chest' as const, sets: 3, minRir: 1, why: 'behind' as const };
    const workout = build({ kind: 'second', muscles: [glutes, chest], sitOut: ['quads'] });
    // Taken as the squat's slot, the strength slots' place, and only then handed to the hinge, the
    // Romanian deadlift came before the bench press.
    expect(
      allEntries(workout.blocks).map((entry) => requireExercise(entry.exerciseId).movementPattern),
    ).toEqual(['horizontal-push', 'hinge']);
  });

  it('a catch-up: no lift for a muscle trained in the last 48 hours', () => {
    const workout = build({ kind: 'catch-up', muscles: [glutes], sitOut: [] }, [
      done(1, 'leg-extension', [10, 15]),
    ]);
    expect(workout.templateId).toBe('catch-up');
    expect(works(workout, 'glutes')).toBe(true);
    expect(works(workout, 'quads')).toBe(false);
  });

  it('a lift shared with what is left of a muscle trained today takes its cap', () => {
    // The glutes behind and the quads' remainder share the squat: 2 sets, 3 or more in reserve.
    const workout = build({
      kind: 'second',
      muscles: [glutes, { muscle: 'quads', sets: 2, minRir: 3, why: 'remainder' }],
      sitOut: [],
    });
    const squat = allEntries(workout.blocks).filter(
      (entry) => requireExercise(entry.exerciseId).movementPattern === 'squat',
    );
    expect(squat).toHaveLength(1);
    const working = squat[0]!.sets.filter((set) => set.kind === 'working');
    expect(working).toHaveLength(2);
    expect(working.every((set) => set.targetRir >= 3)).toBe(true);
  });

  it('the cap holds whichever of the two comes first', () => {
    const workout = build({
      kind: 'second',
      muscles: [{ muscle: 'quads', sets: 2, minRir: 3, why: 'remainder' }, glutes],
      sitOut: [],
    });
    const squat = allEntries(workout.blocks).find(
      (entry) => requireExercise(entry.exerciseId).movementPattern === 'squat',
    )!;
    const working = squat.sets.filter((set) => set.kind === 'working');
    expect(working).toHaveLength(2);
    expect(working.every((set) => set.targetRir >= 3)).toBe(true);
  });

  it('never puts in the lift to push where it works a muscle that rests', () => {
    // The trap-bar deadlift works the quads, trained yesterday: the glutes take the Romanian
    // deadlift in the hinge's place instead.
    const workout = build(
      { kind: 'catch-up', muscles: [glutes], sitOut: [] },
      [done(1, 'leg-extension', [10, 15])],
      {
        pushLift: { exerciseId: 'trap-bar-deadlift', target: 315, units: 'lb', since: RECORD_NOW },
      },
    );
    const ids = allEntries(workout.blocks).map((entry) => entry.exerciseId);
    expect(ids).not.toContain('trap-bar-deadlift');
    expect(works(workout, 'quads')).toBe(false);
  });

  it('finds a lift that leads with the muscle when every lift of the split for it rests', () => {
    // The quads and hamstrings trained yesterday: the squat, the hinge and the lunge all work one
    // of them; the hip thrust or the bridge works the glutes alone (the second review of round M).
    const workout = build({ kind: 'catch-up', muscles: [glutes], sitOut: [] }, [
      done(1, 'leg-extension', [10, 15]),
      done(1, 'leg-curl', [10, 15]),
    ]);
    expect(workout.templateId).toBe('catch-up');
    expect(works(workout, 'glutes')).toBe(true);
    expect(works(workout, 'quads') || works(workout, 'hamstrings')).toBe(false);
  });

  it('names only the muscles a lift went in for, and says nothing of a slot left out', () => {
    // The front delts trained yesterday: every lift for the upper chest works them.
    const workout = build(
      {
        kind: 'catch-up',
        muscles: [upperChest, { muscle: 'chest', sets: 3, minRir: 1, why: 'behind' }],
        sitOut: [],
      },
      [done(1, 'arnold-press', [8, 12])],
    );
    expect(workout.explanation.reasons[0]).toBe(
      'A catch-up for what this week still lacks: chest, a few sets each and none to failure.',
    );
    expect(works(workout, 'upper-chest')).toBe(false);
    expect(workout.compromises).toEqual([]);
  });

  it('a catch-up with no lift left plans as with nothing behind', () => {
    const spec: CatchUpSpec = { kind: 'catch-up', muscles: [upperChest], sitOut: [] };
    const workout = build(spec, [done(1, 'arnold-press', [8, 12])]);
    expect(workout.templateId).not.toBe('catch-up');
    expect(allEntries(workout.blocks).length).toBeGreaterThan(0);
    expect(workout.explanation.reasons.some((line) => line.startsWith('A catch-up'))).toBe(false);
    expect(builtCatchUp(spec, workout).muscles).toEqual([]);
  });
});

describe('a day with nothing behind', () => {
  it('a day not ticked plans as before, whatever was trained in the last 48 hours', () => {
    const workout = build(
      { kind: 'catch-up', muscles: [], sitOut: [] },
      [done(1, 'leg-extension', [10, 15])],
      {},
      'lower',
    );
    expect(works(workout, 'quads')).toBe(true);
  });
});

describe('a second workout with nothing behind', () => {
  it('is the usual plan without what was trained today', () => {
    const workout = build({ kind: 'second', muscles: [], sitOut: ['chest', 'triceps'] }, [
      done(0, 'barbell-bench-press', [6, 10]),
    ]);
    expect(allEntries(workout.blocks).length).toBeGreaterThan(0);
    expect(workout.title).not.toBe('Second workout');
    expect(works(workout, 'chest')).toBe(false);
    expect(works(workout, 'triceps')).toBe(false);
    expect(workout.explanation.reasons[0]).toBe('Chest and triceps, trained today, sit out.');
  });

  it('is nothing more for today when every lift left works a muscle trained today', () => {
    const workout = build({ kind: 'second', muscles: [], sitOut: [...MUSCLE_IDS] });
    expect(allEntries(workout.blocks)).toHaveLength(0);
    expect(workout.title).toBe('Second workout');
    expect(workout.explanation.summary).toBe('Nothing more for today.');
    expect(workout.compromises).toEqual([]);
  });
});

describe('the coach on a second workout', () => {
  /** A lower workout with no calf work: the calves fall behind. */
  const lowerDay = (daysAgo: number): WorkoutRecord => {
    const sets = (weight: number): [number, number, number][] =>
      Array.from({ length: 4 }, () => [10, weight, 2]);
    const parts = [
      record(daysAgo, 'back-squat', sets(185), [6, 10], 2),
      record(daysAgo, 'romanian-deadlift', sets(135), [8, 12], 2),
      record(daysAgo, 'leg-extension', sets(80), [10, 15], 2),
      record(daysAgo, 'hip-thrust', sets(135), [8, 12], 2),
      record(daysAgo, 'rear-delt-fly', sets(20), [12, 20], 2),
      record(daysAgo, 'barbell-shrug', sets(185), [8, 12], 2),
      record(daysAgo, 'cable-crunch', sets(60), [10, 15], 2),
      record(daysAgo, 'pallof-press', sets(30), [10, 15], 2),
      record(daysAgo, 'wrist-curl', sets(30), [10, 15], 2),
    ];
    return {
      ...parts[0]!,
      id: `w-lower-${daysAgo}`,
      templateId: 'lower',
      entries: parts.flatMap((part) => part.entries),
    };
  };
  /** The weekly coverage card, with ten minutes of room today or none, on the plan as titled. */
  const coverage = (
    catchUp: CatchUpSpec | undefined,
    full = false,
    room = true,
    templateId?: string,
  ) => {
    const history = [lowerDay(1), lowerDay(3)];
    const workout = generateWorkout({
      profile: profile(),
      location: gym!,
      history,
      now: RECORD_NOW,
      duration: 'default',
      constraints: { templateId: 'upper' },
    });
    const fatigue = interpretFatigue(history, RECORD_NOW);
    const input: CoachInput = {
      workout: {
        ...workout,
        templateId: templateId ?? workout.templateId,
        duration: {
          ...workout.duration,
          targetMinutes: workout.duration.estimatedMinutes + (room ? 10 : 0),
        },
      },
      status: 'preview',
      duration: 'default',
      completed: emptyCompleted(),
      constraints: {
        ...emptyConstraints(),
        ...(catchUp ? { catchUp } : {}),
        ...(full ? { fullSession: true } : {}),
      },
      profile: profile(),
      history,
      now: RECORD_NOW,
      fatigue,
      strategy: analyzeStrategy({ history, profile: profile(), now: RECORD_NOW, fatigue }),
      lastExportAt: RECORD_NOW,
      workoutCount: history.length,
      location: gym!,
      swaps: [],
    };
    return gatherSignals(input).find((signal) => signal.source === 'weekly coverage') ?? null;
  };

  it('offers the calves their sets on a usual day, or the next session’s lead (baseline)', () => {
    expect(coverage(undefined)?.headline).toMatch(/^Calves/);
    expect(coverage(undefined, false, false)?.action?.kind).toBe('focus');
  });

  it('offers nothing for a muscle that sits out, not even the next session’s lead', () => {
    expect(coverage({ kind: 'second', muscles: [], sitOut: ['calves'] }, false, false)).toBeNull();
  });

  it('adds no work to a second workout, for a muscle that does not sit out either', () => {
    // The calves were not trained today: with room, the card's two sets are no offer off the plan.
    expect(coverage({ kind: 'second', muscles: [], sitOut: [] })).toBeNull();
    expect(coverage({ kind: 'second', muscles: [], sitOut: [] }, true)?.headline).toMatch(
      /^Calves/,
    );
  });

  it('adds no work to a catch-up built; one planned as usual is a usual day', () => {
    const chest: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [{ muscle: 'chest', sets: 3, minRir: 1, why: 'behind' }],
      sitOut: [],
    };
    expect(coverage(chest, false, true, 'catch-up')).toBeNull();
    expect(coverage(chest)?.headline).toMatch(/^Calves/);
  });

  it('offers the calves their sets again once the full session is taken', () => {
    expect(coverage({ kind: 'second', muscles: [], sitOut: ['calves'] }, true)?.headline).toMatch(
      /^Calves/,
    );
  });

  it('never picks a lift that works a muscle that rests', () => {
    const picker = accessoryPicker({
      profile: profile(),
      location: gym!,
      history: [],
      now: RECORD_NOW,
      resting: new Set(['biceps']),
    });
    // The lats' best lift is the chin-up, which works the biceps too (baseline).
    expect(pickAccessoryFor('lats', [], { ...picker, resting: undefined })?.id).toBe('chin-up');
    expect(pickAccessoryFor('lats', [], picker)?.primaryMuscles ?? []).not.toContain('biceps');
  });
});
