import { describe, expect, it } from 'vitest';
import { conductCoach, gatherSignals, type CoachInput } from './coachConductor';
import { REST_TODAY } from '../readiness/checkIn';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type { CompletedWork, Readiness } from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { BENCH, bench, gym, plan, profileOf, trained } from '../../test/backOffs';
import { RECORD_NOW } from '../../test/records';

/**
 * The fourth adversarial review of Maintenance 33: a fever told under way no longer offers
 * "Finish here".
 *
 * Steps: a hybrid lifter starts the push day and logs the bench press's top set. Feeling worse,
 * they check in "Fever or aches". The check-in says `REST_TODAY` and holds every set still to come
 * at the head cold's floor. The coach card under the workout is read.
 *
 * The rule: the report, Readiness: "fever or aches all over, a rest day: Today hides Start, and a
 * workout under way offers "Finish here", keeping at least the head cold's floor on what is left";
 * `safetySignals`: "A fever or aches all over reported under way (...): no day to train, so the
 * coach offers to finish here."
 *
 * What happens: the third review's rest-day filter (`changesToday`, in `gatherSignals`) holds back
 * every offer whose action is `finish` on a rest day, and the coach's own illness card ("Fever or
 * aches: finish here", source `illness`) is such an offer, made only on a rest day under way. So the
 * card is never shown: the workout under way has no "Finish here" at all. Before the third review
 * (9580f26) the filter held back only offers that add work, and the card was there.
 *
 * The fix (the fourth pass): a rest day drops what keeps today's workout going in another shape
 * (a change, a rest, a swap), never the way out of it: "Finish here" and "End and save it" stay.
 *
 * Synthetic data only.
 */

const profile = profileOf('hybrid');
const history = trained();

const fever: Readiness = {
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
  illness: 'body',
};

describe('a fever told under way', () => {
  it('offers "Finish here"', () => {
    const workout = plan(history, profile);
    const entry = bench(workout);
    const top = entry.sets.find((set) => set.kind === 'working')!;
    const completed: CompletedWork = {
      ...emptyCompleted(),
      startedAt: RECORD_NOW,
      currentEntryId: entry.id,
      sets: [
        {
          entryId: entry.id,
          exerciseId: BENCH,
          setIndex: top.index,
          kind: 'working',
          reps: 5,
          weight: top.targetWeight,
          rir: top.targetRir,
          completedAt: RECORD_NOW,
        },
      ],
    };
    const told = recalibrate({
      trigger: { type: 'readiness', readiness: fever },
      workout,
      completed,
      lockedEntryIds: [],
      currentEntryId: entry.id,
      duration: 'default',
      profile,
      location: gym,
      history,
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: RECORD_NOW,
    });
    if (!told.ok) throw new Error(told.error);
    expect(told.summary.details).toContain(REST_TODAY);

    const input: CoachInput = {
      workout: told.workout,
      status: 'active',
      madeAt: RECORD_NOW,
      duration: 'default',
      completed,
      constraints: told.constraints,
      profile,
      history,
      now: RECORD_NOW,
      fatigue: interpretFatigue(history, RECORD_NOW),
      strategy: [],
      lastExportAt: RECORD_NOW,
      workoutCount: history.length,
      location: gym,
    };
    const illness = gatherSignals(input).filter((signal) => signal.source === 'illness');
    expect(illness.map((signal) => signal.action?.label)).toEqual(['Finish here']);
    expect(conductCoach(input)?.signal.headline).toBe('Fever or aches: finish here');
  });
});
