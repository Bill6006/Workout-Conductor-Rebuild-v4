import { describe, expect, it } from 'vitest';
import { createSession } from '../../core/state/session';
import type { CatchUpSpec } from '../../engine/planning/catchUp';
import {
  emptyCompleted,
  emptyConstraints,
  recalibrate,
} from '../../engine/recalibration/recalibrate';
import type { RecalibrationSuccess } from '../../engine/recalibration/types';
import { CATCH_UP_TEMPLATE_IDS, allEntries } from '../../engine/workout/types';
import { generateWorkout } from '../../engine/workoutGenerator/generate';
import { dayNoteOf } from './dayNote';
import { at, describeWorkout, gym, profileOf, session } from '../../test/clockDays';

/**
 * Maintenance 31 (the fourteenth review of round M): a second workout its only lift skipped has
 * nothing more for today, and Today says so with the full session a tap away. Synthetic data only.
 */

// An overhead press this morning (the triceps sit out, the front delts take what is left), a row
// last Thursday; Wednesday the 9th, 6 pm.
const records = [
  session(at(3, 18), [['barbell-row', 3]]),
  session(at(9, 9), [['overhead-press', 3]]),
];
const NOW = at(9, 18);
const spec: CatchUpSpec = {
  kind: 'second',
  muscles: [{ muscle: 'front-delts', sets: 2, minRir: 3, why: 'remainder' }],
  sitOut: ['triceps'],
};

describe('a second workout its only lift skipped: Today says nothing more, the fourteenth review of round M', () => {
  it('the Arnold press skipped', () => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    expect(plan.templateId).toBe(CATCH_UP_TEMPLATE_IDS.second);
    const only = allEntries(plan.blocks);
    expect(only.length, describeWorkout(plan).join('; ')).toBe(1);
    const result = recalibrate({
      trigger: { type: 'skip', entryId: only[0]!.id },
      workout: plan,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: profileOf(),
      location: gym,
      loading: { missingPlates: [] },
      history: records,
      constraints: { ...emptyConstraints(), catchUp: spec },
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    const skipped: RecalibrationSuccess = result;
    expect(allEntries(skipped.workout.blocks)).toEqual([]);
    expect(skipped.workout.explanation.summary).toBe('Nothing more for today.');
    const today = createSession('key', skipped.workout, NOW);
    // On d361edf: { text: 'You trained today: this one goes easy, with only what is left of today’s
    // work.' } and no button.
    const note = dayNoteOf({ ...today, constraints: { ...today.constraints, catchUp: spec } });
    expect(note?.text, JSON.stringify(note)).toMatch(/nothing more for today/);
    expect(note?.action, JSON.stringify(note)).toEqual({ label: 'Full session', full: true });
  });
});
