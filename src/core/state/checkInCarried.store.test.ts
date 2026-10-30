import { describe, expect, it } from 'vitest';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { illnessOf } from '../../engine/readiness/checkIn';
import type { Readiness } from '../../engine/recalibration/types';
import { at } from '../../test/clockDays';
import { record } from '../../test/records';
import { createTestStore } from '../../test/testStore';

/**
 * The fourth review of Maintenance 33: the day's check-in holds on every plan of the day, a saved
 * workout loaded, a workout discarded and the completion closed (`withDayCheckIn`), as told on it, at
 * the time it was told; one told another day is none of today's.
 *
 * Steps: a lifter checks in "Head cold" at 9:00, or "Short on time"; at 10:00 loads a saved workout,
 * or begins today's and discards it. Or checks in "Head cold" at 23:50 and opens the app at 0:10.
 * The times are the device's clock, as the day rules read it: written in UTC they were one day only
 * in UTC (in New York, 23:50 and 0:10 UTC are the same evening), so the test ran only on a UTC
 * runner. It runs in two more zones (`scripts/test-zones.mjs`). Synthetic data only.
 */

const NINE = at(2, 9);
const TEN = at(2, 10);
const LATE = at(2, 23, 50);
const PAST_MIDNIGHT = at(3, 0, 10);

const checkIn = (extra: Partial<Readiness> = {}): Readiness => ({
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
  ...extra,
});

async function lifter(clock: { now: string }) {
  const { store } = createTestStore({ now: () => clock.now });
  await store.hydrate();
  const base = createDefaultProfile(clock.now);
  await store.completeOnboarding(
    {
      ...base,
      bodyweight: 185,
      // Every weekday ticked: Wednesday is a day of the plan.
      schedule: {
        ...base.schedule,
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        weeklyFrequency: 5,
      },
    },
    createDefaultLocations({ gymAccess: true }, clock.now),
  );
  const db = await store.getDatabase();
  const when = new Date(Date.parse(clock.now) - 3 * 86_400_000).toISOString();
  await db.put('workouts', {
    ...record(0, 'barbell-bench-press', [
      [8, 135, 2],
      [8, 135, 2],
    ]),
    id: 'w-bench',
    startedAt: when,
    completedAt: when,
  });
  await store.hydrate();
  return store;
}

describe('the day’s check-in on a later plan of the day', () => {
  it('holds on a saved workout loaded, at the time it was told', async () => {
    const clock = { now: NINE };
    const store = await lifter(clock);
    const saved = await store.saveCurrentWorkout('Today');
    await store.recalibrate({ type: 'readiness', readiness: checkIn({ illness: 'head' }) });
    clock.now = TEN;
    store.loadSavedWorkout(saved.id);
    const session = store.getSnapshot().session!;
    expect(session.lastSummary?.headline).toBe('Loaded "Today".');
    expect(illnessOf(session.constraints.readiness)).toBe('head');
    expect(session.constraints.checkInAt).toBe(NINE);
  });

  it('holds "Short on time" on the plan after a workout discarded', async () => {
    const clock = { now: NINE };
    const store = await lifter(clock);
    await store.recalibrate({ type: 'readiness', readiness: checkIn({ timePressure: true }) });
    expect(store.getSnapshot().session!.duration).toBe(45);
    store.startWorkout();
    clock.now = TEN;
    store.discardWorkout();
    const session = store.getSnapshot().session!;
    expect(session.status).toBe('preview');
    expect(session.constraints.readiness?.timePressure).toBe(true);
    expect(session.duration).toBe(45);
  });

  it('is none of the next day’s', async () => {
    const clock = { now: LATE };
    const store = await lifter(clock);
    await store.recalibrate({ type: 'readiness', readiness: checkIn({ illness: 'head' }) });
    expect(illnessOf(store.getSnapshot().session!.constraints.readiness)).toBe('head');
    clock.now = PAST_MIDNIGHT;
    store.refreshSession();
    const session = store.getSnapshot().session!;
    expect(session.constraints.readiness).toBeNull();
    expect(session.constraints.checkInAt).toBeUndefined();
  });
});
