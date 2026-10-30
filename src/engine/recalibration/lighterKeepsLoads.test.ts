import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { TOO_SOON_SOURCE, gatherSignals, type CoachInput } from '../coach/coachConductor';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { allEntries, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { RECORD_NOW, record } from '../../test/records';

/**
 * The first adversarial review of Maintenance 33: "Lighter keeps the loads", says the "too soon"
 * card; its tap lowers them.
 *
 * Steps: a hybrid lifter's bench press (top set 190 for 4-6 at 1 in reserve, back-offs 180 at 2)
 * on a push day, with the chest worked hard 20 h ago on the dumbbell bench press. The coach's card
 * "The chest may not have recovered" says "Lighter keeps the loads: a set fewer and a rep more in
 * reserve on its lifts today." The lifter taps "Lighter for the chest" before the start.
 *
 * The rule: the approved proposal, part 2: "When easing, keep the load and add a rep in reserve or
 * drop a set: strength gains were similar whether sets stopped closer to failure or further from it
 * (Robinson 2024)"; readiness-and-soreness.md: "keep the load and add 1 RIR, or drop the last set";
 * the report: "a set fewer and a rep more in reserve on that muscle's lifts still to come, loads
 * kept"; and the card's own words.
 *
 * What happens: the option lays the hard start's ease (`easedSet`), which moves a set's load down
 * to the plan's rule for the extra rep in reserve wherever the weights here make a lighter one: the
 * bench press's top set goes 190 to 185 and its back-offs 180 to 175 ("Barbell Bench Press: 1 set
 * fewer, RIR 2, top set 185."). The card's words are not what the tap does.
 *
 * Synthetic data only.
 */

const profile = {
  ...createDefaultProfile(RECORD_NOW),
  bodyweight: 185,
  programStyle: 'hybrid' as const,
};
const gym = createDefaultLocations({ gymAccess: true }, RECORD_NOW).find(
  (place) => place.id === 'gym',
)!;

const session = (exerciseId: string, daysAgo: number, weight: number, rir: number) => ({
  ...record(
    daysAgo,
    exerciseId,
    [
      [5, weight, rir],
      [5, weight, rir],
      [5, weight, rir],
      [5, weight, rir],
    ],
    [4, 6],
    rir,
  ),
  id: `${exerciseId}-${daysAgo}`,
});

const history: WorkoutRecord[] = [
  session('barbell-bench-press', 7, 185, 2),
  session('barbell-bench-press', 3, 185, 2),
  // The chest worked hard 20 h ago, four sets a rep short of failure: a 36 h window.
  session('dumbbell-bench-press', 20 / 24, 65, 1),
];

const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working');

describe('the lighter option of the "too soon" card', () => {
  it('keeps the loads, as the card says', () => {
    const workout = generateWorkout({
      profile,
      location: gym,
      history,
      now: RECORD_NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const input: CoachInput = {
      workout,
      status: 'preview',
      duration: 'default',
      completed: emptyCompleted(),
      constraints: emptyConstraints(),
      profile,
      history,
      now: RECORD_NOW,
      fatigue: interpretFatigue(history, RECORD_NOW),
      strategy: [],
      lastExportAt: RECORD_NOW,
      workoutCount: history.length,
    };
    const card = gatherSignals(input).find((signal) =>
      signal.source.startsWith(`${TOO_SOON_SOURCE}|chest|`),
    )!;
    expect(card.why).toContain(
      'Lighter keeps the loads: a set fewer and a rep more in reserve on its lifts today.',
    );
    expect(card.action).toMatchObject({ trigger: { type: 'lighter', muscle: 'chest' } });

    const tapped = recalibrate({
      trigger: { type: 'lighter', muscle: 'chest' },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile,
      location: gym,
      history,
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: RECORD_NOW,
    });
    if (!tapped.ok) throw new Error(tapped.error);
    const before = new Map(allEntries(workout.blocks).map((entry) => [entry.id, entry]));
    const loads = (entry: WorkoutEntry) => working(entry).map((set) => set.targetWeight);
    for (const entry of allEntries(tapped.workout.blocks)) {
      if (!requireExercise(entry.exerciseId).primaryMuscles.includes('chest')) continue;
      const plan = before.get(entry.id)!;
      // Each set left keeps its planned load (a set fewer comes off the end).
      expect(loads(entry), entry.exerciseId).toEqual(loads(plan).slice(0, loads(entry).length));
    }
  });
});
