import { describe, expect, it } from 'vitest';
import { addLocalDays, localDayKey, localWeekKey, localWeekday } from '../../core/time/localDate';
import { createDefaultLocations } from '../../core/validation/location';
import {
  createDefaultProfile,
  type UserProfile,
  type Weekday,
} from '../../core/validation/profile';
import type { WorkoutRecord } from '../../core/validation/workoutRecord';
import { RECORD_NOW, record } from '../../test/records';
import { requireExercise } from '../../catalog/exercises/catalog';
import { MUSCLE_IDS } from '../../catalog/muscles/muscles';
import { INDIRECT_SET_WEIGHT } from '../volume/weeklyVolume';
import { learnedWindows } from '../recovery/recovery';
import { generateWorkout } from '../workoutGenerator/generate';
import { createFocus } from './focus';
import { keepingOrder, scheduleOf } from './orderKept';
import { readWeek, splitOrder, splitOrderLine } from './splitOrder';
import { orderWords, withoutOrderLines } from '../workoutGenerator/generate';
import { liftedAsPlanned, plannedWorkouts, tooSoonAhead } from './weeklyPlan';
import { weekModel } from './weekModel';
import { allEntries, type GeneratedWorkout } from '../workout/types';

// RECORD_NOW is a Thursday at noon; the Monday three days before it.
const THURSDAY = RECORD_NOW;
const MONDAY = addLocalDays(RECORD_NOW, -3);
const [, gym] = createDefaultLocations({ gymAccess: true }, RECORD_NOW);
const base = createDefaultProfile(RECORD_NOW);

function onDays(days: Weekday[], profile: UserProfile = base): UserProfile {
  return {
    ...profile,
    schedule: { ...profile.schedule, availableDays: days, weeklyFrequency: days.length },
  };
}

/** Two weeks of the plan lifted as planned, up to `now`. */
function followed(profile: UserProfile, now: string): WorkoutRecord[] {
  let history: WorkoutRecord[] = [];
  for (const back of [14, 7]) {
    for (const day of plannedWorkouts(profile, gym, history, addLocalDays(now, -back))) {
      if (Date.parse(day.date) >= Date.parse(now)) break;
      history = [...history, liftedAsPlanned(day.date, day.workout)];
    }
  }
  return history;
}

/**
 * Days trained one by one as planned, each in the order the plan reads, the record keeping it: but
 * the days `missed` after `from`, which go by untrained.
 */
function trained(
  profile: UserProfile,
  from: string,
  days: number,
  missed: readonly number[] = [],
): WorkoutRecord[] {
  let history: WorkoutRecord[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const now = addLocalDays(from, offset);
    if (!profile.schedule.availableDays.includes(localWeekday(now)) || missed.includes(offset)) {
      continue;
    }
    const order = splitOrder({ profile, location: gym, history, now });
    const workout = generateWorkout({
      profile,
      location: gym,
      history,
      now,
      duration: 'default',
      constraints: order ? { splitOrder: order } : {},
    });
    history = [...history, keepingOrder(liftedAsPlanned(now, workout), order)];
  }
  return history;
}

/** The records as read with no order kept on them. */
const withoutOrders = (records: readonly WorkoutRecord[]) =>
  records.map((record) => {
    const copy = { ...record };
    delete copy.splitOrder;
    return copy;
  });

/** A muscle's sets in a planned week, a secondary's at half, as the week model counts them. */
function setsOf(planned: ReturnType<typeof plannedWorkouts>, muscle: string): number {
  let sets = 0;
  for (const day of planned) {
    for (const entry of allEntries(day.workout.blocks)) {
      const working = entry.sets.filter((set) => set.kind === 'working').length;
      const exercise = requireExercise(entry.exerciseId);
      if ((exercise.primaryMuscles as readonly string[]).includes(muscle)) sets += working;
      if ((exercise.secondaryMuscles as readonly string[]).includes(muscle)) {
        sets += working * INDIRECT_SET_WEIGHT;
      }
    }
  }
  return sets;
}

/** A day after the week for `readWeek`, whose week alone these tests read. */
const dayAfterOf = (planned: ReturnType<typeof plannedWorkouts>) => ({
  date: addLocalDays(planned[0]!.date, 7),
  workout: planned[0]!.workout,
});

/** A muscle's sessions in a planned week: the days with a direct set for it. */
function sessionsOf(planned: ReturnType<typeof plannedWorkouts>, muscle: string): number {
  return planned.filter((day) =>
    allEntries(day.workout.blocks).some(
      (entry) =>
        entry.sets.some((set) => set.kind === 'working') &&
        (requireExercise(entry.exerciseId).primaryMuscles as readonly string[]).includes(muscle),
    ),
  ).length;
}

/** Per muscle, the days `tooSoonAhead` finds. */
function perMuscle(found: ReturnType<typeof tooSoonAhead>): Map<string, number> {
  const days = new Map<string, number>();
  for (const day of found)
    for (const muscle of day.muscles) days.set(muscle, (days.get(muscle) ?? 0) + 1);
  return days;
}

// Monday, Tuesday and Thursday: the rotation runs upper, lower, full body, so Thursday's full body
// works the legs inside the window Tuesday's lower day set.
const threeDays = onDays(['mon', 'tue', 'thu']);

const kindsOf = (planned: ReturnType<typeof plannedWorkouts>) =>
  planned.map((day) => day.workout.templateId);

describe('the split’s order across the days (Maintenance 38)', () => {
  it('keeps the defaults in the usual week: no order of four sessions, three with the arms, spares them', () => {
    const profile = onDays(['mon', 'tue', 'thu', 'fri']);
    for (const now of [THURSDAY, MONDAY]) {
      for (const history of [[], followed(profile, now)]) {
        expect(
          tooSoonAhead(plannedWorkouts(profile, gym, history, now), history).length,
        ).toBeGreaterThan(0);
        expect(splitOrder({ profile, location: gym, history, now })).toBeNull();
      }
    }
    // The one reorder of the defaults: a new lifter's first week from a Friday, whose Thursday push
    // day would work the biceps 48 h after Tuesday's pull day. After two weeks followed, none.
    const friday = addLocalDays(THURSDAY, 1);
    const first = splitOrder({ profile, location: gym, history: [], now: friday });
    expect(first?.days.map((day) => [day.templateId, day.was])).toEqual([
      ['push-arms', 'push-arms'],
      ['lower', 'lower'],
      ['push-arms', 'pull-arms'],
      ['pull-arms', 'push-arms'],
    ]);
    expect(first?.spared).toEqual(['biceps']);
    expect(
      splitOrder({ profile, location: gym, history: followed(profile, friday), now: friday }),
    ).toBeNull();
  });

  it('reorders where another order spares a muscle, the days and the sessions kept', () => {
    const planned = plannedWorkouts(threeDays, gym, [], MONDAY);
    expect(planned.map((day) => day.workout.templateId)).toEqual(['upper', 'lower', 'full-body']);
    expect(perMuscle(tooSoonAhead(planned, []))).toEqual(
      new Map([
        ['quads', 1],
        ['hamstrings', 1],
        ['glutes', 1],
      ]),
    );
    const order = splitOrder({ profile: threeDays, location: gym, history: [], now: MONDAY });
    expect(order).toEqual({
      days: planned.map((day, at) => ({
        day: localDayKey(day.date),
        templateId: ['lower', 'upper', 'full-body'][at],
        was: day.workout.templateId,
      })),
      spared: ['quads', 'hamstrings', 'glutes'],
      fewer: [],
      // The days and the sessions a week it was read for: held only while they are the schedule.
      schedule: 'mon,tue,thu/3',
    });
    // Built in that order, the week holds it, and nothing comes back too soon.
    const built = plannedWorkouts(threeDays, gym, [], MONDAY, null, 'default', { order });
    expect(built.map((day) => day.workout.templateId)).toEqual(['lower', 'upper', 'full-body']);
    expect(built.map((day) => day.date)).toEqual(planned.map((day) => day.date));
    expect(tooSoonAhead(built, [])).toEqual([]);
  });

  it('reads a week as the app’s own "too soon" check does', () => {
    for (const [profile, now] of [
      [threeDays, MONDAY],
      [onDays(['mon', 'tue', 'thu', 'fri']), THURSDAY],
      [onDays(['mon', 'wed', 'fri']), MONDAY],
    ] as const) {
      const history = followed(profile, now);
      const planned = plannedWorkouts(profile, gym, history, now);
      expect(
        readWeek(planned, history, learnedWindows(history, null), dayAfterOf(planned)).week,
      ).toEqual(perMuscle(tooSoonAhead(planned, history)));
    }
  });

  it('keeps the window that ends latest, as the app’s own check does, not the newest', () => {
    // The chest taken to failure on a fly the night before Monday: 8 sets at a long length, a window
    // of 84 h. Monday's upper day sets one of 36 h, which ends first; Wednesday's push day, 60 h
    // after the fly, is still inside the fly's window, and only the older window says so.
    const flyAt = new Date(Date.parse(MONDAY) - 12 * 3_600_000).toISOString();
    const fly = {
      ...record(
        0,
        'cable-fly',
        Array.from({ length: 8 }, () => [12, 30, 0] as [number, number, number]),
      ),
      id: 'w-fly',
      startedAt: flyAt,
      completedAt: flyAt,
    };
    const history = [fly];
    const plan = (date: string, templateId: string, past: WorkoutRecord[]) =>
      generateWorkout({
        profile: base,
        location: gym,
        history: past,
        now: date,
        duration: 'default',
        constraints: { templateId },
      });
    const monday = plan(MONDAY, 'upper', history);
    const wednesday = addLocalDays(MONDAY, 2);
    const planned = [
      { date: MONDAY, weekday: 'mon' as const, offset: 0, workout: monday },
      {
        date: wednesday,
        weekday: 'wed' as const,
        offset: 2,
        workout: plan(wednesday, 'push-arms', [...history, liftedAsPlanned(MONDAY, monday)]),
      },
    ];
    const found = perMuscle(tooSoonAhead(planned, history));
    expect(found.get('chest')).toBe(2);
    expect(
      readWeek(planned, history, learnedWindows(history, null), dayAfterOf(planned)).week,
    ).toEqual(found);
  });

  it('holds today’s session under a coach focus, the lifter’s for today', () => {
    const focus = createFocus('chest', MONDAY);
    const order = splitOrder({
      profile: threeDays,
      location: gym,
      history: [],
      now: MONDAY,
      focus,
    });
    const planned = plannedWorkouts(threeDays, gym, [], MONDAY, null, 'default', { focus });
    expect(order?.days[0]?.templateId ?? planned[0]?.workout.templateId).toBe(
      planned[0]?.workout.templateId,
    );
  });

  it('plans the day in the order, says why, and passes over a template the split does not have', () => {
    const order = splitOrder({ profile: threeDays, location: gym, history: [], now: MONDAY });
    expect(order).not.toBeNull();
    const workout = generateWorkout({
      profile: threeDays,
      location: gym,
      history: [],
      now: MONDAY,
      duration: 'default',
      constraints: { splitOrder: order! },
    });
    expect(workout.templateId).toBe('lower');
    expect(workout.explanation.reasons).toContain(
      'Lower body today in place of Upper body: in this order the quads, hamstrings and glutes are not worked hard again inside their recovery windows in the week ahead.',
    );
    // Push + arms is no template of a three-day split: the rotation's choice stands, and nothing
    // is said of an order.
    const foreign = {
      ...order!,
      days: order!.days.map((day, at) => (at === 0 ? { ...day, templateId: 'push-arms' } : day)),
    };
    const plain = generateWorkout({
      profile: threeDays,
      location: gym,
      history: [],
      now: MONDAY,
      duration: 'default',
      constraints: { splitOrder: foreign },
    });
    expect(plain.templateId).toBe('upper');
    expect(plain.explanation.reasons.some((line) => line.includes('in place of'))).toBe(false);
  });

  const strength = (days: Weekday[]) =>
    onDays(days, { ...base, goals: { ...base.goals, primary: 'strength', secondary: 'none' } });
  const templatesOf = (order: ReturnType<typeof splitOrder>) =>
    order ? order.days.map((day) => day.templateId) : null;

  it('takes no order that crowds the first day after the week to spare it', () => {
    // A strength lifter on Monday, Tuesday and Sunday, on Monday: the rotation's full body, lower,
    // upper brings the legs back on Tuesday. Upper, lower, full body spares them in the week, but the
    // rotation's next session, the next Monday's lower day, would then come 24 h after Sunday's full
    // body: refused.
    const profile = strength(['mon', 'tue', 'sun']);
    expect(plannedWorkouts(profile, gym, [], MONDAY).map((day) => day.workout.templateId)).toEqual([
      'full-body',
      'lower',
      'upper',
    ]);
    expect(splitOrder({ profile, location: gym, history: [], now: MONDAY })).toBeNull();
  });

  it('takes no order that spares one muscle by bringing another back more often', () => {
    // A strength lifter on Monday, Tuesday, Thursday and Saturday after two weeks as planned, on
    // Monday: the rotation's push, lower, pull, full body brings the upper back and the biceps back
    // on Saturday. Pull, lower, push, full body has one "too soon" day for two, but it is the chest's,
    // which the rotation's week spares: a trade, refused.
    const profile = strength(['mon', 'tue', 'thu', 'sat']);
    const history = followed(profile, MONDAY);
    const planned = plannedWorkouts(profile, gym, history, MONDAY);
    expect(kindsOf(planned)).toEqual(['push-arms', 'lower', 'pull-arms', 'full-body']);
    expect(perMuscle(tooSoonAhead(planned, history))).toEqual(
      new Map([
        ['upper-back', 1],
        ['biceps', 1],
      ]),
    );
    const order = {
      days: planned.map((day, at) => ({
        day: localDayKey(day.date),
        templateId: ['pull-arms', 'lower', 'push-arms', 'full-body'][at] as string,
        was: day.workout.templateId,
      })),
      spared: [],
      fewer: [],
    };
    const built = plannedWorkouts(profile, gym, history, MONDAY, null, 'default', { order });
    expect(perMuscle(tooSoonAhead(built, history))).toEqual(new Map([['chest', 1]]));
    expect(splitOrder({ profile, location: gym, history, now: MONDAY })).toBeNull();
  });

  it('of two orders as good, takes the one that moves fewer days', () => {
    // Monday, Wednesday, Thursday and Sunday, on Thursday: the rotation's push, lower, pull, push
    // brings the biceps back on Wednesday, the day after Monday's pull day. Push, lower, push, pull
    // and push, push, lower, pull both spare them; the first moves two days, the second three.
    const profile = onDays(['mon', 'wed', 'thu', 'sun']);
    expect(kindsOf(plannedWorkouts(profile, gym, [], THURSDAY))).toEqual([
      'push-arms',
      'lower',
      'pull-arms',
      'push-arms',
    ]);
    const order = splitOrder({ profile, location: gym, history: [], now: THURSDAY });
    expect(templatesOf(order)).toEqual(['push-arms', 'lower', 'push-arms', 'pull-arms']);
    expect(order?.spared).toEqual(['biceps']);
  });

  it('takes an order only once the week built in it reads better', () => {
    // Monday, Wednesday and Thursday, on Thursday: the rotation's upper, lower, full body works the
    // legs on Wednesday inside the window Monday's lower day set, and with nothing before them lower,
    // upper, full body spares them.
    const profile = onDays(['mon', 'wed', 'thu']);
    expect(templatesOf(splitOrder({ profile, location: gym, history: [], now: THURSDAY }))).toEqual(
      ['lower', 'upper', 'full-body'],
    );
    // The back squat last done 200 days ago is new to the lifter again in whichever session has it
    // first. Read session by session, the order's Monday full body keeps the window it had where the
    // rotation put it, after Monday's squat; built in the order, Monday's full body has the squat new
    // again and its longer window, so Wednesday's lower day comes as soon as in the rotation's week.
    const history = [
      record(200, 'back-squat', [
        [5, 225, 2],
        [5, 225, 2],
        [5, 225, 2],
      ]),
    ];
    const order = {
      days: plannedWorkouts(profile, gym, history, THURSDAY).map((day, at) => ({
        day: localDayKey(day.date),
        templateId: ['upper', 'full-body', 'lower'][at] as string,
        was: day.workout.templateId,
      })),
      spared: [],
      fewer: [],
    };
    const built = plannedWorkouts(profile, gym, history, THURSDAY, null, 'default', { order });
    expect(perMuscle(tooSoonAhead(built, history)).get('quads')).toBe(
      perMuscle(tooSoonAhead(plannedWorkouts(profile, gym, history, THURSDAY), history)).get(
        'quads',
      ),
    );
    expect(splitOrder({ profile, location: gym, history, now: THURSDAY })).toBeNull();
  });

  it('takes no order that leaves a muscle short of its weekly target with fewer sets', () => {
    // A strength lifter on Monday, Tuesday and Thursday, on Monday: the rotation's full body, lower,
    // upper brings the legs back on Tuesday, and lower, upper, full body spares them. But each plan
    // answers the days before it: built in that order the week gives the upper chest 3 sets of its
    // 10, where the rotation's gives 4.5. Frequency and goals: refused.
    const profile = strength(['mon', 'tue', 'thu']);
    const planned = plannedWorkouts(profile, gym, [], MONDAY);
    expect(planned.map((day) => day.workout.templateId)).toEqual(['full-body', 'lower', 'upper']);
    expect(perMuscle(tooSoonAhead(planned, [])).get('quads')).toBe(1);
    const order = {
      days: planned.map((day, at) => ({
        day: localDayKey(day.date),
        templateId: ['lower', 'upper', 'full-body'][at] as string,
        was: day.workout.templateId,
      })),
      spared: [],
      fewer: [],
    };
    const built = plannedWorkouts(profile, gym, [], MONDAY, null, 'default', { order });
    expect(tooSoonAhead(built, [])).toEqual([]);
    expect(setsOf(planned, 'upper-chest')).toBe(4.5);
    expect(setsOf(built, 'upper-chest')).toBe(3);
    expect(splitOrder({ profile, location: gym, history: [], now: MONDAY })).toBeNull();
  });

  it('takes no order that trains a muscle on fewer days of the week', () => {
    // Monday, Tuesday, Wednesday and Friday, on Thursday: the rotation's push, lower, pull, push
    // brings the biceps and triceps back on Wednesday. Push, push, lower, pull spares them, but built
    // in it the week's forearms lose their one session, though their sets stay over the target:
    // frequency, refused.
    const profile = onDays(['mon', 'tue', 'wed', 'fri']);
    const planned = plannedWorkouts(profile, gym, [], THURSDAY);
    expect(kindsOf(planned)).toEqual(['push-arms', 'lower', 'pull-arms', 'push-arms']);
    const order = {
      days: planned.map((day, at) => ({
        day: localDayKey(day.date),
        templateId: ['push-arms', 'push-arms', 'lower', 'pull-arms'][at] as string,
        was: day.workout.templateId,
      })),
      spared: [],
      fewer: [],
    };
    const built = plannedWorkouts(profile, gym, [], THURSDAY, null, 'default', { order });
    expect(tooSoonAhead(built, [])).toEqual([]);
    expect(sessionsOf(planned, 'forearms')).toBe(1);
    expect(sessionsOf(built, 'forearms')).toBe(0);
    expect(setsOf(built, 'forearms')).toBeGreaterThanOrEqual(5);
    expect(splitOrder({ profile, location: gym, history: [], now: THURSDAY })).toBeNull();
  });

  it('takes an order that gives a muscle fewer sets where it keeps it over its target', () => {
    // A strength lifter on five days but Thursday and Saturday, on Monday: pull, lower, push, full
    // body, full body spares the quads and hamstrings. Built in it, the upper back has 14.5 sets
    // where the rotation's week gives it 16.5: its target is 13, so the goal loses nothing.
    const profile = strength(['mon', 'tue', 'wed', 'fri', 'sun']);
    const planned = plannedWorkouts(profile, gym, [], MONDAY);
    const order = splitOrder({ profile, location: gym, history: [], now: MONDAY });
    expect(templatesOf(order)).toEqual([
      'pull-arms',
      'lower',
      'push-arms',
      'full-body',
      'full-body',
    ]);
    const built = plannedWorkouts(profile, gym, [], MONDAY, null, 'default', { order });
    expect(setsOf(planned, 'upper-back')).toBe(16.5);
    expect(setsOf(built, 'upper-back')).toBe(14.5);
  });

  it('says apart the muscles it spares the whole week and those on fewer days', () => {
    // A strength lifter on Monday, Tuesday, Thursday and Saturday after two weeks as planned, on
    // Thursday: the order spares the chest, front delts and triceps, and the biceps, too soon on
    // Thursday and Tuesday in the rotation's week, on fewer days.
    const profile = strength(['mon', 'tue', 'thu', 'sat']);
    const history = followed(profile, THURSDAY);
    const order = splitOrder({ profile, location: gym, history, now: THURSDAY });
    expect(order?.spared).toEqual(['chest', 'front-delts', 'triceps']);
    expect(order?.fewer).toEqual(['biceps']);
  });

  it('builds in full only orders better session by session', () => {
    // A strength lifter on Monday, Tuesday, Wednesday and Friday, on Monday: full body, lower, push,
    // pull spares the biceps. Read without the session by session reading first, three orders no
    // better would be built in its place, and none taken.
    const profile = strength(['mon', 'tue', 'wed', 'fri']);
    const order = splitOrder({ profile, location: gym, history: [], now: MONDAY });
    expect(templatesOf(order)).toEqual(['full-body', 'lower', 'push-arms', 'pull-arms']);
    expect(order?.spared).toEqual(['biceps']);
  });

  it('reads no order where the schedule ticks more days than its sessions a week', () => {
    // Monday, Tuesday, Thursday and Friday ticked for three sessions: the plan reads the first three,
    // the week Monday, Tuesday and Thursday reorder, but the lifter picks the days trained.
    const ticked = {
      ...threeDays,
      schedule: { ...threeDays.schedule, availableDays: ['mon', 'tue', 'thu', 'fri'] as Weekday[] },
    };
    expect(kindsOf(plannedWorkouts(ticked, gym, [], MONDAY))).toEqual(
      kindsOf(plannedWorkouts(threeDays, gym, [], MONDAY)),
    );
    expect(
      splitOrder({ profile: threeDays, location: gym, history: [], now: MONDAY }),
    ).not.toBeNull();
    expect(splitOrder({ profile: ticked, location: gym, history: [], now: MONDAY })).toBeNull();
  });

  it('builds in full the orders that leave the goal’s muscles least worked hard too soon', () => {
    // Overall size (the legs, back and chest weigh more) on Monday to Friday, on Monday: the
    // rotation's Wednesday pull day works the back and arms inside Tuesday's upper day's windows.
    // Of the orders better session by session, the three that leave the goal's muscles least too
    // soon are built in full; none of them holds up, so the rotation's order stands. Ranked with
    // every muscle alike, another three are built, and one taken: the goal decides which are tried.
    const profile = onDays(['mon', 'tue', 'wed', 'thu', 'fri'], {
      ...base,
      goals: { ...base.goals, primary: 'overall-size', secondary: 'none' },
    });
    expect(kindsOf(plannedWorkouts(profile, gym, [], MONDAY))).toEqual([
      'lower',
      'upper',
      'pull-arms',
      'lower',
      'push-arms',
    ]);
    expect(perMuscle(tooSoonAhead(plannedWorkouts(profile, gym, [], MONDAY), [])).get('lats')).toBe(
      1,
    );
    expect(splitOrder({ profile, location: gym, history: [], now: MONDAY })).toBeNull();
  });

  it('holds the order through its week once a session of it is trained', () => {
    // Monday, Thursday and Saturday: on Monday the order puts the lower day first, the upper day on
    // Thursday, and keeps Saturday's full body.
    const profile = onDays(['mon', 'thu', 'sat']);
    const order = splitOrder({ profile, location: gym, history: [], now: MONDAY })!;
    expect(order.days.map((day) => [day.templateId, day.was])).toEqual([
      ['lower', 'upper'],
      ['upper', 'lower'],
      ['full-body', 'full-body'],
    ]);
    // Monday trained in it, the record keeping it: Thursday holds the upper day. Read afresh,
    // Thursday would be a lower day again.
    const thursday = addLocalDays(MONDAY, 3);
    const week = trained(profile, MONDAY, 3);
    expect(week.map((day) => day.templateId)).toEqual(['lower']);
    expect(splitOrder({ profile, location: gym, history: week, now: thursday })).toEqual(order);
    const fresh = splitOrder({
      profile,
      location: gym,
      history: withoutOrders(week),
      now: thursday,
    });
    expect(fresh?.days[0]?.templateId).toBe('lower');
    // A catch-up between is no session of the split, and the order still holds.
    const tuesday = addLocalDays(MONDAY, 1);
    const caughtUp = [
      ...week,
      {
        ...withoutOrders(week)[0]!,
        id: 'w-catch-up',
        templateId: 'catch-up',
        startedAt: tuesday,
        completedAt: tuesday,
      },
    ];
    expect(splitOrder({ profile, location: gym, history: caughtUp, now: thursday })).toEqual(order);
    // A day of it gone by untrained (Thursday, read on Saturday), or days that are no longer the
    // plan's: read afresh.
    const saturday = addLocalDays(MONDAY, 5);
    expect(splitOrder({ profile, location: gym, history: week, now: saturday })).toEqual(
      splitOrder({ profile, location: gym, history: withoutOrders(week), now: saturday }),
    );
    const moved = onDays(['mon', 'fri', 'sat']);
    expect(splitOrder({ profile: moved, location: gym, history: week, now: thursday })).toEqual(
      splitOrder({ profile: moved, location: gym, history: withoutOrders(week), now: thursday }),
    );
  });

  it('holds no order read for other days once the days are saved anew', () => {
    // Monday, Thursday and Saturday, Monday trained in the order: the lower day in place of the
    // upper day. Saved on Tuesday for Tuesday, Thursday and Saturday, the order's days ahead are
    // still the plan's, but held it would give Thursday the upper day and the week no lower day
    // (the re-check of the review). Read afresh for the new days: none, and the week is the
    // rotation's.
    const old = onDays(['mon', 'thu', 'sat']);
    const history = trained(old, MONDAY, 1);
    expect(history.map((record) => record.templateId)).toEqual(['lower']);
    expect(history[0]!.splitOrder?.schedule).toBe(scheduleOf(old));
    const tuesday = addLocalDays(MONDAY, 1);
    const moved = onDays(['tue', 'thu', 'sat']);
    const order = splitOrder({ profile: moved, location: gym, history, now: tuesday });
    expect(order).toBeNull();
    expect(
      kindsOf(plannedWorkouts(moved, gym, history, tuesday, null, 'default', { order })),
    ).toEqual(['upper', 'full-body', 'lower']);
    // The days saved back, it holds again, ticked in any order.
    expect(splitOrder({ profile: old, location: gym, history, now: tuesday })).toEqual(
      history[0]!.splitOrder,
    );
    const reticked = onDays(['sat', 'mon', 'thu']);
    expect(splitOrder({ profile: reticked, location: gym, history, now: tuesday })).toEqual(
      history[0]!.splitOrder,
    );
  });

  it('holds no order read for other sessions a week on the same days', () => {
    // A strength lifter on Monday, Wednesday and Thursday, Monday trained in the order: Wednesday's
    // upper day and Thursday's lower day in each other's places. Saved for four sessions a week on the
    // same three days, the split is the five-template one, which has every template of the order but
    // another rotation: read afresh.
    const strength = onDays(['mon', 'wed', 'thu'], {
      ...base,
      goals: { ...base.goals, primary: 'strength', secondary: 'none' },
    });
    const history = trained(strength, MONDAY, 1);
    const held = history[0]!.splitOrder!;
    expect(held.days.map((day) => [day.templateId, day.was])).toEqual([
      ['full-body', 'full-body'],
      ['upper', 'lower'],
      ['lower', 'upper'],
    ]);
    expect(held.schedule).toBe('mon,wed,thu/3');
    const tuesday = addLocalDays(MONDAY, 1);
    expect(splitOrder({ profile: strength, location: gym, history, now: tuesday })).toEqual(held);
    const four = { ...strength, schedule: { ...strength.schedule, weeklyFrequency: 4 } };
    expect(splitOrder({ profile: four, location: gym, history, now: tuesday })).not.toEqual(held);
  });

  it('keeps the rotation in its own days after a week trained in an order', () => {
    // Monday, Tuesday and Thursday trained in the order, lower, upper and full body, where the
    // rotation gave upper, lower, full body: the next Monday is the rotation's next, the upper day.
    // Read as trained, the order would decide the weeks after: the lower day again.
    const week = trained(threeDays, MONDAY, 7);
    expect(week.map((day) => day.templateId)).toEqual(['lower', 'upper', 'full-body']);
    const next = addLocalDays(MONDAY, 7);
    const choice = (history: readonly WorkoutRecord[]) =>
      generateWorkout({
        profile: threeDays,
        location: gym,
        history,
        now: next,
        duration: 'default',
      }).templateId;
    expect(choice(week)).toBe('upper');
    expect(choice(withoutOrders(week))).toBe('lower');
    // A week not trained through in its order is read as trained: Monday, Tuesday and Friday, the
    // Tuesdays of the 8th and the 15th missed. The order read on Friday the 11th, full body and lower
    // in each other's days, went by with Tuesday the 15th untrained: Monday the 21st reads Friday's
    // full body and Monday's lower day where they were, and the full body is the longest ago.
    const missedTuesdays = onDays(['mon', 'tue', 'fri']);
    const partial = trained(missedTuesdays, MONDAY, 14, [1, 8]);
    expect(partial.map((day) => [localDayKey(day.startedAt).slice(5), day.templateId])).toEqual([
      ['09-07', 'upper'],
      ['09-11', 'full-body'],
      ['09-14', 'lower'],
      ['09-18', 'upper'],
    ]);
    expect(partial[1]!.splitOrder?.days.map((day) => [day.templateId, day.was])).toEqual([
      ['full-body', 'lower'],
      ['lower', 'full-body'],
      ['upper', 'upper'],
    ]);
    const read = (history: readonly WorkoutRecord[]) =>
      generateWorkout({
        profile: missedTuesdays,
        location: gym,
        history,
        now: addLocalDays(MONDAY, 14),
        duration: 'default',
      }).templateId;
    expect(read(partial)).toBe('full-body');
    expect(read(withoutOrders(partial))).toBe('full-body');
    // The week as Plan plans it from Tuesday keeps the order on its days, so the Monday after is the
    // rotation's next there too.
    const tuesdayPlan = plannedWorkouts(
      threeDays,
      gym,
      week.slice(0, 1),
      addLocalDays(MONDAY, 1),
      null,
      'default',
      {
        order: week[0]!.splitOrder!,
      },
    );
    expect(kindsOf(tuesdayPlan)).toEqual(['upper', 'full-body', 'upper']);
  });

  it('says in Why this workout where the order spares a muscle on fewer days, and drops it from a copy', () => {
    const planned = plannedWorkouts(threeDays, gym, [], MONDAY);
    const order = {
      days: planned.map((day, at) => ({
        day: localDayKey(day.date),
        templateId: ['lower', 'upper', 'full-body'][at] as string,
        was: day.workout.templateId,
      })),
      spared: [],
      fewer: ['quads' as const],
    };
    const workout = generateWorkout({
      profile: threeDays,
      location: gym,
      history: [],
      now: MONDAY,
      duration: 'default',
      constraints: { splitOrder: order },
    });
    const line =
      'Lower body today in place of Upper body: in this order the quads is worked hard again inside its recovery window on fewer days in the week ahead.';
    expect(workout.explanation.reasons).toContain(line);
    // A copy saved of the day is no day of the order: its line goes, and no other.
    const kept = withoutOrderLines(workout.explanation.reasons);
    expect(kept).not.toContain(line);
    expect(kept).toEqual(workout.explanation.reasons.filter((reason) => reason !== line));
  });

  it('says what an order spares in full and on fewer days', () => {
    expect(orderWords({ spared: ['quads', 'glutes'], fewer: [] })).toBe(
      'the quads and glutes are not worked hard again inside their recovery windows',
    );
    expect(orderWords({ spared: [], fewer: ['biceps'] })).toBe(
      'the biceps is worked hard again inside its recovery window on fewer days',
    );
    expect(orderWords({ spared: ['quads'], fewer: ['biceps', 'triceps'] })).toBe(
      'the quads is not worked hard again inside its recovery window, and the biceps and triceps are worked hard again inside their recovery windows on fewer days',
    );
    expect(orderWords({ spared: [], fewer: [] })).toBeNull();
  });

  it('has no day to order in a week with none left', () => {
    // Monday alone, trained today: the next Monday lies past the week ahead.
    const profile = onDays(['mon']);
    const history = [
      liftedAsPlanned(MONDAY, plannedWorkouts(profile, gym, [], MONDAY)[0]!.workout),
    ];
    expect(plannedWorkouts(profile, gym, history, MONDAY)).toEqual([]);
    expect(splitOrder({ profile, location: gym, history, now: MONDAY })).toBeNull();
  });

  it('gives the lift to push the days ahead in the order, its weekly cap read from them', () => {
    // Monday, Tuesday, Thursday and Friday, the bench press pushed to 225, today the lower day: in
    // this order Thursday's push day and Friday's upper day both work the triceps, which an extra
    // bench press today would take past their weekly cap. Read in the rotation's days it would not.
    const profile: UserProfile = {
      ...onDays(['mon', 'tue', 'thu', 'fri']),
      pushLift: {
        exerciseId: 'barbell-bench-press',
        target: 225,
        units: 'lb',
        since: '2026-08-01T12:00:00.000Z',
      },
    };
    const day = (offset: number) => localDayKey(addLocalDays(MONDAY, offset));
    const order = {
      days: [
        { day: day(0), templateId: 'lower', was: 'push-arms' },
        { day: day(1), templateId: 'pull-arms', was: 'lower' },
        { day: day(3), templateId: 'push-arms', was: 'pull-arms' },
        { day: day(4), templateId: 'upper', was: 'push-arms' },
      ],
      spared: [],
      fewer: [],
    };
    const build = (constraints: Parameters<typeof generateWorkout>[0]['constraints']) =>
      generateWorkout({
        profile,
        location: gym,
        history: [],
        now: MONDAY,
        duration: 'default',
        constraints,
      });
    expect(build({ splitOrder: order }).explanation.reasons).toContain(
      'No extra Barbell Bench Press today: triceps are at the weekly cap.',
    );
    const plain = build({ templateId: 'lower' });
    expect(allEntries(plain.blocks).some((entry) => entry.push === 'extra')).toBe(true);
  });

  it('reads the days after the order’s week in the rotation’s own days for the lift to push', () => {
    // Monday, Thursday, Saturday and Sunday, the bench press pushed to 225, trained as planned in the
    // order the plan reads from Monday the 7th. On Thursday the 24th, the pull day of the order read
    // on the 20th, the week's extra bench press goes in at three sets: the days after the order's
    // week are planned with the week trained through in it, as Plan plans them, and Sunday is a pull
    // day (the re-check of the review). Read as if the week had not been trained in it, Sunday would
    // be the push day, its triceps work taking sets off the extra for the weekly cap.
    const profile: UserProfile = {
      ...onDays(['mon', 'thu', 'sat', 'sun']),
      pushLift: {
        exerciseId: 'barbell-bench-press',
        target: 225,
        units: 'lb',
        since: '2026-08-01T12:00:00.000Z',
      },
    };
    const thursday = addLocalDays(MONDAY, 17);
    const history = trained(profile, MONDAY, 17);
    const order = splitOrder({ profile, location: gym, history, now: thursday })!;
    expect(order.days.map((day) => [day.day.slice(5), day.templateId, day.was])).toEqual([
      ['09-20', 'lower', 'lower'],
      ['09-21', 'push-arms', 'pull-arms'],
      ['09-24', 'pull-arms', 'push-arms'],
      ['09-26', 'lower', 'lower'],
    ]);
    expect(
      kindsOf(plannedWorkouts(profile, gym, history, thursday, null, 'default', { order })),
    ).toEqual(['pull-arms', 'lower', 'pull-arms', 'push-arms']);
    const capped = (workout: GeneratedWorkout) =>
      workout.explanation.reasons.some((line) => line.includes('stay under their weekly cap'));
    const build = (constraints: Parameters<typeof generateWorkout>[0]['constraints'] = {}) =>
      generateWorkout({
        profile,
        location: gym,
        history,
        now: thursday,
        duration: 'default',
        constraints: { splitOrder: order, ...constraints },
      });
    const today = build();
    const extra = allEntries(today.blocks).find((entry) => entry.push === 'extra')!;
    expect(extra.exerciseId).toBe('barbell-bench-press');
    expect(extra.sets.filter((set) => set.kind === 'working')).toHaveLength(3);
    expect(capped(today)).toBe(false);
    // A rebuild keeping the extra reads the days after it so too.
    const rebuilt = build({
      templateId: today.templateId,
      keep: [{ entry: extra, frozen: false }],
      keepBlocks: today.blocks,
    });
    expect(capped(rebuilt)).toBe(false);
  });

  it('says it on Plan while a day it moved is still ahead', () => {
    const order = splitOrder({ profile: threeDays, location: gym, history: [], now: MONDAY })!;
    const week = plannedWorkouts(threeDays, gym, [], MONDAY, null, 'default', { order }).map(
      (day) => ({ date: day.date, templateId: day.workout.templateId }),
    );
    expect(splitOrderLine(order, week)).toBe(
      'In this order the quads, hamstrings and glutes are not worked hard again inside their recovery windows.',
    );
    // Only Thursday's full body left, which the order did not move: nothing to say.
    expect(splitOrderLine(order, week.slice(2))).toBeNull();
  });
});

describe('the week the order is read from, as the store plans it (Maintenance 38)', () => {
  const kinds = kindsOf;

  it('plans the lasting swaps every plan reads', () => {
    const swap = {
      from: 'barbell-bench-press',
      to: 'dumbbell-bench-press',
      setAt: MONDAY,
      until: addLocalDays(MONDAY, 28),
    };
    const lifts = (planned: ReturnType<typeof plannedWorkouts>) =>
      new Set(
        planned.flatMap((day) => allEntries(day.workout.blocks).map((entry) => entry.exerciseId)),
      );
    expect(lifts(plannedWorkouts(threeDays, gym, [], MONDAY))).toContain('barbell-bench-press');
    const swapped = lifts(
      plannedWorkouts(threeDays, gym, [], MONDAY, null, 'default', { swaps: [swap] }),
    );
    expect(swapped).not.toContain('barbell-bench-press');
    expect(swapped).toContain('dumbbell-bench-press');
  });

  it('plans the coach focus until a session trains its muscle, as a saved session clears it', () => {
    expect(kinds(plannedWorkouts(threeDays, gym, [], MONDAY))).toEqual([
      'upper',
      'lower',
      'full-body',
    ]);
    // Led by the quads, Monday is the full body; the focus done, the days after are the rotation's.
    const focus = createFocus('quads', MONDAY);
    expect(kinds(plannedWorkouts(threeDays, gym, [], MONDAY, null, 'default', { focus }))).toEqual([
      'full-body',
      'upper',
      'lower',
    ]);
  });

  it('plans the days after a held order’s last day as Plan does', () => {
    // Monday, Wednesday and Saturday, trained in the order the plan reads from Wednesday the 9th: on
    // Monday the 21st, the last day of the order read on the 16th, the week model plans Wednesday
    // and Saturday after a week trained through in it, read in the rotation's own days, as Plan
    // does (the re-check of the review: it planned them as if the week had not been trained in it).
    const profile = onDays(['mon', 'wed', 'sat']);
    const start = addLocalDays(RECORD_NOW, -1);
    const monday = addLocalDays(start, 12);
    const history = trained(profile, start, 12);
    const order = splitOrder({ profile, location: gym, history, now: monday });
    expect(order?.days.map((day) => [day.day.slice(5), day.templateId, day.was])).toEqual([
      ['09-16', 'upper', 'upper'],
      ['09-19', 'full-body', 'lower'],
      ['09-21', 'lower', 'full-body'],
    ]);
    const week = plannedWorkouts(profile, gym, history, monday, null, 'default', {
      order,
    }).filter((day) => localWeekKey(day.date) === localWeekKey(monday));
    const model = weekModel({ profile, location: gym, history, now: monday, order });
    const apart = MUSCLE_IDS.filter(
      (muscle) => Math.abs(setsOf(week, muscle) - model.muscles[muscle].planned) > 1e-9,
    );
    expect(apart, kindsOf(week).join(', ')).toEqual([]);
  });

  it('gives the week model the days in the order, today with them', () => {
    const order = splitOrder({ profile: threeDays, location: gym, history: [], now: MONDAY });
    const at = (with_: boolean) =>
      weekModel({
        profile: threeDays,
        location: gym,
        history: [],
        now: MONDAY,
        ...(with_ ? { order } : {}),
      }).muscles.quads.plannedToday;
    // Today the lower day in the order, the upper day in the rotation's.
    expect(at(true)).toBeGreaterThan(0);
    expect(at(false)).toBe(0);
  });
});
