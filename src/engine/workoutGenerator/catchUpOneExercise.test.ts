import { describe, expect, it } from 'vitest';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import { allEntries } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Maintenance 31, the thirteenth review of round M. Today's card shows the plan's summary line
 * (`workout.explanation.summary`, WorkoutPreviewCard). A catch-up is often one lift (the quads and
 * the glutes share the squat), and the summary then reads "Catch-up: 1 exercises in about 14 min,
 * Back Squat first." The count is never put in the singular, here or where a change rewrites the
 * line (`refresh`). Synthetic data only.
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: (['quads', 'glutes'] as const).map((muscle) => ({
    muscle,
    sets: 3,
    minRir: 1,
    why: 'behind' as const,
  })),
  sitOut: [],
};

describe('a one-lift catch-up’s summary, the thirteenth review of round M', () => {
  it('the quads and the glutes behind, at the gym: one lift, "1 exercise"', () => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: at(9, 18),
      duration: 'default',
      constraints: { catchUp: spec },
    });
    expect(allEntries(plan.blocks).length, describeWorkout(plan).join('; ')).toBe(1);
    // On a9f07f3: "Catch-up: 1 exercises in about 14 min, Back Squat first."
    expect(plan.explanation.summary).not.toMatch(/\b1 exercises\b/);
  });
});
