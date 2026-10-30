import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { REST_TODAY } from '../../engine/readiness/checkIn';
import { coachContextOf } from '../../features/coach/useCoach';
import { createTestStore } from '../../test/testStore';

/**
 * The second adversarial review of Maintenance 33: on a fever's rest day the Today screen says "rest
 * today" and hides Start, while its coach card offers to add work to today's workout.
 *
 * Steps: Monday noon, a lifter with two sets of biceps work this week. Before starting, they check in
 * "Fever or aches". Today shows the rest day (`REST_TODAY`, no Start), and the coach card beneath it.
 *
 * The rule: the readiness model's illness gate (proposal part 2: "With fever or whole-body symptoms,
 * no session"; checkIn.ts `REST_TODAY`: "Fever or aches all over: rest today, and train again once
 * they have gone"); the first review's fix: "the coach offers no drop set and no 'too soon' card where
 * the day forbids them" (coachConductor.ts: "no workout to lighten, and no card spent on one").
 *
 * What happens: only the "too soon" card and the drop set are held back on the rest day. The coverage
 * card still wins: "Biceps are under target this week" with "About 5 min of room today: two sets of
 * Dumbbell Curl close most of the gap" and the button "Add 2 sets of Dumbbell Curl", on the screen
 * that says to rest today, for a workout that cannot be started.
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
  past(24 * 6, 'pull-arms', [['barbell-row', 135, 8, 2, [6, 10]]]),
  past(24 * 3, 'legs', [['back-squat', 185, 5, 2, [4, 6]]]),
  past(20, 'push-arms', [
    ['barbell-bench-press', 185, 5, 1, [4, 6]],
    ['cable-triceps-pushdown', 50, 12, 1, [10, 15]],
  ]),
];

describe('the coach on a fever rest day', () => {
  it('offers no work for today', async () => {
    const { store } = createTestStore({ now: () => NOW });
    await store.hydrate();
    await store.completeOnboarding(
      { ...createDefaultProfile(NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, NOW),
    );
    const db = await store.getDatabase();
    for (const record of history) await db.put('workouts', record);
    await store.hydrate();

    const result = await store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 3,
        soreness: 2,
        sleep: 3,
        motivation: 3,
        jointDiscomfort: [],
        timePressure: false,
        illness: 'body',
      },
    });
    expect(result?.ok && result.summary.headline).toBe(REST_TODAY);
    const state = store.getSnapshot();
    expect(state.session?.status).toBe('preview');

    const signal = coachContextOf({ ...state, lastExportAt: NOW }, Date.parse(NOW))?.card?.signal;
    expect(signal?.why.join(' ') ?? '').not.toMatch(/room today/);
    expect(signal?.action?.kind === 'recalibrate' ? signal.action.trigger.type : null).toBeNull();
  });
});
