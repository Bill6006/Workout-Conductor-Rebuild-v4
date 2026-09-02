import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCAL_SETTINGS } from '../validation/settings';
import {
  LOCAL_SETTINGS_KEY,
  createMemoryStorage,
  readLocalSettings,
  updateLocalSettings,
  writeLocalSettings,
} from './localSettings';

describe('local settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(readLocalSettings(createMemoryStorage())).toEqual(DEFAULT_LOCAL_SETTINGS);
  });

  it('round-trips and merges patches', () => {
    const storage = createMemoryStorage();
    writeLocalSettings(
      { ...DEFAULT_LOCAL_SETTINGS, lastExportAt: '2026-09-02T12:00:00.000Z' },
      storage,
    );
    const updated = updateLocalSettings(
      { onboardingCompletedAt: '2026-09-02T12:05:00.000Z' },
      storage,
    );
    expect(updated.lastExportAt).toBe('2026-09-02T12:00:00.000Z');
    expect(updated.onboardingCompletedAt).toBe('2026-09-02T12:05:00.000Z');
    expect(readLocalSettings(storage)).toEqual(updated);
  });

  it('falls back to defaults on corrupt or invalid content', () => {
    const storage = createMemoryStorage();
    storage.setItem(LOCAL_SETTINGS_KEY, '{not json');
    expect(readLocalSettings(storage)).toEqual(DEFAULT_LOCAL_SETTINGS);
    storage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify({ schemaVersion: 99 }));
    expect(readLocalSettings(storage)).toEqual(DEFAULT_LOCAL_SETTINGS);
  });

  it('keeps unknown fields from a newer version', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      LOCAL_SETTINGS_KEY,
      JSON.stringify({ ...DEFAULT_LOCAL_SETTINGS, futureToggle: true }),
    );
    const settings = readLocalSettings(storage) as Record<string, unknown>;
    expect(settings.futureToggle).toBe(true);
  });
});
