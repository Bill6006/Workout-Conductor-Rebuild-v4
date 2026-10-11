import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import {
  createDefaultProfile,
  type UserProfile,
  type Weekday,
} from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import { parsePushLine } from '../planning/pushLift';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import {
  generateWorkout,
  isMainLiftLine,
  mainLiftName,
  type GenerationConstraints,
} from './generate';

/**
 * Maintenance 27, the owner's item 44: a lift to push in the plan. It takes its own place and leads
 * it, gets the week's extra exposure where the week has room, and waits where the next session has
 * its place or its muscles would pass their cap. A deload pauses it; the time fit never drops it.
 */

const HOUR = 3_600_000;
const BENCH = 'barbell-bench-press';
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const base = createDefaultProfile(RECORD_NOW);

/** RECORD_NOW is a Thursday: with Mon, Thu and Sat the next session is two days off. */
function profileWith(days: Weekday[], extra: Partial<UserProfile> = {}): UserProfile {
  return {
    ...base,
    schedule: { ...base.schedule, weeklyFrequency: days.length, availableDays: days },
    pushLift: { exerciseId: BENCH, target: 225, units: 'lb', since: '2026-08-01T12:00:00.000Z' },
    ...extra,
  };
}
const spaced = profileWith(['mon', 'thu', 'sat']);

const at = (hoursAgo: number) => new Date(Date.parse(RECORD_NOW) - hoursAgo * HOUR).toISOString();

/** A past session of `templateId`: `lifts` as [exercise, working sets], each at 2 in reserve. */
function past(
  hoursAgo: number,
  templateId: string,
  lifts: [string, number][],
  extra: string[] = [],
): WorkoutRecord {
  const when = at(hoursAgo);
  return {
    id: `w-${hoursAgo}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId,
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: lifts.map(([exerciseId, sets]) => ({
      exerciseId,
      ...(extra.includes(exerciseId) ? { push: 'extra' as const } : {}),
      sets: Array.from({ length: sets }, (_, index) => ({
        kind: 'working' as const,
        reps: 6,
        weight: 100,
        rir: 2,
        completed: true,
        setIndex: index,
        targetReps: [4, 6] as [number, number],
        targetRir: 2,
      })),
    })),
  };
}

function plan(
  profile: UserProfile,
  history: WorkoutRecord[],
  constraints: GenerationConstraints = {},
  duration: 15 | 30 | 45 | 'default' = 'default',
): GeneratedWorkout {
  return generateWorkout({
    profile,
    location: gym,
    history,
    now: RECORD_NOW,
    duration,
    constraints,
  });
}

/** A plan done as planned, every working set at its target. */
function done(workout: GeneratedWorkout, when: string): WorkoutRecord {
  return {
    id: `done-${when}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: workout.templateId,
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: allEntries(workout.blocks).map((entry) => ({
      exerciseId: entry.exerciseId,
      ...(entry.push ? { push: entry.push } : {}),
      sets: entry.sets
        .filter((set) => set.kind === 'working')
        .map((set, index) => ({
          kind: 'working' as const,
          reps: set.targetReps[1],
          weight: set.targetWeight ?? 50,
          rir: set.targetRir,
          completed: true,
          setIndex: index,
          targetReps: [set.targetReps[0], set.targetReps[1]] as [number, number],
          targetRir: set.targetRir,
        })),
    })),
  };
}

const first = (workout: GeneratedWorkout) => allEntries(workout.blocks)[0];
const benchIn = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === BENCH);
const pushLines = (workout: GeneratedWorkout) =>
  workout.explanation.reasons.filter((line) => parsePushLine(line) !== null);
const working = (workout: GeneratedWorkout) =>
  benchIn(workout)?.sets.filter((set) => set.kind === 'working') ?? [];

describe('the lift to push in its own place', () => {
  it('leads, ahead of the main lift, and the lines say so', () => {
    const workout = plan(spaced, [], { templateId: 'full-body' });
    expect(first(workout)?.exerciseId).toBe(BENCH);
    expect(first(workout)?.push).toBe('natural');
    expect(pushLines(workout)).toEqual([
      'Barbell Bench Press leads: the lift you are pushing to 225 lb goes first, where a lift gains most (Nunes et al. 2021).',
    ]);
    // The day's main lift stays the main lift, second.
    const main = workout.explanation.reasons.find(isMainLiftLine);
    expect(main && mainLiftName(main)).toBe('Back Squat');
    expect(main).toContain(' is the primary strength lift');
    expect(workout.explanation.summary).toContain(', Barbell Bench Press first');
  });

  it('never goes to failure', () => {
    const hard = plan(spaced, [], {
      templateId: 'push-arms',
      adjust: { sets: 0, rir: -3, restFactor: 1 },
    });
    expect(Math.min(...working(hard).map((set) => set.targetRir))).toBeGreaterThanOrEqual(1);
  });

  it('gives its place up within a day and a half of its last session, or past three a week', () => {
    const soon = plan(spaced, [past(24, 'upper', [[BENCH, 3]])], { templateId: 'push-arms' });
    expect(benchIn(soon)).toBeUndefined();
    const three = [
      past(24 * 6, 'upper', [[BENCH, 3]]),
      past(24 * 4, 'full-body', [[BENCH, 3]]),
      past(24 * 2, 'upper', [[BENCH, 3]]),
    ];
    expect(benchIn(plan(spaced, three, { templateId: 'push-arms' }))).toBeUndefined();
  });

  it('takes three sets at most in a week with the extra, two under Lean-down', () => {
    const history = [past(24 * 3, 'lower', [[BENCH, 3]], [BENCH])];
    expect(working(plan(spaced, history, { templateId: 'push-arms' }))).toHaveLength(3);
    const lean = profileWith(['mon', 'thu', 'sat'], { programStyle: 'lean-down' });
    expect(working(plan(lean, history, { templateId: 'push-arms' }))).toHaveLength(2);
  });

  it('stays first through a rebuild that keeps the main lift', () => {
    const fresh = plan(spaced, [], { templateId: 'full-body' });
    const squat = allEntries(fresh.blocks).find((entry) => entry.exerciseId === 'back-squat');
    expect(squat).toBeDefined();
    const rebuilt = plan(spaced, [], {
      templateId: 'full-body',
      keep: [{ entry: squat!, frozen: true }],
      keepBlocks: fresh.blocks,
    });
    expect(first(rebuilt)?.exerciseId).toBe(BENCH);
  });

  it('leaves the plan in its own order where the lift cannot be done', () => {
    // Home has no barbell: the bench press's place goes to a stand-in, which does not lead.
    const [home] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
    const ids = (profile: UserProfile) =>
      allEntries(
        generateWorkout({
          profile,
          location: home,
          history: [],
          now: RECORD_NOW,
          duration: 'default',
          constraints: { templateId: 'full-body' },
        }).blocks,
      ).map((entry) => `${entry.exerciseId}${entry.push ? ` (${entry.push})` : ''}`);
    expect(ids(spaced)).not.toContain(BENCH);
    expect(ids(spaced)).toEqual(ids({ ...base, schedule: spaced.schedule }));
  });
});

describe("the week's extra exposure", () => {
  const lastMonday = [past(72, 'push-arms', [[BENCH, 4]])];

  it('goes on a day with no place for the lift, first, heavy and short of failure', () => {
    const workout = plan(spaced, lastMonday, { templateId: 'lower' });
    const extra = first(workout);
    expect(extra?.exerciseId).toBe(BENCH);
    expect(extra?.push).toBe('extra');
    expect(extra?.role).toBe('primary-strength');
    expect(working(workout)).toHaveLength(3);
    expect(working(workout).every((set) => set.targetReps[1] <= 6 && set.targetRir >= 1)).toBe(
      true,
    );
    expect(pushLines(workout)).toEqual([
      "Barbell Bench Press leads: the week's extra session of the lift you are pushing to 225 lb, heavy and short of failure (Pelland et al. 2026).",
    ]);
    // The day's main lift is still the main lift.
    expect(workout.explanation.reasons.find(isMainLiftLine)).toContain('Back Squat is the');
  });

  it('is never left out to fit the time', () => {
    const short = plan(spaced, lastMonday, { templateId: 'lower' }, 15);
    expect(first(short)?.exerciseId).toBe(BENCH);
    expect(working(short).length).toBeGreaterThanOrEqual(2);
  });

  it('pauses in a deload week', () => {
    const deload = { startsAt: at(48), endsAt: at(-24 * 5) };
    const workout = plan(spaced, lastMonday, { templateId: 'lower', deload });
    expect(benchIn(workout)).toBeUndefined();
    expect(pushLines(workout)).toEqual([]);
  });

  it('says why there is none today', () => {
    const workout = plan(spaced, [past(24, 'push-arms', [[BENCH, 4]])], { templateId: 'lower' });
    expect(benchIn(workout)).toBeUndefined();
    expect(workout.explanation.reasons).toContain(
      'No extra Barbell Bench Press today: its last session was yesterday, and it takes 2 days between sessions.',
    );
  });

  it('waits when the next session, tomorrow, has its own place for it', () => {
    // Mon, Tue, Thu, Fri, planned and done as planned from a Monday: Thursday's pull day comes
    // before Friday's push day, which has the bench press's own place.
    const daily = profileWith(['mon', 'tue', 'thu', 'fri']);
    const monday = '2026-09-07T12:00:00.000Z';
    const history: WorkoutRecord[] = [];
    let thursday: GeneratedWorkout | null = null;
    for (const offset of [0, 1, 3]) {
      const now = new Date(Date.parse(monday) + offset * 24 * HOUR).toISOString();
      const workout = generateWorkout({
        profile: daily,
        location: gym,
        history,
        now,
        duration: 'default',
      });
      if (offset === 3) thursday = workout;
      history.push(done(workout, now));
    }
    expect(thursday?.templateId).toBe('pull-arms');
    expect(benchIn(thursday!)).toBeUndefined();
    expect(thursday!.explanation.reasons).toContain(
      'No extra Barbell Bench Press today: the next session has its own place for it.',
    );
  });

  it('waits when it would take one of its muscles over twenty sets a week', () => {
    const triceps = [
      past(24 * 1, 'pull-arms', [['cable-triceps-pushdown', 7]]),
      past(24 * 2, 'pull-arms', [['skull-crusher', 7]]),
      past(72, 'push-arms', [
        [BENCH, 4],
        ['cable-triceps-pushdown', 4],
      ]),
    ];
    const workout = plan(spaced, triceps, { templateId: 'lower' });
    expect(benchIn(workout)).toBeUndefined();
    expect(workout.explanation.reasons).toContain(
      'No extra Barbell Bench Press today: triceps are at the weekly cap.',
    );
  });

  it("takes sets off the day's isolation lift for a muscle at its cap first", () => {
    const triceps = [
      past(24 * 2, 'pull-arms', [['skull-crusher', 6]]),
      past(72, 'push-arms', [
        [BENCH, 4],
        ['cable-triceps-pushdown', 5],
      ]),
    ];
    const workout = plan(spaced, triceps, { templateId: 'pull-arms' });
    expect(first(workout)?.push).toBe('extra');
    const line = workout.explanation.reasons.find((reason) =>
      reason.startsWith(
        'With the extra Barbell Bench Press, its muscles stay under their weekly cap:',
      ),
    );
    expect(line).toBeDefined();
    const trimmed = allEntries(workout.blocks).find(
      (entry) =>
        requireExercise(entry.exerciseId).primaryMuscles.includes('triceps') &&
        !requireExercise(entry.exerciseId).compound,
    );
    expect(trimmed?.sets.filter((set) => set.kind === 'working').length).toBeLessThan(3);
  });
});

describe('without a push', () => {
  it('plans as before: the main lift leads and no push line', () => {
    const workout = plan(base, [], { templateId: 'full-body' });
    expect(first(workout)?.exerciseId).toBe('back-squat');
    expect(pushLines(workout)).toEqual([]);
    expect(allEntries(workout.blocks).some((entry) => entry.push !== undefined)).toBe(false);
  });
});
