import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { recommendNextTarget, summarizeProgression } from '../progression/progression';
import { prescribe } from '../progression/roles';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { generateWorkout } from '../workoutGenerator/generate';
import { FEWER_REPS_SOURCE, conductCoach, type CoachInput } from './coachConductor';

/**
 * Maintenance 30, the re-check of round L: the coach's offer for a move done at bodyweight that keeps
 * falling short of its range (Maintenance 21, item 17: "fewer reps over more sets ... or swap in" the
 * first listed alternative "with a load" that fits) never names the same move made heavier, its
 * loaded version (item 31), but a lift whose load can go under bodyweight, as before.
 */
const NOW = RECORD_NOW;
const profile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);

function shortInput(
  exerciseId: string,
  range: [number, number],
  short: SetSpec[],
  place = gym,
): CoachInput {
  const exercise = requireExercise(exerciseId);
  // Three days apart and three days back: a long set a rep short of failure two days before leaves
  // the glutes inside their window, and since Maintenance 33 the "too soon" card leads.
  const history: WorkoutRecord[] = [6, 3].map((daysAgo) =>
    record(daysAgo, exerciseId, short, range, 1),
  );
  const workout = generateWorkout({
    profile,
    location: place,
    history,
    now: NOW,
    duration: 'default',
  });
  const role = exercise.compound ? ('secondary-hypertrophy' as const) : ('isolation' as const);
  const target = recommendNextTarget({
    exercise,
    role,
    prescription: prescribe(exercise, role, profile),
    history,
    profile,
    now: NOW,
  });
  const blocks = workout.blocks.map((block, blockIndex) =>
    blockIndex === 0
      ? {
          ...block,
          kind: 'straight' as const,
          entries: [
            {
              ...block.entries[0]!,
              exerciseId,
              role,
              progression: summarizeProgression(target),
              manual: undefined,
              sets: [0, 1, 2].map((index) => ({
                index,
                kind: 'working' as const,
                targetReps: range,
                targetRir: 1,
                targetWeight: null,
                restSeconds: 90,
              })),
            },
          ],
        }
      : block,
  );
  const fatigue = interpretFatigue(history, NOW);
  return {
    workout: { ...workout, blocks },
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    location: place,
    history,
    now: NOW,
    fatigue,
    strategy: analyzeStrategy({ history, profile, now: NOW, fatigue }),
    lastExportAt: NOW,
    workoutCount: history.length,
  };
}

describe('the coach’s swap for a bodyweight move that keeps falling short', () => {
  it.each([
    [
      'bulgarian-split-squat',
      [8, 12] as [number, number],
      'Dumbbell Bulgarian Split Squat',
      'Leg Press',
    ],
    ['reverse-lunge', [8, 15] as [number, number], 'Dumbbell Reverse Lunge', 'Goblet Squat'],
  ])('does not name the same move made heavier: %s', (exerciseId, range, heavier, lighter) => {
    const short: SetSpec[] = [
      [range[0] - 2, null, 1],
      [range[0] - 3, null, 1],
      [range[0] - 3, null, 0],
    ];
    const card = conductCoach(shortInput(exerciseId, range, short));
    expect(card?.signal.source).toBe(FEWER_REPS_SOURCE);
    expect(card?.signal.why.join(' ')).not.toContain(heavier);
    // A lift that can be loaded under bodyweight, as before item 31.
    expect(card?.signal.why.join(' ')).toContain(`swap in ${lighter} for a few weeks`);
  });

  it('names no swap at all, rather than the heavier move, where nothing lighter fits', () => {
    // At home there is no leg press: the split squat's lighter swaps are gone, its loaded version
    // is there, and it is still no swap for a lifter short of the range at bodyweight.
    const short: SetSpec[] = [
      [6, null, 1],
      [5, null, 1],
      [5, null, 0],
    ];
    const card = conductCoach(shortInput('bulgarian-split-squat', [8, 12], short, home));
    expect(card?.signal.source).toBe(FEWER_REPS_SOURCE);
    expect(card?.signal.why.join(' ')).not.toContain('Dumbbell Bulgarian Split Squat');
  });
});
