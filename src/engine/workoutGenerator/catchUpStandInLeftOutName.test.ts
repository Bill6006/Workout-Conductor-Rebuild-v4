import { describe, expect, it } from 'vitest';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { CompletedWork } from '../recalibration/types';
import { allEntries } from '../workout/types';
import { generateWorkout } from './generate';
import { at, describeWorkout, gym, profileOf, session, working } from '../../test/clockDays';

/**
 * Fifteenth review of round M. Names are settled once every lift is picked: a new lift that replaces
 * no lift in its slot takes its slot's own name or "one past every name taken", where taken counts
 * only the names given in this rebuild. A lift of the plan before that is left out in the same
 * rebuild frees its name, and the new lift takes it, so the change list reads it as that lift's
 * replacement. In the lower-body catch-up at the gym (back squat e1, leg curl e2), a set of the back
 * squat, then home: the squat stops, the goblet squat stands in for its two sets in its slot, and the
 * leg curl is left out (at home every hamstrings lift works the glutes, which the squat and the
 * goblet squat have given their three sets). The goblet squat is named e2, and the change list says
 * "Replaced Leg Curl with Goblet Squat." The leg curl was not replaced by it; on a day of the plan
 * the same move reads "Replaced Back Squat with Goblet Squat for the sets still to come." The rules:
 * the change list names only what changed. Synthetic data only.
 */

const [home] = createDefaultLocations(
  { gymAccess: false, homeEquipment: ['dumbbells'] },
  at(1),
) as [LocationProfile];
const records = [session(at(3, 18), [['barbell-row', 3]])];
const NOW = at(9, 18);
const lower: CatchUpSpec = {
  kind: 'catch-up',
  muscles: (['quads', 'glutes', 'hamstrings'] as const).map((muscle) => ({
    muscle,
    sets: 3,
    minRir: 1,
    why: 'behind' as const,
  })),
  sitOut: [],
};

describe('a stand-in made at a change of place reads as standing in, not as a lift left out', () => {
  it('the lower-body catch-up, a set of the back squat at the gym, then home', () => {
    const plan = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: lower },
    });
    expect(describeWorkout(plan)).toEqual(['back-squat x3 @RIR 2/2/2', 'leg-curl x3 @RIR 1/1/1']);
    const squat = allEntries(plan.blocks)[0]!;
    const first = working(squat)[0]!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: NOW,
      elapsedSeconds: 300,
      sets: [
        {
          entryId: squat.id,
          exerciseId: squat.exerciseId,
          setIndex: first.index,
          kind: 'working',
          reps: 8,
          weight: first.targetWeight,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    const result = recalibrate({
      trigger: { type: 'location' },
      workout: plan,
      completed,
      lockedEntryIds: [],
      currentEntryId: squat.id,
      duration: 'default',
      profile: profileOf(),
      location: home,
      loading: { missingPlates: [] },
      history: records,
      constraints: { ...emptyConstraints(), catchUp: lower },
      reason: 'test',
      timestamp: NOW,
    });
    if (!result.ok) throw new Error(result.error);
    const changes = result.changes.map((change) => change.detail);
    const detail = `${describeWorkout(result.workout).join('; ')} | ${changes.join(' | ')}`;
    // The goblet squat stands in for the squat's two sets, in its slot; the leg curl is left out.
    const goblet = allEntries(result.workout.blocks).find(
      (entry) => entry.exerciseId === 'goblet-squat',
    );
    expect(goblet?.slot, detail).toBe(squat.slot);
    expect(
      allEntries(result.workout.blocks).some((entry) => entry.exerciseId === 'leg-curl'),
      detail,
    ).toBe(false);
    // On 3290cd8: "Back Squat: 2 sets fewer. | Replaced Leg Curl with Goblet Squat."
    expect(changes, detail).not.toContain('Replaced Leg Curl with Goblet Squat.');
    expect(changes, detail).toContain('Left out Leg Curl.');
  });
});
