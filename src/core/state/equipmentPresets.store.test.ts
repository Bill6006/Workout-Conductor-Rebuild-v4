import { describe, expect, it } from 'vitest';
import type { LoadingMap } from '../../engine/loading/loading';
import type { OutboxEntry } from '../storage/indexedDb';
import { createDefaultLocations } from '../validation/location';
import { createDefaultProfile } from '../validation/profile';
import { PRESET_ID_PREFIX } from '../validation/equipmentPreset';
import { createFakeCloud } from '../../test/fakeCloud';
import { TEST_NOW, createTestStore } from '../../test/testStore';

/**
 * Custom equipment presets in the store (the owner, 2026-10-31): made, renamed, changed and deleted
 * as the lifter likes, each its own record, copied to the cloud like every record; templates only, so
 * no place changes when a preset does. Synthetic data only.
 */

async function lifter(cloud = createFakeCloud(), clock: () => string = () => TEST_NOW) {
  const handle = createTestStore({
    now: clock,
    minOverlayMs: 0,
    cloudClient: async () => cloud.client,
    isOnline: () => true,
  });
  await handle.store.hydrate();
  await handle.store.completeOnboarding(
    createDefaultProfile(TEST_NOW),
    createDefaultLocations({ gymAccess: true }, TEST_NOW),
  );
  return { ...handle, cloud };
}

describe('custom equipment presets', () => {
  it('are kept as made, read back, and queued for the cloud copy', async () => {
    const { store } = await lifter();
    const made = await store.saveEquipmentPreset({
      name: ' Hotel gym ',
      equipment: ['adjustable-dumbbells', 'barbell', 'not-in-the-catalog'],
    });
    expect(made.id.startsWith(PRESET_ID_PREFIX)).toBe(true);
    // The name trimmed, the equipment as a place keeps it: the catalog's, in its order.
    expect(made).toMatchObject({
      name: 'Hotel gym',
      equipment: ['barbell', 'adjustable-dumbbells'],
    });
    expect(store.getSnapshot().equipmentPresets).toEqual([made]);
    const db = await store.getDatabase();
    expect(await db.get('meta', made.id)).toMatchObject({ name: 'Hotel gym' });
    const queued = (await db.getAll<OutboxEntry>('outbox')).map((entry) => entry.id);
    expect(queued).toContain(`meta|${made.id}`);
    await store.hydrate();
    expect(store.getSnapshot().equipmentPresets).toEqual([made]);
  });

  it('are as many as the lifter likes, shown by name', async () => {
    const { store } = await lifter();
    for (const name of ['Work gym', 'Apartment gym', 'Planet Fitness', 'Hotel gym']) {
      await store.saveEquipmentPreset({ name, equipment: ['barbell'] });
    }
    expect(store.getSnapshot().equipmentPresets.map((preset) => preset.name)).toEqual([
      'Apartment gym',
      'Hotel gym',
      'Planet Fitness',
      'Work gym',
    ]);
  });

  it('are renamed and changed in place, keeping when they were made', async () => {
    let now = TEST_NOW;
    const { store } = await lifter(createFakeCloud(), () => now);
    const made = await store.saveEquipmentPreset({ name: 'Hotel gym', equipment: ['barbell'] });
    now = new Date(Date.parse(TEST_NOW) + 3_600_000).toISOString();
    const changed = await store.saveEquipmentPreset({
      id: made.id,
      name: 'Hotel gym, Denver',
      equipment: ['adjustable-dumbbells'],
    });
    expect(changed).toMatchObject({
      id: made.id,
      name: 'Hotel gym, Denver',
      equipment: ['adjustable-dumbbells'],
      createdAt: TEST_NOW,
      updatedAt: now,
    });
    expect(store.getSnapshot().equipmentPresets).toEqual([changed]);
  });

  it('are deleted, the cloud copy told so, the built-ins never', async () => {
    const { store } = await lifter();
    const made = await store.saveEquipmentPreset({ name: 'Hotel gym', equipment: ['barbell'] });
    await store.deleteEquipmentPreset(made.id);
    expect(store.getSnapshot().equipmentPresets).toEqual([]);
    const db = await store.getDatabase();
    expect(await db.get('meta', made.id)).toBeUndefined();
    const queued = await db.getAll<OutboxEntry>('outbox');
    expect(queued.find((entry) => entry.id === `meta|${made.id}`)).toMatchObject({
      op: 'delete',
    });
    await expect(store.deleteEquipmentPreset('Home')).rejects.toThrow(/built in/);
  });

  it('refuse a name a built-in or another preset has, writing nothing', async () => {
    const { store } = await lifter();
    await store.saveEquipmentPreset({ name: 'Hotel gym', equipment: ['barbell'] });
    await expect(store.saveEquipmentPreset({ name: 'Home', equipment: [] })).rejects.toThrow(
      'Home is built in; choose another name.',
    );
    await expect(store.saveEquipmentPreset({ name: 'hotel GYM', equipment: [] })).rejects.toThrow(
      'A preset already has that name.',
    );
    expect(store.getSnapshot().equipmentPresets).toHaveLength(1);
  });

  it('never write over a preset kept that does not read, nor show it', async () => {
    const { store } = await lifter();
    const db = await store.getDatabase();
    const unreadable = { id: `${PRESET_ID_PREFIX}old`, name: '', equipment: 'all' };
    await db.put('meta', unreadable);
    await store.hydrate();
    expect(store.getSnapshot().equipmentPresets).toEqual([]);
    await expect(
      store.saveEquipmentPreset({ id: unreadable.id, name: 'Hotel gym', equipment: [] }),
    ).rejects.toThrow('That preset could not be read; it is left as it is.');
    expect(await db.get('meta', unreadable.id)).toEqual(unreadable);
  });

  it('are templates: a place filled from one stays as it is when the preset changes or goes', async () => {
    const { store } = await lifter();
    const made = await store.saveEquipmentPreset({
      name: 'Hotel gym',
      equipment: ['adjustable-dumbbells', 'adjustable-bench'],
    });
    const gym = store.getSnapshot().locations.find((place) => place.id === 'gym')!;
    // The place filled from the preset, its loading its own: its dumbbells, its plates, and a
    // machine loaded with plates there that keeps its pin stack for a switch back.
    const loading: LoadingMap = {
      dumbbells: { kind: 'dumbbells', ranges: [{ from: 5, to: 50, step: 5 }] },
      plates: { kind: 'plates', perSide: [45, 25, 10, 5, 2.5] },
      'leg-press': {
        kind: 'plates',
        perSide: [45, 25, 10],
        stack: [{ from: 10, to: 200, step: 10 }],
      },
    };
    await store.saveLocation({ ...gym, equipment: [...made.equipment], loading });
    await store.saveEquipmentPreset({ id: made.id, name: 'Hotel gym', equipment: ['barbell'] });
    await store.deleteEquipmentPreset(made.id);
    const kept = store.getSnapshot().locations.find((place) => place.id === 'gym')!;
    expect(kept.equipment).toEqual(made.equipment);
    expect(kept.loading).toEqual(loading);
  });

  it('keep what a newer copy’s catalog added when this one changes them', async () => {
    const { store } = await lifter();
    const db = await store.getDatabase();
    const id = `${PRESET_ID_PREFIX}newer`;
    await db.put('meta', {
      id,
      name: 'Hotel gym',
      equipment: ['barbell', 'equipment-a-later-copy-knows'],
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });
    await store.hydrate();
    const renamed = await store.saveEquipmentPreset({
      id,
      name: 'Hotel gym, Denver',
      equipment: ['barbell'],
    });
    expect(renamed.equipment).toEqual(['barbell', 'equipment-a-later-copy-knows']);
  });

  it('let a preset keep the name it has, even one two devices gave two presets', async () => {
    const { store } = await lifter();
    const db = await store.getDatabase();
    for (const id of ['phone', 'tablet']) {
      await db.put('meta', {
        id: `${PRESET_ID_PREFIX}${id}`,
        name: 'Hotel gym',
        equipment: ['barbell'],
        createdAt: TEST_NOW,
        updatedAt: TEST_NOW,
      });
    }
    await store.hydrate();
    const changed = await store.saveEquipmentPreset({
      id: `${PRESET_ID_PREFIX}phone`,
      name: 'Hotel gym',
      equipment: ['adjustable-dumbbells'],
    });
    expect(changed.equipment).toEqual(['adjustable-dumbbells']);
  });

  it('are read again from the store after each change: one a sync brought meanwhile is listed', async () => {
    const { store } = await lifter();
    const db = await store.getDatabase();
    // Written by a pull, with no read of the store since.
    await db.put('meta', {
      id: `${PRESET_ID_PREFIX}pulled`,
      name: 'Work gym',
      equipment: ['barbell'],
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });
    await store.saveEquipmentPreset({ name: 'Hotel gym', equipment: ['barbell'] });
    expect(store.getSnapshot().equipmentPresets.map((preset) => preset.name)).toEqual([
      'Hotel gym',
      'Work gym',
    ]);
  });

  it('keep an edit to one deleted meanwhile, as a new preset', async () => {
    const { store } = await lifter();
    const made = await store.saveEquipmentPreset({ name: 'Hotel gym', equipment: ['barbell'] });
    const db = await store.getDatabase();
    // Deleted on another device, the deletion pulled, while its sheet was open here.
    await db.delete('meta', made.id);
    const kept = await store.saveEquipmentPreset({
      id: made.id,
      name: 'Hotel gym',
      equipment: ['adjustable-dumbbells'],
    });
    expect(kept.id).not.toBe(made.id);
    expect(store.getSnapshot().equipmentPresets).toEqual([kept]);
  });

  it('never keep the app from opening when a meta record does not read', async () => {
    const { store } = await lifter();
    const made = await store.saveEquipmentPreset({ name: 'Hotel gym', equipment: ['barbell'] });
    const db = await store.getDatabase();
    const getAll = db.getAll.bind(db);
    db.getAll = (async (name: Parameters<typeof db.getAll>[0]) => {
      if (name === 'meta') throw new Error('Failed to read large IndexedDB value');
      return getAll(name);
    }) as typeof db.getAll;
    await store.hydrate();
    expect(store.getSnapshot().error).toBeNull();
    expect(store.getSnapshot().profile).not.toBeNull();
    expect(store.getSnapshot().equipmentPresets).toEqual([made]);
  });

  it('come from another device with the cloud copy', async () => {
    const cloud = createFakeCloud();
    const { store } = await lifter(cloud);
    await store.setCloudToken('test-token');
    await store.flushPendingWork();
    const id = `${PRESET_ID_PREFIX}other-device`;
    cloud.seed({
      store: 'meta',
      id,
      updated_at: TEST_NOW,
      body: JSON.stringify({
        id,
        name: 'Work gym',
        equipment: ['barbell'],
        createdAt: TEST_NOW,
        updatedAt: TEST_NOW,
      }),
    });
    await store.syncNow({ pull: true, full: true });
    await store.hydrate();
    expect(store.getSnapshot().equipmentPresets.map((preset) => preset.name)).toEqual(['Work gym']);
  });
});
