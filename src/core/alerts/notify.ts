/**
 * Notifications from the app itself, with no server behind them. They can be
 * shown while the app is open in the background; a phone that has put the app
 * to sleep will not run the timer that shows them, and nothing here pretends
 * otherwise. Permission is only ever asked for from the Settings switch.
 */

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export const REST_TAG = 'wc-rest';
export const UNFINISHED_TAG = 'wc-unfinished';

export function notifyPermission(): NotifyPermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const found = await navigator.serviceWorker.getRegistration();
    return found ?? null;
  } catch {
    return null;
  }
}

/** Shows one notification, replacing any earlier one with the same tag. False when it could not. */
export async function showAlert(
  title: string,
  options: { body: string; tag: string },
): Promise<boolean> {
  if (notifyPermission() !== 'granted') return false;
  const base = import.meta.env.BASE_URL;
  const full: NotificationOptions = {
    body: options.body,
    tag: options.tag,
    icon: `${base}icons/icon-192.png`,
    badge: `${base}icons/icon-192.png`,
  };
  const worker = await registration();
  try {
    if (worker) {
      await worker.showNotification(title, full);
      return true;
    }
    // Desktop browsers without a service worker yet; phones require the worker.
    new Notification(title, full);
    return true;
  } catch {
    return false;
  }
}

/** Puts away notifications that the app being looked at makes pointless. */
export async function closeAlerts(tag: string): Promise<void> {
  const worker = await registration();
  if (!worker) return;
  try {
    const shown = await worker.getNotifications({ tag });
    for (const notification of shown) notification.close();
  } catch {
    // nothing to close
  }
}
