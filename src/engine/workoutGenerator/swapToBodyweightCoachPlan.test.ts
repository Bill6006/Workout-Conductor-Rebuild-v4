import { afterEach, describe, expect, it } from 'vitest';
import { registerCustomExercises } from '../../catalog/exercises/catalog';
import {
  CustomExerciseSchema,
  customToCatalogExercise,
} from '../../core/validation/customExercise';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { gatherSignals, type CoachInput } from '../coach/coachConductor';
import type { LastingSwap } from '../planning/lastingSwaps';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { allEntries } from '../workout/types';
import { generateWorkout } from './generate';
import { RECORD_NOW, record } from '../../test/records';

/**
 * Maintenance 30, the seventh re-check of round L: the plan and the coach's extra work agree on a kept
 * swap to a bodyweight move. A swap back to the move from one of its loaded versions keeps the move
 * against every loaded version, in the plan as in the coach: the calf raise swapped back to from the
 * calf machine stays on a day the plan's own pick is the leg-press calf raise. A swap to the move from
 * anything else applies where the plan's own pick is the exercise swapped out, and the rule loads the
 * move elsewhere, in the coach too: with the split squat outgrown, the coach names the dumbbell split
 * squat the plan uses. The coach named the bodyweight move in both, while the plan said it was loaded
 * or too light. Synthetic data only.
 */
const NOW = RECORD_NOW;
const [home, gym] = createDefaultLocations({ gymAccess: true }, NOW);
const profile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const kept = (from: string, to: string): LastingSwap => ({
  from,
  to,
  setAt: NOW,
  until: '2026-12-01T00:00:00.000Z',
});

/** One workout of these lifts, `daysAgo`, four sets each. */
function workout(daysAgo: number, lifts: [string, number | null][]): WorkoutRecord {
  const parts = lifts.map(([id, weight]) =>
    record(
      daysAgo,
      id,
      Array.from({ length: 4 }, () => [12, weight, 2]),
      [8, 20],
      2,
    ),
  );
  return {
    ...parts[0]!,
    id: `w-${daysAgo}`,
    templateId: 'lower',
    entries: parts.flatMap((part) => part.entries),
  };
}

/** The other muscles covered this week, so the coach's card is for the one left behind. */
const covered = (calves: boolean) =>
  workout(2, [
    ['rear-delt-fly', 20],
    ['barbell-shrug', 185],
    ['cable-crunch', 60],
    ['pallof-press', 30],
    ['wrist-curl', 30],
    ['romanian-deadlift', 135],
    ['hip-thrust', 135],
    ...(calves ? ([['leg-press-calf-raise', 140]] as [string, number][]) : []),
    ...(calves ? [] : ([['back-squat', 185]] as [string, number][])),
  ]);
const pressing = [
  record(1, 'dumbbell-bench-press', [[10, 50, 2]], [8, 12], 2, { locationId: 'home' }),
  record(5, 'dumbbell-bench-press', [[10, 50, 2]], [8, 12], 2, { locationId: 'home' }),
];
/** The split squat at bodyweight two reps past the top of its range: outgrown. */
const outgrown = record(
  3,
  'bulgarian-split-squat',
  [
    [14, null, 2],
    [13, null, 2],
  ],
  [8, 12],
  2,
  {
    locationId: 'home',
  },
);

function plan(place: LocationProfile, history: WorkoutRecord[], swaps: LastingSwap[]) {
  const lower = generateWorkout({
    profile,
    location: place,
    history,
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'lower', swaps },
  });
  return {
    ids: allEntries(lower.blocks).map((entry) => entry.exerciseId),
    reasons: lower.explanation.reasons,
  };
}

/** The coach's coverage card on an upper day here, ten minutes of room. */
function coverageLabel(place: LocationProfile, history: WorkoutRecord[], swaps: LastingSwap[]) {
  const upper = generateWorkout({
    profile,
    location: place,
    history,
    now: NOW,
    duration: 'default',
    constraints: { templateId: 'upper', swaps },
  });
  const fatigue = interpretFatigue(history, NOW);
  const input: CoachInput = {
    workout: {
      ...upper,
      duration: { ...upper.duration, targetMinutes: upper.duration.estimatedMinutes + 10 },
    },
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history,
    now: NOW,
    fatigue,
    strategy: analyzeStrategy({ history, profile, now: NOW, fatigue }),
    lastExportAt: NOW,
    workoutCount: history.length,
    location: place,
    swaps,
  };
  const action = gatherSignals(input).find((signal) => signal.source === 'weekly coverage')?.action;
  return action?.kind === 'recalibrate' ? action.label : null;
}

afterEach(() => registerCustomExercises([]));

/** A seated calf raise of the lifter's own, on the leg press's stack: one more calf raise at the gym. */
const seatedCalfRaise = () =>
  customToCatalogExercise(
    CustomExerciseSchema.parse({
      id: 'custom-seated-calf-raise',
      custom: true,
      name: 'Seated Calf Raise',
      primaryMuscles: ['calves'],
      movementPattern: 'calf-raise',
      equipment: [['leg-press']],
      load: 'stack',
      strengthSuitability: 0,
      hypertrophySuitability: 3,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );

describe('a kept swap to a bodyweight move the plan does not apply', () => {
  const split = [...pressing, outgrown, covered(true)];
  const calves = [covered(false), workout(4, [['back-squat', 185]])];

  it('with no swap, the coach names the loaded split squat the plan uses (baseline)', () => {
    expect(plan(home!, split, []).ids).toContain('dumbbell-bulgarian-split-squat');
    expect(coverageLabel(home!, split, [])).toBe('Add 2 sets of Dumbbell Bulgarian Split Squat');
  });

  it('a swap back that the plan applies keeps the bodyweight move in both (baseline)', () => {
    const swaps = [kept('leg-press-calf-raise', 'standing-calf-raise')];
    expect(plan(gym!, calves, swaps).reasons).toContain(
      'Standing Calf Raise in place of Leg Press Calf Raise, the swap you chose to keep.',
    );
    expect(coverageLabel(gym!, calves, swaps)).toBe('Add 2 sets of Standing Calf Raise');
  });

  it('never names the split squat the plan has just loaded, for a swap from the dumbbell reverse lunge', () => {
    // Kept when the reverse lunge was outgrown; the split squat outgrown since, at bodyweight.
    const swaps = [kept('dumbbell-reverse-lunge', 'bulgarian-split-squat')];
    const lower = plan(home!, split, swaps);
    expect(lower.ids).toContain('dumbbell-bulgarian-split-squat');
    expect(lower.reasons).toContain(
      'Dumbbell Bulgarian Split Squat in place of the Bulgarian Split Squat: at bodyweight you went past the top of its reps, so it is loaded now.',
    );
    expect(coverageLabel(home!, split, swaps)).not.toBe('Add 2 sets of Bulgarian Split Squat');
  });

  it('keeps the calf raise swapped back to from the calf machine, in the plan as in the coach', () => {
    // Kept on a day the leg press was busy and the plan had the calf machine: a swap back keeps the
    // bodyweight raise against the leg-press calf raise too.
    const swaps = [kept('standing-calf-raise-machine', 'standing-calf-raise')];
    const lower = plan(gym!, calves, swaps);
    expect(lower.ids).toContain('standing-calf-raise');
    expect(lower.ids).not.toContain('leg-press-calf-raise');
    expect(lower.reasons).toContain(
      'Standing Calf Raise in place of Leg Press Calf Raise, the swap you chose to keep.',
    );
    expect(coverageLabel(gym!, calves, swaps)).toBe('Add 2 sets of Standing Calf Raise');
  });

  it('puts the calf raise in for the leg-press calf raise, never the next calf raise there is', () => {
    // A seated calf raise of the lifter's own ranks below the plan's loaded calf raises, and above
    // the bodyweight raise done yesterday: the swap back still puts the bodyweight raise in.
    registerCustomExercises([seatedCalfRaise()]);
    const yesterday = record(
      1,
      'standing-calf-raise',
      [
        [16, null, 2],
        [16, null, 2],
      ],
      [12, 20],
      2,
    );
    const swaps = [kept('standing-calf-raise-machine', 'standing-calf-raise')];
    const lower = plan(gym!, [...calves, yesterday], swaps);
    expect(lower.ids).toContain('standing-calf-raise');
    expect(lower.ids).not.toContain('custom-seated-calf-raise');
  });

  it('keeps the split squat swapped back to from its loaded version, in the plan as in the coach', () => {
    const swaps = [kept('dumbbell-bulgarian-split-squat', 'bulgarian-split-squat')];
    const lower = plan(home!, split, swaps);
    expect(lower.ids).toContain('bulgarian-split-squat');
    expect(lower.ids).not.toContain('dumbbell-bulgarian-split-squat');
    // Never moved down below another quad lift for its loaded version, as the plan keeps it.
    expect(coverageLabel(home!, split, swaps)).toBe('Add 2 sets of Bulgarian Split Squat');
  });
});
