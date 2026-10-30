import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from './recalibrate';
import type {
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
  SessionConstraints,
} from './types';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { builtCatchUp, generateWorkout } from '../workoutGenerator/generate';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * The eighteenth review of round M: a catch-up or second workout is marked emptied only when the
 * lifter's own hand takes out its last lift (`emptied`), and the mark lasts only while it has no lift.
 * A plan made where the day's offer had no lift is built whole at a place that has one, emptied or
 * not; a lift the lifter adds again ends the mark; a slot closed is the plan's, opened by a layout
 * made again. Synthetic data only.
 */

const profile = profileOf();
const NOW = at(9, 18);
const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
const [bare] = createDefaultLocations({ gymAccess: false, homeEquipment: [] }, at(1)) as [
  LocationProfile,
];
const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];

function day(
  spec: CatchUpSpec,
  history: Parameters<typeof generateWorkout>[0]['history'],
  start: LocationProfile,
) {
  let location = start;
  let workout = generateWorkout({
    profile,
    location,
    history,
    now: NOW,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  let constraints: SessionConstraints = { ...emptyConstraints(), catchUp: spec };
  const steps: string[] = [lifts(workout)];
  return {
    get workout() {
      return workout;
    },
    get constraints() {
      return constraints;
    },
    steps,
    find: (id: string) => allEntries(workout.blocks).find((entry) => entry.exerciseId === id)!,
    run(
      trigger: RecalibrationTrigger,
      to?: LocationProfile,
      extra: Partial<RecalibrationRequest> = {},
    ): RecalibrationSuccess {
      if (to) location = to;
      // As the store reads a change of place (`offerOverrides`): a plan made where the day's offer
      // had no lift is built whole at the new place, unless the full session is on.
      const unbuilt =
        trigger.type === 'location' &&
        !constraints.fullSession &&
        builtCatchUp(spec, workout).muscles.length === 0;
      const result = recalibrate({
        trigger,
        workout,
        completed: emptyCompleted(),
        lockedEntryIds: [],
        currentEntryId: null,
        duration: 'default',
        profile,
        location,
        ...(unbuilt ? { offerChanged: true } : {}),
        loading: { missingPlates: [] },
        history,
        constraints,
        reason: 'test',
        timestamp: NOW,
        ...extra,
      });
      if (!result.ok) throw new Error(result.error);
      workout = result.workout;
      constraints = result.constraints;
      steps.push(`${trigger.type}: ${result.summary.headline} => ${lifts(workout)}`);
      return result;
    },
  };
}

describe('a catch-up or second workout emptied by the lifter’s hand', () => {
  it('a second workout made where its muscles had no lift, emptied, is built at a place that has one', () => {
    // An upper-body workout this morning, the side delts missed this week: the bare home has no lift
    // for them, so the second workout is the lower day's bodyweight lifts. The lifter skips each one.
    const records = [
      session(at(3, 18), [['barbell-row', 3]]),
      session(at(9, 9), [
        ['barbell-bench-press', 3],
        ['barbell-row', 3],
        ['lat-pulldown', 3],
        ['barbell-curl', 3],
      ]),
    ];
    const spec: CatchUpSpec = {
      kind: 'second',
      muscles: [{ muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' }],
      sitOut: ['chest', 'triceps', 'upper-back', 'lats', 'biceps'],
    };
    const today = day(spec, records, bare);
    expect(today.workout.templateId).toBe('lower');
    for (const entry of allEntries(today.workout.blocks)) {
      today.run({ type: 'skip', entryId: entry.id });
    }
    expect(today.constraints.emptied).toEqual([{ offer: 'second side-delts', layout: 'lower' }]);
    // At the gym the second workout has the lateral raise: another plan, built whole.
    today.run({ type: 'location' }, gym);
    expect(lifts(today.workout), today.steps.join(' | ')).toBe('lateral-raise x3 @RIR 1/1/1');
  });

  const spec: CatchUpSpec = {
    kind: 'catch-up',
    muscles: [
      { muscle: 'forearms', sets: 3, minRir: 1, why: 'behind' },
      { muscle: 'chest', sets: 3, minRir: 1, why: 'behind' },
    ],
    sitOut: [],
  };
  const records = [session(at(3, 18), [['barbell-row', 3]])];

  it('a lift added again ends the mark: the way back from the full session builds the catch-up', () => {
    const today = day(spec, records, home);
    expect(lifts(today.workout)).toBe('push-up x3 @RIR 2/2/2; hammer-curl x2 @RIR 1/1');
    for (const entry of allEntries(today.workout.blocks)) {
      today.run({ type: 'skip', entryId: entry.id });
    }
    expect(today.constraints.emptied).toEqual([
      { offer: 'catch-up forearms chest', layout: 'catch-up' },
    ]);
    today.run({ type: 'add-exercise', exerciseId: 'wrist-curl', muscle: 'forearms', sets: 2 });
    expect(today.constraints.emptied).toBeUndefined();
    today.run({ type: 'session-kind', full: true, kind: 'catch-up' });
    today.run({ type: 'session-kind', full: false, kind: 'catch-up' });
    // Built whole, the lifts set aside left out.
    expect(lifts(today.workout), today.steps.join(' | ')).toBe(
      'diamond-push-up x3 @RIR 2/2/2; wrist-curl x2 @RIR 1/1',
    );
  });

  it('a slot closed opens again when a save changes the offer: the new plan is laid out whole', () => {
    const today = day(spec, records, home);
    today.run({
      type: 'replace',
      entryId: today.find('push-up').id,
      exerciseId: 'dumbbell-shoulder-press',
    });
    today.run({ type: 'uncomfortable', entryId: today.find('dumbbell-shoulder-press').id });
    today.run({ type: 'uncomfortable', entryId: today.find('arnold-press').id });
    today.run({ type: 'uncomfortable', entryId: today.find('lateral-raise').id });
    expect(today.constraints.closedSlots).toEqual([0]);
    expect(lifts(today.workout)).toBe('hammer-curl x2 @RIR 1/1');
    const next: CatchUpSpec = { ...spec, muscles: [...spec.muscles].reverse() };
    today.run({ type: 'profile' }, undefined, {
      offerChanged: true,
      constraints: { ...today.constraints, catchUp: next },
    });
    expect(today.constraints.closedSlots).toBeUndefined();
    expect(lifts(today.workout), today.steps.join(' | ')).toBe(
      'diamond-push-up x3 @RIR 2/2/2; hammer-curl x2 @RIR 1/1',
    );
  });
});
