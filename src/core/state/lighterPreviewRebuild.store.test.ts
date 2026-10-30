import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import type { AppStore } from './appStore';
import { allEntries } from '../../engine/workout/types';
import { coachContextOf } from '../../features/coach/useCoach';
import { createTestStore } from '../../test/testStore';

/**
 * The second adversarial review of Maintenance 33: "Lighter" taken on today's plan before the start
 * is lost when the plan is made again for another setting, unless a check-in happens to be in force.
 *
 * Steps: Monday noon. Push day yesterday afternoon (20 h ago): the bench press and the triceps
 * pushdown, four sets each a rep short of failure. Today's plan, not started, is the pull day, whose
 * skull crushers ask three sets at 1 in reserve: the coach shows "The triceps may not have
 * recovered" with "Lighter for the triceps", and the lifter taps it (the skull crushers become two
 * sets at 2 in reserve). Then, still before the start, they set a coach focus (or plan a deload
 * week, or reset something on the learned page): the store makes today's plan again.
 *
 * The rule: the store's own rule for a plan made again before the start: "Today's choices hold
 * through it (Maintenance 24): the length, a check-in, the plates missing today, and what was set
 * aside for today ... are applied to the new plan by the engine" (`regeneratePreview`); the lighter
 * option is a day's setting kept in the session's constraints like them ("The muscles the lifter
 * chose to go lighter on today", types.ts), and a check-in in force carries it through the same
 * rebuild. The card's own words: "Lighter keeps the loads: a set fewer and a rep more in reserve on
 * its lifts today."
 *
 * What happens: `rebuildPreview` re-applies the day's choices only when one of its listed choices is
 * in force (`chosen`: a check-in, an effort change, an end time, a skip, a move, a sore joint, plates
 * missing, a length); `lighter` is not among them, so the fresh plan is kept as built: the skull
 * crushers are back at three sets at 1 in reserve, `lighter` is gone from the constraints, and the
 * card comes back offering the same thing. With any check-in in force the same rebuild keeps it.
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
  past(24 * 7, 'push-arms', [['barbell-bench-press', 185, 5, 2, [4, 6]]]),
  past(24 * 6, 'pull-arms', [['barbell-row', 135, 8, 2, [6, 10]]]),
  past(24 * 5, 'legs', [['back-squat', 185, 5, 2, [4, 6]]]),
  past(24 * 2, 'legs', [['back-squat', 185, 5, 2, [4, 6]]]),
  past(20, 'push-arms', [
    ['barbell-bench-press', 185, 5, 1, [4, 6]],
    ['cable-triceps-pushdown', 50, 12, 1, [10, 15]],
  ]),
];

/** The working sets of today's lifts for the triceps, as reserve per set. */
function tricepsWork(store: AppStore): number[][] {
  return allEntries(store.getSnapshot().session!.workout.blocks)
    .filter((entry) => requireExercise(entry.exerciseId).primaryMuscles.includes('triceps'))
    .map((entry) => entry.sets.filter((set) => set.kind === 'working').map((set) => set.targetRir));
}

describe('"Lighter" on a plan not started, made again for another setting', () => {
  it('stays taken, as the day’s other choices do', async () => {
    const { store } = createTestStore({ now: () => NOW });
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, NOW),
    );
    const db = await store.getDatabase();
    for (const record of history) await db.put('workouts', record);
    await store.hydrate();

    const state = store.getSnapshot();
    expect(state.session?.status).toBe('preview');
    const card = coachContextOf({ ...state, lastExportAt: NOW }, Date.parse(NOW))?.card;
    expect(card?.signal.headline).toBe('The triceps may not have recovered');
    const action = card!.signal.action!;
    if (action.kind !== 'recalibrate') throw new Error('no lighter option');
    expect(action.trigger).toEqual({ type: 'lighter', muscle: 'triceps' });
    expect(tricepsWork(store)).toEqual([[1, 1, 1]]);

    const taken = await store.takeCoachChange(action, card!.signal);
    expect(taken?.ok).toBe(true);
    expect(tricepsWork(store)).toEqual([[2, 2]]);
    expect(store.getSnapshot().session!.constraints.lighter).toEqual(['triceps']);

    // Another setting, still before the start: the plan is made again.
    await store.setCoachFocus('biceps');
    expect(store.getSnapshot().session!.constraints.focus).toBe('biceps');
    expect(store.getSnapshot().session!.constraints.lighter).toEqual(['triceps']);
    expect(tricepsWork(store)).toEqual([[2, 2]]);
  });
});
