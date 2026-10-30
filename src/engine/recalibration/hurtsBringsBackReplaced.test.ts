import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import { allEntries } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, profileOf, session } from '../../test/clockDays';

/**
 * Eighteenth review of round M (found by the random runs; from before the round, any day). "Hurts,
 * protect it" "adds a session pain joint, replaces stressful exercises with gentler ones (or removes
 * what cannot be replaced)" (Phase 4); a lift with moderate stress on the joint is replaced where a
 * lift gentle on it fits (`substituteUnfit`: `gentleOn`), and the change list names only what changed
 * (the reviews of round M: "the change list told of a swap that did not happen"). The pass works
 * through the plan in order: a lift with moderate stress on the sore joint, met first, is replaced by
 * the one gentle lift there is, and then the lift the lifter tapped "Hurts" on, met later, takes the
 * best alternative left, which is the very lift the pass just took out for the joint, no longer in
 * the plan and on no list. The plan ends with the same lifts as if the tapped lift had taken the
 * gentle one, but the moderate lift has moved into the tapped lift's place under its name, and the
 * change list says it was both replaced and brought in.
 *
 * Steps (synthetic data only): a push day the schedule ticks, at home with dumbbells: the push-up,
 * the dumbbell shoulder press, the dumbbell curl, the overhead triceps extension and the lateral
 * raise. "Hurts" (shoulder) on the overhead triceps extension: "Protecting your shoulder: 2 exercises
 * replaced." "Replaced Dumbbell Shoulder Press with Diamond Push-Up. | Replaced Overhead Triceps
 * Extension with Dumbbell Shoulder Press."
 *
 * Also fails on 532aba6.
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const NOW = at(8, 18);
const profile = profileOf();
const records = [session(at(3, 18), [['barbell-row', 3]])];

describe('"Hurts" does not bring back a lift the same change replaced for the joint', () => {
  it('a push day at home: "Hurts" (shoulder) on the overhead triceps extension', () => {
    const workout = generateWorkout({
      profile,
      location: home,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { templateId: 'push-arms' },
    });
    const extension = allEntries(workout.blocks).find(
      (entry) => entry.exerciseId === 'overhead-triceps-extension',
    )!;
    expect(requireExercise('dumbbell-shoulder-press').jointStress.shoulder).toBe('moderate');
    const result = recalibrate({
      trigger: { type: 'pain', entryId: extension.id, joint: 'shoulder' },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile,
      location: home,
      loading: { missingPlates: [] },
      history: records,
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    const details = result.changes.map((change) => change.detail);
    const steps = `${describeWorkout(workout).join('; ')} | ${result.summary.headline} [${details.join(' | ')}] => ${describeWorkout(result.workout).join('; ')}`;
    // On 4cb40d7: "Replaced Dumbbell Shoulder Press with Diamond Push-Up." and "Replaced Overhead
    // Triceps Extension with Dumbbell Shoulder Press."
    const outFor = details.flatMap((line) => /^Replaced (.+?) with /.exec(line)?.slice(1, 2) ?? []);
    const inFor = details.flatMap((line) => / with (.+?)\.$/.exec(line)?.slice(1, 2) ?? []);
    expect(
      outFor.filter((name) => inFor.includes(name)),
      steps,
    ).toEqual([]);
  });
});
