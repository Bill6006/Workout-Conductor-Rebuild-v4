import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { recoveryBalance } from '../planning/weeklyPlan';
import { readStart } from './badStart';
import type { CompletedSet, Readiness } from './types';
import { hoursSince, recoveryWindows } from '../recovery/recovery';
import { allEntries, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';

/**
 * The first adversarial review of Maintenance 33: the hard start reads each muscle's window without
 * today's whole-body layer, so it calls a hard start where the coach and the Plan screen say the
 * muscle is still inside its window.
 *
 * Steps: a lifter with their own bench press and incline press targets did pec deck flies 40 h ago,
 * 12 reps at 2 in reserve (the chest's window: 36 h). Today's check-in says sleep "Short" (2), every
 * other answer at the middle: one item worse, so it lowers nothing, but it is a short night. The
 * first sets of the bench press and the incline press each fall exactly 3 reps short.
 *
 * The rule: the report, "The whole-body layer: a short night on today's check-in ... lengthens every
 * window by 12 h", and "The windows are read where recovery is said: the Plan screen's balance ...,
 * the hard start's reading (a muscle inside its window lowers what its first set is expected to do
 * by a step), the 'too soon' card". The proposal, part 1: one shared model "so the two can never
 * contradict"; readiness-and-soreness.md: "Recent hard work on the same muscle within 24-48 h lowers
 * the expectation slightly".
 *
 * What happens: `readStart` calls `recoveryWindows(context.history, { resets })` without the
 * check-in it was given, so the chest's window is 36 h and, 40 h on, over: the bench press takes no
 * step and the two lifts read as a hard start (the rest of the day eased). At the same moment the
 * coach's and the Plan screen's windows (with the short night) give the chest 48 h, 8 h still to
 * run. With the flies 30 h ago (inside 36 h) the same sets are no hard start: the step itself works.
 * (The hard start also reads the log as logged, `state.history`, where the coach and the Plan screen
 * read it as the rules do, `state.readHistory`.)
 *
 * Synthetic data only.
 */

const profile = {
  ...createDefaultProfile(RECORD_NOW),
  bodyweight: 185,
  programStyle: 'hypertrophy-focus' as const,
};
const gym = createDefaultLocations({ gymAccess: true }, RECORD_NOW).find(
  (place) => place.id === 'gym',
)!;

const session = (
  exerciseId: string,
  daysAgo: number,
  set: SetSpec,
  target: [number, number],
  rir: number,
): WorkoutRecord => ({
  ...record(daysAgo, exerciseId, [set, set, set], target, rir),
  id: `${exerciseId}-${daysAgo}`,
});

const historyWithFlies = (hoursAgo: number): WorkoutRecord[] => [
  session('barbell-bench-press', 11, [5, 185, 2], [4, 6], 2),
  session('barbell-bench-press', 7, [5, 185, 2], [4, 6], 2),
  session('incline-dumbbell-press', 11, [8, 60, 2], [6, 10], 2),
  session('incline-dumbbell-press', 7, [8, 60, 2], [6, 10], 2),
  // The pec deck: no long-length work, so its window is the chest's own (the cable fly is one since
  // the third review of Maintenance 33).
  session('pec-deck', hoursAgo / 24, [12, 40, 2], [10, 15], 2),
];

const shortNight: Readiness = {
  energy: 3,
  soreness: 2,
  sleep: 2,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};

/** A lift's first working set logged exactly 3 reps short of what it asked, `minutes` in. */
function threeShort(entry: WorkoutEntry, minutes: number): CompletedSet {
  const set = entry.sets.find((candidate) => candidate.kind === 'working')!;
  return {
    entryId: entry.id,
    exerciseId: entry.exerciseId,
    setIndex: set.index,
    kind: 'working',
    reps: set.targetReps[0] - 3,
    weight: set.targetWeight,
    rir: set.targetRir,
    completedAt: new Date(Date.parse(RECORD_NOW) + minutes * 60_000).toISOString(),
  };
}

function start(history: WorkoutRecord[], madeAt?: string) {
  const workout = generateWorkout({
    profile,
    location: gym,
    history,
    now: RECORD_NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
  const [bench, incline] = allEntries(workout.blocks);
  expect([bench!.exerciseId, incline!.exerciseId]).toEqual([
    'barbell-bench-press',
    'incline-dumbbell-press',
  ]);
  const sets = [threeShort(bench!, 5), threeShort(incline!, 15)];
  return {
    sets,
    reading: readStart(workout.blocks, sets, {
      profile,
      history,
      readiness: shortNight,
      resets: null,
      ...(madeAt ? { madeAt } : {}),
    }),
  };
}

describe("the hard start's window step on a short night", () => {
  it('reads the window the coach and the Plan screen read', () => {
    // The control: the flies inside the chest's own 36 h, the bench press takes the step.
    expect(start(historyWithFlies(30)).reading.low).toBe(false);

    const history = historyWithFlies(40);
    const { sets, reading } = start(history);
    // The coach's window ("too soon" passes the check-in) and the Plan screen's: 48 h, inside.
    const coach = recoveryWindows(history, { readiness: shortNight, now: RECORD_NOW }).get(
      'chest',
    )!;
    expect(coach.hours).toBe(48);
    expect(hoursSince(coach, sets[0]!.completedAt)).toBeLessThan(coach.hours);
    const plan = recoveryBalance(history, sets[0]!.completedAt, { readiness: shortNight });
    expect(plan.find((row) => row.muscle === 'chest')?.state).toBe('recovering');
    expect(reading).toEqual({ low: false, lifts: [] });
  });

  // The third review of Maintenance 33: past midnight, a check-in told on the evening the session was
  // made is that day's, none of the day its first sets were lifted on, as every reader takes it.
  it('past midnight, reads the check-in of the session’s day as none of today’s', () => {
    const history = historyWithFlies(40);
    const madeAt = new Date(Date.parse(RECORD_NOW) - 24 * 3_600_000).toISOString();
    // Made the day before: the short night lengthens no window, the chest's 36 h has run out, and
    // the same sets read as a hard start.
    expect(start(history, madeAt).reading.low).toBe(true);
    expect(start(history).reading.low).toBe(false);
  });
});
