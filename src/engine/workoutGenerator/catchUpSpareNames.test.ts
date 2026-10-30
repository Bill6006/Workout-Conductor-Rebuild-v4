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
  RecalibrationResult,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from '../../engine/recalibration/types';
import {
  allEntries,
  isStopped,
  type GeneratedWorkout,
  type WorkoutEntry,
} from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Maintenance 31, names in a catch-up (the eleventh review of round M): a stand-in keeps its name
 * through a rebuild whatever is kept beside it, a lift pinned, begun or swapped in: a slot's lift
 * takes the spare name its lift had in the plan before. Synthetic data only.
 */

const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const named = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks)
    .map((entry) => `${entry.id}:${entry.exerciseId}${isStopped(entry) ? ' (stopped)' : ''}`)
    .join(', ');
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: (['chest', 'quads', 'glutes'] as const).map((muscle) => ({
    muscle,
    sets: 3,
    minRir: 1,
    why: 'behind' as const,
  })),
  sitOut: [],
};
const succeeded = (result: RecalibrationResult): RecalibrationSuccess => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
const frontForBack = [{ from: 'back-squat', to: 'front-squat', setAt: at(1), until: at(30) }];
/** A barbell and a rack, no bench and no leg press. */
const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['barbell', 'squat-rack'] },
  at(1),
) as [LocationProfile];
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
  swaps: frontForBack,
  ...options,
});
const setOf = (entry: WorkoutEntry, minute: number) => {
  const set = working(entry)[0]!;
  return {
    entryId: entry.id,
    exerciseId: entry.exerciseId,
    setIndex: set.index,
    kind: 'working' as const,
    reps: 8,
    weight: set.targetWeight,
    rir: 2,
    completedAt: at(9, 18, minute),
  };
};

describe('a stand-in keeps its spare name, the eleventh review of round M', () => {
  it('the push-up keeps its name when the front squat beside it is pinned', () => {
    // At the gym the bench press and the leg press, one set of each done. At home neither goes on:
    // the push-up carries the bench press's sets, the front squat the leg press's, and the glutes,
    // which the front squat misses, take a slot of their own.
    const atGym = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec, swaps: frontForBack },
    });
    const [bench, press] = allEntries(atGym.blocks);
    expect([bench?.exerciseId, press?.exerciseId], lifts(atGym)).toEqual([
      'barbell-bench-press',
      'leg-press',
    ]);
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 600,
      sets: [setOf(bench!, 0), setOf(press!, 5)],
    };
    const moved = succeeded(recalibrate(request({ type: 'location' }, atGym, { completed })));
    const standIn = (workout: GeneratedWorkout, exerciseId: string) =>
      allEntries(workout.blocks).find(
        (entry) => !isStopped(entry) && entry.exerciseId === exerciseId,
      );
    const pushUp = standIn(moved.workout, 'push-up');
    const front = standIn(moved.workout, 'front-squat');
    expect([pushUp, front].every(Boolean), named(moved.workout)).toBe(true);
    // The front squat pinned.
    const pinned = succeeded(
      recalibrate(
        request({ type: 'pin', entryId: front!.id, pinned: true }, moved.workout, {
          completed,
          constraints: moved.constraints,
        }),
      ),
    );
    const shorter = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 45 }, pinned.workout, {
          completed,
          constraints: pinned.constraints,
        }),
      ),
    );
    // Before: the push-up took the next name past the pinned front squat's: "Recalibrated to 45
    // min with 10 min done: 1 exercise removed, 1 exercise added."
    expect(standIn(shorter.workout, 'push-up')?.id, named(shorter.workout)).toBe(pushUp!.id);
    expect(
      shorter.changes.filter((change) => change.kind !== 'adjusted').map((change) => change.detail),
      `${shorter.summary.headline} ${named(pinned.workout)} -> ${named(shorter.workout)}`,
    ).toEqual([]);
  });

  it('a stand-in made beside a name taken again takes a name no lift has', () => {
    // More sets than usual, so no muscle has its sets before the last place. At home the push-up,
    // the front squat and the glutes' own lift, one set of that one done. With dumbbells, the
    // chest's and the quads' new lifts take the push-up's and the front squat's names again, and the
    // glutes' stand-in the next name free.
    const more: CatchUpSpec = {
      ...spec,
      muscles: spec.muscles.map((item) => ({ ...item, sets: item.muscle === 'glutes' ? 10 : 6 })),
    };
    const atGym = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: more, swaps: frontForBack },
    });
    const [bench, press] = allEntries(atGym.blocks);
    const done: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 300,
      sets: [setOf(bench!, 0), setOf(press!, 5)],
    };
    const withMore = { constraints: { ...emptyConstraints(), catchUp: more } };
    const moved = succeeded(
      recalibrate(request({ type: 'location' }, atGym, { ...withMore, completed: done })),
    );
    const live = (workout: GeneratedWorkout, slot: number | undefined) =>
      allEntries(workout.blocks).find((entry) => !isStopped(entry) && entry.slot === slot);
    const pushUp = live(moved.workout, bench!.slot);
    const glutes = allEntries(moved.workout.blocks).find(
      (entry) =>
        !isStopped(entry) &&
        entry.slot !== undefined &&
        entry.slot !== bench!.slot &&
        entry.slot !== press!.slot,
    );
    expect([pushUp, glutes].every(Boolean), named(moved.workout)).toBe(true);
    const completed: CompletedWork = { ...done, sets: [...done.sets, setOf(glutes!, 10)] };
    const [dumbbells] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['dumbbells', 'flat-bench'] },
      at(1),
    ) as [LocationProfile];
    const result = recalibrate(
      request({ type: 'location' }, moved.workout, {
        completed,
        location: dumbbells,
        constraints: moved.constraints,
      }),
    );
    // Before (a spare name taken without a look at the names taken again): "The rebuilt workout
    // repeated a row, so nothing was changed."
    expect(result.ok ? 'rebuilt' : result.error).toBe('rebuilt');
    const after = succeeded(result).workout;
    const ids = allEntries(after.blocks).map((entry) => entry.id);
    expect(new Set(ids).size, named(after)).toBe(ids.length);
  });

  it('the lifts beside a stand-in keep their names when it is skipped', () => {
    // At home the push-up, the front squat and the glutes' own lift; the push-up skipped, the
    // workout made shorter.
    const atGym = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec, swaps: frontForBack },
    });
    const [bench, press] = allEntries(atGym.blocks);
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 600,
      sets: [setOf(bench!, 0), setOf(press!, 5)],
    };
    const moved = succeeded(recalibrate(request({ type: 'location' }, atGym, { completed })));
    const pushUp = allEntries(moved.workout.blocks).find(
      (entry) => !isStopped(entry) && entry.exerciseId === 'push-up',
    );
    expect(pushUp, named(moved.workout)).toBeDefined();
    const skipped = succeeded(
      recalibrate(
        request({ type: 'skip', entryId: pushUp!.id }, moved.workout, {
          completed,
          constraints: moved.constraints,
        }),
      ),
    );
    const shorter = succeeded(
      recalibrate(
        request({ type: 'duration', choice: 45 }, skipped.workout, {
          completed,
          constraints: skipped.constraints,
        }),
      ),
    );
    const placed = (workout: GeneratedWorkout) =>
      allEntries(workout.blocks)
        .filter((entry) => !isStopped(entry))
        .map((entry) => `${entry.id}:${entry.exerciseId}`);
    // Before (spare names from the slots laid out alone): the glutes' lift took the push-up's name.
    expect(placed(shorter.workout)).toEqual(placed(skipped.workout));
  });
});
