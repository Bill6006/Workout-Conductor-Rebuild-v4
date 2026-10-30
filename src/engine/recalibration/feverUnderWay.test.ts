import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { REST_TODAY } from '../readiness/checkIn';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  CompletedWork,
  Readiness,
  RecalibrationRequest,
  RecalibrationSuccess,
  SessionConstraints,
} from './types';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { RECORD_NOW, record } from '../../test/records';

/**
 * The first adversarial review of Maintenance 33: a fever reported under way, after a head cold,
 * gives the full-effort plan back.
 *
 * Steps: a hybrid lifter with drop sets on starts the push day (its EZ-bar curl carries a drop set)
 * and logs the bench press's top set. They check in with a head cold: every set still to come is
 * held at 2 or more in reserve and the curl's drop set goes. Feeling worse, they update the
 * check-in to "Fever or aches".
 *
 * The rule: the approved proposal, part 2: "Illness is a gate. With fever or whole-body symptoms,
 * no session. Above-the-neck symptoms are trainable" (Weidner 1997; Dick 2014), and the head cold
 * keeps "every set at 2 or more in reserve" (`RULES.headColdRir`). A fever is the stricter case: the
 * day must never be harder under a fever than under a head cold, and `checkIn.ts` says a fever is
 * "no session today". The drop set goes "On a day that keeps every set short of failure".
 *
 * What happens: the fever has no plan change of its own (`readinessAdjustment` returns undefined
 * for 'body'), so the readiness trigger reads it as a check-in that "takes back an earlier one's
 * adjustment" and restores the plan: the summary reads "Planned effort back: 6 exercises adjusted",
 * every set still to come goes back to 1 in reserve, and the EZ-bar curl's drop set (a set to
 * failure) comes back ("drop set added"), beside the note "Fever or aches all over: rest today".
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
    'barbell-bench-press',
    [
      [5, 185, 2],
      [5, 185, 2],
      [5, 185, 2],
    ],
    [4, 6],
    2,
  ),
);

const checkIn = (illness?: Readiness['illness']): Readiness => ({
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
  ...(illness ? { illness } : {}),
});

function readiness(
  workout: GeneratedWorkout,
  completed: CompletedWork,
  constraints: SessionConstraints,
  value: Readiness,
): RecalibrationSuccess {
  const request: RecalibrationRequest = {
    trigger: { type: 'readiness', readiness: value },
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: 'default',
    profile,
    location: gym,
    history,
    constraints,
    reason: 'test',
    timestamp: RECORD_NOW,
  };
  const result = recalibrate(request);
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** The working and drop sets still to come, as `exercise kind@reserve`. */
const toCome = (workout: GeneratedWorkout, completed: CompletedWork) => {
  const done = new Set(completed.sets.map((set) => `${set.entryId}:${set.setIndex}`));
  return allEntries(workout.blocks).flatMap((entry) =>
    entry.sets
      .filter((set) => set.kind !== 'warmup' && !done.has(`${entry.id}:${set.index}`))
      .map((set) => ({ exerciseId: entry.exerciseId, kind: set.kind, rir: set.targetRir })),
  );
};

describe('a fever reported under way after a head cold', () => {
  it('never gives back a harder day than the head cold had', () => {
    const plan = generateWorkout({
      profile,
      location: gym,
      history,
      now: RECORD_NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    // The plan carries a drop set on the EZ-bar curl.
    expect(allEntries(plan.blocks).some((entry) => entry.dropSet)).toBe(true);
    const bench = allEntries(plan.blocks)[0]!;
    const top = bench.sets.find((set) => set.kind === 'working')!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: RECORD_NOW,
      currentEntryId: bench.id,
      sets: [
        {
          entryId: bench.id,
          exerciseId: bench.exerciseId,
          setIndex: top.index,
          kind: 'working',
          reps: 5,
          weight: top.targetWeight,
          rir: top.targetRir,
          completedAt: RECORD_NOW,
        },
      ],
    };

    const head = readiness(plan, completed, emptyConstraints(), checkIn('head'));
    const headSets = toCome(head.workout, completed);
    expect(headSets.some((set) => set.kind === 'drop')).toBe(false);
    expect(Math.min(...headSets.map((set) => set.rir))).toBeGreaterThanOrEqual(2);

    const fever = readiness(head.workout, completed, head.constraints, checkIn('body'));
    expect(fever.summary.details).toContain(REST_TODAY);
    const feverSets = toCome(fever.workout, completed);
    expect(fever.summary.headline).not.toMatch(/^Planned effort back/);
    expect(fever.summary.headline).toBe(REST_TODAY);
    expect(feverSets.some((set) => set.kind === 'drop')).toBe(false);
    expect(Math.min(...feverSets.map((set) => set.rir))).toBeGreaterThanOrEqual(2);
  });
});
