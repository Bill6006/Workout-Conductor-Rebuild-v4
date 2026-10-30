import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { TOO_SOON_SOURCE, gatherSignals, type CoachInput } from './coachConductor';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import type { CompletedWork } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { RECORD_NOW, record } from '../../test/records';

/**
 * The first adversarial review of Maintenance 33: in a deload week, a first set lifted exactly as
 * the deload asks reads as a fall, and "too soon" warns that the muscle may not have recovered.
 *
 * Steps: four rested weeks of the bench press (three sets of 5 at 185, 2 in reserve, 4-6 asked),
 * and the chest worked hard on the dumbbell bench press 30 h ago (a 36 h window). The lifter is in
 * a planned deload week: today's bench press asks 165 lb for 4-6 reps at 3 in reserve (the deload's
 * lighter load and its rep more in reserve). They lift its first working set as asked: 4 reps at
 * 165, 3 in reserve, as the logger fills it.
 *
 * The rule: Maintenance 33's own fatigue rule (fatigue.ts): "A set's estimated max is read against
 * its target's, so a load planned lighter (later in a session, on a day at the back-offs' load, in
 * a deload week) and lifted as asked is no fall"; the proposal, part 2: "too soon" fires "when your
 * first set confirms it", and light work is never flagged. The hard start reads the same set
 * against what it asked and finds nothing.
 *
 * What happens: `tooSoonSignals` reads the first set's estimated max (165 x (1 + 7/30) = 203.5)
 * against the rested median (228.2) with no regard to what the set asked: 10.8% under, past the
 * 8% line, while the chest is inside its window, so the cards "The chest may not have recovered"
 * (and the triceps') say "Your first Barbell Bench Press set read 11% under your rested sessions."
 * and offer to make the deload's sets lighter still. The ordinary day's first set lifted as asked
 * (the top set, 190 for 4 at 1 in reserve) reads 2.8% under: the deload's lighter load alone makes
 * the "fall".
 *
 * Synthetic data only.
 */

const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
const gym = createDefaultLocations({ gymAccess: true }, RECORD_NOW).find(
  (place) => place.id === 'gym',
)!;
const DAY = 86_400_000;

const session = (exerciseId: string, daysAgo: number, weight: number, rir: number) => {
  const done = record(
    daysAgo,
    exerciseId,
    [
      [5, weight, rir],
      [5, weight, rir],
      [5, weight, rir],
    ],
    [4, 6],
    rir,
  );
  // Each set asked the load it was lifted at, as a saved session's do.
  return {
    ...done,
    id: `${exerciseId}-${daysAgo}`,
    entries: done.entries.map((entry) => ({
      ...entry,
      sets: entry.sets.map((set) => ({ ...set, targetWeight: weight })),
    })),
  };
};

const history: WorkoutRecord[] = [
  session('barbell-bench-press', 16, 185, 2),
  session('barbell-bench-press', 12, 185, 2),
  session('barbell-bench-press', 8, 185, 2),
  session('barbell-bench-press', 4, 185, 2),
  // The chest and the triceps worked hard 30 h ago: a 36 h window.
  session('dumbbell-bench-press', 30 / 24, 65, 1),
];

const deload = {
  startsAt: new Date(Date.parse(RECORD_NOW) - DAY).toISOString(),
  endsAt: new Date(Date.parse(RECORD_NOW) + 5 * DAY).toISOString(),
};

/**
 * The bench press's first working set logged as the plan asks it (the bottom of its range), or
 * as given.
 */
function firstAsAsked(
  workout: GeneratedWorkout,
  lifted?: { reps: number; rir: number },
): CompletedWork {
  const bench = allEntries(workout.blocks).find(
    (entry) => entry.exerciseId === 'barbell-bench-press',
  )!;
  const first = bench.sets.find((set) => set.kind === 'working')!;
  return {
    ...emptyCompleted(),
    startedAt: RECORD_NOW,
    currentEntryId: bench.id,
    sets: [
      {
        entryId: bench.id,
        exerciseId: bench.exerciseId,
        setIndex: first.index,
        kind: 'working',
        reps: lifted?.reps ?? first.targetReps[0],
        weight: first.targetWeight,
        rir: lifted?.rir ?? first.targetRir,
        completedAt: RECORD_NOW,
      },
    ],
  };
}

describe('"too soon" in a deload week', () => {
  it('never reads a first set lifted as the deload asks as a fall', () => {
    const workout = generateWorkout({
      profile,
      location: gym,
      history,
      now: RECORD_NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms', deload },
    });
    const bench = allEntries(workout.blocks).find(
      (entry) => entry.exerciseId === 'barbell-bench-press',
    )!;
    const first = bench.sets.find((set) => set.kind === 'working')!;
    // The deload's own ask: lighter, a rep more in reserve.
    expect([first.targetWeight, first.targetReps, first.targetRir]).toEqual([165, [4, 6], 3]);
    const input: CoachInput = {
      workout,
      status: 'active',
      duration: 'default',
      completed: firstAsAsked(workout),
      constraints: { ...emptyConstraints(), deload },
      profile,
      history,
      now: RECORD_NOW,
      fatigue: interpretFatigue(history, RECORD_NOW),
      strategy: [],
      lastExportAt: RECORD_NOW,
      workoutCount: history.length,
    };
    const cards = gatherSignals(input).filter((signal) =>
      signal.source.startsWith(`${TOO_SOON_SOURCE}|`),
    );
    expect(cards.flatMap((card) => card.why)).not.toContain(
      'Your first Barbell Bench Press set read 11% under your rested sessions.',
    );
    expect(cards).toEqual([]);
  });

  it('reads a first set well short of what it asked as a fall, on an ordinary day', () => {
    const workout = generateWorkout({
      profile,
      location: gym,
      history,
      now: RECORD_NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const bench = allEntries(workout.blocks).find(
      (entry) => entry.exerciseId === 'barbell-bench-press',
    )!;
    const first = bench.sets.find((set) => set.kind === 'working')!;
    expect([first.targetWeight, first.targetReps, first.targetRir]).toEqual([190, [4, 6], 1]);
    const input: CoachInput = {
      workout,
      status: 'active',
      duration: 'default',
      // Two reps to failure on 4-6 asked at 1 in reserve: 190 x (1 + 2 / 30) against
      // 190 x (1 + 5 / 30), 8.6% under, the rested sessions lifted as asked.
      completed: firstAsAsked(workout, { reps: 2, rir: 0 }),
      constraints: emptyConstraints(),
      profile,
      history,
      now: RECORD_NOW,
      fatigue: interpretFatigue(history, RECORD_NOW),
      strategy: [],
      lastExportAt: RECORD_NOW,
      workoutCount: history.length,
    };
    const chest = gatherSignals(input).find((signal) =>
      signal.source.startsWith(`${TOO_SOON_SOURCE}|chest|`),
    );
    expect(chest?.why).toContain(
      'Your first Barbell Bench Press set read 9% under your rested sessions.',
    );
    expect(chest?.why[0]).toMatch(/^Worked hard 30 h before your first Barbell Bench Press set; /);
  });
});
