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
 * Seventeenth review of round M. The fourteenth pass settled that "a lift with one set left in a
 * catch-up has nothing come in for it, and the swap sheet and "Uncomfortable" say so, not that
 * nothing fits". The sixteenth pass made the sheet of a finished lift say it is done "though nothing
 * ranked" (`swapsOffered` checks the lift's own refusal first), but left the one-set case where it
 * was: with no lift ranked at all, `swapsOffered` hands back the ranking's own reason untouched. A
 * catch-up is often a lift with no alternative where the lifter is, so the sheet of the standing calf
 * raise at a bare home, two of its three sets done, says "No safe alternative fits Home and your
 * limitations.", while "Uncomfortable" on it says "Standing Calf Raise stops at the sets done: one
 * set left is too few for another lift to take over." (found by the random runs too: a standing calf
 * raise at a home with dumbbells, one of its two sets done).
 *
 * Steps (synthetic data only): a catch-up for the calves at a home with no equipment, the standing
 * calf raise for three sets; two sets of it done; open its sheet.
 *
 * Also fails on 89dfb39.
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
const twoDone = (entry: WorkoutEntry): CompletedWork => ({
  ...emptyCompleted(),
  startedAt: NOW,
  elapsedSeconds: 600,
  currentEntryId: entry.id,
  sets: working(entry)
    .slice(0, 2)
    .map((set, index) => ({
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

describe('the swap sheet of a lift with one set left and no alternative ranked', () => {
  it('the standing calf raise at a bare home, two of its three sets done', () => {
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
    expect(describeWorkout(plan)).toEqual(['standing-calf-raise x3 @RIR 1/1/1']);
    const completed = twoDone(calf!);
    // As the Today and workout screens build the sheet.
    const sheet = swapsOffered(
      rankAlternatives({
        current: requireExercise(calf!.exerciseId),
        context: contextFor({ profile: profileOf(), location: bare }, constraints),
        otherExercises: [],
        plannedSets: { sets: calf!.sets.length, restSeconds: calf!.restSeconds },
        limit: 6,
      }),
      { constraints, completed, history: records, timestamp: NOW },
      plan,
      calf!,
    );
    // The engine's own words for the lift.
    const tried = recalibrate({
      trigger: { type: 'uncomfortable', entryId: calf!.id },
      workout: plan,
      completed,
      lockedEntryIds: [],
      currentEntryId: calf!.id,
      duration: 'default',
      profile: profileOf(),
      location: bare,
      loading: { missingPlates: [] },
      history: records,
      constraints,
      reason: 'test',
      timestamp: NOW,
    });
    expect(tried.ok ? tried.summary.headline : tried.error).toBe(
      'Standing Calf Raise stops at the sets done: one set left is too few for another lift to take over.',
    );
    expect(sheet.candidates).toEqual([]);
    // On 532aba6: "No safe alternative fits Home and your limitations."
    expect(sheet.emptyReason).toBe(
      'Standing Calf Raise has one set left, too few for another lift to take over.',
    );
  });
});
