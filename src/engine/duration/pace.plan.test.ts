import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import { createDefaultProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { emptyDeclines } from '../coach/coachConductor';
import { learnedSections } from '../learned/learned';
import { emptyResets, withReset } from '../learned/resets';
import {
  emptyCompleted,
  emptyConstraints,
  planUnderTheEase,
  recalibrate,
} from '../recalibration/recalibrate';
import { spareMinutes } from '../coach/coachConductor';
import { planWeek } from '../planning/weeklyPlan';
import type { GeneratedWorkout } from '../workout/types';
import { generateWorkout, paceReason } from '../workoutGenerator/generate';
import { estimateWorkout, remainingMinutes } from './duration';
import { PACE } from './trainingTime';

/**
 * Maintenance 28, the owner's item 4, through the plan: a lifter whose workouts take a fifth longer
 * than the plan's own estimate gets plans fitted to that, says so, and keeps it through a change;
 * the learned page says where the pace stands, with its reset.
 */

const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const profile = createDefaultProfile(RECORD_NOW);

/** Three finished workouts of a curl, each `minutes` against the plan's fifty (an hour). */
function paced(withEstimate = true, minutes = 60): WorkoutRecord[] {
  return [9, 6, 3].map((days) => ({
    ...record(days, 'cable-curl', [[12, 40, 2]], [10, 15], 2),
    trainingSeconds: minutes * 60,
    ...(withEstimate ? { estimatedSeconds: 50 * 60 } : {}),
  }));
}

/** Each lift's rest in a plan, by catalog id and the kind of row it is in. */
function restsOf(workout: GeneratedWorkout): Map<string, number> {
  return new Map(
    workout.blocks.flatMap((block) =>
      block.entries.map((entry) => [
        `${block.kind}:${entry.exerciseId}`,
        block.kind === 'straight' ? entry.restSeconds : block.restBetweenRoundsSeconds,
      ]),
    ),
  );
}

function plan(history: WorkoutRecord[]) {
  return generateWorkout({
    profile,
    location: gym,
    history,
    now: RECORD_NOW,
    duration: 'default',
  });
}

describe("plans fitted to the lifter's own pace (Maintenance 28, item 4)", () => {
  it('fits less of the plan into the length, and says why', () => {
    const fitted = plan(paced());
    const control = plan(paced(false));
    expect(fitted.duration.pace).toBe(1.2);
    expect(control.duration.pace).toBeUndefined();
    expect(fitted.explanation.reasons).toContain(
      "Fitted at your own pace: your workouts take about 20% longer than the plan's own estimate.",
    );
    expect(control.explanation.reasons.some((line) => line.startsWith('Fitted at your own'))).toBe(
      false,
    );
    // The plan's own estimate of the fitted plan is about the length over the pace.
    const own = (workout: typeof fitted) =>
      estimateWorkout(workout.blocks, workout.warmup.generalMinutes, requireExercise).totalMinutes;
    expect(own(fitted)).toBeLessThan(own(control));
    expect(own(fitted) * 1.2).toBeLessThanOrEqual(fitted.duration.targetMinutes + 1.5);
    expect(fitted.duration.estimatedMinutes).toBe(Math.round(own(fitted) * 1.2));
  });

  it('trims sets for the pace, never a rest the length asks for (the review of item 4)', () => {
    const control = restsOf(plan(paced(false)));
    for (const minutes of [60, 75]) {
      const fitted = plan(paced(true, minutes));
      expect(fitted.duration.pace).toBe(minutes / 50);
      // Every lift the fitted plan keeps where it was rests as it does at the plan's own pace.
      // (A move the fit brings back on its own takes the rest the length gives that, Maintenance
      // 24, at any pace.)
      let compared = 0;
      for (const [key, rest] of restsOf(fitted)) {
        if (!control.has(key)) continue;
        expect(rest).toBe(control.get(key));
        compared += 1;
      }
      expect(compared).toBeGreaterThanOrEqual(4);
    }
  });

  it('says the pace as Settings does, and how far plans go when it is further', () => {
    // An hour and a half against fifty minutes: 80% longer, plans no further than half again.
    const slow = plan(paced(true, 90));
    expect(slow.duration.pace).toBe(PACE.FACTOR_HIGH);
    expect(slow.explanation.reasons).toContain(
      "Fitted at your own pace: your workouts take about 80% longer than the plan's own estimate, and plans move no further than 50% longer.",
    );
    expect(paceReason({ ratio: 0.6, factor: PACE.FACTOR_LOW })).toBe(
      "Fitted at your own pace: your workouts take about 40% less time than the plan's own estimate, and plans move no further than 20% shorter.",
    );
    expect(paceReason({ ratio: 1.01, factor: 1.01 })).toBeNull();
    expect(paceReason({ ratio: 1.3, factor: 1 })).toBeNull();
  });

  it("shows the plan's own parts, the pace a part of its own", () => {
    const fitted = plan(paced());
    const time = fitted.explanation.time;
    expect(time.paceMinutes).toBeGreaterThan(0);
    expect(time.warmupMinutes).toBe(fitted.warmup.generalMinutes);
    expect(time.totalMinutes).toBeCloseTo(
      time.warmupMinutes +
        time.workMinutes +
        time.restMinutes +
        time.transitionMinutes +
        (time.paceMinutes ?? 0),
      5,
    );
    expect(plan(paced(false)).explanation.time.paceMinutes).toBeUndefined();
  });

  it("plans the week as today's plan does, a reset read (the review of item 4)", () => {
    // Half-hour sessions, where the pace leaves a lift out.
    const short = {
      ...profile,
      schedule: { ...profile.schedule, typicalDurationMinutes: 30 },
    };
    const reset = withReset(emptyResets(), 'pace', RECORD_NOW);
    const week = (history: WorkoutRecord[], resets: ReturnType<typeof emptyResets> | null) =>
      planWeek(short, gym, history, RECORD_NOW, resets).map((session) => session.muscles);
    const unpaced = week(paced(false), null);
    expect(week(paced(true, 75), reset)).toEqual(unpaced);
    expect(week(paced(true, 75), null)).not.toEqual(unpaced);
  });

  it('keeps the pace through a change that rebuilds nothing', () => {
    const history = paced();
    const workout = plan(history);
    const result = recalibrate({
      trigger: { type: 'reorder', entryId: workout.blocks[2]!.entries[0]!.id, direction: 'up' },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: workout.duration.choice,
      profile,
      location: gym,
      history,
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: RECORD_NOW,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.workout.duration.pace).toBe(1.2);
    const time = estimateWorkout(
      result.workout.blocks,
      result.workout.warmup.generalMinutes,
      requireExercise,
      undefined,
      1.2,
    );
    expect(result.workout.duration.estimatedMinutes).toBe(Math.round(time.totalMinutes));
  });
});

describe('every later estimate of a plan reads the pace it was fitted to', () => {
  const history = paced();
  const workout = plan(history);
  const timed = (blocks: typeof workout.blocks, warmup: number, pace: number) =>
    estimateWorkout(blocks, warmup, requireExercise, undefined, pace).totalMinutes;

  it('times the plan under a hard start at it', () => {
    const under = planUnderTheEase(workout);
    expect(under.duration.estimatedMinutes).toBe(
      Math.round(timed(under.blocks, under.warmup.generalMinutes, 1.2)),
    );
  });

  it('says the minutes a skip saves at it', () => {
    // The last lift on its own: skipping it takes its whole row.
    const last = workout.blocks.filter((block) => block.kind === 'straight').at(-1)!;
    const result = recalibrate({
      trigger: { type: 'skip', entryId: last.entries[0]!.id },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: workout.duration.choice,
      profile,
      location: gym,
      history,
      constraints: emptyConstraints(),
      reason: 'test',
      timestamp: RECORD_NOW,
    });
    if (!result.ok) throw new Error(result.error);
    const without = workout.blocks.filter((block) => block !== last);
    const saved = Math.round(timed(workout.blocks, 0, 1.2) - timed(without, 0, 1.2));
    expect(saved).not.toBe(Math.round(timed(workout.blocks, 0, 1) - timed(without, 0, 1)));
    expect(result.summary.headline).toMatch(new RegExp(`: about ${saved} min saved\\.$`));
  });

  it('gives the coach the room left at it', () => {
    const left = remainingMinutes({
      blocks: workout.blocks,
      exerciseOf: requireExercise,
      isDone: () => false,
      generalWarmupMinutes: workout.warmup.generalMinutes,
      anythingLogged: false,
      elapsedSeconds: 0,
      restSecondsLeft: 0,
      pace: 1.2,
    });
    expect(spareMinutes({ completed: emptyCompleted(), elapsedSeconds: 0, workout })).toBeCloseTo(
      workout.duration.targetMinutes - left,
      5,
    );
  });
});

describe("the learned page's pace", () => {
  const pace = (history: WorkoutRecord[], resets = emptyResets()) =>
    learnedSections({
      history,
      profile,
      now: RECORD_NOW,
      resets,
      declines: emptyDeclines(),
    }).find((section) => section.key === 'pace')!;

  it('says where it stands, and what it does to a plan', () => {
    const usable = pace(paced());
    expect(usable.status).toBe(
      "Your workouts take about 20% longer than the plan's own estimate, from the last 3 workouts it could read.",
    );
    expect(usable.evidence).toContain('a workout the plan puts under 10 minutes');
    expect(usable.evidence).toContain('the rests, weights and reps stay as the length sets them');
    expect(usable.items).toEqual([
      "Plans are fitted to it: a 45-minute plan holds about 38 minutes of the plan's own estimate.",
    ]);
    expect(usable.reset).toBe('Forget your pace');
    expect(pace(paced().slice(0, 2)).status).toBe('Still learning: 2 workouts of the 3 it needs.');
    const reset = pace(paced(), withReset(emptyResets(), 'pace', RECORD_NOW));
    expect(reset.status).toMatch(/^Nothing learned since you reset it on /);
  });

  it('says when workouts were finished but none could be read (the review of item 4)', () => {
    // Three workouts, each more than twice its estimate: none read, though finished.
    expect(pace(paced(true, 120)).status).toBe(
      'Still learning: none yet of the 3 workouts it needs.',
    );
    expect(pace(paced(false)).status).toBe(
      'Nothing learned yet: it reads each finished workout from this version on.',
    );
  });
});
