import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { rankAlternatives } from '../alternatives/rankAlternatives';
import { gatherSignals, type CoachInput } from './coachConductor';
import {
  contextFor,
  emptyCompleted,
  emptyConstraints,
  recalibrate,
  swapsOffered,
} from '../recalibration/recalibrate';
import type { RecalibrationTrigger, SessionConstraints } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { record } from '../../test/records';

/**
 * Twentieth review of round M, on the nineteenth pass's coach fix. The report: "Every coach offer
 * reads the day's list (one helper for all four)": `dayExclusions` (the avoid list and the lifts
 * swapped away today) in the extra set's accessory, the fewer-reps swap, the coverage accessory and
 * the variety swap. The eighteenth pass: "A lift the lifter swaps away stays away for the day
 * (`swappedAway`)". The variety offer's own rule (Maintenance 27, the review of item 49): "the
 * alternative fits today as every offer reads it: the place, the lifter's limits, what they avoid
 * today and the joints protected today".
 *
 * The coach makes a fifth offer that names a lift: the pain-pattern card's four-week swap (item 45,
 * `painPatternSignal`). Its alternative is checked against the place only
 * (`buildConflictContext(profile, location)`), so it can be a lift the lifter swapped away today,
 * or one set aside today ("Uncomfortable", a skip), and the card offers it for four weeks, one tap
 * from putting it back in the plan.
 *
 * Steps (synthetic data only): knee pain logged with the back squat on two lower days a week apart,
 * and two lower days on the leg press since, without it. Today's lower day at the gym leads with the
 * back squat; the coach: "Knee pain with Back Squat, not with Leg Press", "Use Leg Press for 4
 * weeks".
 * - The lifter swaps the Bulgarian split squat for the leg press, then the leg press for the dumbbell
 *   Bulgarian split squat (both on the swap sheet): the leg press is on the day's list
 *   (`swappedAway`). The card still offers "Use Leg Press for 4 weeks".
 * - Or the lifter swaps the Bulgarian split squat for the leg press and calls it uncomfortable: the
 *   leg press is set aside today. The card still offers it.
 * - From before the round (item 45), in the same offer: with the leg press in today's plan (the
 *   Bulgarian split squat swapped for it), the card still offers "Use Leg Press for 4 weeks", and the
 *   tap is refused: "The same exercise appeared twice, so nothing was changed." The variety offer
 *   reads today's plan (`today`); this one does not.
 *
 * All three also fail on 0f8d10f (the card has read neither list, nor today's plan, since item 45).
 */

const NOW = '2026-09-10T12:00:00.000Z';
const profile = createDefaultProfile(NOW);
const [, gym] = createDefaultLocations({ gymAccess: true }, NOW) as [
  LocationProfile,
  LocationProfile,
];
const squatHurt = (days: number): WorkoutRecord => ({
  ...record(days, 'back-squat', [
    [5, 185, 2],
    [5, 185, 2],
    [5, 185, 2],
  ]),
  templateId: 'lower',
  painJoints: ['knee'],
  painReports: [{ exerciseId: 'back-squat', joint: 'knee' }],
});
const legPress = (days: number): WorkoutRecord => ({
  ...record(
    days,
    'leg-press',
    [
      [10, 300, 2],
      [10, 300, 2],
      [10, 300, 2],
    ],
    [8, 12],
  ),
  templateId: 'lower',
  painReports: [],
});
const history: WorkoutRecord[] = [squatHurt(20), legPress(16), squatHurt(13), legPress(9)];

function lowerDay() {
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location: gym,
    history,
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'lower' },
  });
  let constraints: SessionConstraints = emptyConstraints();
  const find = (id: string) => allEntries(workout.blocks).find((entry) => entry.exerciseId === id);
  return {
    get constraints() {
      return constraints;
    },
    find,
    /** What the swap sheet offers for a lift, as Today builds it. */
    sheet(id: string): string[] {
      const entry = find(id)!;
      const ranked = rankAlternatives({
        current: requireExercise(entry.exerciseId),
        context: contextFor({ profile, location: gym }, constraints),
        otherExercises: allEntries(workout.blocks)
          .filter((other) => other.id !== entry.id)
          .map((other) => requireExercise(other.exerciseId)),
        dropSetPlanned: entry.dropSet,
        plannedSets: { sets: entry.sets.length, restSeconds: entry.restSeconds },
        limit: 6,
      });
      const day = {
        constraints,
        completed: emptyCompleted(),
        history,
        timestamp: NOW,
        profile,
        location: gym,
      };
      return swapsOffered(ranked, day, workout, entry).candidates.map(
        (candidate) => candidate.exercise.id,
      );
    },
    run(trigger: RecalibrationTrigger) {
      const result = recalibrate({
        trigger,
        workout,
        completed: emptyCompleted(),
        lockedEntryIds: [],
        currentEntryId: null,
        duration: 'default',
        profile,
        location: gym,
        loading: { missingPlates: [] },
        history,
        constraints,
        reason: 'test',
        timestamp: NOW,
      });
      if (!result.ok) throw new Error(`${trigger.type}: ${result.error}`);
      workout = result.workout;
      constraints = result.constraints;
    },
    /** The four-week swaps the coach's cards offer, as "from -> to". */
    lastingSwaps(): string[] {
      const fatigue = interpretFatigue(history, NOW, null);
      const input: CoachInput = {
        workout,
        status: 'preview',
        duration: 'default',
        completed: emptyCompleted(),
        constraints,
        profile,
        history,
        now: NOW,
        fatigue,
        strategy: analyzeStrategy({ history, profile, now: NOW, fatigue }),
        lastExportAt: NOW,
        workoutCount: history.length,
        location: gym,
      };
      return gatherSignals(input).flatMap((signal) => {
        const action = signal.action;
        if (action?.kind !== 'lasting-swap') return [];
        const from = allEntries(workout.blocks).find((entry) => entry.id === action.entryId);
        return [`${from?.exerciseId} -> ${action.exerciseId}`];
      });
    },
  };
}

describe('the pain-pattern card’s four-week swap', () => {
  it('offers the alternative on a day that leaves it alone', () => {
    const day = lowerDay();
    expect(day.find('back-squat')).toBeDefined();
    expect(day.lastingSwaps()).toEqual(['back-squat -> leg-press']);
  });

  it('offers no lift the lifter swapped away today', () => {
    const day = lowerDay();
    expect(day.sheet('bulgarian-split-squat')).toContain('leg-press');
    day.run({
      type: 'replace',
      entryId: day.find('bulgarian-split-squat')!.id,
      exerciseId: 'leg-press',
    });
    expect(day.sheet('leg-press')).toContain('dumbbell-bulgarian-split-squat');
    day.run({
      type: 'replace',
      entryId: day.find('leg-press')!.id,
      exerciseId: 'dumbbell-bulgarian-split-squat',
    });
    expect(day.constraints.swappedAway).toContain('leg-press');
    // On 0fe4cb9 and 0f8d10f: ['back-squat -> leg-press'].
    expect(day.lastingSwaps()).not.toContain('back-squat -> leg-press');
  });

  it('offers no lift set aside today', () => {
    const day = lowerDay();
    day.run({
      type: 'replace',
      entryId: day.find('bulgarian-split-squat')!.id,
      exerciseId: 'leg-press',
    });
    day.run({ type: 'uncomfortable', entryId: day.find('leg-press')!.id });
    expect(day.constraints.avoidExerciseIds).toContain('leg-press');
    // On 0fe4cb9 and 0f8d10f: ['back-squat -> leg-press'].
    expect(day.lastingSwaps()).not.toContain('back-squat -> leg-press');
  });

  it('offers no lift already in today’s plan, whose tap is refused', () => {
    const day = lowerDay();
    day.run({
      type: 'replace',
      entryId: day.find('bulgarian-split-squat')!.id,
      exerciseId: 'leg-press',
    });
    expect(day.find('leg-press')).toBeDefined();
    expect(() =>
      day.run({ type: 'replace', entryId: day.find('back-squat')!.id, exerciseId: 'leg-press' }),
    ).toThrow('The same exercise appeared twice');
    // On 0fe4cb9 and 0f8d10f: ['back-squat -> leg-press'].
    expect(day.lastingSwaps()).not.toContain('back-squat -> leg-press');
  });
});
