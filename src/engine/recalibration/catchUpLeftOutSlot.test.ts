import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  CompletedWork,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, profileOf, session, working } from '../../test/clockDays';

/**
 * Seventeenth review of round M. The sixteenth pass settled that on a day off the plan "a lift
 * stopped with nothing to come in owes nothing more": no later rebuild fills its place with what the
 * stop did not bring (its own test: the push-up swapped away, two comfort swaps, the lateral raise
 * stopped, and an end time added "the push-up back, the very lift they swapped away"). The fix marks
 * the stopped lift (`stopAtLogged`, `why: 'skip'`), so it covers only a lift begun. The same lift
 * not begun is left out instead ("Left out Lateral Raise: no comfortable alternative fits Home."),
 * its slot keeps no entry at all, and the next rebuild fills the slot afresh from its own movement:
 * the push-up the lifter swapped away comes back, "1 exercise added", by an end time, "Make it
 * easier" or "harder", or a length picked.
 *
 * Steps (synthetic data only): at home with dumbbells, a catch-up for the forearms and the chest is
 * the push-up and the hammer curl. The lifter swaps the push-up for the dumbbell shoulder press;
 * "Uncomfortable" brings the Arnold press, "Uncomfortable" again the lateral raise; "Uncomfortable"
 * on the lateral raise, not begun, leaves it out. Then the rebuild named in each case.
 *
 * Also fails on 89dfb39 (the case was never covered).
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const profile = profileOf();
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const spec: CatchUpSpec = {
  kind: 'catch-up',
  muscles: [
    { muscle: 'forearms', sets: 3, minRir: 1, why: 'behind' },
    { muscle: 'chest', sets: 3, minRir: 1, why: 'behind' },
  ],
  sitOut: [],
};

function day(started: boolean) {
  let workout: GeneratedWorkout = generateWorkout({
    profile,
    location: home,
    history: records,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  let constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec };
  let completed: CompletedWork = started
    ? { ...emptyCompleted(), startedAt: NOW, elapsedSeconds: 60 }
    : emptyCompleted();
  let clock = 1;
  const steps: string[] = [lifts(workout)];
  return {
    get workout() {
      return workout;
    },
    steps,
    find: (id: string) => allEntries(workout.blocks).find((entry) => entry.exerciseId === id),
    log(entry: WorkoutEntry) {
      const set = working(entry)[0]!;
      clock += 3;
      completed = {
        ...completed,
        elapsedSeconds: completed.elapsedSeconds + 180,
        currentEntryId: entry.id,
        sets: [
          ...completed.sets,
          {
            entryId: entry.id,
            exerciseId: entry.exerciseId,
            setIndex: set.index,
            kind: 'working',
            reps: 10,
            weight: set.targetWeight,
            rir: 2,
            completedAt: at(9, 18, clock),
          },
        ],
      };
      steps.push(`log ${entry.exerciseId}`);
    },
    run(trigger: RecalibrationTrigger): RecalibrationSuccess {
      const result = recalibrate({
        trigger,
        workout,
        completed,
        lockedEntryIds: [],
        currentEntryId: completed.currentEntryId,
        duration: trigger.type === 'duration' ? trigger.choice : 'default',
        profile,
        location: home,
        loading: { missingPlates: [] },
        history: records,
        constraints,
        reason: 'test',
        timestamp: at(9, 18, clock + 1),
      });
      if (!result.ok) throw new Error(result.error);
      workout = result.workout;
      constraints = result.constraints;
      steps.push(`${trigger.type}: ${result.summary.headline} => ${lifts(workout)}`);
      return result;
    },
  };
}

/** The push-up swapped away, two comfort swaps, then the lateral raise left out. */
function leftOut(started: boolean) {
  const today = day(started);
  expect(lifts(today.workout)).toBe('push-up x3 @RIR 2/2/2; hammer-curl x2 @RIR 1/1');
  if (started) today.log(today.find('hammer-curl')!);
  today.run({
    type: 'replace',
    entryId: today.find('push-up')!.id,
    exerciseId: 'dumbbell-shoulder-press',
  });
  today.run({ type: 'uncomfortable', entryId: today.find('dumbbell-shoulder-press')!.id });
  today.run({ type: 'uncomfortable', entryId: today.find('arnold-press')!.id });
  const out = today.run({ type: 'uncomfortable', entryId: today.find('lateral-raise')!.id });
  expect(out.summary.headline).toBe(
    'Left out Lateral Raise: no comfortable alternative fits Home.',
  );
  expect(lifts(today.workout)).toBe('hammer-curl x2 @RIR 1/1');
  return today;
}

describe('a lift left out with nothing to come in: no rebuild fills its place', () => {
  const rebuilds: [string, RecalibrationTrigger][] = [
    ['an end time', { type: 'end-by', time: at(9, 19, 30) }],
    ['"Make it easier"', { type: 'intensity', direction: 'easier' }],
    ['a length picked', { type: 'duration', choice: 45 }],
  ];
  for (const [name, trigger] of rebuilds) {
    it(`on a plan not begun, then ${name}`, () => {
      const today = leftOut(false);
      today.run(trigger);
      // On 532aba6: "1 exercise added", push-up x3, the lift the lifter swapped away.
      expect(today.find('push-up'), today.steps.join(' | ')).toBeUndefined();
      expect(lifts(today.workout), today.steps.join(' | ')).not.toContain('push-up');
      // Nor any other lift: the change found no comfortable one (the diamond push-up came in).
      expect(
        allEntries(today.workout.blocks).map((entry) => entry.exerciseId),
        today.steps.join(' | '),
      ).toEqual(['hammer-curl']);
    });
  }

  it('under way (a set of the hammer curl done), then an end time', () => {
    const today = leftOut(true);
    today.run({ type: 'end-by', time: at(9, 19, 30) });
    // On 532aba6: "Ends by 7:30 PM: 1 exercise added." push-up x3.
    expect(today.find('push-up'), today.steps.join(' | ')).toBeUndefined();
    expect(
      allEntries(today.workout.blocks).map((entry) => entry.exerciseId),
      today.steps.join(' | '),
    ).toEqual(['hammer-curl']);
  });
});

describe('a lift the lifter swapped away stays away on the way back from the full session', () => {
  it('the catch-up laid out again keeps the push-up away', () => {
    // A closed slot is the plan's: the catch-up laid out again may fill it (a known limit), but
    // never with the lift the lifter swapped away.
    const today = leftOut(false);
    today.run({ type: 'session-kind', full: true, kind: 'catch-up' });
    today.run({ type: 'session-kind', full: false, kind: 'catch-up' });
    expect(today.find('push-up'), today.steps.join(' | ')).toBeUndefined();
  });
});

/**
 * The same mechanism through a skip (found by the random runs): the lift that replaced the plan's
 * pick is skipped, its slot keeps no entry, and the next rebuild brings back the very lift the
 * lifter swapped away. With no other lift in the plan the emptied catch-up stays so (the fourteenth
 * and sixteenth passes), so the push-up comes back or not depending only on whether the hammer curl
 * is still there. Steps: the push-up swapped for the dumbbell shoulder press, that skipped, then an
 * end time. Also fails on 89dfb39.
 */
describe('a lift the lifter swapped away does not come back when its replacement is skipped', () => {
  it('the push-up swapped for the dumbbell shoulder press, that skipped, then an end time', () => {
    const today = day(false);
    today.run({
      type: 'replace',
      entryId: today.find('push-up')!.id,
      exerciseId: 'dumbbell-shoulder-press',
    });
    today.run({ type: 'skip', entryId: today.find('dumbbell-shoulder-press')!.id });
    expect(lifts(today.workout)).toBe('hammer-curl x2 @RIR 1/1');
    today.run({ type: 'end-by', time: at(9, 19, 30) });
    // On 532aba6: "Ends by 7:30 PM: 1 exercise added." push-up x3.
    expect(today.find('push-up'), today.steps.join(' | ')).toBeUndefined();
  });
});

describe('a lift left out for pain, with nothing safe to come in, closes its slot too', () => {
  it('the lateral raise left out for the shoulder: an end time puts no Arnold press in its place', () => {
    const delts: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [
        { muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' },
        { muscle: 'front-delts', sets: 3, minRir: 1, why: 'behind' },
      ],
      sitOut: [],
    };
    const plan = generateWorkout({
      profile,
      location: home,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: delts },
    });
    expect(lifts(plan)).toBe('lateral-raise x3 @RIR 1/1/1; dumbbell-shoulder-press x3 @RIR 1/1/1');
    const base = {
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default' as const,
      profile,
      location: home,
      loading: { missingPlates: [] },
      history: records,
      reason: 'test',
      timestamp: NOW,
    };
    const raise = allEntries(plan.blocks).find((entry) => entry.exerciseId === 'lateral-raise')!;
    const hurt = recalibrate({
      ...base,
      trigger: { type: 'pain', entryId: raise.id, joint: 'shoulder' },
      workout: plan,
      constraints: { ...emptyConstraints(), catchUp: delts },
    });
    if (!hurt.ok) throw new Error(hurt.error);
    expect(lifts(hurt.workout)).toBe('dumbbell-shoulder-press x3 @RIR 1/1/1');
    const ended = recalibrate({
      ...base,
      trigger: { type: 'end-by', time: at(9, 19, 30) },
      workout: hurt.workout,
      constraints: hurt.constraints,
    });
    if (!ended.ok) throw new Error(ended.error);
    // Before: "arnold-press x3", a lift for the side delts the change had found no safe one of.
    expect(lifts(ended.workout)).toBe('dumbbell-shoulder-press x3 @RIR 1/1/1');
  });
});
