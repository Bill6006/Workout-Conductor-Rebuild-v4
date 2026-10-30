import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationTrigger,
} from '../../engine/recalibration/types';
import { allEntries, isStopped, type GeneratedWorkout } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, profileOf, session, working } from '../../test/clockDays';

/**
 * Maintenance 31 (the twelfth review of round M): a catch-up not begun, rebuilt whole (a length picked, here),
 * is laid out again from what the place has; a lift it plans again for the same muscle keeps its
 * name, so the list of changes names only what changed. Before: with the goblet squat marked
 * "Uncomfortable", the quads' and the glutes' squat slot was laid out again as a lunge for the quads
 * and a hinge for the glutes (left empty, the Bulgarian split squat giving the glutes their sets),
 * the biceps' slot moved from the second to the third, and the dumbbell curl, the same lift for the
 * same muscle, took its name: "Added Dumbbell Curl. / Left out Dumbbell Curl." Synthetic data only.
 */

// A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm, a day the default
// profile does not tick.
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const named = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks)
    .map((entry) => `${entry.id}:${entry.exerciseId}${isStopped(entry) ? ' (stopped)' : ''}`)
    .join(', ');
/** Dumbbells, an adjustable bench and a pull-up bar: no rack, the goblet squat the only squat. */
const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells', 'adjustable-bench', 'pull-up-bar'] },
  at(1),
) as [LocationProfile];
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: (['quads', 'glutes', 'biceps'] as const).map((muscle) => ({
    muscle,
    sets: 3,
    minRir: 1,
    why: 'behind' as const,
  })),
  sitOut: [],
};
const request = (
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  options: Partial<RecalibrationRequest> = {},
): RecalibrationRequest => ({
  trigger,
  workout,
  completed: emptyCompleted(),
  lockedEntryIds: [],
  currentEntryId: null,
  duration: 'default',
  profile: profileOf(),
  location: home,
  loading: { missingPlates: [] },
  history: records,
  constraints: { ...emptyConstraints(), catchUp: spec },
  reason: 'test',
  timestamp: NOW,
  ...options,
});

describe('a catch-up laid out again keeps the names of the lifts it plans again, the twelfth review of round M', () => {
  it('the goblet squat "Uncomfortable", then "45 min": the dumbbell curl keeps its name', () => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: home,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const squat = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'goblet-squat');
    const curl = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'dumbbell-curl');
    expect([squat, curl].every(Boolean), lifts(plan)).toBe(true);
    const comfort = recalibrate(request({ type: 'uncomfortable', entryId: squat!.id }, plan));
    if (!comfort.ok) throw new Error(comfort.error);
    // What came in for comfort stays through the length (the fourteenth review of round M): the
    // plan is rebuilt around it.
    const shorter = recalibrate(
      request({ type: 'duration', choice: 45 }, comfort.workout, {
        constraints: comfort.constraints,
      }),
    );
    if (!shorter.ok) throw new Error(shorter.error);
    expect(shorter.scope).toBe('partial');
    const details = `${shorter.summary.headline} ${shorter.changes.map((change) => change.detail).join(' | ')} (${named(comfort.workout)} -> ${named(shorter.workout)})`;
    const after = allEntries(shorter.workout.blocks).find(
      (entry) => entry.exerciseId === 'dumbbell-curl',
    );
    expect(after, details).toBeDefined();
    // Before: "Recalibrated to 45 min: 1 exercise removed, 1 exercise added, 1 exercise adjusted."
    // ("Added Dumbbell Curl. | Left out Dumbbell Curl."), the curl e2 -> e3.
    expect(after!.id, details).toBe(curl!.id);
    expect(
      shorter.changes
        .filter((change) => change.kind === 'added' || change.kind === 'removed')
        .map((change) => change.detail),
      details,
    ).toEqual([]);
    // And through the rebuilds after it, a set of the first lift done (the plan kept, its slots
    // with it): "30 min" names nothing left out or added either.
    const first = allEntries(shorter.workout.blocks)[0]!;
    const set = working(first)[0]!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 300,
      sets: [
        {
          entryId: first.id,
          exerciseId: first.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: 8,
          weight: set.targetWeight,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    const later = recalibrate(
      request({ type: 'duration', choice: 30 }, shorter.workout, {
        completed,
        currentEntryId: first.id,
        constraints: shorter.constraints,
      }),
    );
    if (!later.ok) throw new Error(later.error);
    const laterDetails = `${later.summary.headline} ${later.changes.map((change) => change.detail).join(' | ')} (${named(shorter.workout)} -> ${named(later.workout)})`;
    expect(
      allEntries(later.workout.blocks).find((entry) => entry.exerciseId === 'dumbbell-curl')?.id,
      laterDetails,
    ).toBe(curl!.id);
    expect(
      later.changes
        .filter((change) => change.kind === 'added' || change.kind === 'removed')
        .map((change) => change.detail),
      laterDetails,
    ).toEqual([]);
  });
});

describe('a catch-up laid out whole again keeps the names of the lifts it plans again, the fourteenth review of round M', () => {
  it('the goblet squat skipped, then "45 min": laid out again, the dumbbell curl keeps its name', () => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: home,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const squat = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'goblet-squat')!;
    const curl = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'dumbbell-curl')!;
    const skipped = recalibrate(request({ type: 'skip', entryId: squat.id }, plan));
    if (!skipped.ok) throw new Error(skipped.error);
    // Not begun, nothing pinned and nothing come in: the length lays the plan out whole.
    const shorter = recalibrate(
      request({ type: 'duration', choice: 45 }, skipped.workout, {
        constraints: skipped.constraints,
      }),
    );
    if (!shorter.ok) throw new Error(shorter.error);
    expect(shorter.scope).toBe('full');
    const after = allEntries(shorter.workout.blocks).find(
      (entry) => entry.exerciseId === 'dumbbell-curl',
    );
    expect(after?.id, named(shorter.workout)).toBe(curl.id);
  });
});
