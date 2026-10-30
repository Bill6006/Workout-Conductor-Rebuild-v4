import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  CompletedSet,
  CompletedWork,
  Readiness,
  RecalibrationSuccess,
  SessionConstraints,
} from './types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { RECORD_NOW, record } from '../../test/records';

/**
 * The second adversarial review of Maintenance 33: a head cold (or a fever) told under way leaves
 * the lift under way below the head cold's floor, to failure on a finisher, while the summary says
 * "every set 2 or more short of failure for the head cold".
 *
 * Steps: a hybrid lifter's pull day (drop sets on). Its chin-ups ask 6-12 reps at 1 in reserve; the
 * dumbbell curl, a finisher, asks two sets at 0 in reserve (to failure) and a drop set. The lifter
 * logs the barbell row's working sets and the first chin-up set, then checks in with "Head cold".
 * In the second case they are on the curl: its first set logged, then the head cold. In the third,
 * "Fever or aches" on the curl.
 *
 * The rule: the readiness model's illness gate (proposal part 2; `RULES.headColdRir`: "Symptoms
 * above the neck are trainable ...: every set at 2 or more in reserve"); the report: "above the
 * neck, every set keeps two or more reps in reserve, no top set to failure and no drop set", and,
 * fixed after the first review, "Any illness keeps a workout under way at the head cold's floor at
 * least". The engine already takes a lift under way's drop set still to come away for it
 * (`withoutDropSetsToCome`: "On a day that keeps every set short of failure ... no drop set is
 * still to come").
 *
 * What happens: the floor reaches only lifts not begun. The rebuild keeps a begun lift's sets as
 * they were (`keptEntries`, `refitStarted` refits loads only), so the chin-ups' two sets still to
 * come stay at 1 in reserve, and the curl's second set stays at 0 (to failure), its drop set gone,
 * beside the headline "Adjusted for today (every set 2 or more short of failure for the head
 * cold)". Under a fever the curl's set stays at 0 under "Fever or aches all over: rest today".
 *
 * Synthetic data only.
 */

const base = createDefaultProfile(RECORD_NOW);
const profile = {
  ...base,
  bodyweight: 185,
  programStyle: 'hybrid' as const,
  techniques: { ...base.techniques, dropSets: true },
};
const gym = createDefaultLocations({ gymAccess: true }, RECORD_NOW).find(
  (place) => place.id === 'gym',
)!;
const history = [7, 3].map((daysAgo) =>
  record(
    daysAgo,
    'barbell-row',
    [
      [5, 130, 2],
      [5, 130, 2],
      [5, 130, 2],
    ],
    [4, 6],
    2,
  ),
);

const checkIn = (illness: NonNullable<Readiness['illness']>): Readiness => ({
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
  illness,
});

const plan = (): GeneratedWorkout =>
  generateWorkout({
    profile,
    location: gym,
    history,
    now: RECORD_NOW,
    duration: 'default',
    constraints: { templateId: 'pull-arms' },
  });

const entryOf = (workout: GeneratedWorkout, exerciseId: string): WorkoutEntry =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === exerciseId)!;

const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');

/** Working sets logged as asked, each a minute after the last. */
function logged(sets: { entry: WorkoutEntry; index: number }[]): CompletedWork {
  const done: CompletedSet[] = sets.map(({ entry, index }, at) => {
    const set = entry.sets.find((each) => each.index === index)!;
    return {
      entryId: entry.id,
      exerciseId: entry.exerciseId,
      setIndex: index,
      kind: 'working',
      reps: set.targetReps[0],
      weight: set.targetWeight,
      rir: set.targetRir,
      completedAt: new Date(Date.parse(RECORD_NOW) + at * 60_000).toISOString(),
    };
  });
  const last = sets.at(-1)!.entry;
  return { ...emptyCompleted(), startedAt: RECORD_NOW, currentEntryId: last.id, sets: done };
}

function tell(
  workout: GeneratedWorkout,
  completed: CompletedWork,
  readiness: Readiness,
  constraints: SessionConstraints = emptyConstraints(),
): RecalibrationSuccess {
  const result = recalibrate({
    trigger: { type: 'readiness', readiness },
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: 'default',
    profile,
    location: gym,
    loading: { missingPlates: [] },
    history,
    constraints,
    reason: 'test',
    timestamp: new Date(Date.parse(RECORD_NOW) + 30 * 60_000).toISOString(),
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** Every working set still to come, as `exercise@reserve`. */
const stillToCome = (workout: GeneratedWorkout, completed: CompletedWork) => {
  const done = new Set(completed.sets.map((set) => `${set.entryId}:${set.setIndex}`));
  return allEntries(workout.blocks).flatMap((entry) =>
    working(entry)
      .filter((set) => !done.has(`${entry.id}:${set.index}`))
      .map((set) => `${entry.exerciseId}@${set.targetRir}`),
  );
};
const underFloor = (sets: string[]) => sets.filter((set) => Number(set.split('@')[1]) < 2);

describe('an illness told with a lift under way', () => {
  it('a head cold holds the chin-ups still to come at 2 or more in reserve', () => {
    const workout = plan();
    const row = entryOf(workout, 'barbell-row');
    const chin = entryOf(workout, 'chin-up');
    // As built: the chin-ups ask 1 in reserve.
    expect(working(chin).map((set) => set.targetRir)).toEqual([1, 1, 1]);
    const completed = logged([
      ...working(row).map((set) => ({ entry: row, index: set.index })),
      { entry: chin, index: working(chin)[0]!.index },
    ]);
    const cold = tell(workout, completed, checkIn('head'));
    expect(cold.summary.headline).toMatch(/every set 2 or more short of failure/);
    expect(underFloor(stillToCome(cold.workout, completed))).toEqual([]);
  });

  it('a head cold takes the finisher under way off failure, as it takes its drop set', () => {
    const workout = plan();
    const curl = entryOf(workout, 'dumbbell-curl');
    // As built: two sets to failure and a drop set.
    expect(working(curl).map((set) => set.targetRir)).toEqual([0, 0]);
    expect(curl.dropSet).toBe(true);
    const completed = logged([{ entry: curl, index: working(curl)[0]!.index }]);
    const cold = tell(workout, completed, checkIn('head'));
    const after = entryOf(cold.workout, 'dumbbell-curl');
    // The drop set goes for the head cold ...
    expect(after.sets.some((set) => set.kind === 'drop')).toBe(false);
    // ... and so must the set to failure still to come.
    expect(underFloor(stillToCome(cold.workout, completed))).toEqual([]);
  });

  it('a fever keeps at least the head cold floor on the finisher under way', () => {
    const workout = plan();
    const curl = entryOf(workout, 'dumbbell-curl');
    const completed = logged([{ entry: curl, index: working(curl)[0]!.index }]);
    const fever = tell(workout, completed, checkIn('body'));
    expect(fever.summary.headline).toBe(
      'Fever or aches all over: rest today, and train again once they have gone.',
    );
    expect(underFloor(stillToCome(fever.workout, completed))).toEqual([]);
  });
});
