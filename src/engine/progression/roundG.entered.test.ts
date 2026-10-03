import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { DUMBBELLS_KEY, type Loading } from '../loading/loading';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { MaxHeldBy, MaxOutcome, SessionConstraints } from '../recalibration/types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { emptyMaxes, recordMax, type MaxInput } from './maxes';
import { capTarget, type NextTarget } from './progression';

/**
 * Maintenance 25, the owner's item 36: "changing the entered weight can still leave me with what
 * appears to be the same target". Traced through the engine: reps past twelve counted as twelve,
 * and an estimate rounded down onto the heaviest pair read as met (docs/research/entered-maxes.md).
 */

const NOW = RECORD_NOW;
const places = createDefaultLocations({ gymAccess: true }, NOW);
const home = places.find((place) => place.id === 'home') as LocationProfile;
const gym = places.find((place) => place.id === 'gym') as LocationProfile;
const lightHome: LocationProfile = {
  ...home,
  loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges: [{ from: 5, to: 20, step: 5 }] } },
};
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };

/** The lift's first working set once the max is saved: the save's rebuild on today's plan. */
function afterMax(
  place: LocationProfile,
  templateId: string,
  exerciseId: string,
  input: MaxInput,
  history: WorkoutRecord[] = [],
  constraints: SessionConstraints = emptyConstraints(),
): {
  weight: number | null;
  reps: [number, number];
  rir: number | null;
  evidence: string[];
  outcome: MaxOutcome | undefined;
  heldBy: MaxHeldBy | undefined;
} {
  const workout: GeneratedWorkout = generateWorkout({
    profile: { ...profile, currentLocationId: place.id },
    location: place,
    history,
    now: NOW,
    duration: 'default',
    constraints: { templateId, deload: constraints.deload },
  });
  const maxes = recordMax(emptyMaxes(), exerciseId, input, 'lb', NOW);
  const result = recalibrate({
    trigger: { type: 'max', exerciseId },
    workout,
    completed: emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: null,
    duration: 'default',
    profile: { ...profile, currentLocationId: place.id },
    location: place,
    history,
    constraints,
    maxes,
    reason: 'test',
    timestamp: NOW,
  });
  if (!result.ok) throw new Error(result.error);
  const entry = allEntries(result.workout.blocks).find(
    (candidate) => candidate.exerciseId === exerciseId,
  ) as WorkoutEntry;
  const set = entry.sets.find((candidate) => candidate.kind === 'working');
  return {
    weight: set?.targetWeight ?? null,
    reps: set?.targetReps ?? [0, 0],
    rir: set?.targetRir ?? null,
    evidence: entry.progression?.evidence ?? [],
    outcome: result.max,
    heldBy: result.maxHeldBy,
  };
}

/** Two sessions of a lift, every set at one weight and range. */
function logged(exerciseId: string, sets: SetSpec[], range: [number, number]): WorkoutRecord[] {
  return [7, 4].map((daysAgo) => {
    const done = record(daysAgo, exerciseId, sets, range, 2);
    for (const set of done.entries[0]?.sets ?? []) set.targetWeight = sets[0]?.[1] ?? null;
    return done;
  });
}

const incline = (input: MaxInput) =>
  afterMax(lightHome, 'push-arms', 'incline-dumbbell-press', input);

describe('a recent set or a max at dumbbells to 20 lb', () => {
  it('moves the target with the entry: every rep of a recent set counts, up to thirty', () => {
    expect(incline({ kind: 'set', weight: 20, reps: 15 })).toMatchObject({
      weight: 20,
      reps: [6, 10],
    });
    // 20 for 20 asks a little more than the pair makes: the reps go up two, and it says why.
    const twenty = incline({ kind: 'set', weight: 20, reps: 20 });
    expect(twenty).toMatchObject({ weight: 20, reps: [8, 12] });
    expect(twenty.evidence.at(-1)).toBe(
      'Held at the heaviest weight here (20 lb): the reps go up instead.',
    );
    // The phone checklist's third entry: 20 for 25 plans 16-20.
    expect(incline({ kind: 'set', weight: 20, reps: 25 })).toMatchObject({
      weight: 20,
      reps: [16, 20],
    });
    // Well short of what the entry asks, the set runs to its reserve.
    expect(incline({ kind: 'set', weight: 30, reps: 10 })).toMatchObject({
      weight: 20,
      reps: [16, 20],
    });
    expect(incline({ kind: 'set', weight: 40, reps: 8 })).toMatchObject({
      weight: 20,
      reps: [26, 30],
    });
  });

  it('reads a known max the same way: a higher max, more reps at the pair, up to thirty', () => {
    expect(incline({ kind: 'max', e1rm: 30 })).toMatchObject({ weight: 20, reps: [6, 10] });
    expect(incline({ kind: 'max', e1rm: 40 })).toMatchObject({ weight: 20, reps: [16, 20] });
    const far = incline({ kind: 'max', e1rm: 80 });
    expect(far).toMatchObject({ weight: 20, reps: [26, 30] });
    expect(far.evidence.at(-1)).toMatch(/up to 30\.$/);
  });

  it('leaves the gym as it was: a place that makes the load gives it', () => {
    expect(
      afterMax(gym, 'push-arms', 'barbell-bench-press', { kind: 'set', weight: 135, reps: 8 }),
    ).toMatchObject({ weight: 120, reps: [4, 6] });
    expect(
      afterMax(gym, 'push-arms', 'barbell-bench-press', { kind: 'max', e1rm: 250 }),
    ).toMatchObject({ weight: 180, reps: [4, 6] });
  });

  it('keeps the logged sets’ rule on a lift with history: a lower max leaves the target, a higher one moves it two steps at most', () => {
    const history = [7, 4].map((daysAgo) => {
      const done = record(
        daysAgo,
        'barbell-bench-press',
        [6, 6, 5].map((reps): SetSpec => [reps, 155, 2]),
        [4, 6],
        2,
      );
      for (const set of done.entries[0]?.sets ?? []) set.targetWeight = 155;
      return done;
    });
    const bench = (input: MaxInput) =>
      afterMax(gym, 'push-arms', 'barbell-bench-press', input, history).weight;
    expect(bench({ kind: 'max', e1rm: 150 })).toBe(160);
    expect(bench({ kind: 'max', e1rm: 220 })).toBe(165);
    expect(bench({ kind: 'max', e1rm: 260 })).toBe(170);
  });
});

describe('the owner’s main lift at dumbbells to 20 lb (after the reviews)', () => {
  const bench = (input: MaxInput) =>
    afterMax(lightHome, 'push-arms', 'dumbbell-bench-press', input);

  it('moves a strength lift’s target with the entry too, run to its effort (Maintenance 25)', () => {
    // Strength sets held far under their load stopped at two extra reps: every entry gave
    // 20 lb × 6-8 "at RIR 2", about a third of the max. They run to their reserve now.
    expect(bench({ kind: 'set', weight: 20, reps: 10 })).toMatchObject({
      weight: 20,
      reps: [4, 6],
    });
    expect(bench({ kind: 'set', weight: 20, reps: 15 })).toMatchObject({
      weight: 20,
      reps: [6, 8],
    });
    const twenty = bench({ kind: 'set', weight: 20, reps: 20 });
    expect(twenty).toMatchObject({ weight: 20, reps: [13, 15], rir: 2 });
    expect(twenty.evidence.at(-1)).toBe(
      'Held at the heaviest weight here (20 lb): about 9 more reps, to 2 in reserve.',
    );
    expect(bench({ kind: 'max', e1rm: 40 })).toMatchObject({ weight: 20, reps: [22, 24] });
    const far = bench({ kind: 'max', e1rm: 60 });
    expect(far).toMatchObject({ weight: 20, reps: [28, 30] });
    expect(far.evidence.at(-1)).toBe(
      'Held at the heaviest weight here (20 lb): about 24 more reps, up to 30.',
    );
  });
});

describe('an entered max against the logged sets (after the reviews)', () => {
  it('reads the log as it reads the entry: the same set entered moves nothing', () => {
    // Logged at 15-20, the bench today at 4-6 reads its load from the log's estimate.
    const history = logged(
      'barbell-bench-press',
      [
        [20, 100, 2],
        [20, 100, 2],
        [20, 100, 2],
      ],
      [15, 20],
    );
    const bench = (input: MaxInput) =>
      afterMax(gym, 'push-arms', 'barbell-bench-press', input, history);
    expect(bench({ kind: 'set', weight: 100, reps: 20 })).toMatchObject({
      weight: 105,
      outcome: 'kept',
    });
    expect(bench({ kind: 'set', weight: 120, reps: 20 })).toMatchObject({
      weight: 115,
      outcome: 'moved',
    });
  });

  it('moves a target read from the log’s estimate at another range: two steps at most', () => {
    // Logged at 10-12: the entry counts there too, as on a lift trained at today's range.
    const history = logged(
      'barbell-bench-press',
      [
        [12, 160, 2],
        [11, 160, 2],
        [10, 160, 2],
      ],
      [10, 12],
    );
    const bench = (input: MaxInput) =>
      afterMax(gym, 'push-arms', 'barbell-bench-press', input, history);
    expect(bench({ kind: 'max', e1rm: 120 })).toMatchObject({ weight: 170, outcome: 'kept' });
    const higher = bench({ kind: 'max', e1rm: 300 });
    expect(higher).toMatchObject({ weight: 180, outcome: 'moved' });
    expect(higher.evidence.at(-1)).toBe(
      'Your max of 300 lb, entered after you began this lift last time, says more than your logged sets: up 2 steps toward it. Your next logged session takes over.',
    );
    expect(bench({ kind: 'set', weight: 200, reps: 5 })).toMatchObject({ weight: 175 });
  });

  it('says the weights here hold a target the max moved (from the second review)', () => {
    // Logged at 60 lb, the incline at dumbbells to 20 lb is held at the pair with the most reps.
    const history = logged(
      'incline-dumbbell-press',
      [
        [8, 60, 2],
        [8, 60, 2],
        [8, 60, 2],
      ],
      [6, 10],
    );
    const after = afterMax(
      lightHome,
      'push-arms',
      'incline-dumbbell-press',
      { kind: 'max', e1rm: 100 },
      history,
    );
    expect(after).toMatchObject({ weight: 20, reps: [26, 30], outcome: 'held' });
  });

  it('says a deload week, not the weights here, holds a max it rounds away (from the third review)', () => {
    // Logged at 175 × 6; the deload week takes the plan to 160 lb at RIR 3. A max one step above
    // the log moves the target to 180 before the deload, and 90% of 175 and of 180 both round to
    // 160: the deload week holds it, while the gym makes 165.
    const history = logged(
      'barbell-bench-press',
      [
        [6, 175, 2],
        [6, 175, 2],
        [6, 175, 2],
      ],
      [4, 6],
    );
    const deload = {
      ...emptyConstraints(),
      deload: { startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-30T00:00:00.000Z' },
    };
    const outcomes = [236, 238, 240, 242, 244, 246, 248, 250].map((e1rm) =>
      afterMax(gym, 'push-arms', 'barbell-bench-press', { kind: 'max', e1rm }, history, deload),
    );
    const held = outcomes.filter((after) => after.outcome === 'held');
    expect(held.length).toBeGreaterThan(0);
    for (const after of held) expect(after.heldBy).toBe('deload');
  });

  it('calls more reps at the heaviest pair a move, not a target kept', () => {
    const history = logged(
      'incline-dumbbell-press',
      [
        [8, 20, 2],
        [8, 20, 2],
        [8, 20, 2],
      ],
      [6, 10],
    );
    const incline = (input: MaxInput) =>
      afterMax(lightHome, 'push-arms', 'incline-dumbbell-press', input, history);
    expect(incline({ kind: 'max', e1rm: 40 })).toMatchObject({
      weight: 20,
      reps: [25, 29],
      outcome: 'moved',
    });
    expect(incline({ kind: 'max', e1rm: 25 })).toMatchObject({
      weight: 20,
      reps: [6, 10],
      outcome: 'kept',
    });
  });

  it('takes a deload week’s lighter load into the estimate at the heaviest pair', () => {
    const set = { kind: 'set', weight: 20, reps: 20 } as const;
    expect(afterMax(lightHome, 'push-arms', 'incline-dumbbell-press', set)).toMatchObject({
      reps: [8, 12],
    });
    // 90% of what 20 × 20 asks is under the pair: nothing asks more than it holds.
    const deload = {
      ...emptyConstraints(),
      deload: { startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-30T00:00:00.000Z' },
    };
    expect(
      afterMax(lightHome, 'push-arms', 'incline-dumbbell-press', set, [], deload),
    ).toMatchObject({ weight: 20, reps: [6, 10] });
  });
});

describe('the heaviest weight a place has, for a target from an estimate', () => {
  const loading: Loading = {
    step: 5,
    cap: 20,
    available: [5, 10, 15, 20],
  } as unknown as Loading;
  const target = (weight: number, exact: number | undefined): NextTarget => ({
    mode: 'start',
    weight,
    reps: [6, 10],
    rir: 1,
    increment: 5,
    sessions: 0,
    viaFamily: false,
    confidence: 'low',
    evidence: [],
    setsAdvice: 0,
    ...(exact === undefined ? {} : { exact }),
  });

  it('holds an estimate rounded down onto it, that asked for more, with the reps up two', () => {
    const fitted = capTarget(target(20, 21.9), loading, 'lb', 'secondary-hypertrophy');
    expect([fitted.weight, fitted.reps, fitted.capped]).toEqual([20, [8, 12], { at: 20 }]);
    // Its sets stand in for nothing heavier: they read as they show.
    expect(fitted.asked).toBeUndefined();
  });

  it('leaves an estimate that asked for no more than it, or a target no longer at its rounding', () => {
    expect(capTarget(target(20, 19.8), loading, 'lb', 'secondary-hypertrophy').reps).toEqual([
      6, 10,
    ]);
    // A load moved since it was rounded (a step down for the work before it) is not the estimate.
    expect(capTarget(target(20, 26), loading, 'lb', 'secondary-hypertrophy').reps).toEqual([6, 10]);
    expect(capTarget(target(20, undefined), loading, 'lb', 'secondary-hypertrophy').reps).toEqual([
      6, 10,
    ]);
  });
});
