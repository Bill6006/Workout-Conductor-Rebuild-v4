import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  CompletedWork,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { RECORD_NOW, record } from '../../test/records';

/**
 * The first adversarial review of Maintenance 33: with the lighter option in force, a lift begun
 * and then undone keeps a mark that shuts it out of the next ease: "Lighter" for its own muscle, or
 * a hard start.
 *
 * Steps: the push day. The lifter takes "Lighter for the triceps" (the bench press, the shoulder
 * press and the pushdown eased). They log a cable fly set (its block is begun), a change runs (the
 * place's weights read again, which moves nothing else), and they undo the fly set: nothing of the
 * fly is logged. Then the chest's card: "Lighter for the chest". Or, instead, the first two lifts
 * read as a hard start.
 *
 * The rule: the lighter option eases "that muscle's lifts still to come" (a set fewer, a rep more
 * in reserve; decision 2); the hard start's ninth pass (item 42, approved): "With no hard start in
 * force, a mark that keeps a lift's sets has nothing to keep them from: it goes, so a hard start
 * told later eases that lift where nothing of it is logged (... a lift begun before one hard start,
 * its sets undone, was never eased by the next)" (`withoutMarks`).
 *
 * What happens: since Maintenance 33 the layer runs `easeTheRest` whenever `constraints.lighter` is
 * set, so the begun block's mark (`eased: { kept: true }` with no sets) is laid and `withoutMarks`
 * never runs to take it off after the undo. "Lighter for the chest" then says "Lighter today for the
 * chest: nothing left to lighten." with the cable fly (chest, nothing logged) at its full 3 sets at
 * 1 in reserve; and a hard start eases every lift still to come but the cable fly.
 *
 * Synthetic data only.
 */

const profile = { ...createDefaultProfile(RECORD_NOW), bodyweight: 185 };
const gym = createDefaultLocations({ gymAccess: true }, RECORD_NOW).find(
  (place) => place.id === 'gym',
)!;
const history = [7, 3].map((daysAgo) =>
  record(
    daysAgo,
    'barbell-bench-press',
    [
      [5, 185, 2],
      [5, 185, 2],
      [5, 185, 2],
    ],
    [4, 6],
    2,
  ),
);

function run(
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  constraints: SessionConstraints,
  completed: CompletedWork,
): RecalibrationSuccess {
  const result = recalibrate({
    trigger,
    workout,
    completed,
    lockedEntryIds: [],
    currentEntryId: completed.currentEntryId,
    duration: 'default',
    profile,
    location: gym,
    history,
    constraints,
    reason: 'test',
    timestamp: RECORD_NOW,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

const working = (entry: WorkoutEntry) =>
  entry.sets.filter((set) => set.kind === 'working').map((set) => set.targetRir);
const flyOf = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === 'cable-fly')!;

/** "Lighter for the triceps" (or not), a cable fly set logged, a change, the fly set undone. */
function flyUndone(lighter = true) {
  const plan = generateWorkout({
    profile,
    location: gym,
    history,
    now: RECORD_NOW,
    duration: 'default',
    constraints: { templateId: 'push-arms' },
  });
  const triceps = lighter
    ? run({ type: 'lighter', muscle: 'triceps' }, plan, emptyConstraints(), emptyCompleted())
    : { workout: plan, constraints: emptyConstraints() };
  const fly = flyOf(triceps.workout);
  const first = fly.sets.find((set) => set.kind === 'working')!;
  const begun: CompletedWork = {
    ...emptyCompleted(),
    startedAt: RECORD_NOW,
    currentEntryId: fly.id,
    sets: [
      {
        entryId: fly.id,
        exerciseId: fly.exerciseId,
        setIndex: first.index,
        kind: 'working',
        reps: 12,
        weight: first.targetWeight,
        rir: 1,
        completedAt: RECORD_NOW,
      },
    ],
  };
  const changed = run({ type: 'loading' }, triceps.workout, triceps.constraints, begun);
  return { plan, changed, begun, undone: { ...begun, sets: [] } };
}

describe('a lift begun and undone while the lighter option is in force', () => {
  it('takes "Lighter" for its own muscle', () => {
    const { plan, changed, undone } = flyUndone();
    expect(working(flyOf(plan))).toEqual([1, 1, 1]);
    const chest = run(
      { type: 'lighter', muscle: 'chest' },
      changed.workout,
      changed.constraints,
      undone,
    );
    expect(chest.summary.headline).not.toBe(
      'Lighter today for the chest: nothing left to lighten.',
    );
    expect(working(flyOf(chest.workout))).toEqual([2, 2]);
  });

  it('takes a hard start told after the undo, as it does without the lighter option', () => {
    const hardStart = ({ changed, undone }: ReturnType<typeof flyUndone>) =>
      run(
        { type: 'bad-start', low: true, lifts: ['barbell-bench-press', 'incline-dumbbell-press'] },
        changed.workout,
        changed.constraints,
        undone,
      );
    // The control: the same steps without the lighter option, the fly is eased.
    expect(working(flyOf(hardStart(flyUndone(false)).workout))).toEqual([2, 2]);
    // Every other lift still to come is eased, the cable fly with them.
    expect(working(flyOf(hardStart(flyUndone()).workout))).toEqual([2, 2]);
  });

  it('keeps no mark of a hard start taken back', () => {
    // A hard start while the fly is begun marks its block; the fly set undone and the hard start
    // taken back, the mark has nothing to keep: "Lighter for the chest" eases the fly.
    const { changed, begun, undone } = flyUndone();
    const lifts = ['barbell-bench-press', 'incline-dumbbell-press'];
    const hard = run(
      { type: 'bad-start', low: true, lifts },
      changed.workout,
      changed.constraints,
      begun,
    );
    expect(flyOf(hard.workout).eased?.kept).toBe(true);
    const back = run(
      { type: 'bad-start', low: false, lifts },
      hard.workout,
      hard.constraints,
      undone,
    );
    const chest = run({ type: 'lighter', muscle: 'chest' }, back.workout, back.constraints, undone);
    expect(working(flyOf(chest.workout))).toEqual([2, 2]);
  });
});
