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
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from '../recalibration/types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout, isMainLiftLine, mainLiftName } from './generate';

/**
 * Maintenance 27, the review of the owner's item 44: the lift to push through the plan's other
 * changes. A harder day leaves it to its sets and short of failure; a swapped extra stays the
 * day's extra, first; the day's main lift stays second; the lines name what leads; a rebuild of a
 * day with its extra weighs no second one.
 */

const HOUR = 3_600_000;
const BENCH = 'barbell-bench-press';
const [home, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const base = createDefaultProfile(RECORD_NOW);

/** RECORD_NOW is a Thursday; a long default session, so the time fit takes nothing. */
function profileWith(days: Weekday[], extra: Partial<UserProfile> = {}): UserProfile {
  return {
    ...base,
    schedule: {
      ...base.schedule,
      weeklyFrequency: days.length,
      availableDays: days,
      typicalDurationMinutes: 150,
    },
    pushLift: { exerciseId: BENCH, target: 225, units: 'lb', since: '2026-08-01T12:00:00.000Z' },
    ...extra,
  };
}
const spaced = profileWith(['mon', 'thu', 'sat']);
const at = (hoursAgo: number) => new Date(Date.parse(RECORD_NOW) - hoursAgo * HOUR).toISOString();

/** A past session: `lifts` as [exercise, working sets], each at 2 in reserve. */
function past(hoursAgo: number, templateId: string, lifts: [string, number][]): WorkoutRecord {
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

/** Monday's push day: the extra is due on Thursday's lower day. */
const lastMonday = [past(72, 'push-arms', [[BENCH, 4]])];

function plan(
  profile: UserProfile,
  history: WorkoutRecord[],
  constraints: Parameters<typeof generateWorkout>[0]['constraints'] = {},
  location = gym,
): GeneratedWorkout {
  return generateWorkout({
    profile,
    location,
    history,
    now: RECORD_NOW,
    duration: 'default',
    constraints,
  });
}

function run(
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  profile: UserProfile,
  history: WorkoutRecord[],
  overrides: Partial<RecalibrationRequest> = {},
): RecalibrationSuccess {
  const result = recalibrate({
    trigger,
    workout,
    completed: emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: null,
    duration: workout.duration.choice,
    profile,
    location: gym,
    history,
    constraints: emptyConstraints(),
    reason: 'test',
    timestamp: RECORD_NOW,
    ...overrides,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

const working = (entry: WorkoutEntry | undefined) =>
  entry?.sets.filter((set) => set.kind === 'working') ?? [];
const ids = (workout: GeneratedWorkout) => allEntries(workout.blocks).map((one) => one.exerciseId);

describe('the lift to push through the plan', () => {
  it('keeps to its sets and short of failure when the day is made harder', () => {
    for (const profile of [
      spaced,
      profileWith(['mon', 'thu', 'sat'], { programStyle: 'high-rep' }),
    ]) {
      const workout = plan(profile, lastMonday, { templateId: 'lower' });
      const extra = allEntries(workout.blocks)[0]!;
      expect(extra.push, profile.programStyle).toBe('extra');
      // Under Light weights the extra is in its own longer range: short of failure, not heavy.
      const tail =
        profile.programStyle === 'high-rep'
          ? 'pushing to 225 lb, short of failure (Pelland et al. 2026).'
          : 'heavy and short of failure (Pelland et al. 2026).';
      expect(
        workout.explanation.reasons.some((line) => line.endsWith(tail)),
        profile.programStyle,
      ).toBe(true);
      const harder = run({ type: 'intensity', direction: 'harder' }, workout, profile, lastMonday, {
        currentEntryId: extra.id,
      });
      const after = allEntries(harder.workout.blocks).find((entry) => entry.id === extra.id);
      expect(working(after), profile.programStyle).toHaveLength(working(extra).length);
      expect(
        Math.min(...working(after).map((set) => set.targetRir)),
        profile.programStyle,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps a swapped extra first through a rebuild, and brings the lift back no second time', () => {
    const workout = plan(spaced, lastMonday, { templateId: 'lower' });
    const extra = allEntries(workout.blocks)[0]!;
    const swapped = run(
      { type: 'replace', entryId: extra.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      spaced,
      lastMonday,
      { currentEntryId: extra.id },
    );
    const rebuilt = run({ type: 'duration', choice: 45 }, swapped.workout, spaced, lastMonday, {
      currentEntryId: extra.id,
      constraints: swapped.constraints,
    });
    expect(ids(rebuilt.workout)[0]).toBe('dumbbell-bench-press');
    expect(ids(rebuilt.workout)).not.toContain(BENCH);
  });

  it("keeps the day's main lift second when accessories for muscles behind lead the rest", () => {
    // A full lower session four days ago: the upper body is behind this week, the legs are not.
    const lower = past(96, 'lower', [
      ['back-squat', 4],
      ['dumbbell-romanian-deadlift', 3],
      ['bulgarian-split-squat', 3],
      ['leg-curl', 3],
      ['leg-extension', 3],
      ['leg-press-calf-raise', 3],
      ['ab-wheel-rollout', 3],
    ]);
    const workout = plan(spaced, [lower], { templateId: 'full-body' });
    expect(ids(workout).slice(0, 2)).toEqual([BENCH, 'back-squat']);
  });

  it('names what leads where the lift cannot be done, at home or swapped away for weeks', () => {
    const swaps = [{ from: BENCH, to: 'dumbbell-bench-press', setAt: at(24), until: at(-24 * 20) }];
    for (const workout of [
      plan(spaced, [], { templateId: 'full-body' }, home),
      plan(spaced, [], { templateId: 'full-body', swaps }),
    ]) {
      const firstName = requireExercise(ids(workout)[0]!).name;
      expect(workout.explanation.summary).toContain(`, ${firstName} first`);
      const main = workout.explanation.reasons.find(isMainLiftLine);
      expect(main && mainLiftName(main)).toBe(firstName);
      expect(ids(workout)).not.toContain(BENCH);
    }
  });

  it('rebuilds a day with its extra under way weighing no second one', () => {
    // A week heavy on the triceps: the extra fits, a second one would not.
    const heavy = [
      past(72, 'push-arms', [
        [BENCH, 4],
        ['cable-triceps-pushdown', 5],
      ]),
    ];
    const workout = plan(spaced, heavy, { templateId: 'lower' });
    const extra = allEntries(workout.blocks)[0]!;
    expect(extra.push).toBe('extra');
    const set = working(extra)[0]!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      sets: [
        {
          entryId: extra.id,
          exerciseId: BENCH,
          setIndex: set.index,
          kind: 'working',
          reps: 5,
          weight: 185,
          rir: 2,
          completedAt: RECORD_NOW,
        },
      ],
    };
    const rebuilt = run({ type: 'duration', choice: 45 }, workout, spaced, heavy, {
      completed,
      currentEntryId: extra.id,
    });
    expect(rebuilt.workout.explanation.reasons.some((line) => line.startsWith('No extra'))).toBe(
      false,
    );
    expect(ids(rebuilt.workout).filter((id) => id === BENCH)).toHaveLength(1);
  });
});
