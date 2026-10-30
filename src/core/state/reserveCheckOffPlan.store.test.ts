import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import { allEntries } from '../../engine/workout/types';
import { offPlanSpec } from '../../engine/workoutGenerator/generate';
import { describeWorkout } from '../../test/clockDays';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Twenty-first review of round M, on the twentieth pass's rule that no set of a day off the plan
 * goes to failure, where it meets the reserve check (Maintenance 27, item 43: `reserveCheckSetFor`
 * in the store, `reserveCheckSet` in reserveCheck.ts).
 *
 * The rules: item 12, "No set to failure: at least 1 rep in reserve, 2 for a beginner"; item 32, "A
 * muscle trained today takes at most what is left of the dose today's own session gave it, three or
 * more reps short of failure"; the twentieth pass, "No set of a day off the plan goes to failure";
 * and the round's first review, "Off the plan ... no drop set" ("A drop set is a set taken to
 * failure"). The research behind them (`docs/research/catch-up-and-second-workout.md`, the
 * recommended defaults): "Effort: the app's normal RIR, with no sets to failure", and "Sets taken
 * at or near failure leave a muscle below baseline for 24 to 48 h".
 *
 * What happens: with reserve checks on (the style settings' "Reserve checks" switch, a style that
 * takes sets to failure) and one due, the day's check goes on the last set of a machine or cable
 * isolation lift: "Reserve check: lift to your usual stop and judge the reps left, then keep going
 * without racking until you cannot finish a rep with good form". The store picks it with the day's
 * deload, a low check-in and a hard start set aside (`reserveCheckSet`'s `day`), but not a day off
 * the plan, so a catch-up's lift, and a second workout's lift for what is left of a muscle trained
 * this morning, is taken to failure.
 *
 * Steps (synthetic data only), reserve checks on, none taken yet (one due, the learning weeks):
 * - Monday's bench press in the log, the cable lateral raise a favourite; on Wednesday, a day the
 *   schedule does not tick, the catch-up has "cable-lateral-raise x3 @RIR 1/1/1". Started, the
 *   day's reserve check is its last set.
 * - A row six days ago; this morning the bench press, and the cable triceps pushdown planned for
 *   four sets and cut short after one, the pushdown a favourite: the second workout takes what is
 *   left of the triceps, "cable-triceps-pushdown x3 @RIR 3/3/3". Started, the day's reserve check
 *   is its last set: the triceps trained this morning taken to failure.
 * The full session taken instead, a day of the plan, still has its check.
 *
 * Both also fail on 0fe4cb9 (item 43's check has never read the day's offer).
 */

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();
const thisMorning = new Date(Date.parse(TEST_NOW) - 4 * 3600_000).toISOString();
const sets3: [number, number, number][] = [
  [10, 100, 2],
  [10, 100, 2],
  [10, 100, 2],
];

/** A workout this morning, each lift with its planned sets and the sets done of them. */
function morning(parts: [exerciseId: string, planned: number, done: number][]): WorkoutRecord {
  return {
    ...record(0, parts[0]![0], sets3, [8, 12], 2),
    id: 'w-morning',
    startedAt: thisMorning,
    completedAt: thisMorning,
    endedEarly: true,
    entries: parts.map(([exerciseId, planned, done]) => ({
      exerciseId,
      plannedSets: planned,
      sets: Array.from({ length: done }, (_, index) => ({
        kind: 'working' as const,
        reps: 10,
        weight: 100,
        rir: 2,
        completed: true,
        setIndex: index,
        targetReps: [8, 12] as [number, number],
        targetRir: 2,
      })),
    })),
  };
}

async function lifter(favourites: string[], log: WorkoutRecord[]) {
  const handle = createTestStore();
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    {
      ...createDefaultProfile(TEST_NOW),
      bodyweight: 185,
      reserveCheck: true,
      exercisePreferences: { preferred: favourites, disliked: [] },
    },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  for (const workout of log) await db.put('workouts', workout);
  await handle.store.hydrate();
  return handle;
}

type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;

/** The day's reserve check once the workout is started, as "lift on set". */
function checkOf(handle: Handle): string | null {
  handle.store.startWorkout();
  const check = handle.store.reserveCheckSetFor();
  if (!check) return null;
  const entry = allEntries(session(handle).workout.blocks).find(
    (candidate) => candidate.id === check.entryId,
  );
  const set = entry?.sets.find((candidate) => candidate.index === check.setIndex);
  return `${check.exerciseId} set ${check.setIndex} @RIR ${set?.targetRir}`;
}

const mondayBench: WorkoutRecord = {
  ...record(0, 'barbell-bench-press', sets3, [8, 12], 2),
  id: 'w-bench-monday',
  startedAt: daysBefore(2),
  completedAt: daysBefore(2),
};

describe('the reserve check on a day off the plan', () => {
  it('takes no catch-up lift to failure', async () => {
    const handle = await lifter(['Cable Lateral Raise'], [mondayBench]);
    expect(session(handle).workout.templateId).toBe('catch-up');
    expect(offPlanSpec(session(handle).constraints, session(handle).workout)).not.toBeNull();
    expect(describeWorkout(session(handle).workout)).toContain('cable-lateral-raise x3 @RIR 1/1/1');
    // On 333f1d4 and 0fe4cb9: "cable-lateral-raise set 2 @RIR 1", taken on to failure.
    expect(checkOf(handle)).toBeNull();
  });

  it('takes no lift for what is left of a muscle trained this morning to failure', async () => {
    const handle = await lifter(
      ['Cable Triceps Pushdown'],
      [
        {
          ...record(0, 'barbell-row', sets3, [8, 12], 2),
          id: 'w-row',
          startedAt: daysBefore(6),
          completedAt: daysBefore(6),
        },
        morning([
          ['barbell-bench-press', 3, 3],
          ['cable-triceps-pushdown', 4, 1],
        ]),
      ],
    );
    expect(session(handle).workout.templateId).toBe('second-workout');
    const triceps = session(handle).constraints.catchUp?.muscles.find(
      (item) => item.muscle === 'triceps',
    );
    expect(triceps).toMatchObject({ why: 'remainder', minRir: 3 });
    expect(describeWorkout(session(handle).workout)).toContain(
      'cable-triceps-pushdown x3 @RIR 3/3/3',
    );
    // On 333f1d4 and 0fe4cb9: "cable-triceps-pushdown set 2 @RIR 3", the triceps trained this
    // morning taken to failure.
    expect(checkOf(handle)).toBeNull();
  });

  it('the full session, a day of the plan, keeps its check', async () => {
    const handle = await lifter(['Cable Lateral Raise'], [mondayBench]);
    await handle.store.setFullSession(true);
    expect(session(handle).constraints.fullSession).toBe(true);
    expect(checkOf(handle)).not.toBeNull();
  });
});
