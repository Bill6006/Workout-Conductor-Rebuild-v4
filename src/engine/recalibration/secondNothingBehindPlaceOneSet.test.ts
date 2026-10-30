import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { CompletedWork, SessionConstraints } from './types';
import { allEntries, isStopped, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Seventeenth review of round M. The thirteenth pass settled that "a lift begun with one set owed has
 * nothing come in for it, here or at another place" (no lift takes fewer than two working sets), and
 * the sixteenth made a second workout with nothing behind a day off the plan for that rule as for
 * every other ("a lift with one set owed took a one-set lift in" was one of its findings). It did so
 * in the engine (`bestAlternative`, `oneSetOwed`, `catchUpRefusal`), but a change of place stands in
 * for a lift through the generator, whose guard is `catchUp !== null && owed < CATCH_UP.MIN_SETS`,
 * and `catchUp` is null for a second workout with nothing behind. So the lift closed at the new place
 * with one set owed takes a one-set stand-in.
 *
 * Steps (synthetic data only): a back squat this morning, nothing behind this week; the second
 * workout at the gym is the push day, the quads sitting out. Three of the bench press's four sets
 * done, the lifter moves home (dumbbells): "Rebuilt for Home", the bench press stops at three and the
 * push-up comes in for one set. The same day with the chest behind stops the bench press there with
 * nothing coming in, as the rule asks.
 *
 * Also fails on 89dfb39 (the engine did not treat this day as off the plan at all then).
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const NOW = at(9, 18);
const profile = profileOf();
const records = [session(at(3, 18), [['barbell-row', 3]]), session(at(9, 9), [['back-squat', 3]])];
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');

/** The day's plan at the gym, `done` sets of the bench press, then a move home. */
function benchThenHome(spec: CatchUpSpec, done: number) {
  const workout = generateWorkout({
    profile,
    location: gym,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  const bench = allEntries(workout.blocks).find(
    (entry) => entry.exerciseId === 'barbell-bench-press',
  )!;
  const constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec };
  const completed: CompletedWork = {
    ...emptyCompleted(),
    startedAt: NOW,
    elapsedSeconds: 600,
    currentEntryId: bench.id,
    sets: working(bench)
      .slice(0, done)
      .map((set, index) => ({
        entryId: bench.id,
        exerciseId: bench.exerciseId,
        setIndex: set.index,
        kind: 'working' as const,
        reps: 8,
        weight: set.targetWeight,
        rir: 2,
        completedAt: at(9, 18, 3 * (index + 1)),
      })),
  };
  const result = recalibrate({
    trigger: { type: 'location' },
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: bench.id,
    duration: 'default',
    profile,
    location: home,
    loading: { missingPlates: [] },
    history: records,
    constraints,
    reason: 'test',
    timestamp: at(9, 18, 20),
  });
  if (!result.ok) throw new Error(result.error);
  const steps = `${lifts(workout)} | ${done} of the bench press | ${result.summary.headline} => ${lifts(result.workout)}`;
  // What came in for the bench press at home: a live lift in its slot.
  const standIns = allEntries(result.workout.blocks).filter(
    (entry) => entry.slot === bench.slot && entry.id !== bench.id && !isStopped(entry),
  );
  return { plan: workout, after: result.workout, standIns, steps };
}

describe('a lift begun with one set owed has nothing come in for it at another place', () => {
  it('a second workout with nothing behind: three of the bench press’s four sets, then home', () => {
    const day = benchThenHome({ kind: 'second', muscles: [], sitOut: ['quads'] }, 3);
    expect(describeWorkout(day.plan)[0]).toBe('barbell-bench-press x4 @RIR 2/2/2/2');
    // On 532aba6: "push-up x1 @RIR 2" comes in for the bench press's one set owed.
    expect(
      day.standIns.map((entry) => entry.exerciseId),
      day.steps,
    ).toEqual([]);
    for (const entry of allEntries(day.after.blocks).filter((each) => !isStopped(each))) {
      expect(
        entry.sets.filter((set) => set.kind === 'working').length,
        day.steps,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('a second workout with nothing behind: two of the split squat’s three sets, then a sore knee in the check-in', () => {
    // At a home with no equipment, after a pull workout this morning (the lats, the upper back and
    // the biceps sit out): the lower day. The knee ticked in the check-in rules out the Bulgarian
    // split squat under way, and the generator closes it with one set owed.
    const [bare] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
      LocationProfile,
    ];
    const pulled = [
      session(at(3, 18), [['barbell-row', 3]]),
      session(at(9, 9), [
        ['lat-pulldown', 3],
        ['barbell-curl', 3],
      ]),
    ];
    const spec: CatchUpSpec = {
      kind: 'second',
      muscles: [],
      sitOut: ['lats', 'upper-back', 'biceps'],
    };
    const workout = generateWorkout({
      profile,
      location: bare,
      history: pulled,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    expect(describeWorkout(workout)[0]).toBe('bulgarian-split-squat x3 @RIR 1/1/1');
    const split = allEntries(workout.blocks)[0]!;
    const result = recalibrate({
      trigger: {
        type: 'readiness',
        readiness: {
          energy: 4,
          soreness: 2,
          sleep: 4,
          motivation: 4,
          jointDiscomfort: ['knee'],
          timePressure: false,
        },
      },
      workout,
      completed: {
        ...emptyCompleted(),
        startedAt: NOW,
        elapsedSeconds: 600,
        currentEntryId: split.id,
        sets: working(split)
          .slice(0, 2)
          .map((set, index) => ({
            entryId: split.id,
            exerciseId: split.exerciseId,
            setIndex: set.index,
            kind: 'working' as const,
            reps: 8,
            weight: set.targetWeight,
            rir: 2,
            completedAt: at(9, 18, 3 * (index + 1)),
          })),
      },
      lockedEntryIds: [],
      currentEntryId: split.id,
      duration: 'default',
      profile,
      location: bare,
      loading: { missingPlates: [] },
      history: pulled,
      constraints: { ...emptyConstraints(), catchUp: spec },
      reason: 'test',
      timestamp: at(9, 18, 20),
    });
    if (!result.ok) throw new Error(result.error);
    const steps = `${lifts(workout)} | ${result.summary.headline} => ${lifts(result.workout)}`;
    // On 532aba6: "reverse-lunge x1" comes in for the split squat's one set owed.
    const standIns = allEntries(result.workout.blocks).filter(
      (entry) => entry.slot === split.slot && entry.id !== split.id && !isStopped(entry),
    );
    expect(
      standIns.map((entry) => entry.exerciseId),
      steps,
    ).toEqual([]);
  });

  it('the same day with the chest behind: the bench press stops at its sets done', () => {
    const day = benchThenHome(
      {
        kind: 'second',
        muscles: [{ muscle: 'chest', sets: 3, minRir: 1, why: 'behind' }],
        sitOut: ['quads'],
      },
      2,
    );
    expect(day.standIns, day.steps).toEqual([]);
  });
});
