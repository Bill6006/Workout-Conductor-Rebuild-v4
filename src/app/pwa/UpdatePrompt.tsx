import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAppSelector } from '../../core/state/useAppStore';
import styles from './UpdatePrompt.module.css';

const OFFLINE_READY_DISMISS_MS = 4000;

/**
 * Safe service-worker update surface.
 *
 * A new version never takes over silently: the waiting worker is only
 * activated when the user taps Reload. While a workout is active or paused
 * the Reload button is withheld, so a deploy can never interrupt a session;
 * the offer returns once the workout is finished or discarded.
 */
export function UpdatePrompt() {
  const sessionStatus = useAppSelector((state) => state.session?.status ?? null);
  const inWorkout = sessionStatus === 'active' || sessionStatus === 'paused';
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
    <div className={styles.toast} role="status" aria-live="polite" data-testid="update-prompt">
      {needRefresh ? (
        inWorkout ? (
          <div className={styles.text}>
            <strong>New version ready</strong>
            <span>It will be offered after this workout. Nothing on this device is lost.</span>
          </div>
        ) : (
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
        )
      ) : (
        <div className={styles.text}>
          <strong>Ready to work offline</strong>
          <span>The app shell is now cached on this device.</span>
        </div>
      )}
    </div>
  );
}
