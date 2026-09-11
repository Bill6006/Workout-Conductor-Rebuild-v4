import {
  readLocalSettings,
  updateLocalSettings,
  type KeyValueStorage,
} from '../storage/localSettings';

/**
 * One device id, generated once and kept in local settings. It never travels
 * in a backup, so a restore on another device cannot make two devices claim
 * the same id.
 */

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dev-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

export function ensureDeviceId(storage: KeyValueStorage): string {
  const settings = readLocalSettings(storage);
  if (settings.deviceId) return settings.deviceId;
  const deviceId = generateId();
  updateLocalSettings({ deviceId }, storage);
  return deviceId;
}

/** A short human label for the devices table, for example "Android · Chrome". */
export function deviceLabel(userAgent?: string): string {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac OS/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Device';
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /Firefox\//i.test(ua)
      ? 'Firefox'
      : /Chrome\//i.test(ua)
        ? 'Chrome'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : 'Browser';
  return `${os} · ${browser}`;
}
