import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import { createDefaultProfile, type UserProfile } from '../../core/validation/profile';
import { record } from '../../test/records';
import { DUMBBELLS_KEY, type LoadingRange } from '../loading/loading';
import { overrideBias } from '../progression/overrides';
import { emptyCompleted, emptyConstraints } from '../recalibration/recalibrate';
import { interpretFatigue } from '../recovery/fatigue';
import { fatigueSteps } from '../recovery/sessionContext';
import type { CoachRoutes, StallDiagnosis, StallKind } from '../strategy/plateau';
import type { StrategyInsight } from '../strategy/strategy';
import {
  allEntries,
  type EntryProgression,
  type GeneratedWorkout,
  type SetPrescription,
  type WorkoutEntry,
} from '../workout/types';
import { generateWorkout } from '../workoutGenerator/generate';
import { gatherSignals, type CoachInput, type CoachSignal } from './coachConductor';

/**
 * Maintenance 24, the owner's item 35. The coach's offers name only weights the place makes today
 * (missing plates included), a stalled lift pushed at light weights shifts from the range it
 * stands in for, and a deload week holds back everything that pushes for more.
 */

const NOW = '2026-09-10T12:00:00.000Z';
const profile: UserProfile = { ...createDefaultProfile(NOW), bodyweight: 185 };
const places = createDefaultLocations({ gymAccess: true }, NOW);
const home = places.find((place) => place.id === 'home') as LocationProfile;
const gym = places.find((place) => place.id === 'gym') as LocationProfile;
const dumbbells = (...ranges: LoadingRange[]): LocationProfile => ({
  ...home,
  loading: { [DUMBBELLS_KEY]: { kind: 'dumbbells', ranges } },
});
const lightHome = dumbbells({ from: 5, to: 20, step: 5 });
const incline = 'incline-dumbbell-press';
const bench = 'barbell-bench-press';
const deloadWeek = {
  startsAt: '2026-09-07T00:00:00.000Z',
  endsAt: '2026-09-14T00:00:00.000Z',
};

function planAt(place: LocationProfile, templateId = 'push-arms'): GeneratedWorkout {
  return generateWorkout({
    profile,
    location: place,
    history: [],
    now: NOW,
    duration: 'default',
    constraints: { templateId },
  });
}

/** The workout with one lift changed: its working sets, and its progression summary. */
function withLift(
  workout: GeneratedWorkout,
  exerciseId: string,
  sets: Partial<SetPrescription>,
  progression: Partial<EntryProgression> = {},
): GeneratedWorkout {
  const change = (entry: WorkoutEntry): WorkoutEntry =>
    entry.exerciseId !== exerciseId
      ? entry
      : {
          ...entry,
          sets: entry.sets.map((set) => (set.kind === 'working' ? { ...set, ...sets } : set)),
          progression: {
            mode: 'weight',
            evidence: ['From your last sessions.'],
            sessions: 2,
            viaFamily: false,
            confidence: 'high',
            setsAdvice: 0,
            ...entry.progression,
            ...progression,
          },
        };
  return {
    ...workout,
    blocks: workout.blocks.map((block) => ({ ...block, entries: block.entries.map(change) })),
  };
}

function inputFor(
  workout: GeneratedWorkout,
  place: LocationProfile,
  patch: Partial<CoachInput> = {},
): CoachInput {
  return {
    workout,
    status: 'preview',
    duration: 'default',
    completed: emptyCompleted(),
    constraints: emptyConstraints(),
    profile,
    history: [],
    now: NOW,
    fatigue: interpretFatigue([], NOW, null),
    strategy: [],
    lastExportAt: NOW,
    workoutCount: 0,
    location: place,
    stalls: [],
    ...patch,
  };
}

const insight = (patch: Partial<StrategyInsight>): StrategyInsight => ({
  kind: 'load',
  recommendation: 'add-weight',
  headline: 'Ready for more load',
  why: ['Three sessions at the top of the range.'],
  sessions: 3,
  confidence: 'high',
  severity: 2,
  ...patch,
});

const stall = (exerciseId: string, kind: StallKind): StallDiagnosis => ({
  exerciseId,
  kind,
  exposures: 4,
  totalExposures: 4,
  baselineE1rm: 200,
  latestE1rm: 200,
  effortMet: 4,
  effortUnknown: 0,
  firstDate: NOW,
  lastDate: NOW,
  why: ['No better estimated max in 4 exposures.'],
});

const routeAt = (exerciseId: string, step: number): CoachRoutes => ({
  id: 'coach-routes',
  routes: {
    [exerciseId]: {
      exerciseId,
      step,
      startedAt: NOW,
      baselineE1rm: 200,
      applied: [],
      exhausted: false,
    },
  },
});

const bySource = (signals: CoachSignal[], source: string) =>
  signals.filter((signal) => signal.source === source);
const labels = (signals: CoachSignal[]) => signals.map((signal) => signal.action?.label ?? null);

describe('a load the coach offers is one the place makes', () => {
  it('offers the next dumbbell up at the gym', () => {
    const workout = withLift(planAt(gym), incline, { targetWeight: 50 });
    const signals = gatherSignals(
      inputFor(workout, gym, { strategy: [insight({ exerciseId: incline })] }),
    );
    expect(labels(bySource(signals, 'strategy: load'))).toEqual(['Take 55 lb today']);
  });

  it("offers the plan's own step where the place makes smaller ones", () => {
    // The plan steps dumbbells 5 lb at a time, so the coach does too, as the card's why says.
    const fine = dumbbells({ from: 5, to: 60, step: 2.5 });
    const workout = withLift(planAt(fine), incline, { targetWeight: 50 });
    const signals = gatherSignals(
      inputFor(workout, fine, { strategy: [insight({ exerciseId: incline })] }),
    );
    expect(labels(bySource(signals, 'strategy: load'))).toEqual(['Take 55 lb today']);
  });

  it("offers the plan's step onto the nearest weight made under it", () => {
    const odd = dumbbells({ from: 5, to: 50, step: 5 }, { from: 52.5, to: 52.5, step: 2.5 });
    const workout = withLift(planAt(odd), incline, { targetWeight: 50 });
    const signals = gatherSignals(
      inputFor(workout, odd, { strategy: [insight({ exerciseId: incline })] }),
    );
    expect(labels(bySource(signals, 'strategy: load'))).toEqual(['Take 52.5 lb today']);
    // The reason says the same weight as the button.
    expect(bySource(signals, 'strategy: load')[0]?.why.at(-1)).toBe(
      'Next step: 52.5 lb, the nearest weight here, then work back up the range.',
    );
  });

  it('leaves out a step the plan took already: its own note says so', () => {
    // Last lifted at 185 lb; the plan's target today is already its step, 190.
    const stepped = withLift(planAt(gym), bench, { targetWeight: 190 }, { from: 185 });
    const signals = gatherSignals(
      inputFor(stepped, gym, {
        strategy: [insight({ exerciseId: bench })],
        stalls: [stall(bench, 'undershooting')],
      }),
    );
    // No card with nothing to tap, and never a second step on top of the plan's.
    expect(bySource(signals, 'strategy: load')).toEqual([]);
    expect(bySource(signals, 'stall: undershooting')).toEqual([]);
    // Held at 185, the step is the plan's next one.
    const held = withLift(planAt(gym), bench, { targetWeight: 185 }, { from: 185 });
    const offered = gatherSignals(
      inputFor(held, gym, { strategy: [insight({ exerciseId: bench })] }),
    );
    expect(labels(bySource(offered, 'strategy: load'))).toEqual(['Take 190 lb today']);
  });

  it('leaves out a micro-deload the plan took already', () => {
    // Last lifted at 50 lb; the plan's micro-deload already set 45 for today.
    const lowered = withLift(
      planAt(gym),
      incline,
      { targetWeight: 45 },
      { from: 50, mode: 'deload' },
    );
    const signals = gatherSignals(
      inputFor(lowered, gym, {
        strategy: [insight({ exerciseId: incline, recommendation: 'micro-deload' })],
      }),
    );
    expect(bySource(signals, 'strategy: load')).toEqual([]);
  });

  it('offers no step up on a lighter day the plan chose: a break, a new rep range, the session', () => {
    // Back after a break, the plan returns at 45 lb from the 50 last lifted; the load it chose not
    // to ask is not offered back, and nothing above it.
    const back = withLift(planAt(gym), incline, { targetWeight: 45 }, { from: 50, mode: 'return' });
    const strategy = [insight({ exerciseId: incline })];
    const stalls = [stall(incline, 'undershooting')];
    const returned = gatherSignals(inputFor(back, gym, { strategy, stalls }));
    expect(bySource(returned, 'strategy: load')).toEqual([]);
    expect(bySource(returned, 'stall: undershooting')).toEqual([]);
    // A new rep range: 60 lb last, at 4-6; today 50 lb, at 6-10, the weight following the reps.
    const range = withLift(
      planAt(gym),
      incline,
      { targetWeight: 50 },
      { from: 60, mode: 'estimate' },
    );
    expect(bySource(gatherSignals(inputFor(range, gym, { strategy })), 'strategy: load')).toEqual(
      [],
    );
    // Two steps down for the session (60 lb last, 40 today, more of the same muscles before it).
    const lighter = withLift(
      planAt(gym),
      incline,
      { targetWeight: 40 },
      { from: 60, mode: 'maintain', nudged: -2 },
    );
    expect(
      bySource(gatherSignals(inputFor(lighter, gym, { strategy, stalls })), 'strategy: load'),
    ).toEqual([]);
    // Its micro-deload stands in the plan's own lighter load too: back after a break at 50 (9%
    // under the 55 last lifted, on a stack by 10), and at a new rep range (125 lb today, 135 last).
    const pushdown = 'cable-triceps-pushdown';
    const deloads = [insight({ exerciseId: pushdown, recommendation: 'micro-deload' })];
    const back55 = withLift(
      planAt(gym),
      pushdown,
      { targetWeight: 50 },
      { from: 55, mode: 'return' },
    );
    expect(allEntries(back55.blocks).some((entry) => entry.exerciseId === pushdown)).toBe(true);
    expect(
      bySource(gatherSignals(inputFor(back55, gym, { strategy: deloads })), 'strategy: load'),
    ).toEqual([]);
    const newRange = withLift(
      planAt(gym),
      bench,
      { targetWeight: 125 },
      { from: 135, mode: 'estimate' },
    );
    expect(
      bySource(
        gatherSignals(
          inputFor(newRange, gym, {
            strategy: [insight({ exerciseId: bench, recommendation: 'micro-deload' })],
          }),
        ),
        'strategy: load',
      ),
    ).toEqual([]);
  });

  it('offers the step over a weight the place only rounded down, and none the plan already took', () => {
    const strategy = [insight({ exerciseId: incline })];
    // 52.5 typed last time; dumbbells by 5 show the same load as 50: the step is still 55.
    const typed = withLift(
      planAt(gym),
      incline,
      { targetWeight: 50 },
      { from: 52.5, mode: 'maintain' },
    );
    expect(
      labels(bySource(gatherSignals(inputFor(typed, gym, { strategy })), 'strategy: load')),
    ).toEqual(['Take 55 lb today']);
    // The plan added 5 lb and the session took it back ("down a step"): the plan's own call stands.
    const stepped = withLift(
      planAt(gym),
      incline,
      { targetWeight: 40 },
      { from: 40, mode: 'weight', nudged: -1 },
    );
    expect(bySource(gatherSignals(inputFor(stepped, gym, { strategy })), 'strategy: load')).toEqual(
      [],
    );
  });

  it('offers no step up and no second deload over a weight set lighter by hand', () => {
    // Last lifted at 200 lb, the plan asks 205, and the route's deload set 185 by hand.
    const byHand = (weight: number): GeneratedWorkout => {
      const workout = withLift(planAt(gym), bench, { targetWeight: weight }, { from: 200 });
      for (const entry of allEntries(workout.blocks)) {
        if (entry.exerciseId === bench) entry.manual = { weight: true };
      }
      return workout;
    };
    const up = [insight({ exerciseId: bench })];
    const down = [insight({ exerciseId: bench, recommendation: 'micro-deload' })];
    const deloaded = byHand(185);
    expect(
      bySource(gatherSignals(inputFor(deloaded, gym, { strategy: up })), 'strategy: load'),
    ).toEqual([]);
    expect(
      bySource(gatherSignals(inputFor(deloaded, gym, { strategy: down })), 'strategy: load'),
    ).toEqual([]);
    // Set by hand at the weight last lifted, the step is offered as ever.
    expect(
      labels(
        bySource(gatherSignals(inputFor(byHand(200), gym, { strategy: up })), 'strategy: load'),
      ),
    ).toEqual(['Take 205 lb today']);
  });

  it("reads a plan saved before targets recorded their steps by the plan's own lines", () => {
    // A plan kept from the day this update lands: 60 lb last, 40 today, and no count of the steps.
    const strategy = [insight({ exerciseId: incline })];
    const saved = (line: string) =>
      withLift(
        planAt(gym),
        incline,
        { targetWeight: 40 },
        { from: 60, mode: 'maintain', evidence: ['From your last sessions.', line] },
      );
    // Two steps down for the work before it today.
    const session = fatigueSteps(10, 4, false).line as string;
    expect(
      bySource(gatherSignals(inputFor(saved(session), gym, { strategy })), 'strategy: load'),
    ).toEqual([]);
    // A step down for your habit: less than the target chosen in three of the last four sessions.
    const chosen = [2, 5, 8, 11].map((daysAgo) => {
      const done = record(daysAgo, incline, [[10, daysAgo === 11 ? 60 : 50, 2]]);
      for (const set of done.entries[0]?.sets ?? []) set.targetWeight = 60;
      return done;
    });
    const habit = overrideBias(chosen, incline, 5).evidence as string;
    expect(habit).toMatch(/steps down to meet you/);
    expect(
      bySource(gatherSignals(inputFor(saved(habit), gym, { strategy })), 'strategy: load'),
    ).toEqual([]);
  });

  it('offers one ordinary step up from a weight off the step grid', () => {
    const stack = {
      ...gym,
      loading: { 'cable-fly': { kind: 'stack' as const, ranges: [{ from: 5, to: 100, step: 5 }] } },
    };
    // 55 lb on a stack by 5: one 10 lb step is 65, not 70.
    const fly = withLift(planAt(stack), 'cable-fly', { targetWeight: 55 }, { from: 55 });
    const [flyCard] = bySource(
      gatherSignals(inputFor(fly, stack, { strategy: [insight({ exerciseId: 'cable-fly' })] })),
      'strategy: load',
    );
    expect(flyCard?.action?.label).toBe('Take 65 lb today');
    expect(flyCard?.why).toEqual(['Three sessions at the top of the range.']);
    // 52.5 lb dumbbells: 57.5 where the dumbbells go by 2.5; where they go by 5, the 55 under it.
    const fine = dumbbells({ from: 5, to: 60, step: 2.5 });
    const byFive = dumbbells({ from: 5, to: 60, step: 5 });
    const offer = (place: LocationProfile) =>
      bySource(
        gatherSignals(
          inputFor(
            withLift(planAt(place), incline, { targetWeight: 52.5 }, { from: 52.5 }),
            place,
            {
              strategy: [insight({ exerciseId: incline })],
            },
          ),
        ),
        'strategy: load',
      )[0];
    expect(offer(fine)?.action?.label).toBe('Take 57.5 lb today');
    expect(offer(byFive)?.action?.label).toBe('Take 55 lb today');
    expect(offer(byFive)?.why.at(-1)).toBe(
      'Next step: 55 lb, the nearest weight here, then work back up the range.',
    );
    // Today's target already 52.5, the heaviest pair here: nothing to tap for what it shows.
    const top = dumbbells({ from: 5, to: 50, step: 5 }, { from: 52.5, to: 52.5, step: 2.5 });
    const atTop = withLift(planAt(top), incline, { targetWeight: 52.5 }, { from: 50 });
    expect(
      bySource(
        gatherSignals(inputFor(atTop, top, { strategy: [insight({ exerciseId: incline })] })),
        'strategy: load',
      ),
    ).toEqual([]);
    // The plan's own step from 51 lb lands on 55: where the dumbbells go by 1 lb, no 56 on top.
    const ones = dumbbells({ from: 1, to: 100, step: 1 });
    const planned = withLift(planAt(ones), incline, { targetWeight: 55 }, { from: 51 });
    expect(
      bySource(
        gatherSignals(inputFor(planned, ones, { strategy: [insight({ exerciseId: incline })] })),
        'strategy: load',
      ),
    ).toEqual([]);
    // A target already a step up (65 from 55, for the session): nothing to tap for what it shows.
    const up = withLift(planAt(stack), 'cable-fly', { targetWeight: 65 }, { from: 55 });
    expect(
      bySource(
        gatherSignals(inputFor(up, stack, { strategy: [insight({ exerciseId: 'cable-fly' })] })),
        'strategy: load',
      ),
    ).toEqual([]);
  });

  it("offers a stack's own step, 10 lb, onto the stack here", () => {
    const stack = {
      ...gym,
      loading: { 'cable-fly': { kind: 'stack' as const, ranges: [{ from: 5, to: 100, step: 5 }] } },
    };
    const workout = withLift(planAt(stack), 'cable-fly', { targetWeight: 50 });
    const signals = gatherSignals(
      inputFor(workout, stack, { strategy: [insight({ exerciseId: 'cable-fly' })] }),
    );
    expect(labels(bySource(signals, 'strategy: load'))).toEqual(['Take 60 lb today']);
  });

  it('says nothing of a step the place cannot make, once the lift is under way or done', () => {
    const workout = withLift(planAt(lightHome), incline, { targetWeight: 20 });
    const lift = allEntries(workout.blocks).find((entry) => entry.exerciseId === incline);
    const first = lift?.sets.find((set) => set.kind === 'working');
    if (!lift || !first) throw new Error('expected the incline press');
    const underWay: CoachInput['completed'] = {
      startedAt: NOW,
      elapsedSeconds: 600,
      currentEntryId: lift.id,
      sets: [
        {
          entryId: lift.id,
          exerciseId: incline,
          setIndex: first.index,
          kind: 'working',
          reps: 20,
          weight: 20,
          rir: 2,
          completedAt: NOW,
        },
      ],
    };
    const strategy = [insight({ exerciseId: incline })];
    const stalls = [stall(incline, 'undershooting')];
    for (const patch of [
      { status: 'active' as const, completed: underWay },
      { status: 'completed' as const, completed: underWay },
    ]) {
      const signals = gatherSignals(inputFor(workout, lightHome, { strategy, stalls, ...patch }));
      expect(bySource(signals, 'strategy: load')).toEqual([]);
      expect(bySource(signals, 'stall: undershooting')).toEqual([]);
    }
    // At the gym the step is made: the card stays, with nothing to tap once the lift is under way.
    const atGym = withLift(planAt(gym), incline, { targetWeight: 50 });
    const gymLift = allEntries(atGym.blocks).find((entry) => entry.exerciseId === incline);
    const signals = gatherSignals(
      inputFor(atGym, gym, {
        strategy,
        status: 'active',
        completed: {
          ...underWay,
          currentEntryId: gymLift?.id ?? null,
          sets: underWay.sets.map((set) => ({ ...set, entryId: gymLift?.id ?? '' })),
        },
      }),
    );
    expect(labels(bySource(signals, 'strategy: load'))).toEqual([null]);
  });

  it('offers no step up across a gap in the dumbbells', () => {
    const gap = dumbbells({ from: 5, to: 50, step: 5 }, { from: 60, to: 100, step: 10 });
    const workout = withLift(planAt(gap), incline, { targetWeight: 50 });
    const signals = gatherSignals(
      inputFor(workout, gap, { strategy: [insight({ exerciseId: incline })] }),
    );
    expect(bySource(signals, 'strategy: load')).toEqual([]);
  });

  it('offers no step up the plates missing today cannot make', () => {
    const workout = withLift(planAt(gym), bench, { targetWeight: 135 });
    const strategy = [insight({ exerciseId: bench })];
    // Without the 2.5s the next weight up is 145, two steps: the reps take it first.
    const missing = gatherSignals(
      inputFor(workout, gym, { strategy, loading: { missingPlates: [2.5] } }),
    );
    expect(bySource(missing, 'strategy: load')).toEqual([]);
    const all = gatherSignals(inputFor(workout, gym, { strategy }));
    expect(labels(bySource(all, 'strategy: load'))).toEqual(['Take 140 lb today']);
  });

  it('takes a micro-deload to a weight the light dumbbells make', () => {
    // A tenth off 20 lb rounds back to 20; the next one down here is 15.
    const workout = withLift(planAt(lightHome), incline, { targetWeight: 20 });
    const signals = gatherSignals(
      inputFor(workout, lightHome, {
        strategy: [insight({ exerciseId: incline, recommendation: 'micro-deload' })],
      }),
    );
    expect(labels(bySource(signals, 'strategy: load'))).toEqual(['Micro-deload to 15 lb']);
  });

  it('takes a micro-deload to the nearest weight made under a tenth off', () => {
    const gap = dumbbells({ from: 5, to: 40, step: 5 }, { from: 50, to: 50, step: 5 });
    const workout = withLift(planAt(gap), incline, { targetWeight: 50 });
    const signals = gatherSignals(
      inputFor(workout, gap, {
        strategy: [insight({ exerciseId: incline, recommendation: 'micro-deload' })],
      }),
    );
    expect(labels(bySource(signals, 'strategy: load'))).toEqual(['Micro-deload to 40 lb']);
  });

  it('takes a micro-deload to a weight the plates here today make', () => {
    // A tenth off 135 lb is 120, which needs 2.5s; without them the nearest under it is 115.
    const workout = withLift(planAt(gym), bench, { targetWeight: 135 });
    const strategy = [insight({ exerciseId: bench, recommendation: 'micro-deload' })];
    const missing = gatherSignals(
      inputFor(workout, gym, { strategy, loading: { missingPlates: [2.5] } }),
    );
    expect(labels(bySource(missing, 'strategy: load'))).toEqual(['Micro-deload to 115 lb']);
    // 115 is 15% off, more than a tenth: the reason says so. 120 is about a tenth: as the card says.
    expect(bySource(missing, 'strategy: load')[0]?.why.at(-1)).toBe(
      '115 lb, 15% lighter, rebuilds the reps before adding load again.',
    );
    const all = gatherSignals(inputFor(workout, gym, { strategy }));
    expect(labels(bySource(all, 'strategy: load'))).toEqual(['Micro-deload to 120 lb']);
    expect(bySource(all, 'strategy: load')[0]?.why).toEqual([
      'Three sessions at the top of the range.',
    ]);
  });

  it("takes the plan's micro-deload where the place makes smaller steps", () => {
    // The plan's micro-deload is at least one ordinary step: 20 lb goes to 15, not to 17.5.
    const fine = dumbbells({ from: 5, to: 60, step: 2.5 });
    const workout = withLift(planAt(fine), incline, { targetWeight: 20 });
    const signals = gatherSignals(
      inputFor(workout, fine, {
        strategy: [insight({ exerciseId: incline, recommendation: 'micro-deload' })],
      }),
    );
    expect(labels(bySource(signals, 'strategy: load'))).toEqual(['Micro-deload to 15 lb']);
  });

  it('offers no micro-deload where nothing lighter is made', () => {
    const only20 = dumbbells({ from: 20, to: 20, step: 5 });
    const workout = withLift(planAt(only20), incline, { targetWeight: 20 });
    const signals = gatherSignals(
      inputFor(workout, only20, {
        strategy: [insight({ exerciseId: incline, recommendation: 'micro-deload' })],
      }),
    );
    expect(bySource(signals, 'strategy: load')).toEqual([]);
  });

  it("a stalled lift's deload step names a lighter weight made there, and is passed over where none is", () => {
    const stalls = [stall(incline, 'stalled-at-effort')];
    const routes = routeAt(incline, 2);
    const light = gatherSignals(
      inputFor(withLift(planAt(lightHome), incline, { targetWeight: 20 }), lightHome, {
        stalls,
        routes,
      }),
    );
    expect(labels(bySource(light, 'stall: route'))).toEqual(['Deload to 15 lb this week']);
    // With one pair of 20s, the route moves on to its next step instead of stopping here.
    const only20 = dumbbells({ from: 20, to: 20, step: 5 });
    const [card] = bySource(
      gatherSignals(
        inputFor(withLift(planAt(only20), incline, { targetWeight: 20 }), only20, {
          stalls,
          routes,
        }),
      ),
      'stall: route',
    );
    expect(card?.action).toMatchObject({
      label: 'Add a working set',
      route: { exerciseId: incline, step: 3 },
    });
    expect(card?.why.at(-1)).toBe(
      'Step 3, a short deload, needs a lighter weight than this place makes. Step 4: one more working set adds the volume a stalled lift often needs.',
    );
    expect(card?.why[1]).toContain('4 add a set (now)');
    // The weights decide it, not the start: under way, the card still reads the step it can give.
    const only20Plan = withLift(planAt(only20), incline, { targetWeight: 20 });
    const lift = allEntries(only20Plan.blocks).find((entry) => entry.exerciseId === incline)!;
    const first = lift.sets.find((set) => set.kind === 'working')!;
    const [underWay] = bySource(
      gatherSignals(
        inputFor(only20Plan, only20, {
          status: 'active',
          completed: {
            startedAt: NOW,
            elapsedSeconds: 600,
            currentEntryId: lift.id,
            sets: [
              {
                entryId: lift.id,
                exerciseId: incline,
                setIndex: first.index,
                kind: 'working',
                reps: 12,
                weight: 20,
                rir: 2,
                completedAt: NOW,
              },
            ],
          },
          stalls,
          routes,
        }),
      ),
      'stall: route',
    );
    expect(underWay?.action).toBeNull();
    expect(underWay?.why[1]).toContain('3 short deload (passed over) → 4 add a set (now)');
  });

  it("a stalled lift's deload comes down from today's target where it is heavier", () => {
    const stalls = [stall(bench, 'stalled-at-effort')];
    const routes = routeAt(bench, 2);
    // Last 190 lb, today 195: a tenth off 195, not a deeper cut from 190.
    const stepped = withLift(planAt(gym), bench, { targetWeight: 195 }, { from: 190 });
    expect(
      labels(bySource(gatherSignals(inputFor(stepped, gym, { stalls, routes })), 'stall: route')),
    ).toEqual(['Deload to 175 lb this week']);
  });

  it('a lighter day the plan chose leaves the deload step out rather than passing it over', () => {
    // Dumbbells of 40, 50 and 60, back after a break: the plan asks 45 (50 last), the set shows 40.
    const tens = dumbbells({ from: 40, to: 60, step: 10 });
    const back = withLift(
      planAt(tens),
      incline,
      { targetWeight: 40, asked: { weight: 45, reps: [8, 12] } },
      { from: 50, mode: 'return' },
    );
    const signals = gatherSignals(
      inputFor(back, tens, {
        stalls: [stall(incline, 'stalled-at-effort')],
        routes: routeAt(incline, 2),
      }),
    );
    // Today is already a tenth lighter: no card, rather than "Add a working set" in its place.
    expect(bySource(signals, 'stall: route')).toEqual([]);
  });

  it("a stalled lift's deload step is left out while the plan's own lighter load is in place", () => {
    // Last lifted at 50 lb; the plan's own micro-deload already set 45 for today.
    const signals = gatherSignals(
      inputFor(withLift(planAt(gym), incline, { targetWeight: 45 }, { from: 50 }), gym, {
        stalls: [stall(incline, 'stalled-at-effort')],
        routes: routeAt(incline, 2),
      }),
    );
    expect(bySource(signals, 'stall: route')).toEqual([]);
  });

  it('a set the weights here push comes down from the weight it shows, and is never stepped up', () => {
    // The dumbbells stop at 45: the plan asks 50, as last time, and the set shows 45 for it.
    const to45 = dumbbells({ from: 5, to: 45, step: 5 });
    const pushed = withLift(
      planAt(to45),
      incline,
      { targetWeight: 45, asked: { weight: 50, reps: [8, 12] } },
      { from: 50, mode: 'reps' },
    );
    const route = gatherSignals(
      inputFor(pushed, to45, {
        stalls: [stall(incline, 'stalled-at-effort')],
        routes: routeAt(incline, 2),
      }),
    );
    expect(labels(bySource(route, 'stall: route'))).toEqual(['Deload to 40 lb this week']);
    const cards = gatherSignals(
      inputFor(pushed, to45, {
        strategy: [insight({ exerciseId: incline, recommendation: 'micro-deload' })],
      }),
    );
    expect(labels(bySource(cards, 'strategy: load'))).toEqual(['Micro-deload to 40 lb']);
    const heavier = gatherSignals(
      inputFor(pushed, to45, {
        strategy: [insight({ exerciseId: incline })],
        stalls: [stall(incline, 'undershooting')],
      }),
    );
    expect(bySource(heavier, 'strategy: load')).toEqual([]);
    expect(bySource(heavier, 'stall: undershooting')).toEqual([]);
    // At a gap (40, then 50) a return at 45 shows 40: no step up to the 50 across it either.
    const gap = dumbbells({ from: 5, to: 40, step: 5 }, { from: 50, to: 50, step: 5 });
    const across = withLift(
      planAt(gap),
      incline,
      { targetWeight: 40, asked: { weight: 45, reps: [8, 12] } },
      { from: 50, mode: 'return' },
    );
    const atGap = gatherSignals(
      inputFor(across, gap, {
        strategy: [insight({ exerciseId: incline })],
        stalls: [stall(incline, 'undershooting')],
      }),
    );
    expect(bySource(atGap, 'strategy: load')).toEqual([]);
    expect(bySource(atGap, 'stall: undershooting')).toEqual([]);
    // Dumbbells to 45, then a pair of 52.5s: the set shows 45 for the 50 asked, and no step up to
    // the 52.5s either.
    const odd = dumbbells({ from: 5, to: 45, step: 5 }, { from: 52.5, to: 52.5, step: 2.5 });
    const short = withLift(
      planAt(odd),
      incline,
      { targetWeight: 45, asked: { weight: 50, reps: [8, 12] } },
      { from: 50, mode: 'reps' },
    );
    expect(
      bySource(
        gatherSignals(inputFor(short, odd, { strategy: [insight({ exerciseId: incline })] })),
        'strategy: load',
      ),
    ).toEqual([]);
    // The light home: 20 lb held for 50, a real history behind it. A tenth off what the set shows.
    const light = withLift(
      planAt(lightHome),
      incline,
      { targetWeight: 20, asked: { weight: 50, reps: [8, 12] } },
      { from: 50, mode: 'reps' },
    );
    const [lighter] = bySource(
      gatherSignals(
        inputFor(light, lightHome, {
          strategy: [
            insight({
              exerciseId: incline,
              recommendation: 'micro-deload',
              why: ['Below the rep floor twice.', 'A 10% micro-deload rebuilds the reps.'],
            }),
          ],
        }),
      ),
      'strategy: load',
    );
    expect(lighter?.action?.label).toBe('Micro-deload to 15 lb');
    // A quarter off, not a tenth: the reason says how much.
    expect(lighter?.why.at(-1)).toBe(
      '15 lb, 25% lighter, rebuilds the reps before adding load again.',
    );
    // The plan's own deload, pushed in turn (40 asked, 35 shown), is left alone.
    const served = withLift(
      planAt(to45),
      incline,
      { targetWeight: 35, asked: { weight: 40, reps: [8, 12] } },
      { from: 50, mode: 'deload' },
    );
    const again = gatherSignals(
      inputFor(served, to45, {
        strategy: [insight({ exerciseId: incline, recommendation: 'micro-deload' })],
        stalls: [stall(incline, 'stalled-at-effort')],
        routes: routeAt(incline, 2),
      }),
    );
    expect(bySource(again, 'strategy: load')).toEqual([]);
    expect(bySource(again, 'stall: route')).toEqual([]);
  });

  it('a lift with sets ending too easy is offered the next weight up only where it is made', () => {
    const stalls = [stall(incline, 'undershooting')];
    const atGym = gatherSignals(
      inputFor(withLift(planAt(gym), incline, { targetWeight: 50 }), gym, { stalls }),
    );
    expect(labels(bySource(atGym, 'stall: undershooting'))).toEqual(['Take 55 lb today']);
    const gap = dumbbells({ from: 5, to: 50, step: 5 }, { from: 60, to: 100, step: 10 });
    const atGap = gatherSignals(
      inputFor(withLift(planAt(gap), incline, { targetWeight: 50 }), gap, { stalls }),
    );
    expect(bySource(atGap, 'stall: undershooting')).toEqual([]);
  });

  it('a stalled lift the light dumbbells hold well short passes over the new rep range', () => {
    const ranges = requireExercise(incline).repRanges;
    const strength = ranges.strength ?? ranges.hypertrophy;
    // Its sets stand in for the strength range at 40 lb; the light dumbbells show 20 lb x 16-20,
    // where a new range could not be loaded at the same effort.
    const workout = withLift(planAt(lightHome), incline, {
      targetWeight: 20,
      targetReps: [16, 20],
      asked: { weight: 40, reps: [strength[0], strength[1]] },
    });
    const [card] = bySource(
      gatherSignals(
        inputFor(workout, lightHome, {
          stalls: [stall(incline, 'stalled-at-effort')],
          routes: routeAt(incline, 0),
        }),
      ),
      'stall: route',
    );
    expect(card?.action).toMatchObject({
      kind: 'alternatives',
      label: 'Swap for a variation',
      route: { exerciseId: incline, step: 1 },
    });
    expect(card?.why.at(-1)).toMatch(
      /^Step 1, a new rep range, needs weights this place does not make\. Step 2: /,
    );
  });

  it('keeps the new rep range where the weights stand only a little short', () => {
    // No 2.5s today: 95 lb for the 100 asked, within a tenth.
    const workout = withLift(planAt(gym), bench, {
      targetWeight: 95,
      targetReps: [5, 7],
      asked: { weight: 100, reps: [4, 6] },
    });
    const signals = gatherSignals(
      inputFor(workout, gym, {
        stalls: [stall(bench, 'stalled-at-effort')],
        routes: routeAt(bench, 0),
      }),
    );
    // Its sets stand in for the strength range, so the new range is the muscle-building one.
    const [low, high] = requireExercise(bench).repRanges.hypertrophy;
    expect(labels(bySource(signals, 'stall: route'))).toEqual([
      `Shift to ${low}-${high} reps for two weeks`,
    ]);
  });

  it('passes over the new rep range from the weights alone, the lift under way or not', () => {
    const ranges = requireExercise(incline).repRanges;
    const strength = ranges.strength ?? ranges.hypertrophy;
    const workout = withLift(planAt(lightHome), incline, {
      targetWeight: 20,
      targetReps: [16, 20],
      asked: { weight: 40, reps: [strength[0], strength[1]] },
    });
    const lift = allEntries(workout.blocks).find((entry) => entry.exerciseId === incline)!;
    const first = lift.sets.find((set) => set.kind === 'working')!;
    const [card] = bySource(
      gatherSignals(
        inputFor(workout, lightHome, {
          status: 'active',
          completed: {
            startedAt: NOW,
            elapsedSeconds: 600,
            currentEntryId: lift.id,
            sets: [
              {
                entryId: lift.id,
                exerciseId: incline,
                setIndex: first.index,
                kind: 'working',
                reps: 18,
                weight: 20,
                rir: 2,
                completedAt: NOW,
              },
            ],
          },
          stalls: [stall(incline, 'stalled-at-effort')],
          routes: routeAt(incline, 0),
        }),
      ),
      'stall: route',
    );
    // Under way, nothing to tap; the route still reads the step it can give next.
    expect(card?.action).toBeNull();
    expect(card?.why[1]).toContain(
      '1 shift the rep range (passed over) → 2 swap for a variation (now)',
    );
  });

  it('says a route is done, not that every step was tried, when it passed some over', () => {
    const routes: CoachRoutes = {
      id: 'coach-routes',
      routes: {
        [incline]: {
          exerciseId: incline,
          step: 3,
          startedAt: NOW,
          baselineE1rm: 200,
          applied: [
            { step: 1, at: NOW },
            { step: 3, at: NOW },
          ],
          exhausted: true,
        },
      },
    };
    const [card] = bySource(
      gatherSignals(
        inputFor(withLift(planAt(gym), incline, { targetWeight: 50 }), gym, {
          stalls: [stall(incline, 'stalled-at-effort')],
          routes,
        }),
      ),
      'stall: route',
    );
    expect(card?.headline).toBe('Incline Dumbbell Press: the route is done, still stalled');
    expect(card?.why[1]).toContain('1 shift the rep range (passed over)');
    expect(card?.why[1]).toContain('3 short deload (passed over)');
    expect(card?.why.at(-1)).toBe(
      'The steps taken did not move the max, and the others were passed over where the weights could not give them: change the exercise for this pattern for a block.',
    );
  });
});

describe('a deload week holds back what pushes for more', () => {
  const inDeload = (input: CoachInput): CoachInput => ({
    ...input,
    constraints: { ...input.constraints, deload: deloadWeek },
  });
  /** Shown on a normal week, held back in a deload week. */
  function heldBack(input: CoachInput, source: string): void {
    expect(bySource(gatherSignals(input), source).length).toBeGreaterThan(0);
    expect(bySource(gatherSignals(inDeload(input)), source)).toEqual([]);
  }

  it('holds back load, rep and volume advice and a stalled route, and keeps the backup reminder', () => {
    const workout = withLift(planAt(gym), incline, { targetWeight: 50 });
    const input = inputFor(workout, gym, {
      strategy: [
        insight({ exerciseId: incline }),
        insight({
          kind: 'rep',
          recommendation: 'add-reps',
          exerciseId: 'dumbbell-shoulder-press',
          headline: 'Reps have flattened',
        }),
        insight({
          kind: 'coverage',
          recommendation: 'adjust-volume',
          muscle: 'triceps',
          headline: 'Triceps are under their weekly target',
        }),
      ],
      stalls: [stall(bench, 'stalled-at-effort')],
      routes: routeAt(bench, 0),
      workoutCount: 5,
      lastExportAt: undefined,
    });
    for (const source of [
      'strategy: load',
      'strategy: rep',
      'strategy: coverage',
      'stall: route',
    ]) {
      heldBack(input, source);
    }
    expect(bySource(gatherSignals(inDeload(input)), 'backup age')).toHaveLength(1);
  });

  it('holds back a muscle behind its week, whatever its tap', () => {
    // Nothing on the push day trains the lats: the tap adds an exercise or leads the next session.
    const input = inputFor(planAt(gym), gym, {
      strategy: [
        insight({
          kind: 'coverage',
          recommendation: 'adjust-volume',
          muscle: 'lats',
          headline: 'Lats are under their weekly target',
        }),
      ],
    });
    const [card] = bySource(gatherSignals(input), 'strategy: coverage');
    expect(
      card?.action?.kind === 'recalibrate' ? card.action.trigger.type : card?.action?.kind,
    ).toMatch(/^(add-exercise|focus)$/);
    heldBack(input, 'strategy: coverage');
  });

  it('holds back an extra set', () => {
    const workout = withLift(planAt(gym), bench, {}, { mode: 'weight', setsAdvice: 1 });
    heldBack(inputFor(workout, gym), 'extra set');
  });

  it('holds back a harder variation at the heaviest weight here', () => {
    const workout = withLift(
      planAt(lightHome),
      incline,
      { targetWeight: 20 },
      { mode: 'weight', capped: { at: 20 } },
    );
    heldBack(inputFor(workout, lightHome), 'capped');
  });

  it('holds back fewer reps over more sets', () => {
    const pull = planAt(gym, 'pull-arms');
    const chin = allEntries(pull.blocks).find((entry) => entry.exerciseId === 'chin-up');
    if (!chin) throw new Error('expected a chin-up on the pull day');
    const floor = chin.sets.find((set) => set.kind === 'working')?.targetReps[0] ?? 6;
    const workout = withLift(
      pull,
      'chin-up',
      { targetWeight: null },
      { mode: 'weight', short: { sessions: 2, floor } },
    );
    heldBack(inputFor(workout, gym), 'fewer reps');
  });

  it('holds back a drop set', () => {
    const planned = planAt(gym);
    // No drop set planned yet, so the coach can offer one.
    const workout: GeneratedWorkout = {
      ...planned,
      blocks: planned.blocks.map((block) => ({
        ...block,
        entries: block.entries.map((entry) => ({
          ...entry,
          dropSet: false,
          sets: entry.sets.filter((set) => set.kind !== 'drop'),
        })),
      })),
    };
    heldBack(inputFor(workout, gym), 'drop-set opportunity');
  });

  it('keeps a longer rest', () => {
    const input = inputFor(planAt(gym), gym, {
      strategy: [
        insight({
          kind: 'rep',
          recommendation: 'increase-rest',
          exerciseId: incline,
          headline: 'Incline Dumbbell Press fades late in the sets',
        }),
      ],
    });
    expect(labels(bySource(gatherSignals(inDeload(input)), 'strategy: rep'))).toEqual([
      'Rest 30 s longer',
    ]);
  });

  it('keeps the note on a lowered load', () => {
    const workout = withLift(planAt(gym), bench, { targetWeight: 115 }, { mode: 'deload' });
    const signals = gatherSignals(inDeload(inputFor(workout, gym)));
    expect(bySource(signals, 'progression')).toHaveLength(1);
  });
});
