import { requireExercise } from '../../catalog/exercises/catalog';
import type { CatalogExercise } from '../../catalog/exercises/exerciseSchema';
import type { LocationProfile } from '../../core/validation/location';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { startRatio } from '../progression/startingLoad';
import { contextFor, swapsOffered } from '../recalibration/recalibrate';
import type { CompletedWork, SessionConstraints } from '../recalibration/types';
import type { CoachRoutes } from '../strategy/plateau';
import {
  allEntries,
  stoppedBefore,
  type GeneratedWorkout,
  type WorkoutBlock,
  type WorkoutEntry,
} from '../workout/types';
import {
  rankAlternatives,
  type AlternativeCandidate,
  type AlternativeResult,
} from './rankAlternatives';
import { buildRankingSignals } from './signals';

/** How many alternatives a lift's sheet lists. */
export const SHEET_ALTERNATIVES = 6;

export interface EntryAlternativesInput {
  profile: UserProfile;
  /** The place today trains at. */
  location: LocationProfile | undefined;
  workout: GeneratedWorkout;
  /** The block the lift is in: a superset's partner limits what can come in. */
  block: WorkoutBlock;
  entry: WorkoutEntry;
  constraints: SessionConstraints;
  completed: Pick<CompletedWork, 'sets'>;
  /**
   * The log: what was done and when, the week's load and the last pain report. The ranking reads
   * no reserve, so the log as kept and as the rules read it give the same list.
   */
  history: readonly WorkoutRecord[];
  now: string;
  coachRoutes?: CoachRoutes;
}

/**
 * The alternatives a lift's sheet offers, best match first: those that fit the place, the
 * lifter's limitations, the joints that hurt today, the lift's superset and the day's catch-up or
 * second workout. One list for the Today sheet, the workout's sheet and the coach, so the coach
 * never offers a way into the sheet that the sheet cannot fill (the owner, 2026-10-31: "A harder
 * variation" was offered for Dumbbell Row at home, whose sheet said no safe alternative fitted).
 */
export function entryAlternatives(input: EntryAlternativesInput): AlternativeResult {
  const { workout, block, entry } = input;
  const current = requireExercise(entry.exerciseId);
  const cap = capLimitedOf(entry, current);
  return swapsOffered(
    rankAlternatives({
      current,
      context: contextFor({ profile: input.profile, location: input.location }, input.constraints),
      // The exercise a stand-in took over from is offered back; swapping to it picks it up.
      otherExercises: allEntries(workout.blocks)
        .filter(
          (other) => other.id !== entry.id && !stoppedBefore(workout.blocks, entry).includes(other),
        )
        .map((other) => requireExercise(other.exerciseId)),
      supersetPartner:
        block.kind === 'superset'
          ? requireExercise(
              block.entries.find((other) => other.id !== entry.id)?.exerciseId ?? entry.exerciseId,
            )
          : undefined,
      dropSetPlanned: entry.dropSet,
      plannedSets: { sets: entry.sets.length, restSeconds: entry.restSeconds },
      signals: {
        ...buildRankingSignals({
          profile: input.profile,
          history: input.history,
          now: input.now,
          sessionPainJoints: input.constraints.painJoints,
          ...(input.coachRoutes ? { coachRoutes: input.coachRoutes } : {}),
          currentExerciseId: current.id,
        }),
        // A lift held at the heaviest weight here ranks first the variations that stay heavy with
        // what the place has, on Today's sheet as in the workout's.
        ...(cap ? { capLimited: cap } : {}),
      },
      limit: SHEET_ALTERNATIVES,
    }),
    {
      constraints: input.constraints,
      completed: input.completed,
      history: input.history,
      timestamp: input.now,
    },
    workout,
    entry,
  );
}

/**
 * A lift held at the heaviest weight here, with a load to measure it by: its load ratio, which a
 * harder variation is under. Undefined otherwise.
 */
export function capLimitedOf(
  entry: WorkoutEntry,
  exercise: CatalogExercise,
): { currentRatio: number } | undefined {
  if (!entry.progression?.capped) return undefined;
  const ratio = startRatio(exercise);
  return ratio === null ? undefined : { currentRatio: ratio };
}

/**
 * The harder variations a lift held at the heaviest weight here has on its sheet: the alternatives
 * listed that are variations of it, the same movement (as the coach route reads a variation), and
 * heavier per pound, as the ranking's own "still heavy with the weights you have" reads them. A
 * rear delt fly is heavier per pound than a row, but no variation of it. Empty when the lift is not
 * held there, or the sheet lists none.
 */
export function harderAlternatives(input: EntryAlternativesInput): AlternativeCandidate[] {
  const current = requireExercise(input.entry.exerciseId);
  const cap = capLimitedOf(input.entry, current);
  if (!cap) return [];
  return entryAlternatives(input).candidates.filter((candidate) => {
    const ratio = startRatio(candidate.exercise);
    return (
      candidate.exercise.movementPattern === current.movementPattern &&
      ratio !== null &&
      ratio < cap.currentRatio - 1e-6
    );
  });
}
