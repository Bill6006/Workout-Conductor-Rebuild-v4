import { describe, expect, it, vi } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile, type Weekday } from '../validation/profile';
import { addLocalDays, localDayKey, localWeekday } from '../time/localDate';
import { at } from '../../test/clockDays';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { record } from '../../test/records';
import { doToday, lifterStore, sessionOf } from '../../test/lifterDays';
import type { SplitOrderInput } from '../../engine/planning/splitOrder';
import { allEntries, type SplitOrder } from '../../engine/workout/types';

/**
 * Maintenance 38, the split's order as the store reads it, the order itself given here (which
 * orders the rule takes is splitOrder.test.ts's): "Longer would help" reads the week in the order of
 * today's length, and offers nothing where the next length would read another; the catch-up reads the
 * week in the order; a deload week planned today takes a kept order off today's plan. Synthetic data.
 */

const given = vi.hoisted(() => ({
  order: (() => null) as (input: SplitOrderInput) => SplitOrder | null,
}));
vi.mock('../../engine/planning/splitOrder', async (original) => {
  const actual = await original<typeof import('../../engine/planning/splitOrder')>();
  return { ...actual, splitOrder: (input: SplitOrderInput) => given.order(input) };
});

function onDays(days: Weekday[], now: string): Partial<UserProfile> {
  const schedule = createDefaultProfile(now).schedule;
  return { schedule: { ...schedule, availableDays: days, weeklyFrequency: days.length } };
}

const order = (days: [string, string, string][]): SplitOrder => ({
  days: days.map(([day, templateId, was]) => ({ day, templateId, was })),
  spared: [],
  fewer: [],
});

/** Monday, Wednesday and Saturday on Wednesday the 2nd, a squat three days before, today at 15 min. */
async function shortDay() {
  const handle = createTestStore({ now: () => TEST_NOW, minOverlayMs: 0 });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    {
      ...createDefaultProfile(TEST_NOW),
      bodyweight: 185,
      ...onDays(['mon', 'wed', 'sat'], TEST_NOW),
    },
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  const when = new Date(Date.parse(TEST_NOW) - 3 * 86_400_000).toISOString();
  await db.put('workouts', {
    ...record(0, 'back-squat', [
      [5, 225, 2],
      [5, 225, 2],
      [5, 225, 2],
    ]),
    id: 'w-squat',
    startedAt: when,
    completedAt: when,
  });
  await handle.store.hydrate();
  expect((await handle.store.setDurationChoice(15))?.ok).toBe(true);
  return handle.store;
}

// An order giving Saturday the lower day, where the rotation at 15 minutes gives it the full body.
const SATURDAY_LOWER = order([
  ['2026-09-02', 'upper', 'upper'],
  ['2026-09-05', 'lower', 'full-body'],
  ['2026-09-07', 'full-body', 'lower'],
]);

describe('the split’s order as the store reads it (Maintenance 38)', () => {
  it('offers a longer session for the week as the order plans it', async () => {
    // Read in the rotation's order, Saturday's full body leaves the triceps a set short of their
    // target this week, and 30 min would close it.
    given.order = () => null;
    const plain = await shortDay();
    expect(plain.longerOfferFor()).toMatchObject({
      choice: 30,
      muscles: ['triceps'],
      closesAll: true,
    });
    // In an order giving Saturday the lower day, today's 3 sets are the week's for them: 30 min would
    // close too little of that, and nothing is offered.
    given.order = () => SATURDAY_LOWER;
    const ordered = await shortDay();
    expect(ordered.getSnapshot().session!.constraints.splitOrder).toEqual(SATURDAY_LOWER);
    expect(ordered.longerOfferFor()).toBeNull();
  });

  it('offers no longer session where the next length would read the week in another order', async () => {
    // None at 15 minutes, the triceps short as above; at 30 an order: the week the offer reads is not
    // the one its tap would give.
    given.order = (input) => (input.todayLength === 30 ? SATURDAY_LOWER : null);
    const store = await shortDay();
    expect(store.getSnapshot().session!.constraints.splitOrder).toBeUndefined();
    expect(store.longerOfferFor()).toBeNull();
  });

  it('builds the catch-up from the week as the order plans it', async () => {
    // Monday, Friday and Sunday, each planned day done at 18:00 from Monday the 31st of August. On
    // Tuesday the 8th an order keeping Friday's full body and moving the lower day from Sunday to
    // Monday, 72 h after Friday's legs: this week's legs have Friday's sets alone, and the catch-up
    // takes them. Read in the rotation's order, Sunday's lower day covers them.
    const days: Weekday[] = ['mon', 'fri', 'sun'];
    const tuesday = order([
      ['2026-09-11', 'full-body', 'full-body'],
      ['2026-09-13', 'upper', 'lower'],
      ['2026-09-14', 'lower', 'upper'],
    ]);
    const catchUp = async (ordered: boolean) => {
      given.order = (input) =>
        ordered && localDayKey(input.now) === '2026-09-08' ? tuesday : null;
      const trainer = await lifterStore(at(0, 6), onDays(days, at(0, 6)));
      for (let day = 0; day <= 8; day += 1) {
        trainer.clock.now = at(day, 18);
        trainer.store.refreshSession();
        if (days.includes(localWeekday(trainer.clock.now))) await doToday(trainer);
      }
      return sessionOf(trainer).constraints.catchUp?.muscles.map((item) => item.muscle) ?? [];
    };
    const plain = await catchUp(false);
    const ordered = await catchUp(true);
    expect(plain).not.toContain('quads');
    expect(ordered).toEqual(expect.arrayContaining(['quads', 'hamstrings', 'glutes']));
  }, 120_000);

  it('carries a catch-up emptied whole to the offer of the order the plan made again reads', async () => {
    // The defaults on Wednesday the 2nd, a day not ticked, Monday's bench press in the log: the
    // catch-up for what is behind. Every lift skipped, then a coach focus set: the plan made again
    // reads the week in another order (given here for the focus: a pull day on each day ahead), whose
    // catch-up is another offer. The emptied mark goes with it, and the plan stays empty.
    const pullWeek = order([
      ['2026-09-03', 'pull-arms', 'pull-arms'],
      ['2026-09-04', 'pull-arms', 'push-arms'],
      ['2026-09-07', 'pull-arms', 'lower'],
      ['2026-09-08', 'pull-arms', 'upper'],
    ]);
    given.order = (input) => (input.focus ? pullWeek : null);
    const handle = createTestStore({ now: () => TEST_NOW, minOverlayMs: 0 });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      { ...createDefaultProfile(TEST_NOW), bodyweight: 185 },
      createDefaultLocations({ gymAccess: true }, TEST_NOW),
    );
    const db = await handle.store.getDatabase();
    const when = new Date(Date.parse(TEST_NOW) - 2 * 86_400_000).toISOString();
    await db.put('workouts', {
      ...record(
        0,
        'barbell-bench-press',
        [
          [10, 100, 2],
          [10, 100, 2],
          [10, 100, 2],
        ],
        [8, 12],
        2,
      ),
      id: 'w-monday',
      startedAt: when,
      completedAt: when,
    });
    await handle.store.hydrate();
    const session = () => handle.store.getSnapshot().session!;
    expect(session().workout.templateId).toBe('catch-up');
    const before = session().constraints.catchUp!.muscles.map((item) => item.muscle);
    for (const entry of allEntries(session().workout.blocks)) {
      await handle.store.recalibrate({ type: 'skip', entryId: entry.id });
    }
    expect(allEntries(session().workout.blocks)).toEqual([]);
    await handle.store.setCoachFocus('side-delts');
    expect(session().constraints.splitOrder).toEqual(pullWeek);
    expect(session().constraints.catchUp!.muscles.map((item) => item.muscle)).not.toEqual(before);
    expect(allEntries(session().workout.blocks)).toEqual([]);
  });

  it('takes a kept order off today’s plan where a deload week planned today covers it', async () => {
    // Monday, Thursday and Saturday, today's upper day standing in the order, today at 45 minutes:
    // the plan made again in the deload week keeps today's choices, and none of the order.
    const monday = at(7, 9);
    given.order = () =>
      order([
        [localDayKey(monday), 'upper', 'upper'],
        [localDayKey(addLocalDays(monday, 3)), 'full-body', 'lower'],
        [localDayKey(addLocalDays(monday, 5)), 'lower', 'full-body'],
      ]);
    const handle = createTestStore({ now: () => monday });
    await handle.store.hydrate();
    await handle.store.completeOnboarding(
      {
        ...createDefaultProfile(monday),
        bodyweight: 185,
        ...onDays(['mon', 'thu', 'sat'], monday),
      },
      createDefaultLocations({ gymAccess: true }, monday),
    );
    expect((await handle.store.setDurationChoice(45))?.ok).toBe(true);
    expect(handle.store.getSnapshot().session!.constraints.splitOrder).toBeDefined();
    await handle.store.planDeloadWeek({
      recommended: true,
      window: { startsAt: addLocalDays(monday, -1), endsAt: addLocalDays(monday, 6) },
      reasons: ['8 sessions in the last 14 days.'],
    });
    const session = handle.store.getSnapshot().session!;
    expect(session.duration).toBe(45);
    expect(session.workout.templateId).toBe('upper');
    expect(session.constraints.splitOrder).toBeUndefined();
  });
});
