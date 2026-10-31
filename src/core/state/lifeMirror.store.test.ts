import { describe, expect, it } from 'vitest';
import { LIFE_MIRROR_APP, LIFE_MIRROR_QUERY, LIFE_MIRROR_STORE } from '../cloud/lifeMirror';
import { LIFE_MIRROR_LINK_ID } from '../validation/lifeMirrorLink';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { localDayKey } from '../time/localDate';
import { createFakeCloud, type FakeCloud } from '../../test/fakeCloud';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Item 48 in the store: the lifter's switch, off until turned on; today's Life Mirror check-in read
 * only with it on, a token, and the cloud copy at Life Mirror's own database; nothing private of a
 * check-in kept anywhere. A test token, a fake cloud, and synthetic check-ins only.
 */

const PRIVATE = 'SYNTHETIC-PRIVATE-NOTE';

/** Today's morning check-in in Life Mirror's rows, on this device's day. */
function seedMorning(cloud: FakeCloud, now: string) {
  const day = localDayKey(now);
  cloud.seed({
    app: LIFE_MIRROR_APP,
    store: LIFE_MIRROR_STORE,
    id: 'lm-1',
    day,
    body: JSON.stringify({
      day,
      block: 'morning',
      completedAt: now,
      updatedAt: now,
      answers: { energy: 4, mood: 2, stress: 4, sleepHours: 2, sleepQuality: 4, motivation: 3 },
      extras: { note: PRIVATE },
    }),
    updated_at: now,
  });
}

async function lifter(options: { now?: string; on?: boolean; token?: boolean; url?: string } = {}) {
  const now = options.now ?? TEST_NOW;
  const cloud = createFakeCloud();
  const handle = createTestStore({
    now: () => now,
    minOverlayMs: 0,
    cloudClient: async () => cloud.client,
    isOnline: () => true,
  });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  seedMorning(cloud, now);
  if (options.url) {
    await handle.store.setCloudCredentials({
      token: 'test-token',
      url: options.url,
      acceptExisting: true,
    });
  } else if (options.token ?? true) {
    await handle.store.setCloudToken('test-token');
  }
  if (options.on ?? true) await handle.store.setLifeMirrorLink(true);
  return { ...handle, cloud };
}

describe('the Life Mirror switch', () => {
  it('is off until turned on, and kept as turned', async () => {
    const handle = await lifter({ on: false });
    expect(handle.store.getSnapshot().lifeMirrorLink.on).toBe(false);
    await handle.store.setLifeMirrorLink(true);
    const db = await handle.store.getDatabase();
    expect(await db.get('meta', LIFE_MIRROR_LINK_ID)).toMatchObject({ on: true });
    await handle.store.hydrate();
    expect(handle.store.getSnapshot().lifeMirrorLink.on).toBe(true);
  });
});

describe('today’s Life Mirror check-in', () => {
  it('is read with the switch on: the readings it may use, each with its time', async () => {
    const handle = await lifter();
    expect(await handle.store.lifeMirrorPrefill()).toEqual({
      energy: { value: 4, at: TEST_NOW },
      sleep: { value: 2, at: TEST_NOW },
      motivation: { value: 3, at: TEST_NOW },
      stress: { value: 4, at: TEST_NOW },
      mood: { value: 2, at: TEST_NOW },
    });
  });

  it('is never read with the switch off: not a call to the cloud', async () => {
    const handle = await lifter({ on: false });
    const calls = handle.cloud.calls();
    expect(await handle.store.lifeMirrorPrefill()).toBeNull();
    expect(handle.cloud.calls()).toBe(calls);
  });

  it('is none without a token, with another database, before 04:00, or when the read fails', async () => {
    expect(await (await lifter({ token: false })).store.lifeMirrorPrefill(), 'no token').toBeNull();
    expect(
      await (
        await lifter({ url: 'libsql://someone-else-db.aws-us-east-1.turso.io' })
      ).store.lifeMirrorPrefill(),
      'another database',
    ).toBeNull();
    const early = new Date(TEST_NOW);
    early.setHours(3, 30, 0, 0);
    expect(
      await (await lifter({ now: early.toISOString() })).store.lifeMirrorPrefill(),
      'before 04:00',
    ).toBeNull();
    // The read itself lost (a sync of this app's own rows may run beside it).
    const failing = await lifter();
    const execute = failing.cloud.client.execute.bind(failing.cloud.client);
    failing.cloud.client.execute = async (statement) => {
      if (statement.sql === LIFE_MIRROR_QUERY) throw new Error('connection lost');
      return execute(statement);
    };
    expect(await failing.store.lifeMirrorPrefill(), 'the read failed').toBeNull();
  });

  it('leaves nothing private of a check-in anywhere: told, saved and kept', async () => {
    const handle = await lifter();
    const filled = await handle.store.lifeMirrorPrefill();
    const result = await handle.store.recalibrate({
      type: 'readiness',
      readiness: {
        energy: filled!.energy!.value,
        soreness: 2,
        sleep: filled!.sleep!.value,
        motivation: filled!.motivation!.value,
        jointDiscomfort: [],
        timePressure: false,
        stress: filled!.stress!.value,
        mood: filled!.mood!.value,
        fromLifeMirror: { energy: TEST_NOW, sleep: TEST_NOW, stress: TEST_NOW, mood: TEST_NOW },
      },
    });
    expect(result?.ok).toBe(true);
    expect(handle.store.getSnapshot().session!.constraints.readiness).toMatchObject({
      stress: 4,
      mood: 2,
      fromLifeMirror: { energy: TEST_NOW },
    });
    expect(JSON.stringify(handle.store.getSnapshot())).not.toContain(PRIVATE);
    const db = await handle.store.getDatabase();
    for (const store of ['meta', 'workouts', 'profile', 'locations', 'cloud', 'outbox'] as const) {
      const rows = await db.getAll(store).catch(() => []);
      expect(JSON.stringify(rows), store).not.toContain(PRIVATE);
    }
    expect(JSON.stringify(handle.cloud.ours())).not.toContain(PRIVATE);
  });
});
