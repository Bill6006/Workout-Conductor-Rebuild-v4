import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations, type LocationProfile } from '../../core/validation/location';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { gatherSignals, type CoachInput } from '../coach/coachConductor';
import type { CatchUpSpec } from '../planning/catchUp';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationResult,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from '../recalibration/types';
import { interpretFatigue } from '../recovery/fatigue';
import { analyzeStrategy } from '../strategy/strategy';
import { allEntries, isStopped, type GeneratedWorkout } from '../workout/types';
import { generateWorkout } from './generate';
import {
  at,
  describeWorkout,
  directFor,
  directSets,
  gym,
  lowestRir,
  profileOf,
  session,
  working,
} from '../../test/clockDays';

/**
 * Maintenance 31, the review of round M: a day off the plan, a catch-up built or a second workout,
 * holds to what it was built from on every path a lift can come in by. A muscle it leaves alone
 * gets no lift from the lift to push, a kept swap, or the swap "Hurts" makes; the lift that takes
 * what is left of a muscle trained today goes to no set to failure, and the coach offers it no set
 * more nor a drop set; the lift to push waits for its planned day. And through a rebuild (the
 * second review): the lift in front keeps to the catch-up through a day's setting, what comes in for
 * a lift keeps its reserve, a lift begun counts against its muscles, and a catch-up under way keeps
 * its own shorter length. And (the third review) a lift planned again for the place's weights, a max,
 * a change of place or busy equipment, or picked up again at the gym, keeps the catch-up's reserve
 * and its sets. Synthetic data only.
 */

const glutes = { muscle: 'glutes' as const, sets: 3, minRir: 1, why: 'behind' as const };
const build = (
  catchUp: CatchUpSpec,
  history: WorkoutRecord[],
  now: string,
  extra: { swaps?: { from: string; to: string; setAt: string; until: string }[] } = {},
  profile = profileOf(),
) =>
  generateWorkout({
    profile,
    location: gym,
    history,
    now,
    duration: 'default',
    constraints: { catchUp, ...extra },
  });

describe('a muscle a day off the plan leaves alone', () => {
  it('gets no lift from the lift to push on a second workout with nothing behind', () => {
    // This morning's leg extensions: the quads sit out. The squat is the lift being pushed.
    const workout = build(
      { kind: 'second', muscles: [], sitOut: ['quads'] },
      [session(at(9, 7), [['leg-extension', 3]])],
      at(9, 18),
      {},
      profileOf({ pushLift: { exerciseId: 'back-squat', target: 275, units: 'lb', since: at(1) } }),
    );
    expect(workout.explanation.reasons).toContain('Quads, trained today, sit out.');
    expect(
      directFor(workout, 'quads').map((entry) => entry.exerciseId),
      describeWorkout(workout).join('; '),
    ).toEqual([]);
  });

  describe('gets no lift from a kept swap', () => {
    // The trap-bar deadlift works the quads.
    const swap = {
      from: 'dumbbell-romanian-deadlift',
      to: 'trap-bar-deadlift',
      setAt: at(1),
      until: at(30),
    };

    it('the quads trained this morning, on a second workout', () => {
      const workout = build(
        { kind: 'second', muscles: [glutes], sitOut: ['quads'] },
        [session(at(9, 7), [['leg-extension', 3]])],
        at(9, 18),
        { swaps: [swap] },
      );
      expect(workout.explanation.reasons).toContain('Quads, trained today, sit out.');
      expect(
        directFor(workout, 'quads').map((entry) => entry.exerciseId),
        describeWorkout(workout).join('; '),
      ).toEqual([]);
    });

    it('the quads trained yesterday, on a catch-up', () => {
      const workout = build(
        { kind: 'catch-up', muscles: [glutes], sitOut: [] },
        [session(at(8, 18), [['leg-extension', 3]])],
        at(9, 18),
        { swaps: [swap] },
      );
      expect(workout.templateId).toBe('catch-up');
      expect(
        directFor(workout, 'quads').map((entry) => entry.exerciseId),
        describeWorkout(workout).join('; '),
      ).toEqual([]);
    });
  });

  it('gets no lift from the swap "Hurts" makes', () => {
    // The lower back hurts on the glutes' hinge, the quads sitting out: no squat in its place.
    const history = [session(at(9, 7), [['leg-extension', 3]])];
    const spec: CatchUpSpec = { kind: 'second', muscles: [glutes], sitOut: ['quads'] };
    const workout = build(spec, history, at(9, 18));
    expect(directFor(workout, 'quads')).toEqual([]);
    const hinge = allEntries(workout.blocks)[0]!;
    const request: RecalibrationRequest = {
      trigger: { type: 'pain', entryId: hinge.id, joint: 'lower-back' },
      workout,
      completed: emptyCompleted(),
      lockedEntryIds: [],
      currentEntryId: null,
      duration: 'default',
      profile: profileOf(),
      location: gym,
      loading: { missingPlates: [] },
      history,
      constraints: { ...emptyConstraints(), catchUp: spec },
      reason: 'test',
      timestamp: at(9, 18),
    };
    const result = recalibrate(request);
    expect(result.ok).toBe(true);
    expect(
      directFor(result.workout, 'quads').map((entry) => entry.exerciseId),
      describeWorkout(result.workout).join('; '),
    ).toEqual([]);
  });
});

describe('what is left of a muscle trained today', () => {
  // Bench press, flyes and lateral raises last Thursday; this Tuesday morning one set of pushdowns
  // before the workout was cut short. The triceps take what is left, at 3 or more in reserve.
  const history = [
    session(at(3, 18), [
      ['barbell-bench-press', 4],
      ['cable-fly', 3],
      ['lateral-raise', 5],
    ]),
    session(at(8, 7), [['cable-triceps-pushdown', 1]], { endedEarly: true }),
  ];
  const spec: CatchUpSpec = {
    kind: 'second',
    muscles: [
      { muscle: 'chest', sets: 3, minRir: 1, why: 'behind' },
      { muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' },
      { muscle: 'triceps', sets: 3, minRir: 3, why: 'remainder' },
    ],
    sitOut: [],
  };

  it('goes to no set to failure: no drop set on its lift, three or more in reserve', () => {
    const workout = build(spec, history, at(8, 18));
    expect(workout.explanation.reasons).toContain(
      'Triceps take only what is left of one session, three or more reps short of failure.',
    );
    const lift = allEntries(workout.blocks).find((entry) => entry.chosenFor.includes('triceps'));
    expect(lift).toBeDefined();
    const sets = lift!.sets.filter((set) => set.kind !== 'warmup');
    expect(
      sets.every((set) => set.targetRir >= 3),
      describeWorkout(workout).join('; '),
    ).toBe(true);
    expect(sets.some((set) => set.kind === 'drop')).toBe(false);
  });

  it('is given no set more nor a drop set by the coach', () => {
    // Pushdowns on Thursday and Sunday, and one set this morning before the workout was cut short.
    const profile = profileOf();
    const now = at(9, 18);
    const days = [
      session(at(3, 18), [['cable-triceps-pushdown', 3]]),
      session(at(6, 18), [['cable-triceps-pushdown', 3]]),
      session(at(9, 7), [['cable-triceps-pushdown', 1]], { endedEarly: true }),
    ];
    const remainderOnly: CatchUpSpec = {
      kind: 'second',
      muscles: [{ muscle: 'triceps', sets: 2, minRir: 3, why: 'remainder' }],
      sitOut: [],
    };
    const workout = build(remainderOnly, days, now);
    const [remainder] = allEntries(workout.blocks);
    expect(working(remainder!).every((set) => set.targetRir >= 3)).toBe(true);
    const harder = (catchUp: CatchUpSpec, full: boolean) => {
      const fatigue = interpretFatigue(days, now, null);
      const input: CoachInput = {
        workout,
        status: 'preview',
        duration: 'default',
        completed: emptyCompleted(),
        constraints: { ...emptyConstraints(), catchUp, ...(full ? { fullSession: true } : {}) },
        profile,
        history: days,
        now,
        fatigue,
        strategy: analyzeStrategy({ history: days, profile, now, fatigue }),
        lastExportAt: now,
        workoutCount: days.length,
        location: gym,
        swaps: [],
      };
      return gatherSignals(input)
        .filter(
          (signal) =>
            signal.action?.kind === 'recalibrate' &&
            ((signal.action.trigger.type === 'drop-set' && signal.action.trigger.on) ||
              (signal.action.trigger.type === 'sets' && signal.action.trigger.workingDelta > 0)) &&
            'entryId' in signal.action.trigger &&
            signal.action.trigger.entryId === remainder!.id,
        )
        .map((signal) => `${signal.source}: ${signal.headline}`);
    };
    // The same plan with the full session taken: the coach asks more of it (baseline).
    expect(harder(remainderOnly, true).length).toBeGreaterThan(0);
    expect(harder(remainderOnly, false), describeWorkout(workout).join('; ')).toEqual([]);
  });
});

describe('the coach on a catch-up', () => {
  it('offers the catch-up no set more, no drop set and no exercise', () => {
    // Four sessions in the fortnight and no arm work: the biceps behind, and their catch-up lift
    // the curl. With the full session taken, the coach offers all three (baseline).
    const profile = profileOf();
    const now = at(9, 18);
    const days = [
      session(at(1, 18), [['back-squat', 3]]),
      session(at(3, 18), [['barbell-bench-press', 3]]),
      session(at(5, 18), [['romanian-deadlift', 3]]),
      session(at(7, 18), [['leg-press', 3]]),
    ];
    const spec: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [{ muscle: 'biceps', sets: 3, minRir: 1, why: 'behind' }],
      sitOut: [],
    };
    const workout = build(spec, days, now);
    expect(workout.templateId).toBe('catch-up');
    const offers = (full: boolean) => {
      const fatigue = interpretFatigue(days, now, null);
      const input: CoachInput = {
        workout,
        status: 'preview',
        duration: 'default',
        completed: emptyCompleted(),
        constraints: {
          ...emptyConstraints(),
          catchUp: spec,
          ...(full ? { fullSession: true } : {}),
        },
        profile,
        history: days,
        now,
        fatigue,
        strategy: analyzeStrategy({ history: days, profile, now, fatigue }),
        lastExportAt: now,
        workoutCount: days.length,
        location: gym,
        swaps: [],
      };
      return new Set(
        gatherSignals(input).flatMap((signal) =>
          signal.action?.kind === 'recalibrate' ? [signal.action.trigger.type] : [],
        ),
      );
    };
    expect([...offers(true)]).toEqual(expect.arrayContaining(['sets', 'drop-set', 'add-exercise']));
    const off = offers(false);
    expect(off.has('sets') || off.has('drop-set') || off.has('add-exercise')).toBe(false);
  });
});

describe('the lift to push', () => {
  /** A plan done as planned, the lift to push's mark kept as a saved workout keeps it. */
  const done = (workout: GeneratedWorkout, when: string): WorkoutRecord => ({
    ...session(when, []),
    templateId: workout.templateId,
    entries: allEntries(workout.blocks).map((entry) => ({
      exerciseId: entry.exerciseId,
      ...(entry.push ? { push: entry.push } : {}),
      sets: working(entry).map((set) => ({
        kind: 'working' as const,
        reps: set.targetReps[0],
        weight: set.targetWeight ?? null,
        rir: set.targetRir,
        completed: true,
      })),
    })),
  });

  it('waits for its planned day: a Wednesday catch-up leaves Thursday its pushed row', () => {
    const profile = profileOf({
      pushLift: { exerciseId: 'barbell-row', target: 225, units: 'lb', since: at(1) },
    });
    // Monday lower, Tuesday push; Wednesday not ticked: the upper back and side delts behind.
    const week = [
      session(at(7, 18), [
        ['back-squat', 4],
        ['romanian-deadlift', 3],
        ['leg-extension', 3],
        ['leg-curl', 3],
      ]),
      session(at(8, 18), [
        ['barbell-bench-press', 4],
        ['incline-dumbbell-press', 3],
        ['cable-fly', 3],
        ['cable-triceps-pushdown', 3],
      ]),
    ];
    const spec: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [
        { muscle: 'upper-back', sets: 3, minRir: 1, why: 'behind' },
        { muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' },
      ],
      sitOut: [],
    };
    const wednesday = build(spec, week, at(9, 18), {}, profile);
    expect(wednesday.templateId).toBe('catch-up');
    const pushed = (workout: GeneratedWorkout) =>
      allEntries(workout.blocks)
        .filter((entry) => entry.push !== undefined)
        .map((entry) => `${entry.exerciseId} (${entry.push})`);
    const thursday = (history: WorkoutRecord[]) =>
      generateWorkout({ profile, location: gym, history, now: at(10, 18), duration: 'default' });
    // Without the catch-up, Thursday's pull day leads with the pushed row (baseline).
    expect(pushed(thursday(week))).toEqual(['barbell-row (natural)']);
    expect(
      pushed(thursday([...week, done(wednesday, at(9, 18))])),
      `Wednesday's catch-up: ${describeWorkout(wednesday).join('; ')}`,
    ).toEqual(['barbell-row (natural)']);
  });
});

/** A recalibration of a day's plan, as the store asks one. */
function requestFor(
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  spec: CatchUpSpec,
  history: WorkoutRecord[],
  now: string,
  options: {
    completed?: CompletedWork;
    currentEntryId?: string;
    profile?: ReturnType<typeof profileOf>;
  } = {},
): RecalibrationRequest {
  return {
    trigger,
    workout,
    completed: options.completed ?? emptyCompleted(),
    lockedEntryIds: [],
    currentEntryId: options.currentEntryId ?? null,
    duration: 'default',
    profile: options.profile ?? profileOf(),
    location: gym,
    loading: { missingPlates: [] },
    history,
    constraints: { ...emptyConstraints(), catchUp: spec },
    reason: 'test',
    timestamp: now,
  };
}

/** Under way: begun at `now`, `minutes` in, the lifter on `entryId`, the sets given logged. */
const underWay = (
  now: string,
  minutes: number,
  entryId: string,
  sets: CompletedWork['sets'] = [],
): CompletedWork => ({
  ...emptyCompleted(),
  startedAt: now,
  elapsedSeconds: minutes * 60,
  currentEntryId: entryId,
  sets,
});

/**
 * Tuesday the 8th: pushdowns last Thursday and Sunday, one set this morning before the workout was
 * cut short. The evening's second workout: the triceps take what is left, 2 sets at 3 in reserve.
 */
const remainderDay = {
  now: at(9, 18),
  history: [
    session(at(3, 18), [['cable-triceps-pushdown', 3]]),
    session(at(6, 18), [['cable-triceps-pushdown', 3]]),
    session(at(9, 7), [['cable-triceps-pushdown', 1]], { endedEarly: true }),
  ],
  spec: {
    kind: 'second',
    muscles: [{ muscle: 'triceps', sets: 2, minRir: 3, why: 'remainder' }],
    sitOut: [],
  } satisfies CatchUpSpec as CatchUpSpec,
};

describe('a day off the plan through a rebuild', () => {
  const { now, history, spec } = remainderDay;

  it('a low check-in, or "easier", never takes the lift in front under its reserve', () => {
    const workout = build(spec, history, now);
    const [lift] = allEntries(workout.blocks);
    expect(working(lift!).every((set) => set.targetRir >= 3)).toBe(true);
    const low = {
      energy: 2,
      soreness: 2,
      sleep: 3,
      motivation: 3,
      jointDiscomfort: [],
      timePressure: false,
    };
    for (const trigger of [
      { type: 'readiness' as const, readiness: low },
      { type: 'intensity' as const, direction: 'easier' as const },
    ]) {
      const result = recalibrate(
        requestFor(trigger, workout, spec, history, now, {
          completed: underWay(now, 2, lift!.id),
          currentEntryId: lift!.id,
        }),
      );
      expect(result.ok).toBe(true);
      expect(
        lowestRir(result.workout, 'triceps'),
        `${trigger.type}: ${describeWorkout(result.workout).join('; ')}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('"Make it harder" adds the lift in front no set and takes no reserve off it', () => {
    const workout = build(spec, history, now);
    const [lift] = allEntries(workout.blocks);
    const harder = { type: 'intensity' as const, direction: 'harder' as const };
    // With no lift in front, the rebuild holds the remainder at 2 sets, 3 in reserve (baseline).
    const fresh = recalibrate(requestFor(harder, workout, spec, history, now));
    expect(directSets(fresh.workout, 'triceps')).toBeLessThanOrEqual(2);
    expect(lowestRir(fresh.workout, 'triceps')).toBeGreaterThanOrEqual(3);
    const result = recalibrate(
      requestFor(harder, workout, spec, history, now, {
        completed: underWay(now, 2, lift!.id),
        currentEntryId: lift!.id,
      }),
    );
    const lifts = describeWorkout(result.workout).join('; ');
    expect(directSets(result.workout, 'triceps'), lifts).toBeLessThanOrEqual(2);
    expect(lowestRir(result.workout, 'triceps'), lifts).toBeGreaterThanOrEqual(3);
  });

  it('what comes in for a lift, by "Uncomfortable" or a swap, keeps its reserve', () => {
    const workout = build(spec, history, now);
    const [lift] = allEntries(workout.blocks);
    for (const trigger of [
      { type: 'uncomfortable' as const, entryId: lift!.id },
      { type: 'replace' as const, entryId: lift!.id, exerciseId: 'overhead-triceps-extension' },
    ]) {
      const result = recalibrate(requestFor(trigger, workout, spec, history, now));
      expect(result.ok).toBe(true);
      expect(
        lowestRir(result.workout, 'triceps'),
        `${trigger.type}: ${describeWorkout(result.workout).join('; ')}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('a beginner’s catch-up keeps its 2 in reserve through "Uncomfortable"', () => {
    const beginner = profileOf({ experience: 'beginner' });
    const sideDelts: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [{ muscle: 'side-delts', sets: 2, minRir: 2, why: 'behind' }],
      sitOut: [],
    };
    const workout = build(sideDelts, history, now, {}, beginner);
    const [lift] = allEntries(workout.blocks);
    expect(lowestRir(workout, 'side-delts')).toBeGreaterThanOrEqual(2);
    const result = recalibrate(
      requestFor({ type: 'uncomfortable', entryId: lift!.id }, workout, sideDelts, history, now, {
        profile: beginner,
      }),
    );
    expect(
      lowestRir(result.workout, 'side-delts'),
      describeWorkout(result.workout).join('; '),
    ).toBeGreaterThanOrEqual(2);
  });

  it('a lift begun counts against its muscles: the triceps’ remainder stays 2', () => {
    // Bench press, flyes and lateral raises last Thursday; one set of pushdowns this Tuesday
    // morning. Tonight: the chest behind (3 at 1 in reserve), the triceps' remainder 2 at 3.
    const days = [
      session(at(3, 18), [
        ['barbell-bench-press', 4],
        ['cable-fly', 3],
        ['lateral-raise', 5],
      ]),
      session(at(8, 7), [['cable-triceps-pushdown', 1]], { endedEarly: true }),
    ];
    const both: CatchUpSpec = {
      kind: 'second',
      muscles: [
        { muscle: 'chest', sets: 3, minRir: 1, why: 'behind' },
        { muscle: 'triceps', sets: 2, minRir: 3, why: 'remainder' },
      ],
      sitOut: [],
    };
    const evening = at(8, 18);
    const workout = build(both, days, evening);
    // As built: the bench press takes the triceps' 2, and their own slot rests.
    expect(directSets(workout, 'triceps'), describeWorkout(workout).join('; ')).toBe(2);
    const [bench] = allEntries(workout.blocks);
    const first = working(bench!)[0]!;
    const logged = underWay(evening, 5, bench!.id, [
      {
        entryId: bench!.id,
        exerciseId: bench!.exerciseId,
        setIndex: first.index,
        kind: 'working',
        reps: 10,
        weight: first.targetWeight,
        rir: 3,
        completedAt: evening,
      },
    ]);
    for (const trigger of [
      { type: 'resume' as const, awaySeconds: 25 * 60 },
      { type: 'duration' as const, choice: 45 as const },
    ]) {
      const result = recalibrate(
        requestFor(trigger, workout, both, days, at(8, 18, 30), {
          completed: logged,
          currentEntryId: bench!.id,
        }),
      );
      expect(
        directSets(result.workout, 'triceps'),
        `${trigger.type}: ${describeWorkout(result.workout).join('; ')}`,
      ).toBeLessThanOrEqual(2);
    }
  });

  it('a catch-up under way keeps its own length: 35 minutes left ten minutes into 45', () => {
    const twoBehind: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [
        { muscle: 'chest', sets: 3, minRir: 1, why: 'behind' },
        { muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' },
      ],
      sitOut: [],
    };
    const days = [session(at(7, 18), [['back-squat', 3]])];
    const evening = at(9, 18);
    const workout = build(twoBehind, days, evening);
    expect(workout.duration.targetMinutes).toBe(45);
    const [first] = allEntries(workout.blocks);
    const result = recalibrate(
      requestFor(
        { type: 'resume', awaySeconds: 25 * 60 },
        workout,
        twoBehind,
        days,
        at(9, 18, 40),
        {
          completed: underWay(evening, 10, first!.id),
          currentEntryId: first!.id,
        },
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.workout.duration.targetMinutes).toBeLessThanOrEqual(35);
  });

  it('a change to one lift late in a catch-up says how far over its own minutes left', () => {
    const twoBehind: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [
        { muscle: 'chest', sets: 3, minRir: 1, why: 'behind' },
        { muscle: 'side-delts', sets: 3, minRir: 1, why: 'behind' },
      ],
      sitOut: [],
    };
    const days = [session(at(7, 18), [['back-squat', 3]])];
    const evening = at(9, 18);
    const workout = build(twoBehind, days, evening);
    const [first] = allEntries(workout.blocks);
    // 35 minutes into the 45: 10 left, not the Default's 25.
    const result = recalibrate(
      requestFor(
        { type: 'sets', entryId: first!.id, workingDelta: 1 },
        workout,
        twoBehind,
        days,
        at(9, 18, 35),
        { completed: underWay(evening, 35, first!.id), currentEntryId: first!.id },
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.workout.compromises.join(' ')).toMatch(/over the 10 min left/);
  });
});

describe('a day off the plan through a rebuild, the third review of round M', () => {
  const { now, history, spec } = remainderDay;
  const [home, gymPlace] = createDefaultLocations({ gymAccess: true }, at(1));
  const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');

  it('the place’s weights, or a plate missing today, keep what is left of the triceps at 3 in reserve', () => {
    const workout = build(spec, history, now);
    expect(lowestRir(workout, 'triceps')).toBeGreaterThanOrEqual(3);
    const result = recalibrate(requestFor({ type: 'loading' }, workout, spec, history, now));
    expect(result.ok).toBe(true);
    // Before: "skull-crusher x2 @RIR 1/1", the lift's own reserve.
    expect(lowestRir(result.workout, 'triceps'), lifts(result.workout)).toBeGreaterThanOrEqual(3);
  });

  it('a max entered for the lift keeps it at 3 in reserve', () => {
    const workout = build(spec, history, now);
    const [lift] = allEntries(workout.blocks);
    const result = recalibrate(
      requestFor({ type: 'max', exerciseId: lift!.exerciseId }, workout, spec, history, now),
    );
    expect(result.ok).toBe(true);
    expect(lowestRir(result.workout, 'triceps'), lifts(result.workout)).toBeGreaterThanOrEqual(3);
  });

  it('a change of place keeps the lift in front at 3 in reserve', () => {
    const workout = build(spec, history, now);
    const [lift] = allEntries(workout.blocks);
    const result = recalibrate(
      requestFor({ type: 'location' }, workout, spec, history, now, {
        completed: underWay(now, 2, lift!.id),
        currentEntryId: lift!.id,
      }),
    );
    expect(result.ok).toBe(true);
    expect(lowestRir(result.workout, 'triceps'), lifts(result.workout)).toBeGreaterThanOrEqual(3);
  });

  it('a lift moved behind another for busy equipment keeps both muscles at 3 in reserve', () => {
    // Pushdowns and curls last Thursday and Sunday, one set of each this morning: tonight the
    // triceps and the biceps each take what is left, 2 sets at 3 in reserve.
    const days = [
      session(at(3, 18), [
        ['cable-triceps-pushdown', 3],
        ['barbell-curl', 3],
      ]),
      session(at(6, 18), [
        ['cable-triceps-pushdown', 3],
        ['barbell-curl', 3],
      ]),
      session(
        at(9, 7),
        [
          ['cable-triceps-pushdown', 1],
          ['barbell-curl', 1],
        ],
        { endedEarly: true },
      ),
    ];
    const arms: CatchUpSpec = {
      kind: 'second',
      muscles: [
        { muscle: 'triceps', sets: 2, minRir: 3, why: 'remainder' },
        { muscle: 'biceps', sets: 2, minRir: 3, why: 'remainder' },
      ],
      sitOut: [],
    };
    // Supersets off, so the two lifts are rows of their own and one can wait behind the other.
    const base = profileOf();
    const profile = profileOf({ techniques: { ...base.techniques, supersets: false } });
    const workout = build(arms, days, now, {}, profile);
    expect(Math.min(lowestRir(workout, 'triceps'), lowestRir(workout, 'biceps'))).toBe(3);
    const [first] = allEntries(workout.blocks);
    const result = recalibrate(
      requestFor({ type: 'equipment-busy', entryId: first!.id }, workout, arms, days, now, {
        profile,
      }),
    );
    expect(result.ok).toBe(true);
    expect(allEntries(result.workout.blocks)[0]!.id, lifts(result.workout)).not.toBe(first!.id);
    // Before: both rows planned again at their role's 1 in reserve.
    expect(lowestRir(result.workout, 'triceps'), lifts(result.workout)).toBeGreaterThanOrEqual(3);
    expect(lowestRir(result.workout, 'biceps'), lifts(result.workout)).toBeGreaterThanOrEqual(3);
  });

  /**
   * One set of the first lift done at the gym, then home, with no bar for it, then the gym again,
   * the lifter on the lift standing in for it there or on none.
   */
  function roundTrip(day: CatchUpSpec, records: WorkoutRecord[], when: string, onStandIn = false) {
    const workout = build(day, records, when);
    const [lift] = allEntries(workout.blocks);
    const first = working(lift!)[0]!;
    const sets: CompletedWork['sets'] = [
      {
        entryId: lift!.id,
        exerciseId: lift!.exerciseId,
        setIndex: first.index,
        kind: 'working',
        reps: 10,
        weight: first.targetWeight,
        rir: 3,
        completedAt: when,
      },
    ];
    const atHome = recalibrate({
      ...requestFor({ type: 'location' }, workout, day, records, when, {
        completed: { ...underWay(when, 5, lift!.id, sets), currentEntryId: null },
      }),
      location: home,
      timestamp: at(9, 18, 10),
    });
    expect(atHome.ok).toBe(true);
    const standIn = allEntries(atHome.workout.blocks).find(
      (entry) => !isStopped(entry) && entry.slot === lift!.slot,
    );
    const on = onStandIn ? (standIn?.id ?? null) : null;
    const back = recalibrate({
      ...requestFor({ type: 'location' }, atHome.workout, day, records, when, {
        completed: { ...underWay(when, 10, lift!.id, sets), currentEntryId: on },
        ...(on ? { currentEntryId: on } : {}),
      }),
      location: gymPlace,
      timestamp: at(9, 18, 20),
    });
    expect(back.ok).toBe(true);
    return { workout, atHome: atHome.workout, back: back.workout };
  }

  it('a lift stopped at home and picked up again at the gym keeps 3 in reserve', () => {
    const { atHome, back } = roundTrip(spec, history, now);
    expect(lowestRir(atHome, 'triceps')).toBeGreaterThanOrEqual(3);
    // Before: "skull-crusher x2 @RIR 3/1", the set picked up at the lift's own reserve.
    expect(lowestRir(back, 'triceps'), lifts(back)).toBeGreaterThanOrEqual(3);
  });

  it('the bench press picked up again at the gym counts against the triceps', () => {
    const presses: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [
        { muscle: 'chest', sets: 3, minRir: 1, why: 'behind' },
        { muscle: 'triceps', sets: 3, minRir: 1, why: 'behind' },
      ],
      sitOut: [],
    };
    const { workout, atHome, back } = roundTrip(
      presses,
      [session(at(3, 18), [['back-squat', 3]])],
      at(9, 18),
    );
    expect(directSets(workout, 'triceps'), lifts(workout)).toBe(3);
    expect(directSets(atHome, 'triceps'), lifts(atHome)).toBe(3);
    // Before: "barbell-bench-press x3; cable-triceps-pushdown x2", 5 triceps sets for their 3.
    expect(directSets(back, 'triceps'), lifts(back)).toBeLessThanOrEqual(3);
    // The bench press picks up its sets again, the stand-in's given back.
    const bench = allEntries(back.blocks).find(
      (entry) => entry.exerciseId === 'barbell-bench-press' && !isStopped(entry),
    );
    expect(bench, lifts(back)).toBeDefined();
    expect(working(bench!), lifts(back)).toHaveLength(3);
  });

  it('the bench press picked up again, the lifter on its stand-in, takes back the stand-in’s sets', () => {
    const presses: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [
        { muscle: 'chest', sets: 3, minRir: 1, why: 'behind' },
        { muscle: 'triceps', sets: 3, minRir: 1, why: 'behind' },
      ],
      sitOut: [],
    };
    const { back } = roundTrip(presses, [session(at(3, 18), [['back-squat', 3]])], at(9, 18), true);
    const bench = allEntries(back.blocks).find(
      (entry) => entry.exerciseId === 'barbell-bench-press' && !isStopped(entry),
    );
    // Counted against the chest and the triceps still, the stand-in left the bench press no sets.
    expect(bench, lifts(back)).toBeDefined();
    expect(working(bench!), lifts(back)).toHaveLength(3);
    expect(directSets(back, 'triceps'), lifts(back)).toBeLessThanOrEqual(3);
  });

  it('a lasting swap to a lift that misses the catch-up’s muscle waits: the glutes keep theirs', () => {
    const swap = { from: 'back-squat', to: 'front-squat', setAt: at(1), until: at(30) };
    const workout = build(
      { kind: 'catch-up', muscles: [glutes], sitOut: [] },
      [session(at(3, 18), [['barbell-row', 3]])],
      now,
      { swaps: [swap] },
    );
    const exercises = allEntries(workout.blocks).map((entry) => entry.exerciseId);
    // Before the slot's muscle counted, the swap put in the front squat, for the quads alone.
    expect(exercises, lifts(workout)).not.toContain('front-squat');
    expect(directSets(workout, 'glutes'), lifts(workout)).toBeGreaterThan(0);
  });

  it('"harder" gives the lift in front no set its muscles have no room for', () => {
    // The bench press gives the chest its 2 sets and the triceps 2 of their 4; the pushdown takes the
    // 2 left. "Harder" on the pushdown took it to the triceps' own 4, and the rebuild, counting it
    // first, put a cable fly in the bench press's place.
    const day: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [
        { muscle: 'chest', sets: 2, minRir: 1, why: 'behind' },
        { muscle: 'triceps', sets: 4, minRir: 1, why: 'behind' },
      ],
      sitOut: [],
    };
    const records = [session(at(3, 18), [['back-squat', 3]])];
    const workout = build(day, records, now);
    const pushdown = allEntries(workout.blocks).find(
      (entry) => requireExercise(entry.exerciseId).movementPattern === 'elbow-extension',
    )!;
    expect(working(pushdown), lifts(workout)).toHaveLength(2);
    const result = recalibrate(
      requestFor({ type: 'intensity', direction: 'harder' }, workout, day, records, now, {
        completed: underWay(now, 2, pushdown.id),
        currentEntryId: pushdown.id,
      }),
    );
    expect(result.ok).toBe(true);
    const after = allEntries(result.workout.blocks).find((entry) => entry.id === pushdown.id)!;
    expect(working(after), lifts(result.workout)).toHaveLength(2);
    expect(
      allEntries(result.workout.blocks).map((entry) => entry.exerciseId),
      lifts(result.workout),
    ).toContain('barbell-bench-press');
    expect(directSets(result.workout, 'triceps'), lifts(result.workout)).toBeLessThanOrEqual(4);
  });

  it('"harder" gives a lift in front the set its muscle has room for, as a plan made harder does', () => {
    // Foundation plans an isolation lift's 2 sets: the biceps have room for 3.
    const profile = profileOf({ programStyle: 'foundation' });
    const day: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [{ muscle: 'biceps', sets: 3, minRir: 1, why: 'behind' }],
      sitOut: [],
    };
    const records = [session(at(3, 18), [['back-squat', 3]])];
    const workout = build(day, records, now, {}, profile);
    const [curl] = allEntries(workout.blocks);
    expect(working(curl!), lifts(workout)).toHaveLength(2);
    const result = recalibrate(
      requestFor({ type: 'intensity', direction: 'harder' }, workout, day, records, now, {
        completed: underWay(now, 2, curl!.id),
        currentEntryId: curl!.id,
        profile,
      }),
    );
    expect(result.ok).toBe(true);
    const after = allEntries(result.workout.blocks).find((entry) => entry.id === curl!.id)!;
    expect(working(after), lifts(result.workout)).toHaveLength(3);
    expect(lowestRir(result.workout, 'biceps')).toBeGreaterThanOrEqual(1);
  });
});

describe('a slot two catch-up muscles share, the fourth review of round M', () => {
  const both = (first: 'quads' | 'biceps', second: 'glutes' | 'forearms'): CatchUpSpec => ({
    kind: 'catch-up',
    muscles: [first, second].map((muscle) => ({ muscle, sets: 3, minRir: 1, why: 'behind' })),
    sitOut: [],
  });
  // A row last Thursday: nothing the catch-up is for rests today.
  const records = [session(at(3, 18), [['barbell-row', 3]])];
  const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
  const swapped = (from: string, to: string) => ({
    swaps: [{ from, to, setAt: at(1), until: at(30) }],
  });

  it('a lasting swap to a lift for one of them waits: the glutes keep their sets', () => {
    const workout = build(
      both('quads', 'glutes'),
      records,
      at(9, 18),
      swapped('back-squat', 'front-squat'),
    );
    expect(directSets(workout, 'quads'), lifts(workout)).toBeGreaterThan(0);
    // Before: "front-squat x3" alone, and "Why this workout" named the quads only.
    expect(directSets(workout, 'glutes'), lifts(workout)).toBeGreaterThan(0);
  });

  it('... and the forearms theirs, the hammer curl swapped for a dumbbell curl', () => {
    const workout = build(
      both('biceps', 'forearms'),
      records,
      at(9, 18),
      swapped('hammer-curl', 'dumbbell-curl'),
    );
    expect(directSets(workout, 'biceps'), lifts(workout)).toBeGreaterThan(0);
    expect(directSets(workout, 'forearms'), lifts(workout)).toBeGreaterThan(0);
  });

  it('a lift swapped out for weeks gives them no slot to share where it was the one for both', () => {
    // A barbell, a rack and a bench: the back squat, swapped for the front squat, was the one squat
    // there for the quads and the glutes; the Romanian deadlift is there for the glutes.
    const [rack] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['barbell', 'squat-rack', 'flat-bench'] },
      at(1),
    );
    const workout = generateWorkout({
      profile: profileOf(),
      location: rack,
      history: records,
      now: at(9, 18),
      duration: 'default',
      constraints: { catchUp: both('quads', 'glutes'), ...swapped('back-squat', 'front-squat') },
    });
    expect(directSets(workout, 'quads'), lifts(workout)).toBeGreaterThan(0);
    // Sharing the squat's slot through the back squat, the glutes had the front squat alone.
    expect(directSets(workout, 'glutes'), lifts(workout)).toBeGreaterThan(0);
  });

  it('the lift to push, giving its place up, gives the muscles no slot to share', () => {
    // A barbell, a rack and a bench: the back squat, the lift to push, is the one squat for the
    // quads and the glutes, and the Romanian deadlift is there for the glutes.
    const [rack] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['barbell', 'squat-rack', 'flat-bench'] },
      at(1),
    );
    const workout = generateWorkout({
      profile: profileOf({
        pushLift: { exerciseId: 'back-squat', target: 275, units: 'lb', since: at(1) },
      }),
      location: rack,
      history: [...records, session(at(1, 18), [['back-squat', 3]])],
      now: at(9, 18),
      duration: 'default',
      constraints: { catchUp: both('quads', 'glutes') },
    });
    expect(directSets(workout, 'quads'), lifts(workout)).toBeGreaterThan(0);
    // Before: "front-squat x3" alone, the push giving way off the plan.
    expect(directSets(workout, 'glutes'), lifts(workout)).toBeGreaterThan(0);
  });
});

describe('a lift kept through a catch-up laid out again, the fifth review of round M', () => {
  const behind = (...muscles: ('quads' | 'glutes' | 'chest' | 'biceps')[]) =>
    muscles.map((muscle) => ({ muscle, sets: 3, minRir: 1, why: 'behind' as const }));
  // A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm.
  const records = [session(at(3, 18), [['barbell-row', 3]])];
  const NOW = at(9, 18);
  const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
  /** Home with a pull-up bar only: the quads take the split squat, the chest the push-up. */
  const [home] = createDefaultLocations(
    { gymAccess: false, homeEquipment: ['pull-up-bar'] },
    at(1),
  ) as [LocationProfile];
  const [rack] = createDefaultLocations(
    { gymAccess: false, homeEquipment: ['barbell', 'squat-rack', 'flat-bench'] },
    at(1),
  ) as [LocationProfile];
  const plan = (
    spec: CatchUpSpec,
    location: LocationProfile | undefined,
    extra: object = {},
    profile = profileOf(),
  ) =>
    generateWorkout({
      profile,
      location,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec, ...extra },
    });
  /** A rebuild at a place, as the store asks one. */
  const rebuildAt = (
    trigger: RecalibrationTrigger,
    workout: GeneratedWorkout,
    spec: CatchUpSpec,
    location: LocationProfile | undefined,
    options: Partial<RecalibrationRequest> = {},
  ): RecalibrationRequest => ({
    ...requestFor(trigger, workout, spec, records, NOW),
    location,
    ...options,
  });
  /** The workout with the entry of this exercise pinned, as the pin trigger leaves it. */
  const pinned = (workout: GeneratedWorkout, exerciseId: string): GeneratedWorkout => {
    const copy = structuredClone(workout);
    const entry = allEntries(copy.blocks).find((candidate) => candidate.exerciseId === exerciseId);
    if (!entry) throw new Error(`${exerciseId} is not in ${lifts(workout)}`);
    entry.pinned = true;
    return copy;
  };

  it('a pinned push-up keeps its slot when a squat rack comes in at home, the quads theirs', () => {
    const spec: CatchUpSpec = { kind: 'catch-up', muscles: behind('quads', 'chest'), sitOut: [] };
    const before = plan(spec, home);
    // At home: "push-up x3; bulgarian-split-squat x3", the push-up's strength slot first.
    expect(directSets(before, 'quads'), lifts(before)).toBeGreaterThan(0);
    const racked: LocationProfile = {
      ...home,
      equipment: [...home.equipment, 'barbell', 'squat-rack'],
    };
    const result = recalibrate(
      rebuildAt({ type: 'equipment' }, pinned(before, 'push-up'), spec, racked),
    );
    expect(result.ok).toBe(true);
    expect(result.scope).toBe('partial');
    // Before: "push-up x3" alone, kept in slot 0, which a layout made again gave the quads' squat.
    expect(directSets(result.workout, 'quads'), lifts(result.workout)).toBeGreaterThan(0);
  });

  it('a second workout begun at home keeps the quads their lift at the gym', () => {
    // The row this morning: the lats and the upper back sit out tonight.
    const morning = [...records, session(at(9, 7), [['barbell-row', 3]])];
    const spec: CatchUpSpec = {
      kind: 'second',
      muscles: behind('quads', 'chest'),
      sitOut: ['lats', 'upper-back'],
    };
    const before = generateWorkout({
      profile: profileOf(),
      location: home,
      history: morning,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec },
    });
    const [first] = allEntries(before.blocks);
    expect(first?.exerciseId, lifts(before)).toBe('push-up');
    const set = working(first!)[0]!;
    const sets: CompletedWork['sets'] = [
      {
        entryId: first!.id,
        exerciseId: first!.exerciseId,
        setIndex: set.index,
        kind: 'working',
        reps: 12,
        weight: null,
        rir: 2,
        completedAt: NOW,
      },
    ];
    const result = recalibrate(
      rebuildAt({ type: 'location' }, before, spec, gym, {
        history: morning,
        completed: underWay(NOW, 5, first!.id, sets),
        currentEntryId: first!.id,
      }),
    );
    expect(result.ok).toBe(true);
    // Before: "push-up x3" alone at the gym, the push-up begun in the gym's squat slot.
    expect(directSets(result.workout, 'quads'), lifts(result.workout)).toBeGreaterThan(0);
  });

  it('a pinned curl keeps its slot at a rack, where the glutes take a hinge of their own', () => {
    // The back squat swapped for the front squat: at the gym the leg press works the quads and the
    // glutes together, one slot; at a rack the glutes take a hinge slot of their own, the second.
    const spec: CatchUpSpec = {
      kind: 'catch-up',
      muscles: behind('quads', 'glutes', 'biceps'),
      sitOut: [],
    };
    const swaps = [{ from: 'back-squat', to: 'front-squat', setAt: at(1), until: at(30) }];
    const profile = profileOf({
      exercisePreferences: { preferred: ['Barbell Curl'], disliked: [] },
    });
    const atGym = plan(spec, gym, { swaps }, profile);
    expect(directSets(atGym, 'glutes'), lifts(atGym)).toBeGreaterThan(0);
    const result = recalibrate(
      rebuildAt({ type: 'location' }, pinned(atGym, 'barbell-curl'), spec, rack, {
        profile,
        swaps,
      }),
    );
    expect(result.ok).toBe(true);
    // Before: "front-squat x3; barbell-curl x3", the pinned curl in the glutes' hinge slot.
    expect(directSets(result.workout, 'glutes'), lifts(result.workout)).toBeGreaterThan(0);
  });
});

describe('a kept lift and the muscles it misses, the sixth review of round M', () => {
  const behind = (...muscles: ('quads' | 'glutes')[]) =>
    muscles.map((muscle) => ({ muscle, sets: 3, minRir: 1, why: 'behind' as const }));
  // A row last Thursday: nothing the day is for rests on Wednesday the 9th, at 6 pm.
  const records = [session(at(3, 18), [['barbell-row', 3]])];
  const NOW = at(9, 18);
  const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
  const succeeded = (result: RecalibrationResult): RecalibrationSuccess => {
    if (!result.ok) throw new Error(result.error);
    return result;
  };
  const rebuildAt = (
    trigger: RecalibrationTrigger,
    workout: GeneratedWorkout,
    spec: CatchUpSpec,
    location: LocationProfile | undefined,
    options: Partial<RecalibrationRequest> = {},
  ): RecalibrationRequest => ({
    ...requestFor(trigger, workout, spec, records, NOW),
    location,
    ...options,
  });
  const plan = (spec: CatchUpSpec, location: LocationProfile | undefined, extra: object = {}) =>
    generateWorkout({
      profile: profileOf(),
      location,
      history: records,
      now: NOW,
      duration: 'default',
      constraints: { catchUp: spec, ...extra },
    });

  describe('a lift for one of two muscles that share a slot', () => {
    // The back squat swapped for the front squat for weeks: at a home rack the quads take the front
    // squat and the glutes a hinge of their own; at the gym the leg press works both, one slot.
    const swaps = [{ from: 'back-squat', to: 'front-squat', setAt: at(1), until: at(30) }];
    const [rack] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['barbell', 'squat-rack', 'flat-bench'] },
      at(1),
    ) as [LocationProfile];
    const spec: CatchUpSpec = { kind: 'catch-up', muscles: behind('quads', 'glutes'), sitOut: [] };

    it('a front squat pinned at the rack leaves the glutes a lift of their own at the gym', () => {
      const before = plan(spec, rack, { swaps });
      expect(directSets(before, 'glutes'), lifts(before)).toBeGreaterThan(0);
      const pinned = structuredClone(before);
      const front = allEntries(pinned.blocks).find((entry) => entry.exerciseId === 'front-squat')!;
      front.pinned = true;
      const result = recalibrate(rebuildAt({ type: 'location' }, pinned, spec, gym, { swaps }));
      expect(result.ok).toBe(true);
      expect(result.scope).toBe('partial');
      // Before: "front-squat x3" alone, in the slot the quads and the glutes share at the gym.
      expect(directSets(result.workout, 'glutes'), lifts(result.workout)).toBeGreaterThan(0);
    });

    it('... and so does one begun there', () => {
      const before = plan(spec, rack, { swaps });
      const front = allEntries(before.blocks).find((entry) => entry.exerciseId === 'front-squat')!;
      const set = working(front)[0]!;
      const sets: CompletedWork['sets'] = [
        {
          entryId: front.id,
          exerciseId: front.exerciseId,
          setIndex: set.index,
          kind: 'working',
          reps: 8,
          weight: 135,
          rir: 2,
          completedAt: NOW,
        },
      ];
      const result = recalibrate(
        rebuildAt({ type: 'location' }, before, spec, gym, {
          swaps,
          completed: underWay(NOW, 5, front.id, sets),
          currentEntryId: front.id,
        }),
      );
      expect(result.ok).toBe(true);
      expect(directSets(result.workout, 'glutes'), lifts(result.workout)).toBeGreaterThan(0);
    });
  });

  it('a swap made at the rack, in the gym’s shared slot, leaves the quads a lift of their own', () => {
    // At the rack the glutes' Romanian deadlift is swapped for the hip thrust; at the gym the quads
    // and the glutes share one slot, which the hip thrust takes: it holds no slot it was swapped
    // in for there, so the quads, which it misses, take their own.
    const swaps = [{ from: 'back-squat', to: 'front-squat', setAt: at(1), until: at(30) }];
    const [rack] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['barbell', 'squat-rack', 'flat-bench'] },
      at(1),
    ) as [LocationProfile];
    const spec: CatchUpSpec = { kind: 'catch-up', muscles: behind('quads', 'glutes'), sitOut: [] };
    const before = plan(spec, rack, { swaps });
    const hinge = allEntries(before.blocks).find(
      (entry) => entry.exerciseId === 'romanian-deadlift',
    );
    expect(hinge, lifts(before)).toBeDefined();
    const swap = succeeded(
      recalibrate(
        rebuildAt(
          { type: 'replace', entryId: hinge!.id, exerciseId: 'hip-thrust' },
          before,
          spec,
          rack,
          { swaps },
        ),
      ),
    );
    const result = succeeded(
      recalibrate(
        rebuildAt({ type: 'location' }, swap.workout, spec, gym, {
          swaps,
          constraints: swap.constraints,
        }),
      ),
    );
    expect(allEntries(result.workout.blocks).map((entry) => entry.exerciseId)).toContain(
      'hip-thrust',
    );
    expect(directSets(result.workout, 'quads'), lifts(result.workout)).toBeGreaterThan(0);
  });

  it('a lift begun at home keeps its place at the gym, the catch-up laid out as at home', () => {
    const behindThree = (muscle: 'quads' | 'chest') =>
      ({ muscle, sets: 3, minRir: 1, why: 'behind' }) as const;
    const spec: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [behindThree('quads'), behindThree('chest')],
      sitOut: [],
    };
    const [home] = createDefaultLocations(
      { gymAccess: false, homeEquipment: ['pull-up-bar'] },
      at(1),
    ) as [LocationProfile];
    const before = plan(spec, home);
    const [first] = allEntries(before.blocks);
    expect(first?.exerciseId, lifts(before)).toBe('push-up');
    const set = working(first!)[0]!;
    const sets: CompletedWork['sets'] = [
      {
        entryId: first!.id,
        exerciseId: first!.exerciseId,
        setIndex: set.index,
        kind: 'working',
        reps: 12,
        weight: null,
        rir: 2,
        completedAt: NOW,
      },
    ];
    const result = succeeded(
      recalibrate(
        rebuildAt({ type: 'location' }, before, spec, gym, {
          completed: underWay(NOW, 5, first!.id, sets),
          currentEntryId: first!.id,
        }),
      ),
    );
    // The catch-up keeps the slots it was laid out in: the push-up begun stays in front, and the
    // quads keep their lunge (laid out again at the gym, the push-up fell behind the squat).
    expect(
      allEntries(result.workout.blocks).map(
        (entry) => requireExercise(entry.exerciseId).movementPattern,
      ),
      lifts(result.workout),
    ).toEqual(['horizontal-push', 'lunge']);
    expect(result.workout.catchUpSlots, lifts(result.workout)).toEqual(before.catchUpSlots);
  });

  it('a kept lift for none of the day’s muscles takes no slot, and keeps none', () => {
    // A leg curl pinned in the first slot of a plan, kept through a catch-up for the chest.
    const lower = plan({ kind: 'catch-up', muscles: [], sitOut: [] }, gym, { templateId: 'lower' });
    const curl = allEntries(lower.blocks).find((entry) => entry.exerciseId === 'leg-curl');
    expect(curl, lifts(lower)).toBeDefined();
    const chest: CatchUpSpec = {
      kind: 'catch-up',
      muscles: [{ muscle: 'chest', sets: 3, minRir: 1, why: 'behind' }],
      sitOut: [],
    };
    const workout = plan(chest, gym, {
      keep: [{ entry: { ...structuredClone(curl!), slot: 0, pinned: true }, frozen: false }],
    });
    const entries = allEntries(workout.blocks);
    expect(
      entries.map((entry) => entry.exerciseId),
      lifts(workout),
    ).toContain('leg-curl');
    const slots = entries.map((entry) => entry.slot).filter((slot) => slot !== undefined);
    expect(new Set(slots).size, lifts(workout)).toBe(slots.length);
  });

  describe('a swap to a lift for none of the day’s muscles', () => {
    // A glutes catch-up at the gym: the back squat, swapped by the lifter for the front squat, which
    // works the glutes only at half. The swap holds its slot: the glutes wait, as it chose.
    const spec: CatchUpSpec = { kind: 'catch-up', muscles: behind('glutes'), sitOut: [] };
    const swapped = () => {
      const before = plan(spec, gym);
      const [squat] = allEntries(before.blocks);
      expect(squat?.exerciseId, lifts(before)).toBe('back-squat');
      const result = succeeded(
        recalibrate(
          rebuildAt(
            { type: 'replace', entryId: squat!.id, exerciseId: 'front-squat' },
            before,
            spec,
            gym,
          ),
        ),
      );
      expect(allEntries(result.workout.blocks).map((entry) => entry.exerciseId)).toEqual([
        'front-squat',
      ]);
      return result;
    };
    const exercises = (result: RecalibrationSuccess) =>
      allEntries(result.workout.blocks).map((entry) => entry.exerciseId);

    it('a shorter session adds no lift', () => {
      const swap = swapped();
      const result = succeeded(
        recalibrate(
          rebuildAt({ type: 'duration', choice: 30 }, swap.workout, spec, gym, {
            constraints: swap.constraints,
          }),
        ),
      );
      // Before: "Recalibrated to 30 min: 1 exercise added", a leg press in the swap's slot.
      expect(exercises(result), result.summary.headline).toEqual(['front-squat']);
    });

    it('"Make it easier" adds no lift', () => {
      const swap = swapped();
      const result = succeeded(
        recalibrate(
          rebuildAt({ type: 'intensity', direction: 'easier' }, swap.workout, spec, gym, {
            constraints: { ...swap.constraints, intensity: -1 },
          }),
        ),
      );
      expect(exercises(result), result.summary.headline).toEqual(['front-squat']);
    });

    it('leaves no two lifts in one slot', () => {
      const swap = swapped();
      const result = succeeded(
        recalibrate(
          rebuildAt({ type: 'end-by', time: at(9, 19) }, swap.workout, spec, gym, {
            constraints: { ...swap.constraints, endBy: at(9, 19) },
          }),
        ),
      );
      // Two lifts of one slot read as a lift stopped and its stand-in to every slot rule.
      const slots = allEntries(result.workout.blocks)
        .map((entry) => entry.slot)
        .filter((slot) => slot !== undefined);
      expect(new Set(slots).size, lifts(result.workout)).toBe(slots.length);
    });
  });
});
