import { describe, expect, it } from 'vitest';
import { emptyMaxes } from '../../engine/progression/maxes';
import type { WorkoutEntry } from '../../engine/workout/types';
import { offersMax } from './offersMax';

/** A lift with no history: its first target is the one a max would set. */
const lift: WorkoutEntry = {
  id: 'e2',
  exerciseId: 'incline-dumbbell-press',
  role: 'secondary-hypertrophy',
  sets: [
    {
      index: 0,
      kind: 'working',
      targetReps: [8, 12],
      targetRir: 2,
      targetWeight: 25,
      restSeconds: 90,
    },
  ],
  restSeconds: 90,
  warmupSets: 0,
  dropSet: false,
  chosenFor: [],
  locked: false,
  pinned: false,
  progression: { mode: 'start', evidence: [] } as never,
};
const NOW = '2026-10-09T12:00:00.000Z';

describe("the card's max offer (Maintenance 26, the tenth pass of item 42)", () => {
  it("is made on a lift whose target a max can still set, and not on one keeping a hard start's ease", () => {
    expect(offersMax(lift, [], emptyMaxes(), NOW)).toBe(true);
    expect(offersMax(lift, [{ entryId: lift.id }], emptyMaxes(), NOW)).toBe(false);
    const easedLift: WorkoutEntry = {
      ...lift,
      eased: { exerciseId: lift.exerciseId, sets: lift.sets, kept: true },
    };
    expect(offersMax(easedLift, [], emptyMaxes(), NOW)).toBe(false);
    // A mark alone, on a lift begun before the hard start, keeps nothing.
    const marked: WorkoutEntry = { ...lift, eased: { exerciseId: lift.exerciseId, kept: true } };
    expect(offersMax(marked, [], emptyMaxes(), NOW)).toBe(true);
  });
});
