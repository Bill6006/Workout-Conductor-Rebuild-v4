import { describe, expect, it } from 'vitest';
import { allEntries, type WorkoutEntry } from '../../engine/workout/types';
import { record } from '../../test/records';
import { TEST_NOW, createTestStore } from '../../test/testStore';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile, type UserProfile } from '../validation/profile';

/**
 * The review of Maintenance 34: the sets the week's need gave a lift stay only where the day still
 * allows them, after every change, with nothing built again too. A short night lengthens the upper
 * chest's window; "Lighter" holds a muscle back; a head cold closes the day to them, on a pinned lift
 * as on any. The default lifter with a 75-minute Default, every weekday ticked, last week's squats;
 * the incline press and the shrug 40 hours before, two reps in reserve: just outside a 36-hour
 * window, inside the 48 a short night makes it. TEST_NOW is a Wednesday. Synthetic data only.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const schedule = createDefaultProfile(TEST_NOW).schedule;

async function lifter(recent: boolean) {
  const handle = createTestStore({ now: () => TEST_NOW, minOverlayMs: 0 });
  await handle.store.hydrate();
  const profile: UserProfile = {
    ...createDefaultProfile(TEST_NOW),
    bodyweight: 185,
    schedule: {
      ...schedule,
      availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      weeklyFrequency: 5,
      typicalDurationMinutes: 75,
    },
  };
  await handle.store.completeOnboarding(
    profile,
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  const db = await handle.store.getDatabase();
  const lastWeek = new Date(Date.parse(TEST_NOW) - 7 * DAY).toISOString();
  await db.put('workouts', {
    ...record(0, 'back-squat', [
      [5, 225, 2],
      [5, 225, 2],
      [5, 225, 2],
    ]),
    id: 'w-last-week',
    startedAt: lastWeek,
    completedAt: lastWeek,
  });
  if (recent) {
    for (const [index, exerciseId] of ['incline-dumbbell-press', 'barbell-shrug'].entries()) {
      const at = new Date(Date.parse(TEST_NOW) - 40 * HOUR + index * 60_000).toISOString();
      await db.put('workouts', {
        ...record(0, exerciseId, [
          [12, 20, 2],
          [12, 20, 2],
          [12, 20, 2],
        ]),
        id: `w-recent-${index}`,
        templateId: null,
        startedAt: at,
        completedAt: at,
      });
    }
  }
  await handle.store.hydrate();
  return handle;
}
type Handle = Awaited<ReturnType<typeof lifter>>;

const working = (entry: WorkoutEntry) => entry.sets.filter((set) => set.kind === 'working').length;
const lift = (handle: Handle, find: (entry: WorkoutEntry) => boolean) =>
  allEntries(handle.store.getSnapshot().session!.workout.blocks).find(find)!;
const incline = (entry: WorkoutEntry) => entry.exerciseId === 'incline-dumbbell-press';

const checkIn = {
  energy: 3,
  soreness: 2,
  sleep: 3,
  motivation: 3,
  jointDiscomfort: [],
  timePressure: false,
};

describe('the sets the week’s need gave, held back after a change', () => {
  it('come off when a short night puts their muscle inside its window, and the change says why', async () => {
    const handle = await lifter(true);
    const before = lift(handle, incline);
    expect(before.carried).toBeGreaterThan(0);
    const own = working(before) - before.carried!;
    const result = await handle.store.recalibrate({
      type: 'readiness',
      readiness: { ...checkIn, sleep: 2 },
    });
    expect(result?.ok).toBe(true);
    const after = lift(handle, incline);
    expect(after.carried).toBeUndefined();
    expect(working(after)).toBe(own);
    expect(after.progression?.evidence.some((line) => / more for the /.test(line))).toBe(false);
    expect(JSON.stringify(result)).toContain(
      'Sets for what this week is short of wait for another day.',
    );
  });

  it('come off first under "Lighter" for another muscle the lift works, then a set of its own', async () => {
    const handle = await lifter(false);
    const before = lift(handle, incline);
    expect(before.carried).toBeGreaterThan(0);
    const own = working(before) - before.carried!;
    // The front delts: the incline press works them with the upper chest it was given sets for.
    expect((await handle.store.recalibrate({ type: 'lighter', muscle: 'front-delts' }))?.ok).toBe(
      true,
    );
    const after = lift(handle, incline);
    expect(after.carried).toBeUndefined();
    expect(working(after)).toBe(own - 1);
  });

  it('come off first under "Lighter" on a lift under way, then a set of its own still to do', async () => {
    const handle = await lifter(false);
    const before = lift(handle, incline);
    expect(before.carried).toBeGreaterThan(0);
    const own = working(before) - before.carried!;
    handle.store.startWorkout();
    const first = before.sets.find((set) => set.kind === 'working')!;
    await handle.store.logSet(before.id, first.index, {
      weight: first.targetWeight,
      reps: first.targetReps[1],
      rir: 2,
    });
    expect((await handle.store.recalibrate({ type: 'lighter', muscle: 'front-delts' }))?.ok).toBe(
      true,
    );
    const after = lift(handle, incline);
    expect(after.carried).toBeUndefined();
    expect(working(after)).toBe(own - 1);
  });

  it('come off a pinned lift under a head cold, as off any', async () => {
    const handle = await lifter(false);
    const target = lift(handle, (entry) => (entry.carried ?? 0) > 0);
    const own = working(target) - target.carried!;
    expect(
      (await handle.store.recalibrate({ type: 'pin', entryId: target.id, pinned: true }))?.ok,
    ).toBe(true);
    expect(
      (
        await handle.store.recalibrate({
          type: 'readiness',
          readiness: { ...checkIn, illness: 'head' },
        })
      )?.ok,
    ).toBe(true);
    const after = lift(handle, (entry) => entry.id === target.id);
    expect(after.pinned).toBe(true);
    expect(after.carried).toBeUndefined();
    expect(working(after)).toBe(own);
  });
});
