import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import { createDefaultLocations } from '../../core/validation/location';
import {
  createDefaultProfile,
  type UserProfile,
  type Weekday,
} from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW } from '../../test/records';
import { emptyCompleted, emptyConstraints, recalibrate } from '../recalibration/recalibrate';
import type {
  CompletedWork,
  RecalibrationRequest,
  RecalibrationSuccess,
  RecalibrationTrigger,
} from '../recalibration/types';
import { allEntries, type GeneratedWorkout, type WorkoutEntry } from '../workout/types';
import { generateWorkout } from './generate';

/**
 * Maintenance 27, the re-check of the owner's item 44: the day's extra through every change. A
 * swapped extra leads and is never the main lift; the cap and the drop-set rule hold when the
 * extra's day is rebuilt; a swap for comfort or pain keeps it; one begun and swapped stays first
 * and weighs no second; a harder day never trims it and an easier one takes the set a fresh one
 * would; the cap line names only lifts still in; no extra is weighed where the lift cannot go; a
 * lasting swap never brings the lift back on a day it gives way; heavy only where the style is.
 */

const HOUR = 3_600_000;
const BENCH = 'barbell-bench-press';
const OHP = 'overhead-press';
const [home, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const base = createDefaultProfile(RECORD_NOW);

/** RECORD_NOW is a Thursday. */
function profileWith(
  days: Weekday[],
  minutes: number,
  extra: Partial<UserProfile> = {},
  lift = BENCH,
): UserProfile {
  return {
    ...base,
    schedule: {
      ...base.schedule,
      weeklyFrequency: days.length,
      availableDays: days,
      typicalDurationMinutes: minutes,
    },
    pushLift: { exerciseId: lift, target: 225, units: 'lb', since: '2026-08-01T12:00:00.000Z' },
    ...extra,
  };
}
const days: Weekday[] = ['mon', 'thu', 'sat'];
const at = (hoursAgo: number) => new Date(Date.parse(RECORD_NOW) - hoursAgo * HOUR).toISOString();

/** A past session: `lifts` as [exercise, working sets], each at 2 in reserve. */
function past(hoursAgo: number, templateId: string, lifts: [string, number][]): WorkoutRecord {
  const when = at(hoursAgo);
  return {
    id: `w-${hoursAgo}`,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId,
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: lifts.map(([exerciseId, sets]) => ({
      exerciseId,
      sets: Array.from({ length: sets }, (_, index) => ({
        kind: 'working' as const,
        reps: 6,
        weight: 100,
        rir: 2,
        completed: true,
        setIndex: index,
        targetReps: [4, 6] as [number, number],
        targetRir: 2,
      })),
    })),
  };
}

/** Monday's push day: the extra is due on Thursday. */
const lastMonday = [past(72, 'push-arms', [[BENCH, 4]])];
/** The triceps near their cap: the extra fits with a set off the pushdown. */
const tricepsNearCap = [
  past(48, 'pull-arms', [['skull-crusher', 6]]),
  past(72, 'push-arms', [
    [BENCH, 4],
    ['cable-triceps-pushdown', 5],
  ]),
];

function plan(
  profile: UserProfile,
  history: WorkoutRecord[],
  constraints: Parameters<typeof generateWorkout>[0]['constraints'] = {},
  location = gym,
  duration: Parameters<typeof generateWorkout>[0]['duration'] = 'default',
): GeneratedWorkout {
  return generateWorkout({ profile, location, history, now: RECORD_NOW, duration, constraints });
}

function run(
  trigger: RecalibrationTrigger,
  workout: GeneratedWorkout,
  profile: UserProfile,
  history: WorkoutRecord[],
  overrides: Partial<RecalibrationRequest> = {},
): RecalibrationSuccess {
  const result = recalibrate({
    trigger,
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
    ...overrides,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

const working = (entry: WorkoutEntry | undefined) =>
  entry?.sets.filter((set) => set.kind === 'working') ?? [];
const ids = (workout: GeneratedWorkout) => allEntries(workout.blocks).map((one) => one.exerciseId);
const entryOf = (workout: GeneratedWorkout, exerciseId: string) =>
  allEntries(workout.blocks).find((entry) => entry.exerciseId === exerciseId);
const capLine = (workout: GeneratedWorkout) =>
  workout.explanation.reasons.find((line) => line.startsWith('With the extra'));

/** One set of `entry` logged, as the store passes it. */
function oneSetOf(entry: WorkoutEntry, weight = 185): CompletedWork {
  const set = working(entry)[0]!;
  return {
    ...emptyCompleted(),
    sets: [
      {
        entryId: entry.id,
        exerciseId: entry.exerciseId,
        setIndex: set.index,
        kind: 'working',
        reps: 5,
        weight,
        rir: 2,
        completedAt: RECORD_NOW,
      },
    ],
    elapsedSeconds: 400,
  };
}

describe("the day's extra through every change (the re-check of item 44)", () => {
  it('leads when swapped, and the main lift keeps its place and its line', () => {
    const profile = profileWith(days, 150);
    const workout = plan(profile, lastMonday, { templateId: 'lower' });
    const extra = allEntries(workout.blocks)[0]!;
    expect(extra.push).toBe('extra');
    const swapped = run(
      { type: 'replace', entryId: extra.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      profile,
      lastMonday,
      { currentEntryId: extra.id },
    );
    for (const choice of [30, 15] as const) {
      const rebuilt = run({ type: 'duration', choice }, swapped.workout, profile, lastMonday, {
        currentEntryId: extra.id,
        constraints: swapped.constraints,
      });
      expect(ids(rebuilt.workout).slice(0, 2), String(choice)).toEqual([
        'dumbbell-bench-press',
        'back-squat',
      ]);
      // The squat keeps the main lift's three sets, as beside the extra itself.
      expect(working(entryOf(rebuilt.workout, 'back-squat')).length, String(choice)).toBe(3);
      expect(rebuilt.workout.explanation.reasons, String(choice)).toContain(
        'Back Squat is the primary strength lift, with full rests and warm-up ramp sets.',
      );
      expect(rebuilt.workout.explanation.summary, String(choice)).toContain(
        ', Dumbbell Bench Press first',
      );
    }
  });

  it("keeps the cap when the extra's day is rebuilt with it under way", () => {
    const profile = profileWith(days, 60);
    const workout = plan(profile, tricepsNearCap, { templateId: 'pull-arms' });
    const extra = allEntries(workout.blocks)[0]!;
    expect(extra.push).toBe('extra');
    expect(working(entryOf(workout, 'cable-triceps-pushdown'))).toHaveLength(2);
    for (const choice of ['default', 45] as const) {
      const rebuilt = run({ type: 'duration', choice }, workout, profile, tricepsNearCap, {
        completed: oneSetOf(extra),
        currentEntryId: extra.id,
      });
      expect(
        working(entryOf(rebuilt.workout, 'cable-triceps-pushdown')),
        String(choice),
      ).toHaveLength(2);
      expect(capLine(rebuilt.workout), String(choice)).toBe(
        'With the extra Barbell Bench Press, its muscles stay under their weekly cap: 1 set off Cable Triceps Pushdown.',
      );
    }
  });

  it("keeps the cap the days after the extra set, when the extra's day is rebuilt", () => {
    // Monday, Tuesday, Thursday and Saturday: Saturday's planned work is what takes the triceps to
    // their cap, so a rebuild that looked only backward gave the pushdown's set back.
    const profile = profileWith(['mon', 'tue', 'thu', 'sat'], 60);
    const history = [
      past(48, 'pull-arms', [['barbell-row', 3]]),
      past(120, 'push-arms', [
        [BENCH, 4],
        ['cable-triceps-pushdown', 4],
      ]),
    ];
    const workout = plan(profile, history, { templateId: 'pull-arms' });
    const extra = allEntries(workout.blocks)[0]!;
    expect(extra.push).toBe('extra');
    expect(working(entryOf(workout, 'cable-triceps-pushdown'))).toHaveLength(2);
    const rebuilt = run({ type: 'duration', choice: 'default' }, workout, profile, history, {
      completed: oneSetOf(extra),
      currentEntryId: extra.id,
    });
    expect(working(entryOf(rebuilt.workout, 'cable-triceps-pushdown'))).toHaveLength(2);
  });

  it("keeps the drop set off the lift's muscles when the extra's day is rebuilt", () => {
    const profile = profileWith(days, 60, {}, OHP);
    const history = [past(72, 'push-arms', [[OHP, 3]])];
    const workout = plan(profile, history, { templateId: 'upper' });
    const extra = allEntries(workout.blocks)[0]!;
    expect(extra.exerciseId).toBe(OHP);
    expect(extra.push).toBe('extra');
    const lift = requireExercise(OHP);
    const onLiftMuscles = (one: GeneratedWorkout) =>
      allEntries(one.blocks).filter(
        (entry) =>
          entry.dropSet &&
          requireExercise(entry.exerciseId).primaryMuscles.some((muscle) =>
            lift.primaryMuscles.includes(muscle),
          ),
      );
    expect(onLiftMuscles(workout)).toEqual([]);
    const rebuilt = run({ type: 'duration', choice: 'default' }, workout, profile, history, {
      completed: oneSetOf(extra, 95),
      currentEntryId: extra.id,
    });
    expect(onLiftMuscles(rebuilt.workout)).toEqual([]);
    expect(working(entryOf(rebuilt.workout, 'cable-triceps-pushdown')).length).toBeLessThan(3);
  });

  it('keeps an extra swapped for comfort or pain once the lifter moves on', () => {
    const profile = profileWith(days, 90);
    const workout = plan(profile, lastMonday, { templateId: 'lower' });
    const extra = allEntries(workout.blocks)[0]!;
    for (const trigger of [
      { type: 'uncomfortable', entryId: extra.id },
      { type: 'pain', entryId: extra.id, joint: 'shoulder' },
    ] as RecalibrationTrigger[]) {
      const swapped = run(trigger, workout, profile, lastMonday, { currentEntryId: extra.id });
      const standIn = allEntries(swapped.workout.blocks)[0]!;
      expect(standIn.exerciseId, trigger.type).not.toBe(BENCH);
      // The lifter moves on to the squat and logs a set, then any rebuild.
      const squat = entryOf(swapped.workout, 'back-squat')!;
      const rebuilt = run(
        { type: 'duration', choice: 'default' },
        swapped.workout,
        profile,
        lastMonday,
        {
          completed: oneSetOf(squat, 225),
          currentEntryId: squat.id,
          constraints: swapped.constraints,
        },
      );
      expect(ids(rebuilt.workout)[0], trigger.type).toBe(standIn.exerciseId);
      expect(allEntries(rebuilt.workout.blocks)[0]?.push, trigger.type).toBe('extra');
    }
  });

  it('keeps an extra begun and swapped first, and weighs no second one', () => {
    const profile = profileWith(days, 60);
    const workout = plan(profile, tricepsNearCap, { templateId: 'pull-arms' });
    const extra = allEntries(workout.blocks)[0]!;
    const completed = oneSetOf(extra);
    const swapped = run(
      { type: 'replace', entryId: extra.id, exerciseId: 'dumbbell-bench-press' },
      workout,
      profile,
      tricepsNearCap,
      { completed, currentEntryId: extra.id },
    );
    const standIn = entryOf(swapped.workout, 'dumbbell-bench-press')!;
    expect(standIn.push).toBe('extra');
    for (const choice of ['default', 45] as const) {
      const rebuilt = run({ type: 'duration', choice }, swapped.workout, profile, tricepsNearCap, {
        completed,
        currentEntryId: standIn.id,
      });
      expect(ids(rebuilt.workout).slice(0, 2), String(choice)).toEqual([
        BENCH,
        'dumbbell-bench-press',
      ]);
      expect(
        rebuilt.workout.explanation.reasons.some((line) => line.startsWith('No extra')),
        String(choice),
      ).toBe(false);
    }
  });

  it('never trims the extra when the day is made harder, nor takes it to failure', () => {
    for (const programStyle of ['hybrid', 'high-rep'] as const) {
      for (const templateId of ['lower', 'pull-arms']) {
        const where = `${programStyle}, ${templateId}`;
        const profile = profileWith(days, 60, { programStyle });
        const plain = plan(profile, lastMonday, { templateId });
        const harder = plan(profile, lastMonday, {
          templateId,
          adjust: { sets: 1, rir: -1, restFactor: 1 },
        });
        const extraOf = (one: GeneratedWorkout) => allEntries(one.blocks)[0];
        expect(extraOf(plain)?.push, where).toBe('extra');
        expect(working(extraOf(harder)), where).toHaveLength(working(extraOf(plain)).length);
        expect(
          Math.min(...working(extraOf(harder)).map((set) => set.targetRir)),
          where,
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('takes a set off the extra in front when the day is made easier, as a fresh one has', () => {
    const profile = profileWith(days, 90);
    const workout = plan(profile, lastMonday, { templateId: 'lower' });
    const extra = allEntries(workout.blocks)[0]!;
    const fresh = plan(profile, lastMonday, {
      templateId: 'lower',
      adjust: { sets: -1, rir: 1, restFactor: 1 },
    });
    const easier = run({ type: 'intensity', direction: 'easier' }, workout, profile, lastMonday, {
      currentEntryId: extra.id,
      lockedEntryIds: [extra.id],
    });
    const kept = allEntries(easier.workout.blocks).find((entry) => entry.id === extra.id);
    expect(working(extra)).toHaveLength(3);
    expect(working(kept)).toHaveLength(working(allEntries(fresh.blocks)[0]).length);
    expect(working(kept)).toHaveLength(2);
    // Harder adds none, and keeps a rep in reserve.
    const harder = run({ type: 'intensity', direction: 'harder' }, workout, profile, lastMonday, {
      currentEntryId: extra.id,
      lockedEntryIds: [extra.id],
    });
    const held = allEntries(harder.workout.blocks).find((entry) => entry.id === extra.id);
    expect(working(held)).toHaveLength(3);
    expect(Math.min(...working(held).map((set) => set.targetRir))).toBeGreaterThanOrEqual(1);
  });

  it('keeps the extra at its sets and short of failure when the push ends mid-session', () => {
    // Light weights, whose own reserve on a main lift is 1: harder would take it to failure.
    const profile = profileWith(days, 90, { programStyle: 'high-rep' });
    const workout = plan(profile, lastMonday, { templateId: 'lower' });
    const extra = allEntries(workout.blocks)[0]!;
    expect(extra.push).toBe('extra');
    const ended = { ...profile, pushLift: undefined };
    const harder = run({ type: 'intensity', direction: 'harder' }, workout, ended, lastMonday, {
      currentEntryId: extra.id,
      lockedEntryIds: [extra.id],
    });
    const held = allEntries(harder.workout.blocks).find((entry) => entry.id === extra.id);
    expect(working(held)).toHaveLength(working(extra).length);
    expect(Math.min(...working(held).map((set) => set.targetRir))).toBeGreaterThanOrEqual(1);
  });

  it('takes no set off a kept lift for the cap, a logged one least of all', () => {
    const profile = profileWith(days, 60);
    const workout = plan(profile, tricepsNearCap, { templateId: 'pull-arms' });
    const extra = allEntries(workout.blocks)[0]!;
    expect(working(extra)).toHaveLength(3);
    // The extra done, and six sets of skull crushers the lifter added and kept: the triceps are
    // over however many sets come off the pushdown.
    const added: WorkoutEntry = {
      ...extra,
      id: 'e20',
      exerciseId: 'skull-crusher',
      role: 'isolation',
      sets: Array.from({ length: 6 }, (_, index) => ({ ...working(extra)[0]!, index })),
      locked: true,
      push: undefined,
    };
    const rebuilt = generateWorkout({
      profile,
      location: gym,
      history: tricepsNearCap,
      now: RECORD_NOW,
      duration: 'default',
      constraints: {
        templateId: 'pull-arms',
        keep: [
          { entry: extra, frozen: true },
          { entry: added, frozen: false },
        ],
        isSetDone: (entryId) => entryId === extra.id,
      },
    });
    expect(working(entryOf(rebuilt, BENCH))).toHaveLength(3);
    expect(working(entryOf(rebuilt, 'skull-crusher'))).toHaveLength(6);
  });

  it('names in the cap line only the lifts still in the plan', () => {
    const profile = profileWith(days, 60);
    for (const duration of ['default', 45, 30, 15] as const) {
      const workout = plan(profile, tricepsNearCap, { templateId: 'pull-arms' }, gym, duration);
      const line = capLine(workout);
      const pushdown = entryOf(workout, 'cable-triceps-pushdown');
      if (duration === 'default') expect(line).toBeDefined();
      if (pushdown) continue;
      expect(line, String(duration)).toBeUndefined();
    }
  });

  it('weighs no extra where the lift cannot go in', () => {
    const profile = profileWith(days, 60);
    // A week heavy on the triceps: weighed, the extra would wait for the cap.
    const heavy = [
      past(24, 'pull-arms', [['cable-triceps-pushdown', 7]]),
      past(48, 'pull-arms', [['skull-crusher', 7]]),
      past(72, 'push-arms', [
        [BENCH, 4],
        ['cable-triceps-pushdown', 4],
      ]),
    ];
    expect(
      plan(profile, heavy, { templateId: 'lower' }).explanation.reasons.some((line) =>
        line.startsWith('No extra Barbell Bench Press today'),
      ),
    ).toBe(true);
    const swaps = [{ from: BENCH, to: 'dumbbell-bench-press', setAt: at(72), until: at(-480) }];
    for (const workout of [
      plan(profile, heavy, { templateId: 'lower', swaps }),
      plan(profile, heavy, { templateId: 'lower' }, home),
    ]) {
      expect(ids(workout)).not.toContain(BENCH);
      expect(workout.explanation.reasons.some((line) => line.startsWith('No extra'))).toBe(false);
    }
  });

  it('never brings the lift back by a lasting swap on a day it gives way', () => {
    // Benched yesterday: today its place goes to another press, swapped by the lifter for weeks
    // into the bench itself.
    const profile = profileWith(['mon', 'wed', 'thu', 'sat'], 90);
    const history = [past(24, 'upper', [[BENCH, 3]])];
    for (const templateId of ['full-body', 'upper', 'push-arms']) {
      const plain = plan(profile, history, { templateId });
      expect(ids(plain), templateId).not.toContain(BENCH);
      expect(ids(plain), templateId).toContain('close-grip-bench-press');
      const swaps = [
        { from: 'close-grip-bench-press', to: BENCH, setAt: at(240), until: at(-480) },
      ];
      expect(ids(plan(profile, history, { templateId, swaps })), templateId).not.toContain(BENCH);
    }
  });

  it('calls the extra heavy only under a style with a heavy range', () => {
    for (const [programStyle, heavy] of [
      ['hybrid', true],
      ['foundation', false],
      ['high-rep', false],
    ] as const) {
      const profile = profileWith(days, 90, { programStyle });
      const workout = plan(profile, lastMonday, { templateId: 'lower' });
      const line = workout.explanation.reasons.find((one) =>
        one.includes("the week's extra session"),
      );
      expect(line, programStyle).toBeDefined();
      expect(line?.includes('heavy and short of failure'), programStyle).toBe(heavy);
    }
  });
});
