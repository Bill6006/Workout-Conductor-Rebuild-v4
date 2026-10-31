import { describe, expect, it } from 'vitest';
import { SCHEDULE_MOVE_ID, parseScheduleMove } from '../validation/scheduleMove';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Maintenance 36 in the store: every change of the sessions a week or the days keeps the schedule
 * watch's record, whichever way it came; the card's way back keeps one the watch leaves alone; a
 * record that does not read is never written over. Synthetic data only.
 */

async function lifter() {
  let now = TEST_NOW;
  const handle = createTestStore({ now: () => now, minOverlayMs: 0 });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return {
    ...handle,
    later: (days: number) => {
      now = new Date(Date.parse(TEST_NOW) + days * 86_400_000).toISOString();
      return now;
    },
  };
}

describe('the schedule watch’s record', () => {
  it('is kept for a change of the days in Settings, with the schedules before and after', async () => {
    const handle = await lifter();
    const profile = handle.store.getSnapshot().profile!;
    const before = profile.schedule;
    expect(handle.store.getSnapshot().scheduleMove).toBeNull();
    const when = handle.later(1);
    await handle.store.saveProfile({
      ...profile,
      schedule: {
        ...before,
        weeklyFrequency: 5,
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      },
    });
    const expected = {
      id: SCHEDULE_MOVE_ID,
      at: when,
      from: { weeklyFrequency: before.weeklyFrequency, availableDays: before.availableDays },
      to: { weeklyFrequency: 5, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      // The default schedule was never set by hand: no time it was set.
      since: null,
      watched: true,
    };
    expect(handle.store.getSnapshot().scheduleMove).toEqual(expected);
    const db = await handle.store.getDatabase();
    expect(await db.get('meta', SCHEDULE_MOVE_ID)).toMatchObject(expected);
    await handle.store.hydrate();
    expect(handle.store.getSnapshot().scheduleMove).toEqual(expected);
  });

  it('is kept for the coach’s move, and the way back is one the watch leaves alone', async () => {
    const handle = await lifter();
    const before = handle.store.getSnapshot().profile!.schedule;
    handle.later(1);
    await handle.store.moveSchedule(2, ['tue', 'sat']);
    expect(handle.store.getSnapshot().scheduleMove).toMatchObject({
      from: { weeklyFrequency: before.weeklyFrequency },
      to: { weeklyFrequency: 2, availableDays: ['tue', 'sat'] },
      watched: true,
    });
    const when = handle.later(40);
    await handle.store.moveSchedule(before.weeklyFrequency, before.availableDays, { back: true });
    expect(handle.store.getSnapshot().profile!.schedule).toMatchObject({
      weeklyFrequency: before.weeklyFrequency,
      availableDays: before.availableDays,
    });
    expect(handle.store.getSnapshot().scheduleMove).toMatchObject({
      at: when,
      from: { weeklyFrequency: 2, availableDays: ['tue', 'sat'] },
      watched: false,
    });
  });

  it('is kept for a change of the days alone', async () => {
    const handle = await lifter();
    const profile = handle.store.getSnapshot().profile!;
    const days = profile.schedule.availableDays.includes('sat')
      ? (['mon', 'tue', 'thu'] as const)
      : (['tue', 'thu', 'sat'] as const);
    await handle.store.saveProfile({
      ...profile,
      schedule: { ...profile.schedule, availableDays: [...days] },
    });
    expect(handle.store.getSnapshot().scheduleMove).toMatchObject({
      from: { availableDays: profile.schedule.availableDays },
      to: { availableDays: [...days] },
      watched: true,
    });
  });

  it('is not kept for a change of anything else', async () => {
    const handle = await lifter();
    const profile = handle.store.getSnapshot().profile!;
    await handle.store.saveProfile({
      ...profile,
      schedule: { ...profile.schedule, typicalDurationMinutes: 30 },
    });
    // The same days in another order are the same days.
    await handle.store.saveProfile({
      ...profile,
      schedule: {
        ...profile.schedule,
        availableDays: [...profile.schedule.availableDays].reverse(),
      },
    });
    expect(handle.store.getSnapshot().scheduleMove).toBeNull();
    const db = await handle.store.getDatabase();
    expect(await db.get('meta', SCHEDULE_MOVE_ID)).toBeUndefined();
  });

  it('leaves a change alone where its flag is missing or does not read', () => {
    const kept = {
      id: SCHEDULE_MOVE_ID,
      at: TEST_NOW,
      from: { weeklyFrequency: 3, availableDays: ['mon', 'wed', 'fri'] },
      to: { weeklyFrequency: 4, availableDays: ['mon', 'tue', 'thu', 'fri'] },
    };
    expect(parseScheduleMove({ ...kept, watched: true })?.watched).toBe(true);
    expect(parseScheduleMove({ ...kept, watched: 'yes' })?.watched).toBe(false);
    // A flag missing is the quiet side too: only another writer leaves it out.
    expect(parseScheduleMove(kept)?.watched).toBe(false);
    expect(parseScheduleMove({ ...kept, to: undefined })).toBeNull();
  });

  it('is never written over where the record kept does not read', async () => {
    const handle = await lifter();
    const db = await handle.store.getDatabase();
    const unreadable = { id: SCHEDULE_MOVE_ID, at: 'not a time', from: 'nothing' };
    await db.put('meta', unreadable);
    const profile = handle.store.getSnapshot().profile!;
    await handle.store.saveProfile({
      ...profile,
      schedule: { ...profile.schedule, weeklyFrequency: 2, availableDays: ['tue', 'sat'] },
    });
    // The profile is saved all the same.
    expect(handle.store.getSnapshot().profile!.schedule.weeklyFrequency).toBe(2);
    expect(await db.get('meta', SCHEDULE_MOVE_ID)).toEqual(unreadable);
  });
});
