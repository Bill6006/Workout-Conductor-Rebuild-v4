import type { ZodType } from 'zod';
import {
  DEFAULT_LOCAL_SETTINGS,
  LocalSettingsSchema,
  type LocalSettings,
} from '../validation/settings';

/**
 * localStorage is used only for small settings and active-session metadata
 * (for example an unfinished onboarding draft). Every read is validated and
 * falls back to defaults, so a corrupt value can never break startup.
 */

export const LOCAL_SETTINGS_KEY = 'wc.v1.settings';
export const ONBOARDING_DRAFT_KEY = 'wc.v1.onboardingDraft';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

let memoryFallback: MemoryStorage | undefined;

/** A throwaway storage for tests and for contexts without localStorage. */
export function createMemoryStorage(): KeyValueStorage {
  return new MemoryStorage();
}

/** window.localStorage when usable, otherwise an in-memory stand-in for this session. */
export function defaultStorage(): KeyValueStorage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const probe = '__wc_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    }
  } catch {
    // fall through to memory
  }
  memoryFallback ??= new MemoryStorage();
  return memoryFallback;
}

export function readJson<T>(key: string, schema: ZodType<T>, storage: KeyValueStorage): T | null {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown, storage: KeyValueStorage): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string, storage: KeyValueStorage): void {
  try {
    storage.removeItem(key);
  } catch {
    // nothing to do
  }
}

export function readLocalSettings(storage: KeyValueStorage = defaultStorage()): LocalSettings {
  return (
    readJson(LOCAL_SETTINGS_KEY, LocalSettingsSchema, storage) ?? { ...DEFAULT_LOCAL_SETTINGS }
  );
}

export function writeLocalSettings(
  settings: LocalSettings,
  storage: KeyValueStorage = defaultStorage(),
): LocalSettings {
  const parsed = LocalSettingsSchema.parse(settings);
  writeJson(LOCAL_SETTINGS_KEY, parsed, storage);
  return parsed;
}

export function updateLocalSettings(
  patch: Partial<LocalSettings>,
  storage: KeyValueStorage = defaultStorage(),
): LocalSettings {
  return writeLocalSettings({ ...readLocalSettings(storage), ...patch }, storage);
}
