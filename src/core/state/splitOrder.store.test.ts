import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile, type Weekday } from '../validation/profile';
import { addLocalDays, localDayKey, localWeekday } from '../time/localDate';
import { at } from '../../test/clockDays';
import { createTestStore } from '../../test/testStore';
import { doToday, lifterStore, sessionOf } from '../../test/lifterDays';
import { allEntries, type SplitOrder } from '../../engine/workout/types';
import { todaysNeedOf, weekModel } from '../../engine/planning/weekModel';
import { MUSCLE_IDS } from '../../catalog/muscles/muscles';
import { nextWindow } from '../../engine/planning/deload';

/**
 * Maintenance 38, the split's order across the lifter's days, as the store keeps it. Monday, Tuesday
 * and Thursday: the rotation runs upper, lower, full body, so Thursday's full body would work the
 * legs inside the window Tuesday's lower day set; lower, upper, full body spares them. The days stay
 * the lifter's, and each session stays the week's once. Synthetic data only.
 */

const MONDAY = at(7, 9);
const LINE =
  'Lower body today in place of Upper body: in this order the quads, hamstrings and glutes are not worked hard again inside their recovery windows in the week ahead.';

function onDays(days: Weekday[]): Partial<UserProfile> {
  const schedule = createDefaultProfile(MONDAY).schedule;
  return { schedule: { ...schedule, availableDays: days, weeklyFrequency: days.length } };
}

async function lifter(
  days: Weekday[] = ['mon', 'tue', 'thu'],
  now: () => string = () => MONDAY,
  changes: Partial<UserProfile> = {},
) {
  const handle = createTestStore({ now });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    { ...createDefaultProfile(MONDAY), bodyweight: 185, ...onDays(days), ...changes },
    createDefaultLocations({ gymAccess: true }, MONDAY),
  );
  return handle.store;
}

const session = (store: Awaited<ReturnType<typeof lifter>>) => store.getSnapshot().session!;

/** The week's need as the store reads it (`weekNeed`), the week planned in `order`. */
function owedIn(store: Awaited<ReturnType<typeof lifter>>, order: SplitOrder | null) {
  const snapshot = store.getSnapshot();
  const week = weekModel({
    profile: snapshot.profile!,
    location: snapshot.locations.find((place) => place.id === snapshot.profile!.currentLocationId),
    history: snapshot.readHistory,
    now: MONDAY,
    resets: snapshot.learnedResets,
    order,
  });
  const owed = Object.fromEntries(
    MUSCLE_IDS.map((muscle) => [muscle, todaysNeedOf(week.muscles[muscle])] as const)
      .filter(([, need]) => need >= 1)
      .map(([muscle, need]) => [muscle, Math.round(need * 2) / 2]),
  );
  return Object.keys(owed).length > 0 ? owed : undefined;
}

describe('the split’s order in the store (Maintenance 38)', () => {
  it('plans today in the order, says why, and keeps the order with the plan', async () => {
    const store = await lifter();
    const today = session(store);
    expect(today.workout.templateId).toBe('lower');
    expect(today.workout.explanation.reasons).toContain(LINE);
    expect(today.constraints.splitOrder?.days.map((day) => [day.templateId, day.was])).toEqual([
      ['lower', 'upper'],
      ['upper', 'lower'],
      ['full-body', 'full-body'],
    ]);
    expect(today.constraints.splitOrder?.days[0]?.day).toBe(localDayKey(MONDAY));
    expect(today.constraints.splitOrder?.spared).toEqual(['quads', 'hamstrings', 'glutes']);
  });

  it('reads the order again at the length today is built, a place changed among it', async () => {
    // The review: read at the Default, the order stood at 15 minutes, where the rotation's week was
    // better. At 30 minutes today's upper day leaves the upper body behind, so the rotation gives
    // Thursday an upper day for it: nothing comes back too soon, and no order is better.
    const store = await lifter();
    const order = session(store).constraints.splitOrder;
    const carried = session(store).constraints.carry;
    expect((await store.setDurationChoice(30))?.ok).toBe(true);
    expect(session(store).workout.templateId).toBe('upper');
    expect(session(store).constraints.splitOrder).toBeUndefined();
    expect(session(store).workout.explanation.reasons).not.toContain(LINE);
    // The week's need with it, read for the week in the rotation's order, not the one before.
    expect(session(store).constraints.carry).toEqual(owedIn(store, null));
    expect(session(store).constraints.carry).not.toEqual(carried);
    const gym = store.getSnapshot().profile!.currentLocationId;
    const home = store.getSnapshot().locations.find((place) => place.id !== gym)!;
    await store.setCurrentLocation(home.id);
    await store.setCurrentLocation(gym);
    expect(session(store).workout.templateId).toBe('upper');
    expect(session(store).constraints.splitOrder).toBeUndefined();
    // Back at the Default, the order is read again, and holds.
    expect((await store.setDurationChoice('default'))?.ok).toBe(true);
    expect(session(store).workout.templateId).toBe('lower');
    expect(session(store).workout.explanation.reasons).toContain(LINE);
    expect(session(store).constraints.splitOrder).toEqual(order);
  });

  it('reads the order at today’s length where a preview is made again', async () => {
    // At 30 minutes no order: a preview made again (a value reset, here) is made at the Default and
    // given today's 30 minutes again, and the order is read at those.
    const store = await lifter();
    const carried = session(store).constraints.carry;
    expect((await store.setDurationChoice(30))?.ok).toBe(true);
    await store.resetLearned('reserve');
    expect(session(store).duration).toBe(30);
    expect(session(store).workout.templateId).toBe('upper');
    expect(session(store).constraints.splitOrder).toBeUndefined();
    // The week's need read again with it: the week in the rotation's order, not the fresh plan's in
    // the order read at the Default.
    expect(session(store).constraints.carry).toEqual(owedIn(store, null));
    expect(session(store).constraints.carry).not.toEqual(carried);
  });

  it('reads the order again where a check-in short on time shortens today', async () => {
    // Monday, Thursday and Saturday: at the Default today is the lower day in place of the upper day.
    // Short on time, today is 45 minutes, where no order is better, and the rotation's upper day
    // stands (the review: the order kept at a check-in's length was a trade).
    const store = await lifter(['mon', 'thu', 'sat']);
    expect(session(store).workout.templateId).toBe('lower');
    expect(session(store).constraints.splitOrder?.days[0]).toMatchObject({
      templateId: 'lower',
      was: 'upper',
    });
    const result = await store.recalibrate({
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
    expect(result?.ok).toBe(true);
    expect(session(store).duration).toBe(45);
    expect(session(store).workout.templateId).toBe('upper');
    expect(session(store).constraints.splitOrder).toBeUndefined();
  });

  it('holds the order through its week, a length picked on a later day of it too', async () => {
    // Monday, Thursday and Saturday: Monday takes the lower day, Thursday the upper day, and
    // Saturday's full body stands. Each workout keeps the order it was trained in, which holds the
    // week: read afresh on Thursday, the lower day would come again.
    const days: Weekday[] = ['mon', 'thu', 'sat'];
    const trainer = await lifterStore(MONDAY, onDays(days));
    const seen: string[] = [];
    for (let day = 7; day <= 12; day += 1) {
      trainer.clock.now = at(day, 9);
      trainer.store.refreshSession();
      if (!days.includes(localWeekday(trainer.clock.now))) continue;
      seen.push(sessionOf(trainer).workout.templateId);
      if (day === 10) {
        // A length picked on Thursday keeps Thursday's session: the order holds, read with today at
        // the Default when the week's first session was trained.
        expect((await trainer.store.setDurationChoice(15))?.ok).toBe(true);
        expect(sessionOf(trainer).workout.templateId).toBe('upper');
        expect(sessionOf(trainer).workout.explanation.reasons).toContain(
          'Upper body today in place of Lower body: in this order the quads, hamstrings and glutes are not worked hard again inside their recovery windows in the week ahead.',
        );
        expect((await trainer.store.setDurationChoice('default'))?.ok).toBe(true);
      }
      await doToday(trainer);
      const last = trainer.store.getSnapshot().history.at(-1)!;
      expect(last.splitOrder?.days.map((item) => [item.templateId, item.was])).toEqual([
        ['lower', 'upper'],
        ['upper', 'lower'],
        ['full-body', 'full-body'],
      ]);
    }
    expect(seen).toEqual(['lower', 'upper', 'full-body']);
  }, 120_000);

  it('keeps the order off a workout trained on a session the order did not give the day', async () => {
    // A saved workout loaded today stands for none of the order's days: the workout keeps no order,
    // and the next day reads one afresh.
    const store = await lifter();
    await store.saveCurrentWorkout('Lower');
    const saved = store.getSnapshot().savedWorkouts[0]!;
    await store.setDurationChoice(30);
    expect(store.loadSavedWorkout(saved.id)).toBe('loaded');
    store.startWorkout();
    await store.finishWorkout(null, { endedEarly: true });
    expect(store.getSnapshot().history.at(-1)?.splitOrder).toBeUndefined();
  });

  it('reads no order where more days are ticked than sessions, and the week trains each once', async () => {
    // The review: Monday to Friday ticked, three sessions, trained on Monday, Wednesday and Friday.
    // Read over the first days ticked, an order gave Wednesday the upper day Monday had, and the week
    // trained no lower day.
    const open: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const schedule = createDefaultProfile(MONDAY).schedule;
    const trainer = await lifterStore(MONDAY, {
      schedule: { ...schedule, availableDays: open, weeklyFrequency: 3 },
    });
    const done: string[] = [];
    for (const day of [7, 9, 11]) {
      trainer.clock.now = at(day, 9);
      trainer.store.refreshSession();
      expect(sessionOf(trainer).constraints.splitOrder).toBeUndefined();
      done.push(sessionOf(trainer).workout.templateId);
      await doToday(trainer);
    }
    expect([...done].sort()).toEqual(['full-body', 'lower', 'upper']);
  }, 120_000);

  it('keeps the rotation’s order today where a deload is planned from tomorrow', async () => {
    // The review: the deload as recommended begins on the next training day, so today was read
    // against a week of full plans the deload makes lighter, and reordered for them.
    const store = await lifter();
    expect(session(store).workout.templateId).toBe('lower');
    const profile = store.getSnapshot().profile!;
    await store.planDeloadWeek({
      recommended: true,
      window: nextWindow(profile, MONDAY),
      reasons: ['8 sessions in the last 14 days.'],
    });
    expect(session(store).constraints.deload).toBeNull();
    expect(session(store).workout.templateId).toBe('upper');
    expect(session(store).constraints.splitOrder).toBeUndefined();
    // Cancelled, today's plan reads the order again.
    await store.cancelDeloadWeek();
    expect(session(store).workout.templateId).toBe('lower');
    expect(session(store).workout.explanation.reasons).toContain(LINE);
  });

  it('keeps the order’s line out of a copy saved of the day', async () => {
    // The review: a copy of Monday's lower day loaded on a Saturday still said "in place of Upper body".
    const clock = { now: MONDAY };
    const store = await lifter(['mon', 'tue', 'thu'], () => clock.now);
    expect(session(store).workout.explanation.reasons).toContain(LINE);
    await store.saveCurrentWorkout('Lower');
    const saved = store.getSnapshot().savedWorkouts[0]!;
    expect(saved.workout.explanation.reasons.some((line) => line.includes('in this order'))).toBe(
      false,
    );
    clock.now = at(19, 9);
    store.refreshSession();
    expect(store.loadSavedWorkout(saved.id)).toBe('loaded');
    expect(session(store).constraints.splitOrder).toBeUndefined();
    expect(
      session(store).workout.explanation.reasons.some((line) => line.includes('in this order')),
    ).toBe(false);
    // A copy that still has the line, saved by another copy of the app, loads without it.
    const db = await store.getDatabase();
    await db.put('savedWorkouts', {
      ...saved,
      id: 'saved-with-line',
      workout: {
        ...saved.workout,
        explanation: {
          ...saved.workout.explanation,
          reasons: [...saved.workout.explanation.reasons, LINE],
        },
      },
    });
    await store.hydrate();
    expect(store.loadSavedWorkout('saved-with-line')).toBe('loaded');
    expect(session(store).workout.explanation.reasons).not.toContain(LINE);
  });

  it('reads the order again at a save where a lift kept holds today', async () => {
    // A lift pinned holds today's session, so the plan is not built whole and the order is not read
    // again at the rebuild: the save reads it. The same days, a profile saved: the same order.
    const store = await lifter();
    const order = session(store).constraints.splitOrder;
    const [first] = allEntries(session(store).workout.blocks);
    await store.recalibrate({ type: 'pin', entryId: first!.id, pinned: true });
    const profile = store.getSnapshot().profile!;
    await store.saveProfile({ ...profile, bodyweight: 190 });
    expect(session(store).workout.templateId).toBe('lower');
    expect(session(store).constraints.splitOrder).toEqual(order);
    // The defaults saved: no order for their week, and the one before goes.
    await store.saveProfile({
      ...store.getSnapshot().profile!,
      ...onDays(['mon', 'tue', 'thu', 'fri']),
    });
    expect(session(store).workout.templateId).toBe('lower');
    expect(session(store).constraints.splitOrder).toBeUndefined();
  });

  it('reads the order at today’s length at a save where a lift kept holds today', async () => {
    // Monday, Tuesday, Thursday and Saturday: at the Default the order keeps today's push day and
    // moves later days; at 30 minutes there is none. Today at 30, a lift pinned, a profile saved:
    // still none.
    const store = await lifter(['mon', 'tue', 'thu', 'sat']);
    expect(session(store).constraints.splitOrder?.days[0]).toMatchObject({
      templateId: 'push-arms',
      was: 'push-arms',
    });
    expect((await store.setDurationChoice(30))?.ok).toBe(true);
    expect(session(store).constraints.splitOrder).toBeUndefined();
    const [first] = allEntries(session(store).workout.blocks);
    await store.recalibrate({ type: 'pin', entryId: first!.id, pinned: true });
    await store.saveProfile({ ...store.getSnapshot().profile!, bodyweight: 190 });
    expect(session(store).workout.templateId).toBe('push-arms');
    expect(session(store).constraints.splitOrder).toBeUndefined();
  });

  it('reads the week’s need in the order read at today’s length where a preview is made again', async () => {
    // Monday, Wednesday, Thursday and Saturday: the order at 30 minutes is not the Default's. Today
    // at 30, a preview made again is made at the Default and given its 30 minutes again: the order
    // read at those, and the week's need in it.
    const store = await lifter(['mon', 'wed', 'thu', 'sat']);
    const atDefault = session(store).constraints.splitOrder!;
    expect((await store.setDurationChoice(30))?.ok).toBe(true);
    const atThirty = session(store).constraints.splitOrder!;
    expect(atThirty.days.map((day) => day.templateId)).not.toEqual(
      atDefault.days.map((day) => day.templateId),
    );
    await store.resetLearned('reserve');
    expect(session(store).duration).toBe(30);
    expect(session(store).constraints.splitOrder).toEqual(atThirty);
    expect(session(store).constraints.carry).toEqual(owedIn(store, atThirty));
  });

  it('reads the order afresh once the days are saved anew in its week', async () => {
    // Monday, Thursday and Saturday: Monday trains the lower day in place of the upper day, the
    // workout keeping the order. Saved on Tuesday for Tuesday, Thursday and Saturday: held, the order
    // would give Thursday the upper day and the week no lower day (the re-check of the review). Read
    // afresh for the new days: none, and the days are the rotation's.
    const trainer = await lifterStore(MONDAY, onDays(['mon', 'thu', 'sat']));
    expect(sessionOf(trainer).workout.templateId).toBe('lower');
    await doToday(trainer);
    expect(trainer.store.getSnapshot().history.at(-1)?.splitOrder).toBeDefined();
    const seen: string[] = [];
    for (let day = 8; day <= 12; day += 1) {
      trainer.clock.now = at(day, 9);
      trainer.store.refreshSession();
      if (day === 8) {
        const profile = trainer.store.getSnapshot().profile!;
        await trainer.store.saveProfile({ ...profile, ...onDays(['tue', 'thu', 'sat']) });
        expect(sessionOf(trainer).constraints.splitOrder).toBeUndefined();
      }
      if (!['tue', 'thu', 'sat'].includes(localWeekday(trainer.clock.now))) continue;
      seen.push(sessionOf(trainer).workout.templateId);
      await doToday(trainer);
    }
    expect(seen).toEqual(['upper', 'full-body', 'lower']);
  }, 120_000);

  it('reads the order again when the days change, and keeps the defaults as they are', async () => {
    const store = await lifter();
    const profile = store.getSnapshot().profile!;
    await store.saveProfile({ ...profile, ...onDays(['mon', 'tue', 'thu', 'fri']) });
    // Four sessions, three with the arms: no order spares them, and today is the rotation's.
    expect(session(store).constraints.splitOrder).toBeUndefined();
    expect(
      session(store).workout.explanation.reasons.some((line) => line.includes('in place of')),
    ).toBe(false);
  });

  it('keeps the order where a lift kept holds today at the session it gives the day', async () => {
    const store = await lifter();
    const order = session(store).constraints.splitOrder;
    const [first] = allEntries(session(store).workout.blocks);
    await store.recalibrate({ type: 'pin', entryId: first!.id, pinned: true });
    expect((await store.setDurationChoice(30))?.ok).toBe(true);
    expect(session(store).workout.templateId).toBe('lower');
    expect(session(store).constraints.splitOrder).toEqual(order);
  });

  it('reads the week’s need from the week in the order', async () => {
    const store = await lifter();
    const snapshot = store.getSnapshot();
    const owed = (order: SplitOrder | null) => {
      const week = weekModel({
        profile: snapshot.profile!,
        location: snapshot.locations.find(
          (place) => place.id === snapshot.profile!.currentLocationId,
        ),
        history: snapshot.readHistory,
        now: MONDAY,
        resets: snapshot.learnedResets,
        order,
      });
      return Object.fromEntries(
        MUSCLE_IDS.map((muscle) => [muscle, todaysNeedOf(week.muscles[muscle])] as const)
          .filter(([, need]) => need >= 1)
          .map(([muscle, need]) => [muscle, Math.round(need * 2) / 2]),
      );
    };
    const order = session(store).constraints.splitOrder!;
    // Today the lower day in the order: the legs owe sets today, which the rotation's upper day
    // would not have.
    expect(session(store).constraints.carry).toEqual(owed(order));
    expect(owed(order)).not.toEqual(owed(null));
    expect(session(store).constraints.carry?.quads).toBeGreaterThan(0);
  });

  it('drops the order where a lift kept holds today at another session', async () => {
    const store = await lifter();
    const [first] = allEntries(session(store).workout.blocks);
    await store.recalibrate({ type: 'pin', entryId: first!.id, pinned: true });
    const profile = store.getSnapshot().profile!;
    await store.saveProfile({ ...profile, ...onDays(['mon', 'tue', 'thu', 'sat']) });
    // On Monday, Tuesday, Thursday and Saturday the order keeps today the push day (made again
    // without the pin, today's plan is it). The pin keeps the lower day, so the order goes: kept, the
    // week would be planned round a push day today had not.
    expect(session(store).workout.templateId).toBe('lower');
    expect(session(store).constraints.splitOrder).toBeUndefined();
  });

  it('keeps the rotation’s order in a deload week planned today', async () => {
    const store = await lifter();
    expect(session(store).workout.templateId).toBe('lower');
    await store.planDeloadWeek({
      recommended: true,
      window: { startsAt: addLocalDays(MONDAY, -1), endsAt: addLocalDays(MONDAY, 6) },
      reasons: ['8 sessions in the last 14 days.'],
    });
    expect(session(store).constraints.splitOrder).toBeUndefined();
    expect(session(store).workout.templateId).toBe('upper');
  });
});
