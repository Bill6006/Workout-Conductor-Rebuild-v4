import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { allEntries } from '../../engine/workout/types';
import { coachContextOf } from '../../features/coach/useCoach';
import { createTestStore } from '../../test/testStore';

/**
 * The second adversarial review of Maintenance 33: right after "Lighter for the triceps", the day's
 * reserve check (a set to failure, item 43) goes on the triceps pushdown the lighter option eased.
 *
 * Steps: a hybrid lifter with "Check how well I judge reps in reserve" on, a check due this week.
 * Push day yesterday afternoon (20 h ago): the bench press and skull crushers, four sets each a rep
 * short of failure. Today's plan, not started, is the pull day with three sets of the triceps
 * pushdown at 1 in reserve. The coach shows "The triceps may not have recovered", and the lifter
 * taps "Lighter for the triceps": the pushdown becomes two sets of 9-14 at 2 in reserve.
 *
 * The rule: the "too soon" card's own words: "Lighter keeps the loads: a set fewer and a rep more in
 * reserve on its lifts today"; item 43's day rule (docs/research/reserve-check.md, "Which day"):
 * "None in a deload week, after a low or sore check-in, on a hard-start day (item 42) ...: a day the
 * plan is easing", since a set to failure "costs more fatigue, muscle damage and discomfort,
 * recovered within 24 to 48 hours". The lighter option is the hard start's ease for one muscle
 * ("their lifts take a hard start's ease, never on top of one", types.ts), and Maintenance 33 added
 * its own days (a check-in that lowers, any illness) to that rule.
 *
 * What happens: `reserveCheckSetFor` reads the deload, the check-in and the hard start only, never
 * the lighter option, so the check moves onto the eased pushdown's new last set: the lifter is asked
 * to take the triceps to failure today, on the muscle the coach has just said may not have
 * recovered, minutes after choosing a rep more in reserve on it.
 *
 * Synthetic data only.
 */

const NOW = '2026-09-07T12:00:00.000Z';
const HOUR = 3_600_000;

type Lift = [
  exerciseId: string,
  weight: number,
  reps: number,
  rir: number,
  range: [number, number],
];

function past(hoursAgo: number, templateId: string, lifts: Lift[]): WorkoutRecord {
  const when = new Date(Date.parse(NOW) - hoursAgo * HOUR).toISOString();
  return {
    id: `${templateId}-${hoursAgo}`,
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
    entries: lifts.map(([exerciseId, weight, reps, rir, range]) => ({
      exerciseId,
      plannedSets: 4,
      sets: [0, 1, 2, 3].map((setIndex) => ({
        kind: 'working' as const,
        reps,
        weight,
        rir,
        completed: true,
        setIndex,
        targetReps: range,
        targetRir: rir,
        targetWeight: weight,
      })),
    })),
  };
}

const history: WorkoutRecord[] = [
  past(24 * 7, 'push-arms', [
    ['barbell-bench-press', 185, 5, 2, [4, 6]],
    ['skull-crusher', 50, 10, 1, [8, 12]],
  ]),
  past(24 * 6, 'pull-arms', [
    ['barbell-row', 135, 8, 2, [6, 10]],
    ['cable-triceps-pushdown', 50, 12, 1, [10, 15]],
  ]),
  past(24 * 5, 'legs', [['back-squat', 185, 5, 2, [4, 6]]]),
  past(24 * 2, 'legs', [['back-squat', 185, 5, 2, [4, 6]]]),
  past(20, 'push-arms', [
    ['barbell-bench-press', 185, 5, 1, [4, 6]],
    ['skull-crusher', 50, 10, 1, [8, 12]],
  ]),
];

describe('the reserve check after "Lighter" on a muscle', () => {
  it('never asks a set to failure of a lift the lighter option eased', async () => {
    const { store } = createTestStore({ now: () => NOW });
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(NOW), bodyweight: 185, reserveCheck: true },
      createDefaultLocations({ gymAccess: true }, NOW),
    );
    const db = await store.getDatabase();
    for (const record of history) await db.put('workouts', record);
    await store.hydrate();

    const state = store.getSnapshot();
    const card = coachContextOf({ ...state, lastExportAt: NOW }, Date.parse(NOW))?.card;
    expect(card?.signal.headline).toBe('The triceps may not have recovered');
    const action = card!.signal.action!;
    if (action.kind !== 'recalibrate') throw new Error('no lighter option');
    const taken = await store.takeCoachChange(action, card!.signal);
    expect(taken?.ok).toBe(true);
    const pushdown = allEntries(store.getSnapshot().session!.workout.blocks).find(
      (entry) => entry.exerciseId === 'cable-triceps-pushdown',
    )!;
    // Eased: two sets, a rep more in reserve.
    expect(
      pushdown.sets
        .filter((set) => set.kind === 'working')
        .map((set) => [set.targetReps, set.targetRir]),
    ).toEqual([
      [[9, 14], 2],
      [[9, 14], 2],
    ]);

    const check = store.reserveCheckSetFor();
    const checked = check ? requireExercise(check.exerciseId) : null;
    expect(checked?.primaryMuscles.includes('triceps') ?? false).toBe(false);
  });
});
