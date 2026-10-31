import { describe, expect, it } from 'vitest';
import { requireExercise } from '../../catalog/exercises/catalog';
import type { MuscleId } from '../../catalog/muscles/muscles';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';
import type { WorkoutRecord } from '../validation/workoutRecord';
import {
  allEntries,
  isStopped,
  type GeneratedWorkout,
  type WorkoutEntry,
} from '../../engine/workout/types';
import { templateDose } from '../../engine/workoutGenerator/generate';
import { describeWorkout, directFor, directSets, working } from '../../test/clockDays';
import { restCategory } from '../../engine/progression/roles';
import { dayNoteOf } from '../../features/today/dayNote';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 31, the owner's items 12 and 32, in the store: a day not ticked offers a catch-up to
 * a lifter in training, with the full session one tap away; a second workout the same day leads
 * with what was missed. TEST_NOW is a Wednesday, which the default schedule does not tick.
 */

const DAY = 86_400_000;
const daysBefore = (days: number) => new Date(Date.parse(TEST_NOW) - days * DAY).toISOString();

async function lifter(
  history: { daysAgo: number; exerciseId: string; templateId?: string }[],
  changes: Partial<UserProfile> = {},
  now: () => string = () => TEST_NOW,
) {
  const handle = createTestStore({ now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...changes },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  for (const { daysAgo, exerciseId, templateId } of history) {
    const when = daysBefore(daysAgo);
    await db.put('workouts', {
      ...record(
        0,
        exerciseId,
        [
          [10, 100, 2],
          [10, 100, 2],
          [10, 100, 2],
        ],
        [8, 12],
        2,
      ),
      id: `w-${exerciseId}-${daysAgo}`,
      startedAt: when,
      completedAt: when,
      ...(templateId ? { templateId } : {}),
    });
  }
  await handle.store.hydrate();
  return handle;
}
type Handle = Awaited<ReturnType<typeof lifter>>;
const session = (handle: Handle) => handle.store.getSnapshot().session!;

/** The day's workout begun and finished, each working set logged or none, the summary put away. */
async function doTheWorkout(handle: Handle, log = true) {
  handle.store.startWorkout();
  if (log) {
    for (const entry of allEntries(session(handle).workout.blocks)) {
      for (const set of entry.sets.filter((candidate) => candidate.kind === 'working')) {
        await handle.store.logSet(entry.id, set.index, {
          weight: set.targetWeight,
          reps: set.targetReps[1],
          rir: 2,
        });
      }
    }
  }
  await handle.store.finishWorkout(null);
  handle.store.dismissCompletion();
}

/** The muscles worked directly by the workouts begun today. */
const trainedToday = (handle: Handle) =>
  new Set<MuscleId>(
    handle.store
      .getSnapshot()
      .history.filter((item) => item.startedAt === TEST_NOW)
      .flatMap((item) => item.entries)
      .flatMap((entry) => requireExercise(entry.exerciseId).primaryMuscles),
  );

const schedule = createDefaultProfile(TEST_NOW).schedule;
const wednesdayTicked: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: [...schedule.availableDays, 'wed'], weeklyFrequency: 5 },
};
/**
 * Three sessions a week, Monday, Wednesday and Friday, the full body, upper and lower sessions in
 * turn: upper last Friday and lower on Monday make this Wednesday's first workout the full body one.
 */
const threeDays: Partial<UserProfile> = {
  schedule: { ...schedule, availableDays: ['mon', 'wed', 'fri'], weeklyFrequency: 3 },
};
const upperThenLower = [
  { daysAgo: 5, exerciseId: 'barbell-bench-press', templateId: 'upper' },
  { daysAgo: 2, exerciseId: 'back-squat', templateId: 'lower' },
];

describe('a day not ticked (item 12)', () => {
  it('offers a lifter in training a catch-up, saying so in one line, the full session a tap away', async () => {
    // Monday's bench press: the chest is done for this week's Monday, and the week goes on.
    const handle = await lifter([{ daysAgo: 2, exerciseId: 'barbell-bench-press' }]);
    const today = session(handle);
    expect(today.workout.templateId).toBe('catch-up');
    expect(today.constraints.catchUp?.kind).toBe('catch-up');
    const note = dayNoteOf(today);
    expect(note?.text).toBe(
      `Not one of your training days: a ${today.workout.duration.estimatedMinutes}-minute catch-up for what is behind this week.`,
    );
    expect(note).not.toHaveProperty('action');
    // Built only from the muscles the spec names.
    const muscles = new Set(today.constraints.catchUp!.muscles.map((item) => item.muscle));
    expect(allEntries(today.workout.blocks).length).toBeLessThanOrEqual(muscles.size);
  });

  it('takes the full session on a tap, and the catch-up again on another', async () => {
    const handle = await lifter([{ daysAgo: 2, exerciseId: 'barbell-bench-press' }]);
    await handle.store.setFullSession(true);
    const full = session(handle);
    expect(full.workout.templateId).not.toBe('catch-up');
    expect(full.constraints.fullSession).toBe(true);
    expect(dayNoteOf(full)).toEqual({
      text: 'Not one of your training days.',
    });
    await handle.store.setFullSession(false);
    expect(session(handle).workout.templateId).toBe('catch-up');
    expect(session(handle).constraints.fullSession).toBeUndefined();
  });

  it('keeps the full session through a later plan the same day', async () => {
    const handle = await lifter([{ daysAgo: 2, exerciseId: 'barbell-bench-press' }]);
    await handle.store.setFullSession(true);
    // A workout from another device lands: the plan is built again, the lifter's choice kept.
    const db = await handle.store.getDatabase();
    const when = daysBefore(1);
    await db.put('workouts', {
      ...record(0, 'back-squat', [[5, 200, 2]], [4, 6], 2),
      id: 'w-elsewhere',
      startedAt: when,
      completedAt: when,
    });
    await handle.store.hydrate();
    expect(session(handle).workout.templateId).not.toBe('catch-up');
    expect(session(handle).constraints.fullSession).toBe(true);
  });

  it('finds the catch-up it emptied on the way back, through a later plan the same day', async () => {
    // The seventeenth review of round M: the way back laid the catch-up out again.
    const handle = await lifter([{ daysAgo: 2, exerciseId: 'barbell-bench-press' }]);
    for (const entry of allEntries(session(handle).workout.blocks)) {
      await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
    }
    expect(allEntries(session(handle).workout.blocks)).toEqual([]);
    await handle.store.setFullSession(true);
    // An old workout from another device lands: the plan is built again, the offer the same.
    const db = await handle.store.getDatabase();
    const when = daysBefore(20);
    await db.put('workouts', {
      ...record(0, 'back-squat', [[5, 200, 2]], [4, 6], 2),
      id: 'w-elsewhere',
      startedAt: when,
      completedAt: when,
    });
    await handle.store.hydrate();
    expect(session(handle).constraints.fullSession).toBe(true);
    expect(allEntries(session(handle).workout.blocks).length).toBeGreaterThan(0);
    await handle.store.setFullSession(false);
    expect(allEntries(session(handle).workout.blocks)).toEqual([]);
    expect(dayNoteOf(session(handle))?.text).toBe(
      'Not one of your training days: nothing more for today.',
    );
  });

  it('keeps the catch-up through a change of length, and the full session too', async () => {
    const handle = await lifter([{ daysAgo: 2, exerciseId: 'barbell-bench-press' }]);
    await handle.store.setDurationChoice(30);
    expect(session(handle).workout.templateId).toBe('catch-up');
    expect(session(handle).constraints.catchUp?.kind).toBe('catch-up');
    await handle.store.setFullSession(true);
    await handle.store.setDurationChoice(45);
    expect(session(handle).workout.templateId).not.toBe('catch-up');
    expect(session(handle).constraints.fullSession).toBe(true);
    expect(dayNoteOf(session(handle))).not.toHaveProperty('action');
  });

  it('keeps the full session through a plan built again for a coach focus', async () => {
    const handle = await lifter([{ daysAgo: 2, exerciseId: 'barbell-bench-press' }]);
    await handle.store.setFullSession(true);
    await handle.store.setCoachFocus('lats');
    expect(session(handle).workout.templateId).not.toBe('catch-up');
    expect(session(handle).constraints.fullSession).toBe(true);
  });

  it('gives a new lifter, or one back after a break, the full session', async () => {
    expect(session(await lifter([])).workout.templateId).not.toBe('catch-up');
    expect(session(await lifter([])).constraints.catchUp).toBeUndefined();
    const back = await lifter([{ daysAgo: 20, exerciseId: 'barbell-bench-press' }]);
    expect(session(back).constraints.catchUp).toBeUndefined();
  });

  it('plans the regular session on a ticked day', async () => {
    const handle = await lifter([{ daysAgo: 2, exerciseId: 'barbell-bench-press' }], {
      schedule: {
        ...createDefaultProfile(TEST_NOW).schedule,
        availableDays: ['mon', 'wed', 'fri'],
        weeklyFrequency: 3,
      },
    });
    expect(session(handle).constraints.catchUp).toBeUndefined();
    expect(dayNoteOf(session(handle))).toBeNull();
  });

  it('holds no catch-up in a deload week', async () => {
    const handle = await lifter([{ daysAgo: 2, exerciseId: 'barbell-bench-press' }]);
    expect(session(handle).constraints.catchUp?.kind).toBe('catch-up');
    // A length chosen today: the plan built again keeps it, and reads the day's offer afresh.
    await handle.store.setDurationChoice(30);
    await handle.store.setFullSession(true);
    // A window that covers today: the plan is built again, and the week holds back what pushes.
    await handle.store.planDeloadWeek({
      recommended: true,
      window: { startsAt: daysBefore(1), endsAt: daysBefore(-6) },
      reasons: ['8 sessions in the last 14 days.'],
    });
    expect(session(handle).constraints.catchUp ?? null).toBeNull();
    expect(session(handle).constraints.fullSession).toBeUndefined();
    expect(dayNoteOf(session(handle))).toBeNull();
  });
});

/** The day's regular workout done in full, on a Wednesday ticked: the next plan is the second. */
async function afterFirstWorkout() {
  const handle = await lifter([{ daysAgo: 6, exerciseId: 'back-squat' }], {
    schedule: { ...schedule, availableDays: [...schedule.availableDays, 'wed'] },
  });
  await doTheWorkout(handle);
  return handle;
}

describe('a second workout the same day (item 32)', () => {
  it('holds no lift that works a muscle trained today and sitting out', async () => {
    const second = session(await afterFirstWorkout());
    const spec = second.constraints.catchUp!;
    expect(spec.kind).toBe('second');
    const sitOut = new Set(spec.sitOut);
    for (const entry of allEntries(second.workout.blocks)) {
      expect(
        requireExercise(entry.exerciseId).primaryMuscles.some((muscle) => sitOut.has(muscle)),
      ).toBe(false);
    }
  });

  it('takes the full session on a tap, and goes easy again on another', async () => {
    const handle = await afterFirstWorkout();
    await handle.store.setFullSession(true);
    expect(session(handle).constraints.fullSession).toBe(true);
    expect(session(handle).lastSummary?.headline).toMatch(/^The full session/);
    expect(dayNoteOf(session(handle))).toEqual({
      text: 'You trained today.',
    });
    await handle.store.setFullSession(false);
    expect(session(handle).constraints.fullSession).toBeUndefined();
    expect(session(handle).lastSummary?.headline).toMatch(/^The second workout/);
    expect(dayNoteOf(session(handle))?.text).toMatch(/^You trained today[,:]/);
  });

  it('leads with what was missed once a workout is done today; what was trained sits out', async () => {
    // Wednesday ticked: the first workout is the day's regular one.
    const handle = await lifter([{ daysAgo: 6, exerciseId: 'back-squat' }], {
      schedule: { ...schedule, availableDays: [...schedule.availableDays, 'wed'] },
    });
    handle.store.startWorkout();
    const first = session(handle);
    expect(first.constraints.catchUp).toBeUndefined();
    const lead = allEntries(first.workout.blocks)[0]!.exerciseId;
    for (const entry of allEntries(first.workout.blocks)) {
      for (const set of entry.sets.filter((candidate) => candidate.kind === 'working')) {
        await handle.store.logSet(entry.id, set.index, {
          weight: set.targetWeight,
          reps: set.targetReps[1],
          rir: 2,
        });
      }
    }
    await handle.store.finishWorkout(null);
    handle.store.dismissCompletion();
    const second = session(handle);
    expect(second.constraints.catchUp?.kind).toBe('second');
    const spec = second.constraints.catchUp!;
    expect(spec.sitOut.length).toBeGreaterThan(0);
    // The main lift done today in full does not come back: its muscles had their dose.
    expect(allEntries(second.workout.blocks).map((entry) => entry.exerciseId)).not.toContain(lead);
    expect(dayNoteOf(second)?.text).toMatch(/^You trained today/);
  });
});

describe('the day’s offer, the review of round M', () => {
  it('follows the schedule saved: ticking today ends the catch-up and its line', async () => {
    const handle = await lifter([{ daysAgo: 2, exerciseId: 'barbell-bench-press' }]);
    expect(session(handle).workout.templateId).toBe('catch-up');
    await handle.store.saveProfile({ ...handle.store.getSnapshot().profile!, ...wednesdayTicked });
    expect(session(handle).constraints.catchUp).toBeUndefined();
    expect(session(handle).workout.templateId).not.toBe('catch-up');
    expect(dayNoteOf(session(handle))).toBeNull();
  });

  it('follows the schedule saved: unticking today offers the catch-up, in one line', async () => {
    const handle = await lifter(
      [{ daysAgo: 2, exerciseId: 'barbell-bench-press' }],
      wednesdayTicked,
    );
    expect(dayNoteOf(session(handle))).toBeNull();
    await handle.store.saveProfile({ ...handle.store.getSnapshot().profile!, schedule });
    expect(session(handle).workout.templateId).toBe('catch-up');
    expect(dayNoteOf(session(handle))?.text).toMatch(/^Not one of your training days: a /);
  });

  it('keeps the full session taken through a profile save that keeps the offer', async () => {
    const handle = await lifter([{ daysAgo: 2, exerciseId: 'barbell-bench-press' }]);
    await handle.store.setFullSession(true);
    await handle.store.saveProfile({ ...handle.store.getSnapshot().profile!, bodyweight: 190 });
    expect(session(handle).constraints.catchUp?.kind).toBe('catch-up');
    expect(session(handle).constraints.fullSession).toBe(true);
    expect(session(handle).workout.templateId).not.toBe('catch-up');
  });

  it('leaves a workout begun as it is: a schedule saved mid-workout keeps its catch-up', async () => {
    const handle = await lifter([{ daysAgo: 2, exerciseId: 'barbell-bench-press' }]);
    handle.store.startWorkout();
    await handle.store.saveProfile({ ...handle.store.getSnapshot().profile!, ...wednesdayTicked });
    expect(session(handle).status).not.toBe('preview');
    expect(session(handle).constraints.catchUp?.kind).toBe('catch-up');
    expect(session(handle).workout.templateId).toBe('catch-up');
  });

  it('follows the experience saved: a beginner’s muscles trained today all sit out', async () => {
    const handle = await lifter(upperThenLower, threeDays);
    await doTheWorkout(handle);
    const trained = trainedToday(handle);
    expect(session(handle).constraints.catchUp?.kind).toBe('second');
    await handle.store.saveProfile({
      ...handle.store.getSnapshot().profile!,
      experience: 'beginner',
    });
    const second = session(handle);
    expect(second.constraints.catchUp?.muscles.filter((item) => item.why === 'remainder')).toEqual(
      [],
    );
    const again = allEntries(second.workout.blocks)
      .filter((entry) =>
        requireExercise(entry.exerciseId).primaryMuscles.some((muscle) => trained.has(muscle)),
      )
      .map((entry) => entry.exerciseId);
    expect(again).toEqual([]);
  });

  it('counts a workout begun today only once a set of it is done', async () => {
    const handle = await lifter([{ daysAgo: 6, exerciseId: 'back-squat' }], wednesdayTicked);
    expect(dayNoteOf(session(handle))).toBeNull();
    // Begun by mistake and finished at once, nothing logged.
    await doTheWorkout(handle, false);
    expect(handle.store.getSnapshot().history.some((item) => item.startedAt === TEST_NOW)).toBe(
      true,
    );
    expect(session(handle).constraints.catchUp).toBeUndefined();
    expect(dayNoteOf(session(handle))).toBeNull();
  });

  it('keeps the full session taken through a workout begun and discarded', async () => {
    const handle = await lifter([{ daysAgo: 2, exerciseId: 'barbell-bench-press' }]);
    await handle.store.setFullSession(true);
    handle.store.startWorkout();
    handle.store.discardWorkout();
    expect(session(handle).constraints.fullSession).toBe(true);
    expect(session(handle).workout.templateId).not.toBe('catch-up');
  });

  it('in a deload week, a second workout still goes easy on what was done', async () => {
    const handle = await lifter(upperThenLower, threeDays);
    await handle.store.planDeloadWeek({
      recommended: true,
      window: { startsAt: daysBefore(1), endsAt: daysBefore(-6) },
      reasons: ['8 sessions in the last 14 days.'],
    });
    expect(session(handle).constraints.deload).not.toBeNull();
    expect(session(handle).workout.templateId).toBe('full-body');
    await doTheWorkout(handle);
    const trained = trainedToday(handle);
    const second = session(handle);
    expect(dayNoteOf(second)?.text).toMatch(/^You trained today/);
    const hard = allEntries(second.workout.blocks)
      .filter((entry) =>
        requireExercise(entry.exerciseId).primaryMuscles.some((muscle) => trained.has(muscle)),
      )
      .filter((entry) => entry.sets.some((set) => set.kind !== 'warmup' && set.targetRir < 3))
      .map((entry) => entry.exerciseId);
    expect(hard).toEqual([]);
  });

  it('after the day’s full body workout done in full, the quads have nothing left and sit out', async () => {
    const handle = await lifter(upperThenLower, threeDays);
    expect(session(handle).workout.templateId).toBe('full-body');
    await doTheWorkout(handle);
    const spec = session(handle).constraints.catchUp!;
    expect(spec.kind).toBe('second');
    expect(spec.sitOut).toContain('quads');
  });
});

/** A saved workout of bench press sets at `when`, with a template or none. */
const benchAt = (
  id: string,
  when: string,
  sets: number,
  templateId: string | null = null,
): WorkoutRecord => ({
  ...record(
    0,
    'barbell-bench-press',
    Array.from({ length: sets }, () => [10, 100, 2] as [number, number, number]),
    [8, 12],
    2,
  ),
  id,
  startedAt: when,
  completedAt: when,
  templateId,
});

/** A lifter with these workouts saved, on the clock given. */
async function withRecords(
  records: WorkoutRecord[],
  changes: Partial<UserProfile> = {},
  now: () => string = () => TEST_NOW,
) {
  const handle = createTestStore({ now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...changes },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  for (const item of records) await db.put('workouts', item);
  await handle.store.hydrate();
  return handle;
}

describe('the day’s offer, the second review of round M', () => {
  /** Monday's bench press: a lifter in training, offered a catch-up on Wednesday. */
  const monday = () => [benchAt('w-monday', daysBefore(2), 3)];

  it('a check-in short on time never makes the catch-up longer than its own length', async () => {
    const handle = await withRecords(monday(), {
      schedule: { ...schedule, typicalDurationMinutes: 45 },
    });
    const before = session(handle);
    expect(before.workout.templateId).toBe('catch-up');
    expect(before.workout.duration.targetMinutes).toBe(30);
    await handle.store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: 4,
        soreness: 2,
        sleep: 4,
        motivation: 4,
        jointDiscomfort: [],
        timePressure: true,
      },
    });
    const after = session(handle);
    expect(after.workout.duration.targetMinutes, after.lastSummary?.headline).toBeLessThanOrEqual(
      30,
    );
    expect(allEntries(after.workout.blocks).length).toBeLessThanOrEqual(
      allEntries(before.workout.blocks).length,
    );
  });

  it('End by on a catch-up ends at its own length, not the Default’s', async () => {
    const handle = await withRecords(monday());
    expect(session(handle).workout.duration.targetMinutes).toBe(45);
    await handle.store.setEndBy(true);
    const endBy = session(handle).constraints.endBy!;
    expect((Date.parse(endBy) - Date.parse(TEST_NOW)) / 60_000).toBeLessThanOrEqual(45);
  });

  it('after a catch-up done in full, its muscles sit out of the evening’s workout', async () => {
    const handle = await withRecords(monday());
    const catchUp = session(handle);
    expect(catchUp.workout.templateId).toBe('catch-up');
    expect(
      catchUp.constraints.catchUp!.muscles.find((item) => item.muscle === 'side-delts')?.sets,
    ).toBe(3);
    await doTheWorkout(handle);
    const second = session(handle);
    expect(second.constraints.catchUp?.kind).toBe('second');
    expect(
      second.constraints.catchUp!.muscles.filter((item) => item.why === 'remainder'),
      describeWorkout(second.workout).join('; '),
    ).not.toContainEqual(expect.objectContaining({ muscle: 'side-delts' }));
    expect(second.constraints.catchUp!.sitOut).toContain('side-delts');
  });

  it('reads what is left from the first workout with a set done, not one begun empty', async () => {
    const sunday = '2026-09-06T12:00:00.000Z';
    const profile = { ...createDefaultProfile(TEST_NOW), bodyweight: 185 } as UserProfile;
    // The upper session's own chest sets, in full.
    const dose = templateDose(profile, 'upper', 'chest');
    // Begun and left: the push day's chest work planned, no set of it done.
    const planned = benchAt('w-planned', '2026-09-06T07:00:00.000Z', 0).entries[0]!;
    const empty = {
      ...benchAt('w-empty', '2026-09-06T07:00:00.000Z', 0, 'push-arms'),
      entries: [
        { ...planned, plannedSets: 4, sets: [] },
        { ...planned, exerciseId: 'cable-fly', plannedSets: 3, sets: [] },
      ],
    };
    const upper = benchAt('w-upper', '2026-09-06T09:00:00.000Z', dose, 'upper');
    const lastSunday = benchAt('w-last', '2026-08-30T12:00:00.000Z', 3);
    // Without the empty start, the chest sits out (baseline).
    const plain = await withRecords([lastSunday, upper], {}, () => sunday);
    expect(session(plain).constraints.catchUp?.sitOut).toContain('chest');
    const handle = await withRecords([lastSunday, empty, upper], {}, () => sunday);
    const spec = session(handle).constraints.catchUp!;
    expect(spec.kind).toBe('second');
    expect(spec.muscles.map((item) => `${item.muscle}:${item.why}`)).not.toContain(
      'chest:remainder',
    );
    expect(spec.sitOut).toContain('chest');
  });

  it('a deload pull day done in full leaves the lats nothing more', async () => {
    const pushMonday = [benchAt('w-monday', daysBefore(2), 3, 'push-arms')];
    // The same pull day in a normal week leaves the lats nothing (baseline).
    const normal = await withRecords(pushMonday, wednesdayTicked);
    expect(session(normal).workout.templateId).toBe('pull-arms');
    await doTheWorkout(normal);
    expect(session(normal).constraints.catchUp?.sitOut).toContain('lats');
    const handle = await withRecords(pushMonday, wednesdayTicked);
    await handle.store.planDeloadWeek({
      recommended: true,
      window: { startsAt: daysBefore(1), endsAt: daysBefore(-6) },
      reasons: ['8 sessions in the last 14 days.'],
    });
    expect(session(handle).workout.templateId).toBe('pull-arms');
    await doTheWorkout(handle);
    const second = session(handle);
    expect(
      second.constraints.catchUp!.muscles.map((item) => `${item.muscle}:${item.why}`),
      describeWorkout(second.workout).join('; '),
    ).not.toContain('lats:remainder');
    expect(second.constraints.catchUp!.sitOut).toContain('lats');
  });

  it('ticking today and a technique in one save ends the catch-up and its line', async () => {
    const handle = await withRecords(monday());
    expect(session(handle).workout.templateId).toBe('catch-up');
    const profile = handle.store.getSnapshot().profile!;
    await handle.store.saveProfile({
      ...profile,
      schedule: {
        ...profile.schedule,
        availableDays: [...profile.schedule.availableDays, 'wed'],
        weeklyFrequency: 5,
      },
      techniques: { ...profile.techniques, dropSets: !profile.techniques.dropSets },
    });
    const today = session(handle);
    expect(today.constraints.catchUp, dayNoteOf(today, true)?.text).toBeUndefined();
    expect(today.workout.templateId).not.toBe('catch-up');
    expect(dayNoteOf(today, true)).toBeNull();
  });

  describe('the switch between the catch-up and the full session after a swap', () => {
    const patterns = (workout: ReturnType<typeof session>['workout']) =>
      allEntries(workout.blocks)
        .map((entry) => requireExercise(entry.exerciseId).movementPattern)
        .sort();

    it('gives the usual plan in full, whatever was swapped on the catch-up', async () => {
      const usual = await withRecords(monday());
      await usual.store.setFullSession(true);
      const handle = await withRecords(monday());
      const raise = allEntries(session(handle).workout.blocks).find(
        (entry) => entry.exerciseId === 'lateral-raise',
      )!;
      await handle.store.recalibrate({
        type: 'replace',
        entryId: raise.id,
        exerciseId: 'cable-lateral-raise',
      });
      await handle.store.setFullSession(true);
      const full = session(handle);
      expect(full.workout.templateId).toBe(session(usual).workout.templateId);
      expect(patterns(full.workout), describeWorkout(full.workout).join('; ')).toEqual(
        patterns(session(usual).workout),
      );
    });

    it('gives the catch-up back with every muscle’s lift, within its sets', async () => {
      const plain = await withRecords(monday());
      const spec = session(plain).constraints.catchUp!;
      const coveredPlain = new Set(
        allEntries(session(plain).workout.blocks).flatMap((entry) => entry.chosenFor),
      );
      const handle = await withRecords(monday());
      await handle.store.setFullSession(true);
      const chin = allEntries(session(handle).workout.blocks).find(
        (entry) => entry.exerciseId === 'chin-up',
      )!;
      await handle.store.recalibrate({ type: 'replace', entryId: chin.id, exerciseId: 'pull-up' });
      await handle.store.setFullSession(false);
      const back = session(handle);
      expect(back.workout.templateId).toBe('catch-up');
      const lifts = describeWorkout(back.workout).join('; ');
      const covered = new Set(allEntries(back.workout.blocks).flatMap((entry) => entry.chosenFor));
      expect(
        [...coveredPlain].filter((muscle) => !covered.has(muscle)),
        lifts,
      ).toEqual([]);
      for (const item of spec.muscles) {
        const sets = allEntries(back.workout.blocks)
          .filter((entry) => requireExercise(entry.exerciseId).primaryMuscles.includes(item.muscle))
          .reduce(
            (sum, entry) => sum + entry.sets.filter((set) => set.kind === 'working').length,
            0,
          );
        expect(sets, `${item.muscle}: ${lifts}`).toBeLessThanOrEqual(item.sets);
      }
    });
  });

  it('a full session begun on Saturday and discarded on Sunday leaves Sunday its catch-up', async () => {
    let now = '2026-09-05T17:00:00.000Z';
    const handle = await withRecords(
      [benchAt('w-thu', '2026-09-03T12:00:00.000Z', 3)],
      {},
      () => now,
    );
    expect(session(handle).constraints.catchUp?.kind).toBe('catch-up');
    await handle.store.setFullSession(true);
    handle.store.startWorkout();
    now = '2026-09-06T10:00:00.000Z';
    handle.store.discardWorkout();
    const sunday = session(handle);
    expect(sunday.baseKey.startsWith('2026-09-06|')).toBe(true);
    expect(
      sunday.constraints.fullSession,
      describeWorkout(sunday.workout).join('; '),
    ).toBeUndefined();
    expect(sunday.workout.templateId).toBe('catch-up');
  });
});

describe('the day’s offer, the third review of round M', () => {
  /** Monday's bench press: a lifter in training, offered a catch-up on Wednesday. */
  const monday = () => [benchAt('w-monday', daysBefore(2), 3)];
  const patterns = (handle: Handle) =>
    allEntries(session(handle).workout.blocks)
      .map((entry) => requireExercise(entry.exerciseId).movementPattern)
      .sort();

  for (const technique of [false, true]) {
    const save = technique ? ', with a technique in the same save,' : '';
    it(`today ticked${save} after a swap on the catch-up gives the usual plan whole`, async () => {
      const usual = await withRecords(monday(), wednesdayTicked);
      const handle = await withRecords(monday());
      expect(session(handle).workout.templateId).toBe('catch-up');
      const raise = allEntries(session(handle).workout.blocks).find(
        (entry) => entry.exerciseId === 'lateral-raise',
      )!;
      await handle.store.recalibrate({
        type: 'replace',
        entryId: raise.id,
        exerciseId: 'cable-lateral-raise',
      });
      const profile = handle.store.getSnapshot().profile!;
      await handle.store.saveProfile({
        ...profile,
        ...wednesdayTicked,
        ...(technique
          ? { techniques: { ...profile.techniques, circuits: !profile.techniques.circuits } }
          : {}),
      });
      const today = session(handle);
      expect(today.constraints.catchUp).toBeUndefined();
      expect(today.workout.templateId).toBe(session(usual).workout.templateId);
      // Before: the pull day's rear-delt fly gave its slot to the catch-up's cable lateral raise.
      expect(patterns(handle), describeWorkout(today.workout).join('; ')).toEqual(patterns(usual));
    });
  }

  it('today unticked after a pin on the usual plan gives the catch-up whole', async () => {
    const plain = await withRecords(monday());
    const spec = session(plain).constraints.catchUp!;
    const coveredPlain = new Set(
      allEntries(session(plain).workout.blocks).flatMap((entry) => entry.chosenFor),
    );
    const handle = await withRecords(monday(), wednesdayTicked);
    const [first] = allEntries(session(handle).workout.blocks);
    await handle.store.recalibrate({ type: 'pin', entryId: first!.id, pinned: true });
    const profile = handle.store.getSnapshot().profile!;
    await handle.store.saveProfile({ ...profile, schedule });
    const today = session(handle);
    expect(today.workout.templateId).toBe('catch-up');
    const lifts = describeWorkout(today.workout).join('; ');
    const covered = new Set(allEntries(today.workout.blocks).flatMap((entry) => entry.chosenFor));
    // Before: the pinned barbell row x4 took the bench press's slot: the chest, which the catch-up
    // leads with, had no lift, and the lats took 4 sets for their 2.
    expect(
      [...coveredPlain].filter((muscle) => !covered.has(muscle)),
      lifts,
    ).toEqual([]);
    for (const item of spec.muscles) {
      const sets = allEntries(today.workout.blocks)
        .filter((entry) => requireExercise(entry.exerciseId).primaryMuscles.includes(item.muscle))
        .reduce((sum, entry) => sum + entry.sets.filter((set) => set.kind === 'working').length, 0);
      expect(sets, `${item.muscle}: ${lifts}`).toBeLessThanOrEqual(item.sets);
    }
  });

  it('the lower day done in full with a favourite front squat leaves the glutes nothing', async () => {
    const ticked: Partial<UserProfile> = {
      schedule: { ...schedule, availableDays: [...schedule.availableDays, 'wed'] },
    };
    const pushMonday = benchAt('w-mon', daysBefore(2), 3, 'push-arms');
    const pullTuesday = {
      ...benchAt('w-tue', daysBefore(1), 3, 'pull-arms'),
      entries: [{ ...benchAt('w-row', daysBefore(1), 3).entries[0]!, exerciseId: 'barbell-row' }],
    };
    // With the back squat, the glutes sit out after the lower day.
    const plain = await withRecords([pushMonday, pullTuesday], ticked);
    expect(session(plain).workout.templateId).toBe('lower');
    await doTheWorkout(plain);
    expect(session(plain).constraints.catchUp?.sitOut).toContain('glutes');
    const handle = await withRecords([pushMonday, pullTuesday], {
      ...ticked,
      exercisePreferences: { preferred: ['Front Squat'], disliked: [] },
    });
    const first = session(handle);
    expect(first.workout.templateId).toBe('lower');
    expect(allEntries(first.workout.blocks).map((entry) => entry.exerciseId)).toContain(
      'front-squat',
    );
    await doTheWorkout(handle);
    const second = session(handle);
    expect(second.constraints.catchUp?.kind).toBe('second');
    // Before: "glutes: 2 sets, remainder", a hip thrust x2 after the whole lower day: the squat's
    // slot named the glutes, and the front squat works them at half.
    expect(
      second.constraints.catchUp!.muscles.map((item) => `${item.muscle}:${item.why}`),
      describeWorkout(second.workout).join('; '),
    ).not.toContain('glutes:remainder');
    expect(second.constraints.catchUp!.sitOut).toContain('glutes');
  });
});

describe('a catch-up planned as the split’s session, the fourth review of round M', () => {
  const FRIDAY = '2026-09-04T12:00:00.000Z';
  const SATURDAY = '2026-09-05T12:00:00.000Z';

  /** Friday's workout: every muscle trained directly but the triceps; no session left this week. */
  const friday = (): WorkoutRecord => ({
    id: 'w-friday',
    startedAt: FRIDAY,
    completedAt: FRIDAY,
    locationId: 'gym',
    templateId: null,
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: [
      'cable-fly',
      'incline-dumbbell-press',
      'lateral-raise',
      'rear-delt-fly',
      'barbell-shrug',
      'barbell-row',
      'deadlift',
      'barbell-curl',
      'wrist-curl',
      'back-squat',
      'standing-calf-raise',
      'plank',
      'pallof-press',
    ].map((exerciseId) => ({
      exerciseId,
      plannedSets: 3,
      sets: [0, 1, 2].map((index) => ({
        kind: 'working' as const,
        reps: 10,
        weight: 50,
        rir: 2,
        completed: true,
        setIndex: index,
        targetReps: [8, 12] as [number, number],
        targetRir: 2,
      })),
    })),
  });

  /** Saturday at home, a pull-up bar all there is: the triceps' catch-up cannot be built there. */
  async function saturdayAtHome() {
    const handle = createTestStore({ now: () => SATURDAY });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(SATURDAY, 'home'), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true, homeEquipment: ['pull-up-bar'] }, SATURDAY),
    );
    const db = await handle.store.getDatabase();
    await db.put('workouts', friday());
    await handle.store.hydrate();
    const home = session(handle);
    // Every lift there for the triceps works the chest, trained yesterday, or is not there.
    expect(home.constraints.catchUp?.muscles.map((item) => item.muscle)).toEqual(['triceps']);
    expect(home.workout.templateId).not.toBe('catch-up');
    return { handle, home };
  }

  /** No lift for the chest, trained yesterday, in a catch-up, nor more than the triceps' 3 sets. */
  function expectNoLiftOfTheOtherPlan(handle: Handle) {
    const { workout } = session(handle);
    const lifts = describeWorkout(workout).join('; ');
    const catchUp = workout.templateId === 'catch-up';
    expect(
      catchUp ? directFor(workout, 'chest').map((entry) => entry.exerciseId) : [],
      lifts,
    ).toEqual([]);
    expect(catchUp ? directSets(workout, 'triceps') : 0, lifts).toBeLessThanOrEqual(3);
  }

  it('a pin on it stays out of the catch-up a change of place can build', async () => {
    const { handle, home } = await saturdayAtHome();
    const [first] = allEntries(home.workout.blocks);
    await handle.store.recalibrate({ type: 'pin', entryId: first!.id, pinned: true });
    await handle.store.setCurrentLocation('gym');
    // Before: "Catch-up: push-up x4", the pinned push-up in the triceps' slot.
    expectNoLiftOfTheOtherPlan(handle);
  });

  it('... or new equipment at the place', async () => {
    const { handle, home } = await saturdayAtHome();
    const [first] = allEntries(home.workout.blocks);
    await handle.store.recalibrate({ type: 'pin', entryId: first!.id, pinned: true });
    const place = handle.store.getSnapshot().locations.find((item) => item.id === 'home')!;
    await handle.store.saveLocation({
      ...place,
      equipment: [...place.equipment, 'resistance-bands'],
    });
    expectNoLiftOfTheOtherPlan(handle);
  });

  it('a workout begun on it keeps it at the next place', async () => {
    const { handle, home } = await saturdayAtHome();
    handle.store.startWorkout();
    const [first] = allEntries(session(handle).workout.blocks);
    const set = first!.sets.find((candidate) => candidate.kind === 'working')!;
    await handle.store.logSet(first!.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[1],
      rir: 2,
    });
    await handle.store.setCurrentLocation('gym');
    const gym = session(handle).workout;
    // Before: the push day begun at home became "Catch-up: push-up x4" at the gym.
    expect(gym.templateId, describeWorkout(gym).join('; ')).toBe(home.workout.templateId);
  });
});

describe('a catch-up through a change of place, the fifth review of round M', () => {
  const MONDAY = '2026-08-31T12:00:00.000Z';
  const FRIDAY = '2026-09-04T12:00:00.000Z';
  const SATURDAY = '2026-09-05T12:00:00.000Z';
  /** A finished workout at `when`: three working sets of each exercise, ten reps at 2 in reserve. */
  const workoutAt = (id: string, when: string, exerciseIds: string[]): WorkoutRecord => ({
    id,
    startedAt: when,
    completedAt: when,
    locationId: 'gym',
    templateId: null,
    endedEarly: false,
    rating: null,
    skippedExerciseIds: [],
    painJoints: [],
    readiness: null,
    prs: [],
    entries: exerciseIds.map((exerciseId) => ({
      exerciseId,
      plannedSets: 3,
      sets: [0, 1, 2].map((index) => ({
        kind: 'working' as const,
        reps: 10,
        weight: 50,
        rir: 2,
        completed: true,
        setIndex: index,
        targetReps: [8, 12] as [number, number],
        targetRir: 2,
      })),
    })),
  });
  /** Saturday, at home with a pull-up bar only or at the gym, these workouts saved. */
  async function saturday(records: WorkoutRecord[], place: 'home' | 'gym' = 'home') {
    const handle = createTestStore({ now: () => SATURDAY });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(SATURDAY, place), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true, homeEquipment: ['pull-up-bar'] }, SATURDAY),
    );
    const db = await handle.store.getDatabase();
    for (const item of records) await db.put('workouts', item);
    await handle.store.hydrate();
    return handle;
  }
  const lifts = (handle: Handle) => describeWorkout(session(handle).workout).join('; ');
  /** Friday's workout: every muscle trained directly but the triceps (the fourth review's week). */
  const allButTriceps = () =>
    workoutAt('w-friday', FRIDAY, [
      'cable-fly',
      'incline-dumbbell-press',
      'lateral-raise',
      'rear-delt-fly',
      'barbell-shrug',
      'barbell-row',
      'deadlift',
      'barbell-curl',
      'wrist-curl',
      'back-squat',
      'standing-calf-raise',
      'plank',
      'pallof-press',
    ]);
  const NOTHING_TODAY =
    'Not one of your training days, and nothing behind this week can be caught up today.';

  it('a catch-up begun at home keeps the quads and the glutes their lift at the gym', async () => {
    // Monday's flyes and Friday's workout: Saturday's catch-up is for the quads, the triceps, the
    // glutes and the chest.
    const week = () => [
      workoutAt('w-monday', MONDAY, ['cable-fly']),
      workoutAt('w-friday', FRIDAY, [
        'incline-dumbbell-press',
        'lateral-raise',
        'rear-delt-fly',
        'barbell-shrug',
        'barbell-row',
        'leg-curl',
        'barbell-curl',
        'wrist-curl',
        'standing-calf-raise',
        'plank',
        'pallof-press',
      ]),
    ];
    const handle = await saturday(week());
    // At home: "push-up x3; bulgarian-split-squat x3", the push-up's strength slot first.
    expect(session(handle).workout.templateId).toBe('catch-up');
    handle.store.startWorkout();
    const [first] = allEntries(session(handle).workout.blocks);
    const set = first!.sets.find((candidate) => candidate.kind === 'working')!;
    await handle.store.logSet(first!.id, set.index, {
      weight: set.targetWeight,
      reps: set.targetReps[1],
      rir: 2,
    });
    await handle.store.setCurrentLocation('gym');
    expect(session(handle).workout.templateId).toBe('catch-up');
    // Before: "push-up x3" alone, the push-up begun in the gym's squat slot.
    expect(directSets(session(handle).workout, 'quads'), lifts(handle)).toBeGreaterThan(0);
    expect(directSets(session(handle).workout, 'glutes'), lifts(handle)).toBeGreaterThan(0);
  });

  it('a change of place builds the catch-up whole where it can be built, a pin with it', async () => {
    const handle = await saturday([allButTriceps()]);
    // At home every lift for the triceps works the chest, trained yesterday: the split's session.
    expect(session(handle).workout.templateId).not.toBe('catch-up');
    expect(dayNoteOf(session(handle), false)?.text).toBe(NOTHING_TODAY);
    const [first] = allEntries(session(handle).workout.blocks);
    await handle.store.recalibrate({ type: 'pin', entryId: first!.id, pinned: true });
    await handle.store.setCurrentLocation('gym');
    // Before: the split's session kept for the pin, a whole push day, and Today still saying that
    // nothing could be caught up, at a gym where the catch-up is a triceps pushdown.
    expect(session(handle).workout.templateId, lifts(handle)).toBe('catch-up');
    expect(dayNoteOf(session(handle), false)?.text, lifts(handle)).not.toBe(NOTHING_TODAY);
  });

  it('new equipment at the place builds it whole too, once there is a lift for it', async () => {
    const handle = await saturday([allButTriceps()]);
    const [first] = allEntries(session(handle).workout.blocks);
    await handle.store.recalibrate({ type: 'pin', entryId: first!.id, pinned: true });
    const place = handle.store.getSnapshot().locations.find((item) => item.id === 'home')!;
    await handle.store.saveLocation({
      ...place,
      equipment: [...place.equipment, 'resistance-bands'],
    });
    // A band pushdown for the triceps.
    expect(session(handle).workout.templateId, lifts(handle)).toBe('catch-up');
    expect(dayNoteOf(session(handle), false)?.text, lifts(handle)).not.toBe(NOTHING_TODAY);
  });
});

describe('a catch-up’s layout kept with the plan, the eighth review of round M', () => {
  it('a save that changes the dose and keeps the offer gives the dose it now asks', async () => {
    // Monday's bench press: a beginner saved as an intermediate reads the offer again, 3 sets at 1
    // in reserve where it was 2 at 2, and with a pin rebuilds around it.
    const bench = [{ daysAgo: 2, exerciseId: 'barbell-bench-press' }];
    const handle = await lifter(bench, { experience: 'beginner' });
    const before = session(handle);
    expect(before.workout.templateId).toBe('catch-up');
    const entries = allEntries(before.workout.blocks);
    await handle.store.recalibrate({
      type: 'pin',
      entryId: entries[entries.length - 1]!.id,
      pinned: true,
    });
    await handle.store.saveProfile({
      ...handle.store.getSnapshot().profile!,
      experience: 'intermediate',
    });
    const after = session(handle);
    expect(after.constraints.catchUp!.muscles.map((item) => item.muscle)).toEqual(
      before.constraints.catchUp!.muscles.map((item) => item.muscle),
    );
    expect(
      after.constraints.catchUp!.muscles.find((item) => item.muscle === 'upper-chest'),
    ).toMatchObject({ sets: 3, minRir: 1 });
    expect(after.log[0]?.scope).toBe('partial');
    // The plan an intermediate gets for the day, made whole.
    const whole = session(await lifter(bench, { experience: 'intermediate' })).workout;
    const shape = (entry: WorkoutEntry) => ({
      exercise: entry.exerciseId,
      sets: working(entry).length,
      rir: working(entry).map((set) => set.targetRir),
    });
    const wholeShape = new Map(
      allEntries(whole.blocks).map((entry) => [entry.exerciseId, shape(entry)]),
    );
    const lifts = (workout: GeneratedWorkout) => describeWorkout(workout).join('; ');
    const unpinned = allEntries(after.workout.blocks).filter((entry) => !entry.pinned);
    expect(unpinned.length, lifts(after.workout)).toBeGreaterThan(0);
    // Before: "barbell-bench-press x2 @RIR 2/2; incline-dumbbell-press x2 @RIR 2/2; ...", every
    // lift at the beginner's dose the kept slots carried.
    expect(unpinned.map(shape), `${lifts(after.workout)} :: whole ${lifts(whole)}`).toEqual(
      unpinned.map((entry) => wholeShape.get(entry.exerciseId) ?? shape(entry)),
    );
  });
});

describe('the order a day off the plan leads in, the ninth review of round M', () => {
  const HOUR = 3_600_000;
  /** Workouts logged `hoursAgo`, each a lift's sets of the sets it planned. */
  async function logged(
    history: {
      hoursAgo: number;
      exerciseId: string;
      sets: number;
      planned?: number;
      templateId: string;
    }[],
    changes: Partial<UserProfile> = {},
  ) {
    const handle = createTestStore({ now: () => TEST_NOW });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185, ...changes },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await handle.store.getDatabase();
    for (const { hoursAgo, exerciseId, sets, planned = sets, templateId } of history) {
      const when = new Date(Date.parse(TEST_NOW) - hoursAgo * HOUR).toISOString();
      const saved = record(
        0,
        exerciseId,
        Array.from({ length: sets }, () => [10, 100, 2] as [number, number, number]),
        [8, 12],
        2,
      );
      await db.put('workouts', {
        ...saved,
        id: `w-${exerciseId}-${hoursAgo}`,
        startedAt: when,
        completedAt: when,
        templateId,
        endedEarly: sets < planned,
        entries: saved.entries.map((entry) => ({ ...entry, plannedSets: planned })),
      });
    }
    await handle.store.hydrate();
    return handle;
  }

  it('a catch-up keeps its strength lifts first: the squat before the calf raise', async () => {
    // Two sessions a week, Monday and Friday; Monday's lower day cut short at five sets of leg press.
    const handle = await logged(
      [
        { hoursAgo: 48, exerciseId: 'leg-press', sets: 5, templateId: 'lower' },
        { hoursAgo: 216, exerciseId: 'barbell-row', sets: 3, templateId: 'pull-arms' },
      ],
      { schedule: { ...schedule, availableDays: ['mon', 'fri'], weeklyFrequency: 2 } },
    );
    expect(session(handle).workout.templateId).toBe('catch-up');
    const entries = allEntries(session(handle).workout.blocks);
    expect(
      entries.map((entry) => entry.exerciseId),
      describeWorkout(session(handle).workout).join('; '),
    ).toContain('back-squat');
    // Before: the week-aware order put the back squat fifth, behind the calf raise.
    const strength = entries.map((entry) => restCategory(entry.role) === 'strength');
    const firstOther = strength.indexOf(false);
    expect(
      firstOther < 0 || strength.lastIndexOf(true) < firstOther,
      describeWorkout(session(handle).workout).join('; '),
    ).toBe(true);
  });

  it('a second workout leads with a muscle missed, not the chest’s remainder', async () => {
    // Monday's pull day; this morning's push day ended after one of the four bench sets planned.
    const handle = await logged([
      { hoursAgo: 50, exerciseId: 'barbell-row', sets: 4, templateId: 'pull-arms' },
      { hoursAgo: 50, exerciseId: 'lat-pulldown', sets: 3, templateId: 'pull-arms' },
      { hoursAgo: 50, exerciseId: 'barbell-curl', sets: 3, templateId: 'pull-arms' },
      {
        hoursAgo: 3,
        exerciseId: 'barbell-bench-press',
        sets: 1,
        planned: 4,
        templateId: 'push-arms',
      },
    ]);
    const spec = session(handle).constraints.catchUp!;
    expect(spec.kind).toBe('second');
    const missed = spec.muscles.filter((item) => item.why === 'behind').map((item) => item.muscle);
    expect(missed.length).toBeGreaterThan(0);
    const workout = session(handle).workout;
    const first = allEntries(workout.blocks).find((entry) => !isStopped(entry))!;
    // Before: "close-grip-bench-press x3 @RIR 3/3/3; ..." and "Close-Grip Bench Press first", the
    // chest's and the triceps' remainder.
    expect(
      first.chosenFor.some((muscle) => missed.includes(muscle)),
      `${describeWorkout(workout).join('; ')} :: ${workout.explanation.summary}`,
    ).toBe(true);
  });
});
