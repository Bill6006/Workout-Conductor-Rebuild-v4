import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type { RecalibrationSuccess, RecalibrationTrigger, SessionConstraints } from './types';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, profileOf, session } from '../../test/clockDays';

/**
 * Eighteenth review of round M, on the seventeenth pass's `closeSlot`. The report: "On a day off the
 * plan, a lift left out with nothing to come in closes its slot (`closed`), which no rebuild fills".
 * The sixteenth pass settled which days are off the plan: "one rule says when the day is off the
 * plan, a second workout with nothing behind included" (`offPlanSpec`). But the closed mark lives on
 * the catch-up's slots (`catchUpSlots`), which a second workout with nothing behind does not have:
 * the generator plans it from the split's own template, so `closeSlot` finds no slot to close
 * (`if (!slots?.[gone.slot]) return`) and the next rebuild fills the place again, the seventeenth
 * pass's own finding on the one day off the plan its fix does not reach.
 *
 * Steps (synthetic data only): a back squat this morning, nothing behind this week. At home with
 * dumbbells the second workout is the push day without the quads and the glutes: the push-up, the
 * dumbbell shoulder press, the overhead triceps extension, the lateral raise and the dumbbell curl.
 * The lifter swaps the push-up for the Arnold press, then taps "Uncomfortable" on it: "Left out
 * Arnold Press: no comfortable alternative fits Home." Then an end time, "Make it easier" or a length
 * picked: "1 exercise added", the diamond push-up in the place the change found nothing for.
 *
 * Also fails on 532aba6 (no slot closed on any day then).
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const NOW = at(9, 18);
const profile = profileOf();
const records = [session(at(3, 18), [['barbell-row', 3]]), session(at(9, 9), [['back-squat', 3]])];
const spec: CatchUpSpec = { kind: 'second', muscles: [], sitOut: ['quads', 'glutes'] };
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const ids = (workout: GeneratedWorkout) =>
  allEntries(workout.blocks).map((entry) => entry.exerciseId);

function leftOut() {
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location: home,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  let constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec };
  const steps: string[] = [lifts(workout)];
  const find = (id: string) => allEntries(workout.blocks).find((entry) => entry.exerciseId === id)!;
  const run = (trigger: RecalibrationTrigger): RecalibrationSuccess => {
    const result = recalibrate({
      trigger,
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: trigger.type === 'duration' ? trigger.choice : 'default',
      profile,
      location: home,
      loading: { missingPlates: [] },
      history: records,
      constraints,
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    workout = result.workout;
    constraints = result.constraints;
    steps.push(`${trigger.type}: ${result.summary.headline} => ${lifts(workout)}`);
    return result;
  };
  expect(ids(workout)).toEqual([
    'push-up',
    'dumbbell-shoulder-press',
    'overhead-triceps-extension',
    'lateral-raise',
    'dumbbell-curl',
  ]);
  run({ type: 'replace', entryId: find('push-up').id, exerciseId: 'arnold-press' });
  const out = run({ type: 'uncomfortable', entryId: find('arnold-press').id });
  expect(out.summary.headline).toBe('Left out Arnold Press: no comfortable alternative fits Home.');
  const left = ids(workout);
  expect(left).toEqual([
    'dumbbell-shoulder-press',
    'overhead-triceps-extension',
    'lateral-raise',
    'dumbbell-curl',
  ]);
  return {
    left,
    steps,
    run,
    get workout() {
      return workout;
    },
  };
}

describe('a second workout with nothing behind: a lift left out with nothing to come in', () => {
  const rebuilds: [string, RecalibrationTrigger][] = [
    ['an end time', { type: 'end-by', time: at(9, 19, 30) }],
    ['"Make it easier"', { type: 'intensity', direction: 'easier' }],
    ['a length picked', { type: 'duration', choice: 45 }],
  ];
  for (const [name, trigger] of rebuilds) {
    it(`no rebuild fills its place: ${name}`, () => {
      const day = leftOut();
      day.run(trigger);
      // On 4cb40d7: "1 exercise added", diamond-push-up x4 in the push-up's place.
      expect(ids(day.workout), day.steps.join(' | ')).not.toContain('diamond-push-up');
      expect(ids(day.workout), day.steps.join(' | ')).toEqual(day.left);
    });
  }
});
