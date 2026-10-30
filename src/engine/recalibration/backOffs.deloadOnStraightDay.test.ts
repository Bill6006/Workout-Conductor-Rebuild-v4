import { describe, expect, it } from 'vitest';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { gatherSignals, type CoachInput } from '../coach/coachConductor';
import { emptyCompleted, emptyConstraints } from './recalibrate';
import type { RecalibrationTrigger } from './types';
import { interpretFatigue } from '../recovery/fatigue';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { RECORD_NOW, record, type SetSpec } from '../../test/records';
import { BENCH, bench, gym, plan, profileOf, run } from '../../test/backOffs';
import { savedAs } from '../../test/backOffsSim';

/**
 * The sixth review of round N. The coach's deload of a stalled main lift (its route's "Deload to
 * N lb this week") taken on a day the lift runs straight at its back-offs' load (a day it is a
 * secondary lift, the full-body day of the three-day split) keeps the day's mark (`atBackOffs`):
 * the `target-weight` trigger moves every set to the deload's load and leaves the mark, so the day
 * is saved as one at the back-offs' load. The lift's next top set reads past it, as past its
 * back-offs, and steps from the stalled top set before it: the deload taken leaves no trace on the
 * lift. The same deload taken on its main day is saved as a straight session of its own, and the
 * next top set rebuilds from it. The spec: straight sets where the load is eased; a day saved as
 * one at the back-offs' load is a straight day at that load. Synthetic data only.
 */

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.parse(RECORD_NOW) + days * DAY).toISOString();

/** An upper day of the bench press on top set plus back-offs, `daysAgo` before RECORD_NOW. */
function upperDay(daysAgo: number, top: SetSpec, backOffs: SetSpec[]): WorkoutRecord {
  const done = record(daysAgo, BENCH, [top, ...backOffs], [4, 6], 2, { templateId: 'upper' });
  const entry = done.entries[0]!;
  entry.backOffDrop = 0.05;
  entry.role = 'primary-strength';
  entry.sets.forEach((set, index) => {
    set.tier = index === 0 ? 'top' : 'back-off';
    set.targetRir = index === 0 ? 1 : 2;
  });
  return done;
}

// The stalled top set: 200 x 5 at 1 in reserve, then the back-offs as asked.
const history = [
  upperDay(
    3,
    [5, 200, 1],
    [
      [5, 190, 2],
      [5, 190, 2],
      [5, 190, 2],
    ],
  ),
];

function coachInput(workout: GeneratedWorkout): CoachInput {
  return {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile: profileOf(),
    history,
    now: RECORD_NOW,
    fatigue: interpretFatigue(history, RECORD_NOW),
    strategy: [],
    lastExportAt: RECORD_NOW,
    workoutCount: 1,
    location: gym,
    stalls: [
      {
        exerciseId: BENCH,
        kind: 'stalled-at-effort',
        exposures: 4,
        totalExposures: 4,
        baselineE1rm: 233,
        latestE1rm: 233,
        effortMet: 4,
        effortUnknown: 0,
        firstDate: at(-24),
        lastDate: at(-3),
        why: ['No better estimated max in 4 exposures.'],
      },
    ],
    routes: {
      id: 'coach-routes',
      routes: {
        [BENCH]: {
          exerciseId: BENCH,
          step: 2,
          startedAt: at(-10),
          baselineE1rm: 233,
          applied: [],
          exhausted: false,
        },
      },
    },
  };
}

/**
 * The deload card taken on a day's plan, the day lifted as asked, then the next upper day's first
 * working set; null where the coach offers no deload that day.
 */
function afterDeload(templateId: string) {
  const workout = plan(history, profileOf(), { templateId });
  const [route] = gatherSignals(coachInput(workout)).filter(
    (signal) => signal.source === 'stall: route',
  );
  const action = route?.action;
  if (action?.kind !== 'recalibrate') return null;
  const taken = run(action.trigger as RecalibrationTrigger, workout, { history }).workout;
  const saved = savedAs(taken, RECORD_NOW, `deload-${templateId}`);
  const next = generateWorkout({
    profile: profileOf(),
    location: gym,
    history: [...history, saved],
    now: at(2),
    duration: 'default',
    constraints: { templateId: 'upper' },
  });
  const top = allEntries(next.blocks)
    .find((entry) => entry.exerciseId === BENCH)!
    .sets.find((set) => set.kind === 'working')!;
  return { label: action.label, taken: bench(taken), top };
}

describe('the coach’s deload taken on a day the main lift runs at its back-offs’ load', () => {
  it('the full-body day is that day (the bench press secondary there)', () => {
    const workout = plan(history, profileOf(), { templateId: 'full-body' });
    expect(bench(workout).role).toBe('secondary-strength');
    expect(bench(workout).atBackOffs).toBe(true);
  });

  it('is read by the next top set, as the same deload taken on the main day is', () => {
    const onMain = afterDeload('upper')!;
    // Taken on the main day, the next upper day rebuilds from the deload's load.
    expect(onMain.label).toMatch(/^Deload to \d+ lb this week$/);
    expect(onMain.top.targetWeight!).toBeLessThan(200);
    const onFullBody = afterDeload('full-body');
    // Offered on the full-body day (on 6f2d5ea: "Deload to 180 lb this week"), taking it is a
    // deload the lift's next top set reads.
    if (onFullBody === null) return;
    const deloadLoad = onFullBody.taken.sets.find((set) => set.kind === 'working')!.targetWeight!;
    expect(deloadLoad).toBeLessThan(190);
    const lines = `main day: ${onMain.label} -> next ${onMain.top.targetWeight}; full-body day: ${onFullBody.label} -> next ${onFullBody.top.targetWeight} (${onFullBody.top.tier}, marked ${String(onFullBody.taken.atBackOffs)})`;
    // On 6f2d5ea: the full-body day's deload is saved as a day at the back-offs' load, and the next
    // top set steps from the stalled 200 x 5 to 205, as if no deload was taken.
    expect(onFullBody.top.targetWeight!, lines).toBeLessThan(200);
  });
});
