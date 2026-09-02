import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './UpdatePrompt.module.css';

const OFFLINE_READY_DISMISS_MS = 4000;

/**
 * Safe service-worker update surface.
 *
 * A new version never takes over silently: the waiting worker is only
 * activated when the user taps Reload. Later phases will additionally hold
 * this prompt while a workout is active so a deploy can never interrupt a session.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.warn('Service worker registration failed', error);
    },
  });

  useEffect(() => {
    if (!offlineReady) {
      return;
    }
    const timer = window.setTimeout(() => setOfflineReady(false), OFFLINE_READY_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) {
    return null;
  }

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      {needRefresh ? (
        <>
          <div className={styles.text}>
            <strong>New version available</strong>
            <span>Reload when you are ready. Nothing on this device is lost.</span>
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={() => setNeedRefresh(false)}>
              Later
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void updateServiceWorker(true)}
            >
              Reload
            </button>
          </div>
        </>
      ) : (
        <div className={styles.text}>
          <strong>Ready to work offline</strong>
          <span>The app shell is now cached on this device.</span>
        </div>
      )}
    </div>
  );
}
