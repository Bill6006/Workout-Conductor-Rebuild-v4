import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { rankAlternatives } from '../alternatives/rankAlternatives';
import type { CatchUpSpec } from '../planning/catchUp';
import {
  contextFor,
  emptyCompleted,
  emptyConstraints,
  recalibrate,
  swapsOffered,
} from './recalibrate';
import type { CompletedWork } from './types';
import { allEntries, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, profileOf, session, working } from '../../test/clockDays';

/**
 * Sixteenth review of round M. The swap sheet never offers a swap it would refuse, "saying why when
 * it offers none (a lift with every set done: it is done)". The fifteenth pass makes the refusal of
 * each lift the sheet ranks say "X is done: nothing is left to swap" (`catchUpRefusal`), and
 * `swapsOffered` passes that on, but only when the ranking had lifts to refuse: with none ranked at
 * all, it hands back the ranking's own reason untouched. A catch-up is often a lift with no
 * alternative where the lifter is: the calves' standing calf raise at a home with no equipment.
 * Its three sets done, its sheet (the workout screen opens one on a finished lift) says "No safe
 * alternative fits Home and your limitations.", as if a swap were wanted and nothing fitted;
 * the engine itself says "Standing Calf Raise is done: nothing is left to swap." Synthetic data only.
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const [bare] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
  LocationProfile,
];
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [{ muscle: 'calves', sets: 3, minRir: 1, why: 'behind' }],
  sitOut: [],
};
const constraints = { ...emptyConstraints(), catchUp: spec };
const allDone = (entry: WorkoutEntry): CompletedWork => ({
  ...emptyCompleted(),
  startedAt: NOW,
  elapsedSeconds: 600,
  sets: working(entry).map((set, index) => ({
    entryId: entry.id,
    exerciseId: entry.exerciseId,
    setIndex: set.index,
    kind: 'working' as const,
    reps: 15,
    weight: set.targetWeight,
    rir: 2,
    completedAt: at(9, 18, index * 3),
  })),
});

describe('the swap sheet on a finished lift with no alternative in a catch-up says it is done', () => {
  it('the standing calf raise at a bare home, all three sets done', () => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: bare,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const calf = allEntries(plan.blocks).find(
      (entry) => entry.exerciseId === 'standing-calf-raise',
    );
    expect(calf, describeWorkout(plan).join('; ')).toBeDefined();
    const completed = allDone(calf!);
    // As the Today and workout screens build the sheet.
    const sheet = swapsOffered(
      rankAlternatives({
        current: requireExercise(calf!.exerciseId),
        context: contextFor({ profile: profileOf(), location: bare }, constraints),
        otherExercises: allEntries(plan.blocks)
          .filter((other) => other.id !== calf!.id)
          .map((other) => requireExercise(other.exerciseId)),
        plannedSets: { sets: calf!.sets.length, restSeconds: calf!.restSeconds },
        limit: 6,
      }),
      { constraints, completed, history: records, timestamp: NOW },
      plan,
      calf!,
    );
    const tried = recalibrate({
      trigger: { type: 'replace', entryId: calf!.id, exerciseId: 'glute-bridge' },
      workout: plan,
      completed,
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: profileOf(),
      location: bare,
      loading: { missingPlates: [] },
      history: records,
      constraints,
      reason: 'test',
      timestamp: NOW,
    });
    expect(tried.ok ? '' : tried.error).toBe(
      'Standing Calf Raise is done: nothing is left to swap.',
    );
    expect(sheet.candidates).toEqual([]);
    // On 89dfb39: "No safe alternative fits Home and your limitations."
    expect(sheet.emptyReason).toBe('Standing Calf Raise is done: nothing is left to swap.');
  });
});
