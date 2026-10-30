import { describe, expect, it } from 'vitest';
import type { MuscleId } from '../../catalog/muscles/muscles';
import type { UserProfile } from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { allEntries, type GeneratedWorkout } from '../workout/types';
import { generateWorkout, sessionDose } from '../workoutGenerator/generate';
import { catchUpKind, catchUpSpec } from './catchUp';
import { shortfallOf, weekModel } from './weekModel';
import {
  at,
  describeWorkout,
  directFor,
  gym,
  profileOf,
  session,
  working,
} from '../../test/clockDays';

/**
 * Maintenance 31, the review of round M: a day's offer from end to end, as the store reads it (the
 * kind, the week model, the spec, and the plan built from it). A muscle trained today takes only
 * what is left of one session, three or more short of failure, and nothing more if it was trained
 * in the 48 hours before; a muscle short of its week takes no more sets than it is short; a
 * catch-up is shorter than the full session, takes no set to failure, and leaves the split's
 * rotation as it was. Synthetic data only.
 */

function dayPlan(profile: UserProfile, history: WorkoutRecord[], now: string) {
  const kind = catchUpKind(profile, history, now);
  const week = weekModel({ profile, location: gym, history, now });
  const spec = catchUpSpec(week, profile, kind!, (muscle) => sessionDose(profile, muscle));
  const workout = generateWorkout({
    profile,
    location: gym,
    history,
    now,
    duration: 'default',
    constraints: { catchUp: spec },
  });
  return { kind, week, spec, workout };
}

const directSets = (workout: GeneratedWorkout, muscle: MuscleId) =>
  directFor(workout, muscle).reduce((sum, entry) => sum + working(entry).length, 0);

/** Last week's four sessions: a lifter in training. */
const pushDay = (day: number) =>
  session(at(day, 18), [
    ['barbell-bench-press', 4],
    ['incline-dumbbell-press', 3],
    ['overhead-press', 3],
    ['cable-fly', 3],
    ['cable-triceps-pushdown', 3],
    ['lateral-raise', 3],
    ['barbell-curl', 3],
  ]);
const pullDay = (day: number) =>
  session(at(day, 18), [
    ['barbell-row', 4],
    ['lat-pulldown', 3],
    ['rear-delt-fly', 3],
    ['barbell-curl', 3],
    ['cable-triceps-pushdown', 3],
    ['barbell-shrug', 3],
  ]);
const lowerDay = (day: number) =>
  session(at(day, 18), [
    ['back-squat', 4],
    ['romanian-deadlift', 3],
    ['bulgarian-split-squat', 3],
    ['leg-curl', 3],
    ['leg-extension', 3],
    ['standing-calf-raise', 3],
    ['plank', 2],
  ]);
const lastWeek = [pushDay(1), pullDay(2), lowerDay(3), pushDay(4)];
/** Saturday the 12th, Thursday and Friday missed: a day not ticked, much behind. */
const saturday = () => dayPlan(profileOf(), [...lastWeek, pushDay(7), pullDay(8)], at(12, 10));

describe('which day offers what', () => {
  it('counts a workout begun today as the first once a working set of it is done', () => {
    // Wednesday the 9th, not ticked: Monday's workout makes it a catch-up day.
    const monday = session(at(7, 18), [['back-squat', 3]]);
    const begun = session(at(9, 7), [['barbell-bench-press', 2]]);
    const warmUps = {
      ...begun,
      entries: begun.entries.map((entry) => ({
        ...entry,
        sets: entry.sets.map((set) => ({ ...set, kind: 'warmup' as const })),
      })),
    };
    expect(catchUpKind(profileOf(), [monday, warmUps], at(9, 18))).toBe('catch-up');
    expect(catchUpKind(profileOf(), [monday, begun], at(9, 18))).toBe('second');
  });
});

describe('a muscle trained today', () => {
  it('takes only what is left of one session, three or more in reserve, through a shared lift too', () => {
    // Bench press, flyes and lateral raises last Thursday. This Tuesday morning's workout was cut
    // short after one set of pushdowns: the triceps take what is left, while the muscles missed lead.
    const history = [
      session(at(3, 18), [
        ['barbell-bench-press', 4],
        ['cable-fly', 3],
        ['lateral-raise', 5],
      ]),
      session(at(8, 7), [['cable-triceps-pushdown', 1]], { endedEarly: true }),
    ];
    const profile = profileOf();
    const { kind, spec, workout } = dayPlan(profile, history, at(8, 18));
    expect(kind).toBe('second');
    const triceps = spec.muscles.find((item) => item.muscle === 'triceps');
    expect(triceps).toEqual({ muscle: 'triceps', sets: 3, minRir: 3, why: 'remainder' });
    expect(workout.explanation.reasons).toContain(
      'Triceps take only what is left of one session, three or more reps short of failure.',
    );
    const lifts = describeWorkout(workout).join('; ');
    expect(
      directFor(workout, 'triceps')
        .flatMap(working)
        .every((set) => set.targetRir >= 3),
      lifts,
    ).toBe(true);
    expect(directSets(workout, 'triceps'), lifts).toBeLessThanOrEqual(triceps!.sets);
    // The day's two workouts together stay within one session's sets.
    expect(1 + directSets(workout, 'triceps'), lifts).toBeLessThanOrEqual(
      sessionDose(profile, 'triceps'),
    );
  });

  it('takes nothing more when it was trained in the 48 hours before as well', () => {
    // Monday lower, Tuesday pull, Friday evening push and arms. Saturday, not ticked, one set of
    // pushdowns in the morning before the workout was cut short.
    const week = [
      session(at(7, 18), [
        ['back-squat', 4],
        ['romanian-deadlift', 3],
        ['leg-extension', 3],
      ]),
      session(at(8, 18), [
        ['barbell-row', 4],
        ['lat-pulldown', 3],
        ['barbell-curl', 3],
      ]),
      session(at(11, 18), [
        ['barbell-bench-press', 4],
        ['incline-dumbbell-press', 3],
        ['cable-triceps-pushdown', 3],
        ['lateral-raise', 3],
      ]),
    ];
    const profile = profileOf();
    // Without the morning's set: a catch-up, and the triceps rest.
    const catchUp = dayPlan(profile, week, at(12, 18));
    expect(catchUp.kind).toBe('catch-up');
    expect(catchUp.spec.muscles.map((item) => item.muscle)).not.toContain('triceps');
    expect(directFor(catchUp.workout, 'triceps')).toEqual([]);
    // With it: a second workout, and the one set does not open three more tonight.
    const second = dayPlan(
      profile,
      [...week, session(at(12, 7), [['cable-triceps-pushdown', 1]], { endedEarly: true })],
      at(12, 18),
    );
    expect(second.kind).toBe('second');
    expect(second.spec.sitOut).toContain('triceps');
    expect(
      directFor(second.workout, 'triceps').map((entry) => entry.exerciseId),
      describeWorkout(second.workout).join('; '),
    ).toEqual([]);
  });

  it('is one with direct sets today: a muscle worked only as a secondary one leads if behind', () => {
    // This morning's lat pulldowns, cut short: the lats and upper back trained, the biceps only as a
    // secondary muscle.
    const history = [
      session(at(3, 18), [
        ['back-squat', 4],
        ['romanian-deadlift', 3],
        ['leg-extension', 3],
      ]),
      session(at(4, 18), [
        ['barbell-bench-press', 4],
        ['barbell-row', 4],
      ]),
      session(at(7, 7), [['lat-pulldown', 3]], { endedEarly: true }),
    ];
    const { spec, workout } = dayPlan(profileOf(), history, at(7, 18));
    expect(spec.kind).toBe('second');
    expect(spec.sitOut).not.toContain('biceps');
    expect(workout.explanation.reasons.join(' | ')).not.toMatch(/biceps[^|]*trained today/i);
  });
});

describe('a muscle short of its week', () => {
  it('takes no more sets than it is short, through the lifts other muscles share', () => {
    // Monday a short lower day, Tuesday push, Thursday pull, Friday missed: on Saturday the glutes
    // are 3 sets short, the quads and hamstrings more.
    const history = [
      ...lastWeek,
      session(at(7, 18), [
        ['back-squat', 4],
        ['leg-curl', 3],
        ['hip-thrust', 3],
      ]),
      pushDay(8),
      pullDay(10),
    ];
    const { spec, week, workout } = dayPlan(profileOf(), history, at(12, 10));
    expect(shortfallOf(week.muscles.glutes)).toBe(3);
    expect(spec.muscles.find((item) => item.muscle === 'glutes')?.sets).toBe(3);
    expect(directSets(workout, 'glutes'), describeWorkout(workout).join('; ')).toBeLessThanOrEqual(
      shortfallOf(week.muscles.glutes),
    );
  });
});

describe('a catch-up', () => {
  it('gives the hamstrings a lift on the Saturday after a missed lower day', () => {
    // Thursday's lower day and Friday missed: the hamstrings 10 sets short, nothing planned. The
    // squat gives the glutes their sets and every hinge works them, so the hamstrings take the leg
    // curl (the second review of round M; before, they had no lift).
    const lower = session(at(3, 18), [
      ['back-squat', 4],
      ['romanian-deadlift', 3],
      ['leg-curl', 3],
      ['leg-extension', 3],
      ['standing-calf-raise', 3],
    ]);
    const profile = profileOf();
    const { spec, workout } = dayPlan(
      profile,
      [pushDay(1), pullDay(2), lower, pushDay(4), pushDay(7), pullDay(8)],
      at(12, 10),
    );
    expect(spec.muscles.slice(0, 3).map((item) => item.muscle)).toContain('hamstrings');
    expect(
      directSets(workout, 'hamstrings'),
      `${workout.explanation.reasons[0]} | ${describeWorkout(workout).join('; ')}`,
    ).toBeGreaterThan(0);
  });

  it('takes no set to failure, a drop set included', () => {
    const { kind, workout } = saturday();
    expect(kind).toBe('catch-up');
    expect(workout.explanation.reasons[0]).toMatch(/a few sets each and none to failure\.$/);
    const toFailure = allEntries(workout.blocks).flatMap((entry) =>
      entry.sets
        .filter((set) => set.kind !== 'warmup' && set.targetRir < 1)
        .map((set) => `${entry.exerciseId} ${set.kind} @RIR ${set.targetRir}`),
    );
    expect(toFailure).toEqual([]);
    expect(allEntries(workout.blocks).some((entry) => entry.dropSet)).toBe(false);
  });

  it('is shorter than the full session the same day', () => {
    const { workout } = saturday();
    const full = generateWorkout({
      profile: profileOf(),
      location: gym,
      history: [...lastWeek, pushDay(7), pullDay(8)],
      now: at(12, 10),
      duration: 'default',
    });
    expect(workout.templateId).toBe('catch-up');
    expect(
      workout.duration.estimatedMinutes,
      `catch-up ${workout.explanation.summary} / full ${full.explanation.summary}`,
    ).toBeLessThan(full.duration.estimatedMinutes);
  });

  it('leaves the split’s rotation as it was: Thursday plans as if Wednesday held no template', () => {
    /** A plan done as planned. */
    const done = (workout: GeneratedWorkout, when: string): WorkoutRecord => ({
      ...session(
        when,
        allEntries(workout.blocks).map(
          (entry) => [entry.exerciseId, working(entry).length] as [string, number],
        ),
      ),
      templateId: workout.templateId,
    });
    const plan = (history: WorkoutRecord[], now: string) => {
      const profile = profileOf();
      return catchUpKind(profile, history, now)
        ? dayPlan(profile, history, now).workout
        : generateWorkout({ profile, location: gym, history, now, duration: 'default' });
    };
    let history: WorkoutRecord[] = [];
    const days = [
      new Date(2026, 7, 17, 18),
      new Date(2026, 7, 18, 18),
      new Date(2026, 7, 20, 18),
      new Date(2026, 7, 21, 18),
      new Date(2026, 7, 24, 18),
      new Date(2026, 7, 25, 18),
      new Date(2026, 7, 27, 18),
      new Date(2026, 7, 28, 18),
      // Monday the 31st, Tuesday the 1st, and Wednesday the 2nd, not ticked: a catch-up.
      new Date(2026, 7, 31, 18),
      new Date(2026, 8, 1, 18),
      new Date(2026, 8, 2, 18),
    ].map((date) => date.toISOString());
    const templates: string[] = [];
    for (const when of days) {
      const workout = plan(history, when);
      history = [...history, done(workout, when)];
      templates.push(workout.templateId);
    }
    expect(templates.at(-1)).toBe('catch-up');
    const thursday = plan(history, at(3, 18));
    const untitled = plan(
      history.map((record) =>
        record.templateId === 'catch-up' ? { ...record, templateId: null } : record,
      ),
      at(3, 18),
    );
    expect(thursday.templateId, `the week: ${templates.join(', ')}`).toBe(untitled.templateId);
  });
});
